import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";
import { listSharedDocuments } from "@/features/care/queries";
import type { SharedDocument } from "@/features/care/types";

/**
 * useCareSharedDocuments — fetch documents shared with a clinic organization
 *
 * Returns documents explicitly shared via document_organization_access_grants
 * Cached for 30 seconds to prevent re-fetches on org switch / back-navigation
 *
 * Returns: SharedDocument[] (includes title, type, version, child_profile_id, permissions)
 */
export function useCareSharedDocuments(organizationId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.careDocuments.shared(organizationId || ""),
    queryFn: async () => {
      if (!organizationId) throw new Error("organizationId required");
      return listSharedDocuments(organizationId);
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes
  });
}
