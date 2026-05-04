"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useCareContext } from "@/features/care/CareContext";
import {
  listGrantedChildren,
  listSharedDocuments,
} from "@/features/care/queries";
import { SharedDocumentsList } from "@/features/care/SharedDocumentsList";
import type { GrantedChild, SharedDocument } from "@/features/care/types";

export default function CareDocumentsPage() {
  const { activeOrganizationId, activeOrganizationName } = useCareContext();

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [children, setChildren] = useState<GrantedChild[]>([]);

  useEffect(() => {
    if (!activeOrganizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listSharedDocuments(activeOrganizationId),
      listGrantedChildren(activeOrganizationId),
    ]).then(([docs, kids]) => {
      if (cancelled) return;
      setDocuments(docs);
      setChildren(kids);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId]);

  const childNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of children) map[c.childProfileId] = c.displayName;
    return map;
  }, [children]);

  if (!activeOrganizationId) return null;

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

      {loading ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <SharedDocumentsList
          documents={documents}
          childNamesById={childNamesById}
        />
      )}
    </div>
  );
}
