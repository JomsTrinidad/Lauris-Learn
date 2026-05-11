/**
 * AI summary service for IEP Progress Report Assistant.
 *
 * Two main responsibilities:
 *   1. summarizeExtraction() — parse extracted text into structured sections using AI
 *   2. mapToIepSuggestions() — deterministically map summary sections to IEP fields
 *
 * Summary is optional (checks IEP_AI_PROVIDER env var).
 * Mapping is deterministic and always runs (no AI needed).
 * Contract: never return fake sections or suggestions.
 */

import type {
  SummaryResult,
  SummarySection,
  SuggestionInsert,
} from "./types";
import { getExtractionConfig } from "@/lib/extraction-guardrails/config";

/**
 * Summarize extracted text into 7 structured sections.
 *
 * Checks IEP_AI_PROVIDER environment variable. If not set,
 * returns status='not_configured' without attempting any AI call.
 *
 * @param extractedText - Raw text extracted from the document
 * @returns Summary with structured sections or not_configured status
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

  // Check for configured AI provider
  const provider = process.env.IEP_AI_PROVIDER?.trim();

  if (!provider || provider === "none") {
    return {
      status: "not_configured",
      message:
        "AI summary provider not configured. " +
        "To generate IEP suggestions automatically, set IEP_AI_PROVIDER " +
        "in environment variables (e.g., 'openai_gpt4').",
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Provider implementations
  // ─────────────────────────────────────────────────────────────────

  if (provider === "openai_gpt4") {
    return summarizeWithOpenAI(extractedText);
  }

  if (provider === "anthropic_claude_3_5_sonnet") {
    return {
      status: "not_configured",
      message: "Anthropic API integration not yet implemented.",
    };
  }

  // Default: unknown provider
  return {
    status: "not_configured",
    message: `Unknown AI provider: ${provider}. ` +
      "Check IEP_AI_PROVIDER configuration.",
  };
}

/**
 * Summarize extracted text using OpenAI GPT-4.
 */
async function summarizeWithOpenAI(
  extractedText: string,
): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      status: "not_configured",
      message: "OPENAI_API_KEY not set in environment variables.",
    };
  }

  const prompt = `You are an expert in special education and IEP planning.
Analyze the following therapy/progress report and extract key information into these 7 sections.
Return a JSON object with these exact fields (use null if not applicable):
{
  "therapy_focus": "What is the main focus of therapy?",
  "strengths": "What are the student's strengths or positive progress?",
  "areas_of_need": "What areas need improvement or intervention?",
  "progress_since_last": "What progress has been made since the last report?",
  "recommended_supports": "What supports or accommodations are recommended?",
  "suggested_goals": "What goals should be set? (one per line if multiple)",
  "followup_notes": "Any notes for follow-up or parent communication?"
}

REPORT TEXT:
${extractedText}

Return ONLY valid JSON, no markdown or extra text.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        status: "not_configured",
        message: `OpenAI API error: ${error.error?.message || "Unknown error"}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let summary: SummarySection;
    try {
      summary = JSON.parse(content);
    } catch {
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
    return {
      status: "not_configured",
      message: `Summarization failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Map summarized content to IEP field suggestions.
 *
 * This is deterministic mapping (no AI needed). It converts the 7
 * summary sections into concrete IEP field suggestions. Always runs,
 * regardless of whether the summary came from AI or manual input.
 *
 * @param summary - Structured summary sections
 * @param sourceDocumentId - Document ID for audit trail
 * @returns Array of suggestions ready to insert into DB
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

/**
 * Truncate text to a maximum length with ellipsis.
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with "…" if over limit
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "…";
}
