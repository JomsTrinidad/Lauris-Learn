"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Search,
  Upload,
  Inbox,
  X,
  HelpCircle,
  BookOpen,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  ShieldCheck,
  Layers,
  Ban,
  Activity as ActivityIcon,
  Users,
  Globe,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import {
  DOCUMENT_TYPE_OPTIONS,
  REQUEST_STATUS_LABELS,
  STATUS_LABELS,
} from "@/features/documents/constants";
import {
  listDocuments,
  type DocumentListItem,
  type ListDocumentsFilters,
} from "@/features/documents/queries";
import {
  listRequests,
  type RequestListItem,
} from "@/features/documents/requests-api";
import type { DocumentStatus, DocumentType, RequestStatus } from "@/features/documents/types";
import { DocumentsList } from "@/features/documents/DocumentsList";
import { DocumentDetailModal } from "@/features/documents/DocumentDetailModal";
import { UploadDocumentModal } from "@/features/documents/UploadDocumentModal";
import { RequestDocumentModal } from "@/features/documents/RequestDocumentModal";
import { RequestsList } from "@/features/documents/RequestsList";
import { CancelRequestModal } from "@/features/documents/CancelRequestModal";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: DocumentStatus[] = ["draft", "active", "shared", "archived", "revoked"];
const REQUEST_STATUS_OPTIONS: RequestStatus[] = ["requested", "submitted", "reviewed", "cancelled"];

type ViewMode = "documents" | "requests";

interface ResolvedStudent {
  id: string;
  name: string;
}

