import type { ZodType } from "zod";

export type JsonSchema = Record<string, unknown>;
export type ToolMessage = { role: "system" | "user" | "assistant"; content: string };

type LiteLlmResponse = {
  choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
};

export class LiteLlmForcedToolClient {
  constructor(private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number }) {}

  async call<T>(input: { model: string; messages: ToolMessage[]; toolName: string; toolDescription: string; parameters: JsonSchema; validator: ZodType<T> }): Promise<T> {
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
    const calls = payload.choices?.[0]?.message?.tool_calls ?? [];
    if (calls.length !== 1 || calls[0]?.function?.name !== input.toolName) throw new Error(`Expected exactly one forced tool call: ${input.toolName}.`);
    const argumentsText = calls[0]?.function?.arguments;
    if (!argumentsText) throw new Error("Forced tool call did not include arguments.");
    return input.validator.parse(JSON.parse(argumentsText));
  }
}
