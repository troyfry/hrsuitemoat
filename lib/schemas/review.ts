// lib/schemas/review.ts
import { z } from "zod";

/**
 * Zod schema the server enforces AFTER OpenAI returns JSON.
 * Keep this aligned with the OpenAI json_schema below.
 */
export const ReviewSchemaZ = z.object({
  schema_version: z.literal("ReviewSchema.v1"),
  jurisdiction: z.string().min(2),
  filename: z.string(),
  summary: z.string().min(40),
  overall_risk: z.enum(["low", "medium", "high"]),
  issues: z
    .array(
      z.object({
        section: z.string().min(1),
        title: z.string().min(3),
        description: z.string().min(20),
        severity: z.enum(["low", "medium", "high"]),
        related_statutes: z.array(z.string()),
      })
    )
    .default([]),
  legal_citations: z.array(z.string()).default([]),
  sources: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(), // don't enforce .url() here; OpenAI schema just uses string
        citation: z.string(),
        accessed_at: z.string(), // ISO-8601 encouraged by prompt; we accept string
      })
    )
    .default([]),
  disclaimers: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
  soft_fail: z.boolean(),
  fallback_offered: z.enum(["federal", "none"]),
});
export type ReviewSchema = z.infer<typeof ReviewSchemaZ>;

/**
 * OpenAI response_format JSON schema.
 * NOTE:
 *  - name MUST match ^[a-zA-Z0-9_-]+$
 *  - include EVERY key from properties in "required" arrays where needed
 *  - avoid nonstandard formats (e.g., "uri")
 */
export const ReviewSchemaOpenAI = {
  name: "ReviewSchema_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      schema_version: { type: "string", const: "ReviewSchema.v1" },
      jurisdiction: { type: "string", minLength: 2 },
      filename: { type: "string" },
      summary: { type: "string", minLength: 40 },
      overall_risk: { type: "string", enum: ["low", "medium", "high"] },
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            section: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 3 },
            description: { type: "string", minLength: 20 },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            related_statutes: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "section",
            "title",
            "description",
            "severity",
            "related_statutes",
          ],
        },
      },
      legal_citations: {
        type: "array",
        items: { type: "string" },
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            url: { type: "string" }, // keep plain string; upstream "uri" format is not accepted
            citation: { type: "string" },
            accessed_at: { type: "string" }, // ISO-8601 encouraged, not enforced here
          },
          required: ["name", "url", "citation", "accessed_at"],
        },
      },
      disclaimers: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      soft_fail: { type: "boolean" },
      fallback_offered: { type: "string", enum: ["federal", "none"] },
    },
    required: [
      "schema_version",
      "jurisdiction",
      "filename",
      "summary",
      "overall_risk",
      "issues",
      "legal_citations",
      "sources",
      "disclaimers",
      "confidence",
      "soft_fail",
      "fallback_offered",
    ],
  },
  strict: true,
};
