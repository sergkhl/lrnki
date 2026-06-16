import type { ZodType } from "zod";

export type JsonSchema = Record<string, unknown>;
export type ToolMessage = { role: "system" | "user" | "assistant"; content: string };

type LiteLlmResponse = {
  choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
};

export class LiteLlmForcedToolClient {
  // `temperature`/`seed` are the determinism lever (TODO 1). When set, every
  // forced-tool call samples greedily with a fixed seed so the neural stages
  // (discovery/admission/claims) stop drifting across re-runs. Left unset, the
  // client stays a neutral transport at the model's default sampling — the
  // composition root chooses the policy, not this transport.
  constructor(private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number; maxRetries?: number; temperature?: number; seed?: number }) {}

  async call<T>(input: { model: string; messages: ToolMessage[]; toolName: string; toolDescription: string; parameters: JsonSchema; validator: ZodType<T> }): Promise<T> {
    // Retry budget for transient model deviations (zero/multiple tool calls,
    // malformed arguments, network blips). Fail closed once exhausted.
    const maxRetries = this.options.maxRetries ?? 2;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.callOnce(input);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          // Rate limits (429) need a real cooldown window, not a 500ms blip —
          // back off exponentially and longer than for ordinary deviations.
          const status = error instanceof LiteLlmHttpError ? error.status : undefined;
          const base = status === 429 ? 2000 : 500;
          await delay(base * 2 ** attempt);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async callOnce<T>(input: { model: string; messages: ToolMessage[]; toolName: string; toolDescription: string; parameters: JsonSchema; validator: ZodType<T> }): Promise<T> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: [{ type: "function", function: { name: input.toolName, description: input.toolDescription, parameters: input.parameters, strict: true } }],
        tool_choice: { type: "function", function: { name: input.toolName } },
        ...(this.options.temperature !== undefined ? { temperature: this.options.temperature } : {}),
        ...(this.options.seed !== undefined ? { seed: this.options.seed } : {})
      })
    });
    if (!response.ok) throw new LiteLlmHttpError(response.status);
    const payload = await response.json() as LiteLlmResponse;
    const calls = (payload.choices?.[0]?.message?.tool_calls ?? []).filter((call) => call?.function?.name === input.toolName);
    // Forced tool_choice should yield exactly one matching call; tolerate the model
    // emitting the same tool more than once by taking the first valid arguments.
    if (calls.length === 0) throw new Error(`Expected a forced tool call: ${input.toolName}.`);
    const argumentsText = calls[0]?.function?.arguments;
    if (!argumentsText) throw new Error("Forced tool call did not include arguments.");
    return input.validator.parse(JSON.parse(argumentsText));
  }
}

export class LiteLlmHttpError extends Error {
  constructor(readonly status: number) {
    super(`LiteLLM request failed with ${status}.`);
    this.name = "LiteLlmHttpError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
