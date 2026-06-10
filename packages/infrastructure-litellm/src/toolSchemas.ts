import { z } from "zod";
import type { JsonSchema } from "./LiteLlmForcedToolClient";

export const conceptAdmissionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "tier", "independentlyMeaningful", "independentlyTeachable", "durableBeyondSource", "reasonCodes", "confidence"],
        properties: {
          candidateId: { type: "string" },
          tier: { type: "string", enum: ["core", "optional", "reject", "quarantine"] },
          independentlyMeaningful: { type: "boolean" },
          independentlyTeachable: { type: "boolean" },
          durableBeyondSource: { type: "boolean" },
          reasonCodes: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    }
  }
};

export const conceptAdmissionValidator = z.object({
  decisions: z.array(z.object({
    candidateId: z.string(),
    tier: z.enum(["core", "optional", "reject", "quarantine"]),
    independentlyMeaningful: z.boolean(),
    independentlyTeachable: z.boolean(),
    durableBeyondSource: z.boolean(),
    reasonCodes: z.array(z.string()),
    confidence: z.number().min(0).max(1)
  }).strict())
}).strict();
