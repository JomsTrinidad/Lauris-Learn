import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";
import { listDocuments, type DocumentListItem, type ListDocumentsFilters } from "@/features/documents/queries";

/**
 * useSchoolDocuments — fetch documents for the school Document Coordination workspace
 *
 * Applies filters: school, student, status, type, search
 * Cached for 30 seconds to prevent re-fetches on tab switch / filter change
 *
 * Returns: DocumentListItem[] (includes enriched student info and current version)
 */
export function useSchoolDocuments(
  schoolId: string | null,
  filters: {
    studentId?: string | null;
    status?: string | null;
    documentType?: string | null;
    search?: string | null;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.documents.list(schoolId || "", filters),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      const listFilters: ListDocumentsFilters = {
        schoolId,
        studentId: filters.studentId || null,
        status: (filters.status as any) || null,
        documentType: (filters.documentType as any) || null,
        search: filters.search || null,
      };

      return listDocuments(supabase, listFilters);
    },
    enabled: !!schoolId,
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes
  });
}
