import type { ZodType } from "zod";

export type JsonSchema = Record<string, unknown>;
export type ToolMessage = { role: "system" | "user" | "assistant"; content: string };

type LiteLlmResponse = {
  choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
};

export class LiteLlmForcedToolClient {
  constructor(private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number; maxRetries?: number }) {}

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
        if (attempt < maxRetries) await delay(500 * (attempt + 1));
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
        tool_choice: { type: "function", function: { name: input.toolName } }
      })
    });
    if (!response.ok) throw new Error(`LiteLLM request failed with ${response.status}.`);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
