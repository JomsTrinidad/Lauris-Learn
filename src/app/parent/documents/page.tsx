"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Calendar, ShieldCheck, AlertCircle, BellRing, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import {
  formatDocumentType,
  formatDate,
  daysUntil,
} from "@/features/documents/utils";
import {
  listParentDocuments,
  listConsentsForStudentDocument,
  isConsentLive,
  type ParentDocumentListItem,
} from "@/features/documents/parent-api";
import { ParentDocumentDetailModal } from "@/features/documents/ParentDocumentDetailModal";
import { ParentUploadDocumentModal } from "@/features/documents/ParentUploadDocumentModal";
import { PendingConsentsPanel } from "@/features/documents/PendingConsentsPanel";
import { ParentRequestsPanel } from "@/features/documents/ParentRequestsPanel";
import type { DocumentType } from "@/features/documents/types";
import { useParentContext } from "../layout";

export default function ParentDocumentsPage() {
  const { childId, child, schoolId } = useParentContext();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Fulfillment context — non-null when the upload modal was opened from
  // ParentRequestsPanel, so we can wire requestId + defaultDocumentType
  // through to the modal and clear it on close.
  const [fulfillCtx, setFulfillCtx] = useState<
    { id: string; label: string; type: DocumentType } | null
  >(null);
  // Bumped after a fulfillment / decline so ParentRequestsPanel reloads.
  const [requestsRefresh, setRequestsRefresh] = useState(0);
  // Bumped after the detail modal grants/revokes a consent so the
  // page-level pending-consents panel re-fetches (otherwise that panel
  // would still show the just-handled row until the next route change).
  const [consentsRefresh, setConsentsRefresh] = useState(0);

  // The ParentContext already exposes the selected child (multi-child families
  // get a switcher in the header). The optional ?student=<id> param lets a
  // parent deep-link to a specific child's documents — but only if the URL
  // matches one of their kids. We don't blindly trust the param; if it doesn't
  // match `childId` (which RLS already trusts), fall through to the context.
  const studentParam = searchParams.get("student");
  const effectiveStudentId = studentParam === childId ? childId : childId;

  const [docs, setDocs] = useState<ParentDocumentListItem[]>([]);
  const [pendingByDoc, setPendingByDoc] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!effectiveStudentId) {
        setLoading(false);
        setDocs([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const rows = await listParentDocuments(supabase, effectiveStudentId);
        if (signal?.aborted) return;
        setDocs(rows);

        // Per-doc count of live "pending" consents — drives the
        // "Pending your approval" badge on each card. We fan these out
        // in parallel; volumes are tiny per child.
        const counts: Record<string, number> = {};
        await Promise.all(
          rows.map(async (d) => {
            try {
              const cs = await listConsentsForStudentDocument(supabase, {
                id:            d.id,
                document_type: d.document_type,
                student_id:    d.student_id,
                school_id:     d.school_id,
              });
              const n = cs.filter((c) => c.status === "pending" && isConsentLive(c)).length;
              if (n > 0) counts[d.id] = n;
            } catch {
              // Non-fatal — list still renders without the badge.
            }
          }),
        );
        if (signal?.aborted) return;
        setPendingByDoc(counts);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Couldn't load documents.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [effectiveStudentId, supabase],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Resolve auth.uid() once for the upload modal's created_by / uploader_user_id.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setParentUserId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  // If the URL had a stray ?student value that didn't match, strip it so the
  // page is canonical for the active child.
  useEffect(() => {
    if (studentParam && studentParam !== childId) {
      router.replace("/parent/documents");
    }
  }, [studentParam, childId, router]);

  const canUpload = !!(schoolId && childId && parentUserId);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Shared with you{child ? ` about ${child.firstName}` : ""}.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setUploadOpen(true)}
          disabled={!canUpload}
          title={canUpload ? undefined : "Loading your account…"}
        >
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          Upload for School
        </Button>
      </div>

      {/* Page-level inbox panels — pending consents and incoming document
          requests both need to be reachable without opening a doc, so we
          surface them above the list. */}
      <ParentRequestsPanel
        studentId={effectiveStudentId}
        refreshKey={requestsRefresh}
        onFulfill={(req) => {
          setFulfillCtx(req);
          setUploadOpen(true);
        }}
        onChanged={() => setRequestsRefresh((n) => n + 1)}
      />

      <PendingConsentsPanel
        studentId={effectiveStudentId}
        refreshKey={consentsRefresh}
        onChanged={() => { void load(); }}
      />

      {error && <ErrorAlert message={error} />}

      {loading ? (
        <PageSpinner />
      ) : docs.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <DocumentCard
              key={d.id}
              doc={d}
              pendingCount={pendingByDoc[d.id] ?? 0}
              onOpen={() => setSelectedDocId(d.id)}
            />
          ))}
        </ul>
      )}

      <ParentDocumentDetailModal
        docId={selectedDocId}
        onClose={() => setSelectedDocId(null)}
        onChanged={() => {
          // Detail-modal grants/revokes can flip a doc from invisible to
          // visible (or vice versa) AND clear a row from the pending-consents
          // panel — refresh both so the UI doesn't go stale.
          void load();
          setConsentsRefresh((n) => n + 1);
        }}
      />

      {schoolId && childId && parentUserId && child && (
        <ParentUploadDocumentModal
          open={uploadOpen}
          onClose={() => {
            setUploadOpen(false);
            setFulfillCtx(null);
          }}
          onUploaded={(docId) => {
            setUploadOpen(false);
            // Refresh the list (new draft appears immediately) and the
            // requests panel (fulfilled row should flip to submitted), then
            // open the detail modal for the just-uploaded doc.
            void load();
            if (fulfillCtx) setRequestsRefresh((n) => n + 1);
            setFulfillCtx(null);
            setSelectedDocId(docId);
          }}
          schoolId={schoolId}
          studentId={childId}
          studentName={`${child.firstName} ${child.lastName}`}
          userId={parentUserId}
          fulfillingRequestId={fulfillCtx?.id ?? null}
          fulfillingRequestLabel={fulfillCtx?.label ?? null}
          defaultDocumentType={fulfillCtx?.type ?? null}
        />
      )}
    </div>
  );
}