export default function DocumentsPage() {
  const { schoolId, userId, userRole, loading: ctxLoading } = useSchoolContext();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();

  // View toggle
  const [viewMode, setViewMode] = useState<ViewMode>("documents");

  // Help drawer
  const [helpOpen, setHelpOpen]         = useState(false);
  const [helpSearch, setHelpSearch]     = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  // Filter state
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "">("");
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<ResolvedStudent | null>(null);
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatus | "">("");

  // Data
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Requests
  const [requests, setRequests] = useState<RequestListItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestToCancel, setRequestToCancel] = useState<RequestListItem | null>(null);

  // Selected document for detail modal
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Modals
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const canUpload  = userRole === "school_admin" || userRole === "teacher";
  const canRequest = userRole === "school_admin" || userRole === "teacher";
  const isAdmin    = userRole === "school_admin";

  // ── Resolve student filter from query param ─────────────────────────────
  const studentParam = searchParams.get("student");
  useEffect(() => {
    if (!studentParam || !schoolId) {
      setStudentFilter(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("students")
      .select("id, first_name, last_name, school_id")
      .eq("id", studentParam)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data && data.school_id === schoolId) {
          setStudentFilter({ id: data.id, name: `${data.first_name} ${data.last_name}` });
        } else {
          // Either not found or not in our school — strip the param.
          setStudentFilter(null);
          router.replace("/documents");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [studentParam, schoolId, supabase, router]);

  // ── Load documents whenever filters change ──────────────────────────────
  const loadDocs = useCallback(
    async (signal?: AbortSignal) => {
      if (!schoolId) return;
      setLoading(true);
      setError(null);
      try {
        const filters: ListDocumentsFilters = {
          schoolId,
          studentId:    studentFilter?.id ?? null,
          status:       statusFilter || null,
          documentType: typeFilter || null,
          search:       search || null,
        };
        const data = await listDocuments(supabase, filters);
        if (signal?.aborted) return;
        setDocs(data);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load documents.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [schoolId, studentFilter?.id, statusFilter, typeFilter, search, supabase],
  );

  // ── Load requests when in Requests view or after a mutation ─────────────
  const loadRequests = useCallback(
    async (signal?: AbortSignal) => {
      if (!schoolId) return;
      setRequestsLoading(true);
      setRequestsError(null);
      try {
        const data = await listRequests(supabase, {
          schoolId,
          studentId: studentFilter?.id ?? null,
          status:    requestStatusFilter || null,
        });
        if (signal?.aborted) return;
        setRequests(data);
      } catch (err) {
        if (signal?.aborted) return;
        setRequestsError(err instanceof Error ? err.message : "Failed to load requests.");
      } finally {
        if (!signal?.aborted) setRequestsLoading(false);
      }
    },
    [schoolId, studentFilter?.id, requestStatusFilter, supabase],
  );

  // Debounce search; everything else loads immediately
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => loadDocs(ctrl.signal), search ? 300 : 0);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [loadDocs, search]);

  useEffect(() => {
    if (viewMode !== "requests") return;
    const ctrl = new AbortController();
    void loadRequests(ctrl.signal);
    return () => ctrl.abort();
  }, [viewMode, loadRequests]);

  function clearStudentFilter() {
    router.replace("/documents");
  }

  if (ctxLoading) return <PageSpinner />;
  if (!schoolId) {
    return (
      <div className="p-6">
        <ErrorAlert message="Your account is not linked to a school." />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-semibold">Document Coordination</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            IEPs, therapy reports, medical certificates, and other coordinated
            documents about your students.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            <HelpCircle className="w-4 h-4" />
            Help
          </button>
          <Button
            variant="outline"
            onClick={() => setRequestOpen(true)}
            disabled={!canRequest}
            title={canRequest ? undefined : "Only school admins and teachers can create requests."}
          >
            <Inbox className="w-4 h-4 mr-2" />
            Request Document
          </Button>
          <Button
            onClick={() => setUploadOpen(true)}
            disabled={!canUpload}
            title={canUpload ? undefined : "Only school admins and teachers can upload."}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </header>

      {/* View toggle */}
      <div className="flex items-center gap-1 border-b border-border">
        <ViewTab
          active={viewMode === "documents"}
          onClick={() => setViewMode("documents")}
          icon={<FileText className="w-3.5 h-3.5" />}
          label={`Documents${docs.length ? ` (${docs.length})` : ""}`}
        />
        <ViewTab
          active={viewMode === "requests"}
          onClick={() => setViewMode("requests")}
          icon={<Inbox className="w-3.5 h-3.5" />}
          label={`Requests${requests.length ? ` (${requests.length})` : ""}`}
        />
      </div>

      {/* Active student-filter chip (when navigated from a student row) */}
      {studentFilter && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm text-foreground">
            Showing documents for <strong>{studentFilter.name}</strong>
          </span>
          <button
            onClick={clearStudentFilter}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        </div>
      )}

      {/* Filters — different controls per view */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          {viewMode === "documents" ? (
            <>
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | "")}
                className="w-44"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </Select>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DocumentType | "")}
                className="w-64"
              >
                <option value="">All document types</option>
                {DOCUMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </>
          ) : (
            <Select
              value={requestStatusFilter}
              onChange={(e) => setRequestStatusFilter(e.target.value as RequestStatus | "")}
              className="w-44"
            >
              <option value="">All statuses</option>
              {REQUEST_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Body */}
      {viewMode === "documents" ? (
        <>
          {error && <ErrorAlert message={error} />}
          {loading ? (
            <PageSpinner />
          ) : docs.length === 0 ? (
            <EmptyState
              scoped={!!studentFilter}
              canUpload={canUpload}
              onClickUpload={() => setUploadOpen(true)}
            />
          ) : (
            <DocumentsList docs={docs} onOpenDoc={(d) => setSelectedDocId(d.id)} />
          )}
        </>
      ) : (
        <>
          {requestsError && <ErrorAlert message={requestsError} />}
          {requestsLoading ? (
            <PageSpinner />
          ) : (
            <RequestsList
              requests={requests}
              canCancel={canRequest}
              onCancel={(r) => setRequestToCancel(r)}
            />
          )}
        </>
      )}

      <DocumentDetailModal
        docId={selectedDocId}
        onClose={() => setSelectedDocId(null)}
        onChanged={() => { void loadDocs(); }}
      />

      {schoolId && userId && (
        <UploadDocumentModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={(docId) => {
            setUploadOpen(false);
            void loadDocs();
            setSelectedDocId(docId);
          }}
          defaultStudentId={studentFilter?.id ?? null}
          schoolId={schoolId}
          userId={userId}
        />
      )}

      {schoolId && userId && (
        <RequestDocumentModal
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          onRequested={() => {
            setRequestOpen(false);
            setViewMode("requests");
            void loadRequests();
          }}
          schoolId={schoolId}
          userId={userId}
          isAdmin={isAdmin}
          defaultStudentId={studentFilter?.id ?? null}
        />
      )}

      <CancelRequestModal
        open={requestToCancel !== null}
        onClose={() => setRequestToCancel(null)}
        onCancelled={() => {
          setRequestToCancel(null);
          void loadRequests();
        }}
        request={requestToCancel}
      />

      {helpOpen && (
        <DocumentsHelpDrawer
          search={helpSearch}
          onSearchChange={setHelpSearch}
          expanded={helpExpanded}
          onToggleExpand={(id) => setHelpExpanded((p) => ({ ...p, [id]: !p[id] }))}
          onClose={() => { setHelpOpen(false); setHelpSearch(""); }}
        />
      )}
    </div>
  );
}


function ViewTab({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}


// ── Help drawer ───────────────────────────────────────────────────────────

type HelpTopic = {
  id: string;
  icon: React.ElementType;
  title: string;
  searchText: string;
  body: React.ReactNode;
};

function DocumentsHelpDrawer({
  search, onSearchChange, expanded, onToggleExpand, onClose,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  expanded: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onClose: () => void;
}) {
  const Step = ({ n, text }: { n: number; text: React.ReactNode }) => (
    <div className="flex gap-2.5 items-start">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span>{text}</span>
    </div>
  );
  const Tip = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
  const Note = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-3 flex gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-800 text-xs">
      <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );

  const topics: HelpTopic[] = [
    {
      id: "what-is",
      icon: FileText,
      title: "What Document Coordination is for",
      searchText: "iep therapy report medical certificate evaluation accommodation parent provided sensitive private",
      body: (
        <div className="space-y-2">
          <p>Use this for sensitive child documents — IEPs, therapy evaluations and progress reports, school accommodations, medical certificates, developmental pediatrician reports, and parent-provided documents.</p>
          <p>Every view, download, and access denial is recorded in the document's Activity tab. Files only open through short-lived signed links — never via permanent URLs.</p>
          <Note>For day-to-day class updates and photos, use Updates instead. This area is reserved for documents that need consent, audit, and controlled access.</Note>
        </div>
      ),
    },
    {
      id: "upload",
      icon: Upload,
      title: "Upload a document",
      searchText: "upload new document draft pdf jpeg png webp 25mb file student type title",
      body: (
        <div className="space-y-2">
          <p>Adds a new document for one student. New uploads land as <strong>Draft</strong> — only school staff can see them until you Mark as Active or Share.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<span>Click <strong>Upload Document</strong> at the top right.</span>} />
            <Step n={2} text={<span>Pick the student, document type, and a title. Effective date and review date are optional.</span>} />
            <Step n={3} text={<span>Choose a file — PDF, JPEG, PNG, or WebP, up to 25 MB.</span>} />
            <Step n={4} text={<span>Click <strong>Upload as Draft</strong>. The document opens automatically.</span>} />
          </div>
          <Tip>If the upload fails with a permission error, make sure you're logged in as a school admin or as a teacher of a class the student is enrolled in.</Tip>
        </div>
      ),
    },
    {
      id: "statuses",
      icon: CheckCircle2,
      title: "Statuses: Draft, Active, Shared, Archived",
      searchText: "status draft active shared archived revoked terminal lifecycle mark",
      body: (
        <div className="space-y-2">
          <ul className="space-y-2 text-xs">
            <li><strong>Draft</strong> — visible to school staff only. Use this while a document is being prepared.</li>
            <li><strong>Active</strong> — part of the school's official record. Still not shared externally until you grant access.</li>
            <li><strong>Shared</strong> — at least one external grant exists.</li>
            <li><strong>Archived</strong> — kept for audit but no longer in default lists. Terminal — you can't change it back to active.</li>
            <li><strong>Revoked</strong> — content has been retracted. Used rarely; not exposed in the UI yet.</li>
          </ul>
          <p className="text-xs">Open a document and use the <strong>Status actions</strong> bar to change status. Available actions depend on current status and your role.</p>
        </div>
      ),
    },
    {
      id: "versions",
      icon: Layers,
      title: "Add a new version or hide a wrong upload",
      searchText: "version v2 v3 upload new replace hide eyeoff wrong file rollback",
      body: (
        <div className="space-y-2">
          <p>Documents can have multiple versions. The most recent visible version is the one parents and external recipients see — older versions stay in the audit trail.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<span>Open the document → <strong>Versions</strong> tab.</span>} />
            <Step n={2} text={<span>Click <strong>Upload new version</strong> to add a v2, v3, etc. Existing access grants keep working — they reference the document, not the version.</span>} />
            <Step n={3} text={<span>If you uploaded the wrong file, click <strong>Hide</strong> on that version. The document automatically points to the next-most-recent visible version.</span>} />
          </div>
          <Tip>You can't hide the only visible version of a non-draft document. Upload a replacement first, then hide the wrong one.</Tip>
        </div>
      ),
    },
    {
      id: "share-staff",
      icon: Users,
      title: "Share with a staff member",
      searchText: "share internal staff teacher admin school user permissions view download expiry",
      body: (
        <div className="space-y-2">
          <p>Internal sharing — staff only, same school. No parent consent needed.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<span>Open the document → <strong>Access</strong> tab → <strong>Share</strong>.</span>} />
            <Step n={2} text={<span>Stay on <strong>Staff member</strong>, pick someone, choose how long the access lasts (30 / 90 / 180 / 365 days, or custom).</span>} />
            <Step n={3} text={<span><strong>Download</strong> is off by default — turn it on if the recipient needs to save the file.</span>} />
            <Step n={4} text={<span>Click <strong>Share</strong>. They'll see this document in their list immediately.</span>} />
          </div>
          <Note>Teachers who already teach the student's class don't need a grant — they can see the document automatically. Use grants for staff who don't have direct class access.</Note>
        </div>
      ),
    },
    {
      id: "share-external",
      icon: Globe,
      title: "Share with an external contact (consent-gated)",
      searchText: "share external contact doctor therapist clinic consent parent grant pending granted expired",
      body: (
        <div className="space-y-2">
          <p>External sharing — doctors, therapists, clinic staff. Always requires a parent's consent. v1 is document-scoped (consent covers exactly this document).</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<span>Open document → <strong>Access</strong> → <strong>Share</strong> → <strong>External contact</strong> tab.</span>} />
            <Step n={2} text={<span>Pick an existing contact or click <strong>+ Add new external contact</strong> (admin only).</span>} />
            <Step n={3} text={<span>If no consent exists for this combination yet, you'll see <strong>Request consent</strong>. Click it, fill in purpose + expiry + permissions, and submit.</span>} />
            <Step n={4} text={<span>Once the parent grants the consent, come back to the share modal and the status flips to green <strong>Granted</strong> — then you can share.</span>} />
          </div>
          <Tip>Grant expiry is automatically capped to consent expiry. Download is automatically disabled if the parent didn't allow it in the consent.</Tip>
        </div>
      ),
    },
    {
      id: "consent-states",
      icon: ShieldCheck,
      title: "Consent states: Pending, Granted, Expired",
      searchText: "consent pending granted expired revoked parent guardian status approval",
      body: (
        <div className="space-y-2">
          <ul className="space-y-2 text-xs">
            <li><strong>Pending</strong> — drafted by you, awaiting parent approval. You can't share yet.</li>
            <li><strong>Granted</strong> — parent has approved. You can create grants up to the consent's expiry.</li>
            <li><strong>Expired</strong> — past the consent's expiry date. All dependent grants stop working automatically. Request a new consent if you still need access.</li>
            <li><strong>Revoked</strong> — parent withdrew permission. All dependent grants are revoked at the same time.</li>
          </ul>
          <Note>Parents will be able to grant or revoke consents from their own portal in a later release. For now, ask the parent and then update the consent on their behalf.</Note>
        </div>
      ),
    },
    {
      id: "revoke",
      icon: Ban,
      title: "Revoke an active grant",
      searchText: "revoke access grant remove stop external internal staff cancel reason audit",
      body: (
        <div className="space-y-2">
          <p>Stops a recipient's access immediately. The grant stays in the audit trail with a Revoked tag.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<span>Open the document → <strong>Access</strong> tab.</span>} />
            <Step n={2} text={<span>Find the active grant → click <strong>Revoke</strong>.</span>} />
            <Step n={3} text={<span>Optionally add a reason (saved to audit), then confirm.</span>} />
          </div>
          <Tip>Only school admins can revoke. Once revoked, the grant cannot be reinstated — create a new share if needed.</Tip>
        </div>
      ),
    },
    {
      id: "expiring",
      icon: AlertTriangle,
      title: "Expiring soon — what the amber badge means",
      searchText: "expiring soon badge amber 14 days countdown grant consent expiry warning",
      body: (
        <div className="space-y-2">
          <p>Grants in the Access tab that expire in the next 14 days display an amber <strong>Expires in Nd</strong> badge. Use it to spot grants you may want to extend or revoke before they lapse.</p>
          <Note>Grants expire automatically — no action needed if you want them to lapse. To extend, revoke the existing grant and share again with a new expiry.</Note>
        </div>
      ),
    },
    {
      id: "request",
      icon: Inbox,
      title: "Request a document from a parent or external contact",
      searchText: "request document missing ask parent external contact reason due date guardian",
      body: (
        <div className="space-y-2">
          <p>Use this when you don't have a document yet and need someone to provide one.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<span>Click <strong>Request Document</strong> at the top right.</span>} />
            <Step n={2} text={<span>Pick the student and document type.</span>} />
            <Step n={3} text={<span>Choose <strong>Parent</strong> (one of the student's guardians) or <strong>External contact</strong>.</span>} />
            <Step n={4} text={<span>Add a reason — the recipient sees this — and an optional due date.</span>} />
          </div>
          <Note>Recipients can submit through their own portal in a later release. Until then, a request is a tracked open ask — once you receive the document, upload it manually and cancel the request with a reason like "Received via email."</Note>
        </div>
      ),
    },
    {
      id: "activity",
      icon: ActivityIcon,
      title: "Read the Activity audit",
      searchText: "activity audit log access events view download denied actor timestamp who when",
      body: (
        <div className="space-y-2">
          <p>Open a document → <strong>Activity</strong> tab. Shows the latest 50 events for this document, newest first.</p>
          <ul className="space-y-1 mt-2 text-xs">
            <li><strong>Access Link Issued</strong> — someone opened a signed link to view or download.</li>
            <li><strong>Preview Opened</strong> — the file was previewed in-browser.</li>
            <li><strong>Download Requested</strong> — the file was downloaded.</li>
            <li><strong>Access Denied</strong> (red) — someone tried to access but didn't have permission. The reason is shown inline.</li>
          </ul>
          <Note>Activity is read-only. There is no export in v1 — query the database directly if you need bulk audit data.</Note>
        </div>
      ),
    },
    {
      id: "privacy",
      icon: Lock,
      title: "Privacy & security model",
      searchText: "privacy security signed url 60 seconds rls audit no super admin bypass strict",
      body: (
        <div className="space-y-2">
          <ul className="space-y-2 text-xs">
            <li><strong>Signed links expire in 60 seconds.</strong> Reload the link if it expires.</li>
            <li><strong>No global admin bypass.</strong> Even platform admins cannot read documents — only school admins, scoped to their own school.</li>
            <li><strong>Every access is audited</strong>, including denials and access by external contacts.</li>
            <li><strong>External access requires a parent's consent</strong> — there is no way to share with an outside party without one.</li>
          </ul>
          <Tip>Treat document URLs as expiring. Don't paste signed links into chat or email — share the document with a contact through the Access tab instead.</Tip>
        </div>
      ),
    },
    {
      id: "roles",
      icon: ShieldCheck,
      title: "Who can do what",
      searchText: "roles permissions school admin teacher parent external contact who can what allowed",
      body: (
        <div className="space-y-2">
          <ul className="space-y-2 text-xs">
            <li><strong>School admin</strong> — full read/write across the school: upload, version, share, request, revoke, archive, manage external contacts.</li>
            <li><strong>Teacher</strong> — read documents for students in classes they teach. Can upload and create requests but cannot share, revoke, or add external contacts.</li>
            <li><strong>Parent</strong> — sees documents about their own children that have been Shared or Archived. Parent UI is under construction (consents are still managed by school staff for now).</li>
            <li><strong>External contact</strong> — sees only documents they've been granted with an active, granted consent. No portal yet — for now, share by sending them a fresh link from the Access tab when they need it.</li>
          </ul>
        </div>
      ),
    },
  ];

  const q = search.trim().toLowerCase();
  const filtered = q
    ? topics.filter((t) => t.title.toLowerCase().includes(q) || t.searchText.toLowerCase().includes(q))
    : topics;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">Documents Help</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search topics..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
              <p className="text-sm">No topics match <span className="font-medium text-foreground">"{search}"</span></p>
              <button type="button" onClick={() => onSearchChange("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              const open = !!expanded[item.id];
              return (
                <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => onToggleExpand(item.id)}
                  >
                    <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="flex-1 text-sm font-medium">{item.title}</span>
                    {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                      {item.body}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
          {search
            ? <span>Showing results for "<span className="font-medium text-foreground">{search}</span>"</span>
            : <span>{topics.length} topics · click any to expand</span>}
        </div>
      </div>
    </div>
  );
}


function EmptyState({
  scoped,
  canUpload,
  onClickUpload,
}: {
  scoped: boolean;
  canUpload: boolean;
  onClickUpload: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">
          {scoped ? "No documents for this student yet" : "Upload your first document"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Document Coordination is for IEPs, therapy reports, evaluations,
          medical certificates, and any sensitive document about a student that
          needs to be shared safely with parents, doctors, or other schools —
          with consent and an audit trail.
        </p>
        <div className="pt-2">
          <Button
            onClick={onClickUpload}
            disabled={!canUpload}
            title={canUpload ? undefined : "Only school admins and teachers can upload."}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
