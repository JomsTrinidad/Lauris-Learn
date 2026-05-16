"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCareContext } from "@/features/care/CareContext";
import {
  getCareChildWithDetails,
  getChildIdentity,
  listChildIdentifiers,
  listGrantedChildren,
  listOwnedChildren,
  listSharedDocuments,
} from "@/features/care/queries";
import { listClinicDocumentsForChild } from "@/features/care/clinic-documents-api";
import {
  getChildClinicMembershipState,
  listSessionIdsWithNotes,
  listSessionsForChild,
} from "@/features/care/sessions-api";
import { ChildDetailView } from "@/features/care/ChildDetailView";
import { ChildDetailShellSkeleton } from "@/features/care/ChildDetailSkeleton";
import type {
  CareChildDetailBundle,
  ClinicDocument,
  SharedDocument,
  TherapySession,
} from "@/features/care/types";

/**
 * Care Performance Phase 1 — progressive loading.
 *
 * The page now renders in two phases:
 *   Phase 1 (primary):   get_care_child_with_details RPC (1 round-trip)
 *                        → identity, identifiers, origin, membership.
 *                        These are sufficient to render the header,
 *                        identity card, identifier card, and the
 *                        Accept-as-therapy-client card.
 *
 *   Phase 2 (secondary): clinic docs + shared docs + sessions +
 *                        session-note indicators. These render as
 *                        skeleton blocks until ready.
 *
 * Fallback: if the RPC isn't available (e.g. migration not yet
 * applied), we fall back to the legacy 5-query path. Behaviour is
 * identical from the user's perspective — only the load time differs.
 */
export default function CareChildDetailPage() {
  const { activeOrganizationId, isClinicAdmin, userId } = useCareContext();
  const params = useParams<{ childProfileId: string }>();
  const childProfileId = params?.childProfileId ?? "";

  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [bundle, setBundle] = useState<CareChildDetailBundle | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [clinicDocuments, setClinicDocuments] = useState<ClinicDocument[]>([]);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [sessionsWithNotes, setSessionsWithNotes] = useState<Set<string>>(
    new Set(),
  );

  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!activeOrganizationId || !childProfileId) {
      setPrimaryLoading(false);
      setSecondaryLoading(false);
      return;
    }
    let cancelled = false;
    setPrimaryLoading(true);
    setSecondaryLoading(true);
    setNotFound(false);
    setBundle(null);

    // ── Phase 1: primary identity + access bundle ───────────────────
    (async () => {
      const result = await getCareChildWithDetails(
        childProfileId,
        activeOrganizationId,
      );
      if (cancelled) return;

      if (result.kind === "ok") {
        setBundle(result.bundle);
      } else if (result.kind === "not_found") {
        setNotFound(true);
      } else {
        // Fallback: RPC unavailable. Run the legacy 5-query path.
        const [owned, grants, idy, ids, memberState] = await Promise.all([
          listOwnedChildren(activeOrganizationId),
          listGrantedChildren(activeOrganizationId),
          getChildIdentity(childProfileId),
          listChildIdentifiers(childProfileId),
          getChildClinicMembershipState(
            activeOrganizationId,
            childProfileId,
          ),
        ]);
        if (cancelled) return;

        const ownedMatch = owned.find(
          (o) => o.childProfileId === childProfileId,
        );
        const grantMatch = grants.find(
          (g) => g.childProfileId === childProfileId,
        );

        if (!idy) {
          setNotFound(true);
        } else if (ownedMatch) {
          setBundle({
            identity: idy,
            identifiers: ids,
            origin: {
              childProfileId,
              displayName: ownedMatch.displayName,
              preferredName: ownedMatch.preferredName,
              dateOfBirth: ownedMatch.dateOfBirth,
              originType: "owned",
            },
            membershipState: memberState,
            showIdentifiers: true,
          });
        } else if (grantMatch) {
          setBundle({
            identity: idy,
            identifiers: ids,
            origin: {
              childProfileId,
              displayName: grantMatch.displayName,
              preferredName: grantMatch.preferredName,
              dateOfBirth: grantMatch.dateOfBirth,
              originType: "shared",
              scope: grantMatch.scope,
              grantValidUntil: grantMatch.grantValidUntil,
            },
            membershipState: memberState,
            showIdentifiers: grantMatch.scope === "identity_with_identifiers",
          });
        } else {
          setNotFound(true);
        }
      }

      setPrimaryLoading(false);
    })();

    // ── Phase 2: secondary data (docs + sessions) ───────────────────
    // Runs in parallel with phase 1. These cards render skeletons
    // until this batch resolves.
    (async () => {
      const [docs, clinicDocs, sess] = await Promise.all([
        listSharedDocuments(activeOrganizationId, childProfileId),
        listClinicDocumentsForChild(childProfileId),
        listSessionsForChild(activeOrganizationId, childProfileId),
      ]);
      if (cancelled) return;

      setDocuments(docs);
      setClinicDocuments(clinicDocs);
      setSessions(sess);

      if (sess.length > 0) {
        const noteIds = await listSessionIdsWithNotes(sess.map((s) => s.id));
        if (!cancelled) setSessionsWithNotes(noteIds);
      } else {
        setSessionsWithNotes(new Set());
      }

      setSecondaryLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId, childProfileId, reloadTick]);

  if (!activeOrganizationId) return null;

  // Phase 1 still loading → render the skeleton shell. This is the
  // shortest path; with the new RPC it typically resolves in ~100ms.
  if (primaryLoading) {
    return <ChildDetailShellSkeleton />;
  }

  if (notFound || !bundle) {
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
      identity={bundle.identity}
      identifiers={bundle.identifiers}
      origin={bundle.origin}
      documents={documents}
      clinicDocuments={clinicDocuments}
      sessions={sessions}
      sessionsWithNotes={sessionsWithNotes}
      membershipState={bundle.membershipState}
      activeOrganizationId={activeOrganizationId}
      canEdit={isClinicAdmin && bundle.origin.originType === "owned"}
      isClinicAdmin={isClinicAdmin}
      uploaderProfileId={userId ?? undefined}
      originOrganizationId={
        bundle.origin.originType === "owned" ? activeOrganizationId : undefined
      }
      secondaryLoading={secondaryLoading}
      onChanged={() => setReloadTick((n) => n + 1)}
    />
  );
}
