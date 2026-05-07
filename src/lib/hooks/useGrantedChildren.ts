import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";
import { listGrantedChildren } from "@/features/care/queries";
import type { GrantedChild } from "@/features/care/types";

/**
 * useGrantedChildren — fetch children granted to a clinic via active identity grants
 *
 * Returns children whose child_profile is currently shared with the caller's clinic
 * via an active, currently-valid identity grant.
 * Cached for 30 seconds to prevent re-fetches on org switch
 *
 * Returns: GrantedChild[] (includes displayName, scope, grantValidUntil)
 */
export function useGrantedChildren(organizationId: string | null) {
  return useQuery({
    queryKey: queryKeys.careGrantedChildren.list(organizationId || ""),
    queryFn: async () => {
      if (!organizationId) throw new Error("organizationId required");
      return listGrantedChildren(organizationId);
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes
  });
}
