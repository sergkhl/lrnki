import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolMessage } from "./LiteLlmForcedToolClient";

export type PromptFile = {
  path: string;
  bytes: Buffer;
  model: string;
  toolName: string;
  toolDescription: string;
  systemTemplate: string;
  userTemplate: string;
  dependencyPaths: string[];
};

export type RenderedPromptFile = {
  model: string;
  toolName: string;
  toolDescription: string;
  messages: ToolMessage[];
};

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const promptRoot = join(packageRoot, "prompts");
const promptCache = new Map<string, PromptFile>();
const partialCache = new Map<string, string>();

export function readPromptFile(promptPath: string): PromptFile {
  const cached = promptCache.get(promptPath);
  if (cached) return cached;
  const fullPath = join(promptRoot, promptPath);
  const bytes = readFileSync(fullPath);
  const text = bytes.toString("utf8");
  const { frontmatter, body } = parsePromptDocument(text, promptPath);
  const systemTemplate = extractBlock(body, "system", promptPath);
  const userTemplate = extractBlock(body, "user", promptPath);
  const partialNames = [...body.matchAll(/\{\{>\s*([a-zA-Z0-9_-]+)\s*\}\}/g)].map((match) => match[1]);
  const dependencyPaths = partialNames.map((name) => `partials/${name}.prompt`);
  const prompt = {
    path: promptPath,
    bytes,
    model: requiredScalar(frontmatter, "model", promptPath),
    toolName: requiredScalar(frontmatter, "lrnki.toolName", promptPath),
    toolDescription: requiredScalar(frontmatter, "lrnki.toolDescription", promptPath),
    systemTemplate,
    userTemplate,
    dependencyPaths
  };
  promptCache.set(promptPath, prompt);
  return prompt;
}

export function promptFileDependencyBytes(promptPath: string): Buffer[] {
  const prompt = readPromptFile(promptPath);
  return [prompt.bytes, ...prompt.dependencyPaths.map((path) => readFileSync(join(promptRoot, path)))];
}

export function renderPromptFile(promptPath: string, data: Record<string, unknown>): RenderedPromptFile {
  const prompt = readPromptFile(promptPath);
  return {
    model: prompt.model,
    toolName: prompt.toolName,
    toolDescription: prompt.toolDescription,
    messages: [
      { role: "system", content: renderTemplate(prompt.systemTemplate, data).trim() },
      { role: "user", content: renderTemplate(prompt.userTemplate, data).trim() }
    ]
  };
}

function parsePromptDocument(text: string, promptPath: string): { frontmatter: Map<string, string>; body: string } {
  if (!text.startsWith("---\n")) throw new Error(`${promptPath}: expected YAML frontmatter`);
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`${promptPath}: frontmatter is not closed`);
  const frontmatter = new Map<string, string>();
  const stack: string[] = [];
  for (const rawLine of text.slice(4, end).split("\n")) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const level = Math.floor(indent / 2);
    stack.length = level;
    const line = rawLine.trim();
    if (line.endsWith(":")) {
      stack[level] = line.slice(0, -1);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`${promptPath}: unsupported frontmatter line ${JSON.stringify(rawLine)}`);
    const key = [...stack, line.slice(0, colon).trim()].filter(Boolean).join(".");
    frontmatter.set(key, line.slice(colon + 1).trim());
  }
  return { frontmatter, body: text.slice(end + "\n---\n".length) };
}

function extractBlock(body: string, blockName: "system" | "user", promptPath: string): string {
  const pattern = new RegExp(`\\{\\{#${blockName}\\}\\}\\n?([\\s\\S]*?)\\n?\\{\\{/${blockName}\\}\\}`);
  const match = body.match(pattern);
  if (!match) throw new Error(`${promptPath}: missing {{#${blockName}}} block`);
  return match[1] ?? "";
}

function requiredScalar(frontmatter: Map<string, string>, key: string, promptPath: string): string {
  const value = frontmatter.get(key);
  if (!value) throw new Error(`${promptPath}: missing frontmatter ${key}`);
  return value;
}

function renderTemplate(template: string, data: Record<string, unknown>): string {
  const withLoops = template.replace(/\{\{#each\s+([a-zA-Z0-9_.-]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_match, key: string, inner: string) => {
    const value = lookup(data, key);
    if (!Array.isArray(value)) return "";
    return value.map((item) => renderTemplate(inner, asRecord(item))).join("");
  });
  const withPartials = withLoops.replace(/\{\{>\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, name: string) =>
    renderTemplate(readPartial(name), data)
  );
  return withPartials.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => String(lookup(data, key) ?? ""));
}

function readPartial(name: string): string {
  const cached = partialCache.get(name);
  if (cached !== undefined) return cached;
  const text = readFileSync(join(promptRoot, "partials", `${name}.prompt`), "utf8");
  partialCache.set(name, text);
  return text;
}

function lookup(data: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => asRecord(current)[part], data);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
