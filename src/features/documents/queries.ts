/**
 * Supabase query helpers for the Document Coordination feature.
 *
 * All queries run under the user-session client (RLS-gated). The Phase B
 * accessible_document_ids() helper does the role differentiation server-side,
 * so we don't have to filter again here for visibility — RLS naturally hides
 * rows the caller can't see.
 *
 * View-models (DocumentListItem) are co-located with the queries that produce
 * them. UI components should import these types, not raw Database['public']
 * shapes, to keep call sites coherent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  ChildDocumentRow,
  ChildDocumentVersionRow,
  DocumentType,
  DocumentStatus,
} from "./types";

type Client = SupabaseClient<Database>;

// ─── View-models ────────────────────────────────────────────────────────────

export interface DocumentListItem extends ChildDocumentRow {
  student: { id: string; first_name: string; last_name: string } | null;
  current_version:
    | { id: string; version_number: number; file_name: string | null; mime_type: string | null }
    | null;
}

export interface ListDocumentsFilters {
  schoolId:     string;
  studentId?:   string | null;
  status?:      DocumentStatus | null;
  documentType?: DocumentType | null;
  /** Case-insensitive title match. */
  search?:      string | null;
}


// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listDocuments(
  supabase: Client,
  f: ListDocumentsFilters,
): Promise<DocumentListItem[]> {
  let q = supabase
    .from("child_documents")
    .select("*")
    .eq("school_id", f.schoolId)
    .order("updated_at", { ascending: false });

  if (f.studentId)    q = q.eq("student_id", f.studentId);
  if (f.status)       q = q.eq("status", f.status);
  if (f.documentType) q = q.eq("document_type", f.documentType);
  if (f.search) {
    const term = f.search.trim();
    if (term.length > 0) q = q.ilike("title", `%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  const docs = (data ?? []) as ChildDocumentRow[];
  if (docs.length === 0) return [];

  return enrichDocuments(supabase, docs);
}

export async function getDocument(
  supabase: Client,
  docId: string,
): Promise<DocumentListItem | null> {
  const { data, error } = await supabase
    .from("child_documents")
    .select("*")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const enriched = await enrichDocuments(supabase, [data as ChildDocumentRow]);
  return enriched[0] ?? null;
}

export async function listVersions(
  supabase: Client,
  docId: string,
): Promise<ChildDocumentVersionRow[]> {
  const { data, error } = await supabase
    .from("child_document_versions")
    .select("*")
    .eq("document_id", docId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChildDocumentVersionRow[];
}


// ─── Internal helpers ───────────────────────────────────────────────────────

async function enrichDocuments(
  supabase: Client,
  docs: ChildDocumentRow[],
): Promise<DocumentListItem[]> {
  const studentIds = Array.from(new Set(docs.map((d) => d.student_id)));
  const versionIds = docs
    .map((d) => d.current_version_id)
    .filter((x): x is string => !!x);

  const [studentsRes, versionsRes] = await Promise.all([
    studentIds.length
      ? supabase
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? supabase
          .from("child_document_versions")
          .select("id, version_number, file_name, mime_type")
          .in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  type StudentLite = { id: string; first_name: string; last_name: string };
  type VersionLite = {
    id: string;
    version_number: number;
    file_name: string | null;
    mime_type: string | null;
  };

  const studentMap = new Map<string, StudentLite>(
    (studentsRes.data as StudentLite[] | null ?? []).map((s) => [s.id, s]),
  );
  const versionMap = new Map<string, VersionLite>(
    (versionsRes.data as VersionLite[] | null ?? []).map((v) => [v.id, v]),
  );

  return docs.map((d) => ({
    ...d,
    student: studentMap.get(d.student_id) ?? null,
    current_version: d.current_version_id
      ? versionMap.get(d.current_version_id) ?? null
      : null,
  }));
}
