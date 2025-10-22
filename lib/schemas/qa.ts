// lib/schemas/qa.ts
import { z } from "zod";

/** Zod (server enforcement) */
export const QASchemaZ = z.object({
  version: z.literal("QASchema.v1"),
  state: z.string().min(2),
  jurisdiction: z.enum(["state", "federal"]),
  question: z.string().min(3),
  answer: z.string().min(10),
  key_points: z.array(z.string()).min(1),
  risk_level: z.enum(["low", "medium", "high"]),
  actions: z.array(z.string()).min(1),
  citations: z.array(
    z.object({
      title: z.string().min(3),
      url: z.string().url(),
      domain: z.string().min(3),
    })
  ).min(1),
  disclaimers: z.array(z.string()).min(1),
  compliance_notes: z.array(z.string()).default([]),
  sources_restricted: z.boolean().default(false),
  fallback_used: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  generated_at: z.string(),
  model: z.string(),
});
export type QASchema = z.infer<typeof QASchemaZ>;

/** OpenAI response_format (model contract) */
export const QASchemaOpenAI = {
  name: "QASchema_v1", // must match ^[a-zA-Z0-9_-]+$
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      version: { type: "string", const: "QASchema.v1" },
      state: { type: "string", minLength: 2 },
      jurisdiction: { type: "string", enum: ["state", "federal"] },
      question: { type: "string", minLength: 3 },
      answer: { type: "string", minLength: 10 },
      key_points: { type: "array", items: { type: "string" }, minItems: 1 },
      risk_level: { type: "string", enum: ["low", "medium", "high"] },
      actions: { type: "array", items: { type: "string" }, minItems: 1 },
      citations: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", minLength: 3 },
            url: { type: "string", pattern: "^https?://.+" }, // <-- pattern (not format)
            domain: { type: "string", minLength: 3 },
          },
          required: ["title", "url", "domain"],
        },
      },
      disclaimers: { type: "array", items: { type: "string" }, minItems: 1 },
      compliance_notes: { type: "array", items: { type: "string" } },
      sources_restricted: { type: "boolean" },
      fallback_used: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      generated_at: { type: "string" },
      model: { type: "string" },
    },
    required: [
      "version",
      "state",
      "jurisdiction",
      "question",
      "answer",
      "key_points",
      "risk_level",
      "actions",
      "citations",
      "disclaimers",
      "compliance_notes",
      "sources_restricted",
      "fallback_used",
      "confidence",
      "generated_at",
      "model",
    ],
  },
  strict: true,
} as const;
