import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";
import { listRequests, type ListRequestsFilters } from "@/features/documents/requests-api";
import type { RequestStatus } from "@/features/documents/types";

/**
 * useDocumentRequests — fetch document requests for the school
 *
 * Applies filters: school, student, status
 * Cached for 30 seconds to prevent re-fetches on tab switch
 *
 * Returns: RequestListItem[] (includes enriched student, guardian, and document info)
 */
export function useDocumentRequests(
  schoolId: string | null,
  filters: {
    studentId?: string | null;
    status?: RequestStatus | null;
  }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.documentRequests.list(schoolId || "", filters),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      const listFilters: ListRequestsFilters = {
        schoolId,
        studentId: filters.studentId || null,
        status: filters.status || null,
      };

      return listRequests(supabase, listFilters);
    },
    enabled: !!schoolId,
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes
  });
}
