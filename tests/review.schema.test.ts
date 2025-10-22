import { describe, it, expect } from "vitest";
import { ReviewSchemaZ } from "@/lib/schemas/review";

describe("ReviewSchema.v1", () => {
  it("accepts a valid payload", () => {
    const sample = {
      schema_version: "ReviewSchema.v1",
      jurisdiction: "CA",
      filename: "doc.pdf",
      summary: "A".repeat(50),
      overall_risk: "medium",
      issues: [{
        section: "Meal/Rest",
        title: "Meal periods",
        description: "Policy may not provide 30-min uninterrupted meal periods.",
        severity: "high",
        related_statutes: ["Cal. Lab. Code § 226.7"]
      }],
      legal_citations: ["Cal. Lab. Code § 226.7"],
      sources: [{
        name: "DIR Meal Periods",
        url: "https://www.dir.ca.gov/...",
        citation: "Cal. Lab. Code § 226.7",
        accessed_at: new Date().toISOString()
      }],
      disclaimers: ["This is not legal advice."],
      confidence: 0.8,
      soft_fail: false,
      fallback_offered: "none"
    };
    expect(() => ReviewSchemaZ.parse(sample)).not.toThrow();
  });
});
