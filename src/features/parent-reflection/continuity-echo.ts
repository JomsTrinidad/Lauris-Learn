"use client";

/**
 * Phase 16 — Parent Reflection Layer V1 (continuity echo).
 *
 * Sibling of the Phase-11 `proud-moments/resonance` module. Both surfaces
 * are PRIVATE PARENT REFLECTIONS — quiet observable echoes from home —
 * scoped to a stable anchor on the page. Phase 11 attaches to a single
 * `proud_moment.id`. Phase 16 attaches to a stable continuity anchor —
 * for v1 only, that's the school support context (one per child, one
 * `updatedAt` per re-write by school staff).
 *
 * Architectural contract (mirrors Phase 11 byte-for-byte intent):
 *   - localStorage ONLY in v1 — no backend, no schema, no RLS, no RPC.
 *   - Teachers do NOT see parent echoes in v1. Privacy by architecture.
 *   - No notifications, no badges, no counters, no thread.
 *   - One phrase per (parent device, child, anchor).
 *   - Free-text composition is NOT supported — preset phrases only.
 *
 * Why a separate module instead of generalising `useResonance`:
 *   The two layers WILL diverge. Resonance is reactive (responding to a
 *   specific celebrated moment). Echo is reflective (acknowledging a
 *   broader ongoing situation). Phrase voice differs; persistence semantics
 *   may diverge later (e.g. echoes might one day chain across context
 *   updates, while resonance stays single-moment). Keeping them as
 *   parallel modules preserves room to evolve each independently. Phase 16
 *   v1 deliberately uses the same surface grammar — the divergence is
 *   structural, not visual.
 *
 * Voice contract:
 *   Phrases are OBSERVATIONAL ECHOES from home, on the BROADER situation
 *   the school has named (not on a single event). Tone is "we're seeing
 *   this too" — not "thanks for letting us know", not "great", not a
 *   reply. Phrases use second-person "we" / child's first name, never "I".
 *
 * Storage key shape:
 *   parent-continuity-echo:{childId}:{anchorId}  →  phrase string
 *
 * Anchor invalidation:
 *   The caller passes `anchorId` (in v1: support context's `updatedAt`
 *   timestamp). When school updates the context, anchorId changes, and the
 *   old echo no longer renders. The previous localStorage row stays for
 *   audit / future "echo history" surfaces, but is invisible until/unless
 *   referenced again. No automatic cleanup in v1.
 */

import { useCallback, useEffect, useState } from "react";

function echoKey(childId: string, anchorId: string): string {
  return `parent-continuity-echo:${childId}:${anchorId}`;
}

interface StoredEcho {
  phrase: string | null;
  savedAt: string | null;
}

/**
 * Parses either the V2 JSON `{phrase, savedAt}` shape OR the legacy bare
 * phrase string. Legacy saves return savedAt=null and render their phrase
 * without a temporal stamp — correct because we have no record of when
 * they were saved.
 */
function parseStoredEcho(raw: string | null): StoredEcho {
  if (raw === null) return { phrase: null, savedAt: null };
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed && typeof parsed === "object"
      && typeof parsed.phrase === "string"
    ) {
      return {
        phrase: parsed.phrase,
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
      };
    }
  } catch {
    // Not JSON — fall through to legacy string handling.
  }
  return { phrase: raw, savedAt: null };
}

function serializeEcho(phrase: string): string {
  return JSON.stringify({ phrase, savedAt: new Date().toISOString() });
}

/**
 * Returns the parent's continuity echo + savedAt anchor for a specific
 * anchor (v1: support-context `updatedAt`), plus setter. SSR-safe —
 * hydrates on mount via useEffect.
 *
 * `hydrated` is true once the initial localStorage read has completed.
 * Callers should render nothing until hydrated to avoid flicker.
 *
 * V2 — Journey Memory: storage is now JSON `{phrase, savedAt}`. The
 * savedAt anchor lets the saved pill carry a temporal stamp ("· 6d")
 * so the pill becomes a remembered note, not a current-state toggle.
 * Legacy plain strings still parse and render without the stamp.
 */
export function useContinuityEcho(
  childId: string | null,
  anchorId: string | null,
) {
  const [state, setState] = useState<StoredEcho>({ phrase: null, savedAt: null });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!childId || !anchorId || typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(echoKey(childId, anchorId));
      setState(parseStoredEcho(stored));
    } catch {
      // localStorage unavailable (private browsing edge) — no-op. The echo
      // simply won't persist this session, which is acceptable.
    }
    setHydrated(true);
  }, [childId, anchorId]);

  const setPhrase = useCallback((next: string | null) => {
    if (next === null) {
      setState({ phrase: null, savedAt: null });
    } else {
      setState({ phrase: next, savedAt: new Date().toISOString() });
    }
    if (!childId || !anchorId || typeof window === "undefined") return;
    try {
      if (next === null) {
        window.localStorage.removeItem(echoKey(childId, anchorId));
      } else {
        window.localStorage.setItem(echoKey(childId, anchorId), serializeEcho(next));
      }
    } catch {
      // Silent — write failure means the echo won't persist; UX still works.
    }
  }, [childId, anchorId]);

  return { phrase: state.phrase, savedAt: state.savedAt, setPhrase, hydrated };
}

/**
 * Returns three preset continuity-echo phrases. Fewer than Phase 11's five
 * because the echo is broader-scope (responds to a multi-day situation,
 * not a single celebrated moment) — three phrases cover the meaningful
 * states: same observation, child has expressed it themselves, ongoing
 * presence at home.
 *
 * Phrase voice: observational, modest, grounded. Never enthusiastic,
 * never effusive. Reflects "we're seeing this too" energy, not "thanks!"
 * or "great job!" energy. Phrases are deliberately statements, not
 * questions, so the strip never reads as a survey.
 */
export function buildContinuityEchoPhrases(firstName: string): string[] {
  const name = firstName.trim() || "Your child";
  return [
    "We're seeing this at home too.",
    `${name} has talked about this.`,
    "We've been noticing this lately.",
  ];
}
