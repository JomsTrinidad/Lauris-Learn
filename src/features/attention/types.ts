/**
 * Shared types for the dashboard "Needs Attention" feature.
 *
 * AttentionItem is produced by:
 *   - Computed inline items in dashboard/page.tsx (billing overdue, attendance, etc.)
 *   - getIepAttentionItems() in queries.ts (IEP review queue + teacher drafts)
 *
 * Fields marked optional are only populated by module-specific queries; the
 * render loop in dashboard/page.tsx gates on their presence before rendering.
 */

export type AttentionPriority = "high" | "medium" | "low";

export type AttentionCategory = "needs_review" | "needs_input";

export interface AttentionItem {
  /** Stable unique identifier for React key and deduplication. */
  id: string;
  /** Drives the colour scheme of the row in the dashboard card. */
  category: AttentionCategory;
  /** Short headline shown in bold. */
  title: string;
  /** Optional secondary line — student name + plan title for IEP items. */
  description?: string;
  /** Optional tertiary line — e.g. "Submitted 4 days ago." */
  detail?: string;
  /** Relative or absolute href for the call-to-action button. */
  action_href: string;
  /** Label text for the call-to-action button. */
  action_label: string;
  /** Controls row accent colour and sort weight. */
  priority: AttentionPriority;
  /** ISO timestamp used for sorting and age calculations — IEP items only. */
  relevant_at?: string;
  /** Related student ID — used for deep-link navigation — IEP items only. */
  related_student_id?: string;
  /** Related plan ID — used for deep-link navigation — IEP items only. */
  related_plan_id?: string;
}