function DocumentCard({
  doc,
  pendingCount,
  onOpen,
}: {
  doc: ParentDocumentListItem;
  pendingCount: number;
  onOpen: () => void;
}) {
  const reviewDays = daysUntil(doc.review_date);
  const reviewSoon =
    reviewDays != null && reviewDays >= 0 && reviewDays <= 14;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full text-left rounded-xl border bg-card hover:bg-accent/40 transition-colors px-4 py-3 ${
          pendingCount > 0 ? "border-amber-300" : "border-border"
        }`}
      >
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm truncate">{doc.title}</h3>
              <Badge variant={doc.status}>{doc.status}</Badge>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                  <BellRing className="w-3 h-3" />
                  Pending your approval
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDocumentType(doc.document_type)}
              {doc.current_version && (
                <> · v{doc.current_version.version_number}</>
              )}
            </p>
            <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap">
              {doc.effective_date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(doc.effective_date)}
                </span>
              )}
              {doc.review_date && (
                <span
                  className={`inline-flex items-center gap-1 ${
                    reviewSoon ? "text-orange-700" : ""
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  Review {formatDate(doc.review_date)}
                </span>
              )}
              {doc.source_kind === "parent" && (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  You uploaded this
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}


function EmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center space-y-2">
        <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="font-medium">No documents yet</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Documents the school shares with you (IEPs, therapy reports, medical
          certificates) will show up here. You can also send the school
          documents of your own using <strong>Upload for School</strong>.
        </p>
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 justify-center pt-2">
          <AlertCircle className="w-3 h-3" />
          Permission requests from the school appear here too.
        </p>
      </CardContent>
    </Card>
  );
}
