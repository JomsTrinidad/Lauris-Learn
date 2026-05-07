import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";
import {
  listParentDocuments,
  listConsentsForStudentDocument,
  isConsentLive,
  type ParentDocumentListItem,
} from "@/features/documents/parent-api";

export interface ParentDocumentsResult {
  documents: ParentDocumentListItem[];
  pendingByDoc: Record<string, number>;
}

/**
 * useParentDocuments — fetch documents shared with a parent for their child
 *
 * Loads parent-visible documents and computes per-document pending consent counts
 * via a fan-out of per-doc consent queries (volumes are tiny).
 *
 * Cached for 30 seconds to prevent re-fetches on navigation
 * Upload success should invalidate this cache.
 *
 * Returns: { documents: ParentDocumentListItem[], pendingByDoc: Record<docId, count> }
 */
export function useParentDocuments(studentId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.parentDocuments.list(studentId || ""),
    queryFn: async () => {
      if (!studentId) throw new Error("studentId required");

      // Load the documents list
      const docs = await listParentDocuments(supabase, studentId);

      // Fan out per-doc consent counts in parallel
      const counts: Record<string, number> = {};
      await Promise.all(
        docs.map(async (d) => {
          try {
            const consents = await listConsentsForStudentDocument(supabase, {
              id: d.id,
              document_type: d.document_type,
              student_id: d.student_id,
              school_id: d.school_id,
            });
            const n = consents.filter((c) => c.status === "pending" && isConsentLive(c)).length;
            if (n > 0) counts[d.id] = n;
          } catch {
            // Non-fatal — list still renders without the badge
          }
        })
      );

      return { documents: docs, pendingByDoc: counts } as ParentDocumentsResult;
    },
    enabled: !!studentId,
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes
  });
}
