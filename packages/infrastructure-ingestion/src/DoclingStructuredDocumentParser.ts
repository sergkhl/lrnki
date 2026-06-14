import { createHash } from "node:crypto";
import type { StructuredDocument } from "@lrnki/domain-core";
import type { StructuredDocumentParserPort } from "@lrnki/ports";
import { extractMarkdownBlocks } from "./markdownBlocks";

const PARSER_NAME = "docling";
// Bumped whenever the conversion contract changes (image tag or pinned options).
const PARSER_VERSION = "1";

// Mixed-format ingestion for Gate 2 (ADR-0013). Docling converts PDF/DOCX/PPTX
// to Markdown over HTTP; we then feed that Markdown through the same shared
// `extractMarkdownBlocks` pass the native-markdown parser uses, so the
// region-classification contract is identical across formats.
const SUPPORTED: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
};

// Conversion options pinned for a reproducible frozen oracle suite, chosen to be
// as fast as possible without losing anything the pipeline consumes:
//   - do_ocr=false: the curated Gate 2 fixtures are digital-born (selectable
//     text), so OCR adds latency and nondeterminism without benefit; a scanned
//     fixture would need its own arm with do_ocr=true recorded in the config.
//   - do_table_structure=false: every table collapses to a non-teachable
//     `table_placeholder` that never reaches an LLM stage, so running the
//     TableFormer structure model is pure waste. Disabling it entirely (not just
//     table_mode=fast, which still runs the model) cut conversion ~45% in
//     measurement — tables still emit as markdown pipe-rows the parser collapses.
//   - to_formats=md + image_export_mode=placeholder: figures become `<!-- image -->`
//     placeholders the shared pass strips.
//   - abort_on_error=true: fail closed (rule 6).
const PINNED_OPTIONS: Record<string, string> = {
  to_formats: "md",
  do_ocr: "false",
  image_export_mode: "placeholder",
  do_table_structure: "false",
  abort_on_error: "true"
};

export interface DoclingParserConfig {
  // Base URL of the docling-serve HTTP API (docker-compose `docling`, :5001).
  baseUrl: string;
  // Version tag of the pinned docling image, recorded in the parser config hash
  // so the layout contract is attributable to an exact converter build.
  imageTag: string;
  // Overall ceiling for one conversion (submit + poll). CPU conversions of long
  // PDFs/PPTX run for minutes; the server's own sync endpoint caps at
  // DOCLING_SERVE_MAX_SYNC_WAIT (120s), which is why we go async. Defaults 900s.
  timeoutMs?: number;
}

interface DoclingTaskStatus {
  task_id?: string;
  task_status?: string;
  error_message?: string;
}

interface DoclingConvertResponse {
  status?: string;
  errors?: unknown[];
  document?: { md_content?: string };
}

// task_status values from the docling ConversionStatus enum.
const TERMINAL_OK = new Set(["success", "partial_success"]);
const TERMINAL_FAIL = new Set(["failure", "skipped"]);

export class DoclingStructuredDocumentParser implements StructuredDocumentParserPort {
  constructor(private readonly config: DoclingParserConfig) {}

  supports(contentType: string): boolean {
    return contentType in SUPPORTED;
  }

  async parse(input: { sourceResourceId: string; bytes: Uint8Array; contentType: string }): Promise<StructuredDocument> {
    const format = SUPPORTED[input.contentType];
    if (!format) throw new Error(`DoclingStructuredDocumentParser does not support ${input.contentType}.`);

    const markdown = await this.convert(input.bytes, input.contentType, format);
    return {
      sourceResourceId: input.sourceResourceId,
      parserName: PARSER_NAME,
      parserVersion: PARSER_VERSION,
      parserConfigHash: this.configHash(),
      blocks: extractMarkdownBlocks(markdown)
    };
  }

  // The pinned converter identity: parser version + docling image tag + the
  // exact conversion options. Two runs with the same hash produced the same
  // layout contract — the reproducibility guarantee Gate 2 depends on.
  private configHash(): string {
    const options = Object.entries(PINNED_OPTIONS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return createHash("sha256").update(`${PARSER_NAME}:${PARSER_VERSION}:${this.config.imageTag}:${options}`).digest("hex");
  }

  // Async conversion: submit → poll task status → fetch result. The synchronous
  // endpoint holds the connection open for the whole CPU conversion and caps at
  // the server's DOCLING_SERVE_MAX_SYNC_WAIT (120s); the async flow decouples the
  // client from that cap, which a frozen oracle suite with large documents needs.
  private async convert(bytes: Uint8Array, contentType: string, format: string): Promise<string> {
    const deadline = Date.now() + (this.config.timeoutMs ?? 900_000);

    const form = new FormData();
    // Docling detects the source format from the filename extension.
    form.append("files", new Blob([bytes as BlobPart], { type: contentType }), `source.${format}`);
    for (const [key, value] of Object.entries(PINNED_OPTIONS)) form.append(key, value);

    const submitted = (await this.request(`/v1/convert/file/async`, { method: "POST", body: form }, deadline)) as DoclingTaskStatus;
    const taskId = submitted.task_id;
    if (!taskId) throw new Error(`Docling async submit returned no task_id (status=${submitted.task_status ?? "<none>"}).`);

    // Poll with server-side long-poll (wait=5s) until a terminal state. The
    // server blocks up to `wait` seconds per call, so this is not a busy loop.
    let status = submitted.task_status ?? "pending";
    while (!TERMINAL_OK.has(status) && !TERMINAL_FAIL.has(status)) {
      if (Date.now() > deadline) throw new Error(`Docling conversion timed out (task ${taskId}, last status=${status}).`);
      const polled = (await this.request(`/v1/status/poll/${taskId}?wait=5`, { method: "GET" }, deadline)) as DoclingTaskStatus;
      status = polled.task_status ?? status;
      if (TERMINAL_FAIL.has(status)) {
        throw new Error(`Docling conversion ${status} (task ${taskId}): ${polled.error_message ?? "no detail"}`);
      }
    }

    const result = (await this.request(`/v1/result/${taskId}`, { method: "GET" }, deadline)) as DoclingConvertResponse;
    // Fail closed: only accept an explicit success with non-empty markdown.
    if (result.status !== "success") {
      throw new Error(`Docling result status=${result.status ?? "<none>"} errors=${JSON.stringify(result.errors ?? [])}`);
    }
    const markdown = result.document?.md_content;
    if (!markdown || markdown.trim().length === 0) {
      throw new Error("Docling result returned empty md_content.");
    }
    return markdown;
  }

  // One HTTP call bounded by the overall conversion deadline, parsing JSON and
  // failing closed on any non-2xx.
  private async request(pathAndQuery: string, init: RequestInit, deadline: number): Promise<unknown> {
    const controller = new AbortController();
    const remaining = Math.max(1_000, deadline - Date.now());
    const timeout = setTimeout(() => controller.abort(), remaining);
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}${pathAndQuery}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Docling ${pathAndQuery} failed: HTTP ${response.status} ${response.statusText} ${body.slice(0, 500)}`);
    }
    return response.json();
  }
}
