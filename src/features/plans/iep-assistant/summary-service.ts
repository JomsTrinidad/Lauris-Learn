/**
 * AI summary service for IEP Progress Report Assistant.
 *
 * Two main responsibilities:
 *   1. summarizeExtraction() — parse extracted text into structured sections using AI
 *   2. mapToIepSuggestions()  — deterministically map summary sections to IEP fields
 *
 * Default provider: OpenAI Chat Completions with Structured Outputs.
 * Backward compat: IEP_AI_PROVIDER=openai_gpt4 is treated as openai.
 * Model: OPENAI_IEP_SUMMARY_MODEL env var, defaults to gpt-4.1-mini.
 *
 * Summary is optional (checks IEP_AI_PROVIDER and REPORT_AI_SUMMARY_ENABLED).
 * Mapping is deterministic and always runs (no AI needed).
 * Contract: never return fake sections or suggestions.
 * All AI output is framed as draft educational planning support requiring human review.
 * The model must not produce medical diagnoses, clinical conclusions, or legal determinations.
 */

import type {
  SummaryResult,
  SummarySection,
  SuggestionInsert,
} from "./types";
import { getExtractionConfig } from "@/lib/extraction-guardrails/config";

/**
 * JSON schema for OpenAI Structured Outputs.
 *
 * strict: true guarantees every field in `required` is always present in the response.
 * All 7 fields are type "string" — use empty string when not applicable (not null),
 * since this is compatible with the existing SummarySection type (string | null | undefined)
 * and mapToIepSuggestions() already handles empty/falsy values correctly.
 */
