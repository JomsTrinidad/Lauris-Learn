"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Search,
  Upload,
  Inbox,
  X,
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
  STATUS_LABELS,
} from "@/features/documents/constants";
import {
  listDocuments,
  type DocumentListItem,
  type ListDocumentsFilters,
} from "@/features/documents/queries";
import type { DocumentStatus, DocumentType } from "@/features/documents/types";
import { DocumentsList } from "@/features/documents/DocumentsList";
import { DocumentDetailModal } from "@/features/documents/DocumentDetailModal";
import { UploadDocumentModal } from "@/features/documents/UploadDocumentModal";

const STATUS_OPTIONS: DocumentStatus[] = ["draft", "active", "shared", "archived", "revoked"];

interface ResolvedStudent {
  id: string;
  name: string;
}

export default function DocumentsPage() {
  const { schoolId, userId, userRole, loading: ctxLoading } = useSchoolContext();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "">("");
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<ResolvedStudent | null>(null);

  // Data
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected document for detail modal
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);

  const canUpload = userRole === "school_admin" || userRole === "teacher";

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

  // Debounce search; everything else loads immediately
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => loadDocs(ctrl.signal), search ? 300 : 0);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [loadDocs, search]);

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
          <Button variant="outline" disabled title="Coming in a later step">
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
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
        </CardContent>
      </Card>

      {/* Body */}
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

      <DocumentDetailModal
        docId={selectedDocId}
        onClose={() => setSelectedDocId(null)}
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
