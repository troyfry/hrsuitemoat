// lib/schemas/review.ts
import { z } from "zod";

/** Zod used by your route */
// Zod used by route.ts
export const ReviewSchemaZ = z.object({
  schema_version: z.literal("ReviewSchema.v1"),
  jurisdiction: z.string(),
  filename: z.string(),
  summary: z.string(),
  overall_risk: z.enum(["low","medium","high"]),
  issues: z.array(z.object({
    section: z.string(),
    title: z.string(),
    description: z.string(),
    severity: z.enum(["low","medium","high"]),
    related_statutes: z.array(z.string()),
  })),
  legal_citations: z.array(z.string()),
  sources: z.array(z.object({
    name: z.string(),
    url: z.string(),
    citation: z.string(),
    accessed_at: z.string(),
  })),
  disclaimers: z.array(z.string()),
  confidence: z.number(),
  soft_fail: z.boolean(),
  fallback_offered: z.enum(["federal","none"]),
  confidence_flags: z.array(z.string()),
});


export type ReviewSchema = z.infer<typeof ReviewSchemaZ>;

/** OpenAI response_format schema — must fully require every property */
export const ReviewSchemaOpenAI = {
  name: "ReviewSchema_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      schema_version: { const: "ReviewSchema.v1" },
      jurisdiction: { type: "string" },
      filename: { type: "string" },
      summary: { type: "string" },
      overall_risk: { enum: ["low","medium","high"] },
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            section: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            severity: { enum: ["low","medium","high"] },
            related_statutes: { type: "array", items: { type: "string" } }
          },
          required: ["section","title","description","severity","related_statutes"]
        }
      },
      legal_citations: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            url: { type: "string" },
            citation: { type: "string" },
            accessed_at: { type: "string" }
          },
          required: ["name","url","citation","accessed_at"]
        }
      },
      disclaimers: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      soft_fail: { type: "boolean" },
      fallback_offered: { enum: ["federal","none"] },
      confidence_flags: { type: "array", items: { type: "string" } }
    },
    required: [
      "schema_version","jurisdiction","filename","summary","overall_risk",
      "issues","legal_citations","sources","disclaimers",
      "confidence","soft_fail","fallback_offered","confidence_flags"
    ]
  }
} as const;