const IEP_SUMMARY_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "iep_summary",
    strict: true,
    schema: {
      type: "object",
      properties: {
        therapy_focus: {
          type: "string",
          description: "The reported focus of therapy or intervention. Empty string if not mentioned.",
        },
        strengths: {
          type: "string",
          description:
            "Observed strengths or positive progress — educational observations only, no diagnoses. Empty string if not mentioned.",
        },
        areas_of_need: {
          type: "string",
          description:
            "Areas needing additional educational support — use 'appears to', 'may benefit from'. Empty string if not mentioned.",
        },
        progress_since_last: {
          type: "string",
          description: "Progress noted since the previous report. Empty string if not mentioned.",
        },
        recommended_supports: {
          type: "string",
          description:
            "Educational supports or accommodations suggested by the report. Use 'consider', 'team should review'. Empty string if none.",
        },
        suggested_goals: {
          type: "string",
          description:
            "Educational goals to consider — one per line, use 'consider' framing. Empty string if none. NOT clinical targets.",
        },
        followup_notes: {
          type: "string",
          description: "Notes for the educational team to follow up on. Empty string if none.",
        },
      },
      required: [
        "therapy_focus",
        "strengths",
        "areas_of_need",
        "progress_since_last",
        "recommended_supports",
        "suggested_goals",
        "followup_notes",
      ],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Summarize extracted text into 7 structured sections.
 *
 * Checks IEP_AI_PROVIDER and REPORT_AI_SUMMARY_ENABLED. Returns
 * status='not_configured' without an AI call when either is unset.
 *
 * @param extractedText - Raw text extracted from the document
 */
export async function summarizeExtraction(
  extractedText: string,
): Promise<SummaryResult> {
  if (!extractedText || !extractedText.trim()) {
    return {
      status: "not_configured",
      message: "No extracted text to summarize.",
    };
  }

  const { aiSummaryEnabled } = getExtractionConfig();
  if (!aiSummaryEnabled) {
    return {
      status: "not_configured",
      message: "AI summary is disabled. Set REPORT_AI_SUMMARY_ENABLED=true to enable.",
    };
  }

  // Normalize provider aliases
  const rawProvider = process.env.IEP_AI_PROVIDER?.trim();
  const provider = rawProvider === "openai_gpt4" ? "openai" : rawProvider;

  if (!provider || provider === "none") {
    return {
      status: "not_configured",
      message:
        "AI summary provider not configured. " +
        "Set IEP_AI_PROVIDER=openai and OPENAI_API_KEY to generate IEP suggestions automatically.",
    };
  }

  if (provider === "openai") {
    return summarizeWithOpenAI(extractedText);
  }

  return {
    status: "not_configured",
    message: `Unknown AI provider: ${provider}. Check IEP_AI_PROVIDER configuration (expected: openai).`,
  };
}

/**
 * Summarize extracted text using OpenAI Chat Completions with Structured Outputs.
 *
 * Uses IEP_SUMMARY_SCHEMA with strict: true to guarantee all 7 fields are present.
 * Model: OPENAI_IEP_SUMMARY_MODEL (default: gpt-4.1-mini).
 * Temperature: 0.2 for consistent structured output.
 *
 * Safety contract:
 * - All output is framed as draft educational observations
 * - No medical diagnoses, clinical conclusions, or legal determinations
 * - Human review required before applying any suggestion
 */
async function summarizeWithOpenAI(
  extractedText: string,
): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "not_configured",
      message: "OPENAI_API_KEY not set. Configure it to enable AI summarization.",
    };
  }

  const model = process.env.OPENAI_IEP_SUMMARY_MODEL?.trim() || "gpt-4.1-mini";

  const systemPrompt =
    "You are a special education support tool that helps educators draft IEP content. " +
    "You extract key observations from therapy and progress reports into structured sections. " +
    "All output must be draft educational planning observations only — " +
    "NOT medical diagnoses, clinical conclusions, or legal determinations. " +
    "Use language such as 'may benefit from', 'appears to', 'consider', " +
    "'team should review', 'based on this report'. " +
    "When a section is not addressed in the report, return an empty string for that field. " +
    "Human review by a qualified educator is required before any suggestion is applied.";

  const userPrompt =
    "Analyze the following therapy or progress report and extract key observations " +
    "into the 7 required fields.\n\nREPORT TEXT:\n" + extractedText;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        response_format: IEP_SUMMARY_SCHEMA,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const openaiMessage = (errBody as any)?.error?.message ?? response.statusText;
      console.error("[iep-summary] OpenAI API error", {
        provider: "openai",
        model,
        httpStatus: response.status,
        openaiMessage,
      });
      return {
        status: "not_configured",
        message: `OpenAI API error: ${openaiMessage}`,
      };
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";

    // Structured Outputs with strict: true always produces valid JSON,
    // but we still guard the parse for belt-and-suspenders safety.
    let summary: SummarySection;
    try {
      summary = JSON.parse(content);
    } catch {
      console.error("[iep-summary] Failed to parse OpenAI JSON response", {
        provider: "openai",
        model,
        contentSnippet: content.substring(0, 200),
      });
      return {
        status: "not_configured",
        message: "Failed to parse AI response as JSON.",
      };
    }

    return {
      status: "done",
      sections: summary,
    };
  } catch (err) {
    console.error("[iep-summary] Fetch failed", {
      provider: "openai",
      model,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      status: "not_configured",
      message: `Summarization failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Map summarized content to IEP field suggestions.
 *
 * Deterministic (no AI). Converts the 7 summary sections into concrete IEP
 * field suggestions. Always runs regardless of whether AI produced the summary.
 *
 * @param summary          - Structured summary sections
 * @param sourceDocumentId - Document ID (used by the caller for the audit trail)
 */
export function mapToIepSuggestions(
  summary: SummarySection,
  sourceDocumentId: string,
): SuggestionInsert[] {
  const suggestions: SuggestionInsert[] = [];

  // 1. strengths → present_academic_strengths (medium confidence)
  if (summary.strengths?.trim()) {
    suggestions.push({
      target_section: "assessment",
      target_field: "present_academic_strengths",
      suggested_text: summary.strengths.trim(),
      source_excerpt: truncate(summary.strengths, 200),
      confidence_label: "medium",
    });
  }

  // 2. areas_of_need → present_academic_needs (medium confidence)
  if (summary.areas_of_need?.trim()) {
    suggestions.push({
      target_section: "assessment",
      target_field: "present_academic_needs",
      suggested_text: summary.areas_of_need.trim(),
      source_excerpt: truncate(summary.areas_of_need, 200),
      confidence_label: "medium",
    });
  }

  // 3. therapy_focus + progress_since_last → evaluation_results (low confidence, composite)
  const evaluationText = [
    summary.therapy_focus?.trim(),
    summary.progress_since_last?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (evaluationText) {
    suggestions.push({
      target_section: "assessment",
      target_field: "evaluation_results",
      suggested_text: evaluationText,
      source_excerpt: truncate(evaluationText, 200),
      confidence_label: "low",
    });
  }

  // 4. followup_notes → parent_concerns (low confidence)
  if (summary.followup_notes?.trim()) {
    suggestions.push({
      target_section: "assessment",
      target_field: "parent_concerns",
      suggested_text: summary.followup_notes.trim(),
      source_excerpt: truncate(summary.followup_notes, 200),
      confidence_label: "low",
    });
  }

  // 5. recommended_supports → barrier accommodations (medium confidence)
  if (summary.recommended_supports?.trim()) {
    suggestions.push({
      target_section: "supports",
      target_field: "barrier",
      suggested_text: summary.recommended_supports.trim(),
      source_excerpt: truncate(summary.recommended_supports, 200),
      confidence_label: "medium",
    });
  }

  // 6. suggested_goals → goal (split by line, low confidence)
  if (summary.suggested_goals?.trim()) {
    const goals = summary.suggested_goals
      .split("\n")
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    for (const goal of goals) {
      suggestions.push({
        target_section: "goals",
        target_field: "goal",
        suggested_text: goal,
        source_excerpt: null,
        confidence_label: "low",
      });
    }
  }

  return suggestions;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "…";
}
