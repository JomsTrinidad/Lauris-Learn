"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";
import { Spinner, ErrorAlert } from "@/components/ui/spinner";
import { useCareContext } from "@/features/care/CareContext";
import { useCareSharedDocuments, useGrantedChildren } from "@/lib/hooks";
import { SharedDocumentsList } from "@/features/care/SharedDocumentsList";

export default function CareDocumentsPage() {
  const { activeOrganizationId, activeOrganizationName } = useCareContext();

  // Hook: documents shared with this clinic
  const docsQuery = useCareSharedDocuments(activeOrganizationId);

  // Hook: children granted to this clinic
  const childrenQuery = useGrantedChildren(activeOrganizationId);

  // Build child names map from granted children
  const childNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of childrenQuery.data ?? []) map[c.childProfileId] = c.displayName;
    return map;
  }, [childrenQuery.data]);

  if (!activeOrganizationId) return null;

  const isLoading = docsQuery.isLoading || childrenQuery.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Documents
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Documents explicitly shared with{" "}
          <span className="font-medium">{activeOrganizationName}</span>.
        </p>
      </div>

      {docsQuery.error && <ErrorAlert message={docsQuery.error.message} />}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <SharedDocumentsList
          documents={docsQuery.data ?? []}
          childNamesById={childNamesById}
        />
      )}
    </div>
  );
}
