"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { useCareContext } from "@/features/care/CareContext";
import {
  getChildIdentity,
  listChildIdentifiers,
  listGrantedChildren,
  listOwnedChildren,
  listSharedDocuments,
} from "@/features/care/queries";
import { listClinicDocumentsForChild } from "@/features/care/clinic-documents-api";
import { ChildDetailView } from "@/features/care/ChildDetailView";
import type {
  CareChildRow,
  ChildIdentifier,
  ChildIdentity,
  ClinicDocument,
  SharedDocument,
} from "@/features/care/types";

export default function CareChildDetailPage() {
  const { activeOrganizationId, isClinicAdmin, userId } = useCareContext();
  const params = useParams<{ childProfileId: string }>();
  const childProfileId = params?.childProfileId ?? "";

  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<ChildIdentity | null>(null);
  const [identifiers, setIdentifiers] = useState<ChildIdentifier[]>([]);
  const [match, setMatch] = useState<CareChildRow | null>(null);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [clinicDocuments, setClinicDocuments] = useState<ClinicDocument[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!activeOrganizationId || !childProfileId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [owned, grants, idy, ids, docs, clinicDocs] = await Promise.all([
        listOwnedChildren(activeOrganizationId),
        listGrantedChildren(activeOrganizationId),
        getChildIdentity(childProfileId),
        listChildIdentifiers(childProfileId),
        listSharedDocuments(activeOrganizationId, childProfileId),
        listClinicDocumentsForChild(childProfileId),
      ]);
      if (cancelled) return;

      const ownedMatch = owned.find((o) => o.childProfileId === childProfileId);
      if (ownedMatch) {
        setMatch({
          childProfileId,
          displayName: ownedMatch.displayName,
          preferredName: ownedMatch.preferredName,
          dateOfBirth: ownedMatch.dateOfBirth,
          originType: "owned",
        });
      } else {
        const grantMatch = grants.find(
          (g) => g.childProfileId === childProfileId,
        );
        if (grantMatch) {
          setMatch({
            childProfileId,
            displayName: grantMatch.displayName,
            preferredName: grantMatch.preferredName,
            dateOfBirth: grantMatch.dateOfBirth,
            originType: "shared",
            scope: grantMatch.scope,
            grantValidUntil: grantMatch.grantValidUntil,
          });
        } else {
          setMatch(null);
        }
      }

      setIdentity(idy);
      setIdentifiers(ids);
      setDocuments(docs);
      setClinicDocuments(clinicDocs);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId, childProfileId, reloadTick]);

  if (!activeOrganizationId) return null;

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (!identity || !match) {
    return (
      <div className="space-y-4">
        <Link
          href="/care/children"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>
        <Card className="p-12 text-center">
          <p className="font-medium">Child not available.</p>
          <p className="text-sm text-muted-foreground mt-1">
            This child is no longer linked to your organization, or the access
            window has ended.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <ChildDetailView
      identity={identity}
      identifiers={identifiers}
      origin={match}
      documents={documents}
      clinicDocuments={clinicDocuments}
      canEdit={isClinicAdmin && match.originType === "owned"}
      isClinicAdmin={isClinicAdmin}
      uploaderProfileId={userId ?? undefined}
      originOrganizationId={
        match.originType === "owned" ? activeOrganizationId : undefined
      }
      onChanged={() => setReloadTick((n) => n + 1)}
    />
  );
}
