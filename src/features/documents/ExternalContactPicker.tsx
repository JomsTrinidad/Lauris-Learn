"use client";

/**
 * ExternalContactPicker — Phase D step D12.
 *
 * Inline combobox over `external_contacts` for the active school. Supports:
 *   - typeahead search by name/email/organization
 *   - an inline "+ Add new contact" form (school_admin only — INSERT policy)
 *
 * Deactivated contacts are hidden from the picker but the parent component
 * may still display them as "deactivated" if needed (we just don't surface
 * them as choices).
 *
 * The created/selected ExternalContactRow is bubbled up so the share flow
 * can immediately consult it for consent.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Loader2, Mail, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import {
  listExternalContacts,
  createExternalContact,
} from "./consent-api";
import { createClient } from "@/lib/supabase/client";
import type { ExternalContactRow } from "./types";

export interface ExternalContactPickerProps {
  schoolId: string;
  /** Whether the caller is allowed to create contacts (school_admin only). */
  canCreate: boolean;
  value: ExternalContactRow | null;
  onChange: (c: ExternalContactRow | null) => void;
  disabled?: boolean;
}

export function ExternalContactPicker({
  schoolId,
  canCreate,
  value,
  onChange,
  disabled,
}: ExternalContactPickerProps) {
  const supabase = useMemo(() => createClient(), []);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [contacts, setContacts] = useState<ExternalContactRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(false);

  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState<string | null>(null);
  const [draftName,   setDraftName]   = useState("");
  const [draftEmail,  setDraftEmail]  = useState("");
  const [draftOrg,    setDraftOrg]    = useState("");
  const [draftRole,   setDraftRole]   = useState("");
  const [draftPhone,  setDraftPhone]  = useState("");
  const [showCreate,  setShowCreate]  = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    listExternalContacts(supabase, schoolId)
      .then((rows) => {
        if (cancelled) return;
        setContacts(rows.filter((c) => c.deactivated_at === null));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadErr(err instanceof Error ? err.message : "Failed to load contacts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, supabase]);

  // Click-away
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts.slice(0, 30);
    return contacts.filter((c) => {
      return (
        c.full_name.toLowerCase().includes(term)
        || c.email.toLowerCase().includes(term)
        || (c.organization_name ?? "").toLowerCase().includes(term)
        || (c.role_title ?? "").toLowerCase().includes(term)
      );
    });
  }, [search, contacts]);

  function clearSelection() {
    onChange(null);
    setSearch("");
  }

  function onPick(c: ExternalContactRow) {
    onChange(c);
    setSearch("");
    setOpen(false);
  }

  function resetCreateForm() {
    setDraftName("");
    setDraftEmail("");
    setDraftOrg("");
    setDraftRole("");
    setDraftPhone("");
    setCreateErr(null);
  }

  async function onCreate() {
    // NOTE: this picker is rendered inside ShareDocumentModal's <form>.
    // We deliberately do NOT use a nested <form> here — nested forms are
    // invalid HTML and the inner submit can either trigger the outer
    // form's onSubmit or escape preventDefault entirely (which navigates
    // the page and closes every modal). All inputs are plain <Input>
    // elements; this handler runs from the Save button's onClick.
    if (!draftName.trim() || !draftEmail.trim()) {
      setCreateErr("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setCreateErr(null);
    try {
      const created = await createExternalContact(supabase, {
        schoolId,
        fullName:         draftName.trim(),
        email:            draftEmail.trim(),
        organizationName: draftOrg.trim() || null,
        roleTitle:        draftRole.trim() || null,
        phone:            draftPhone.trim() || null,
      });
      setContacts((prev) => [...prev, created].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      onChange(created);
      setShowCreate(false);
      setCreating(false);
      resetCreateForm();
    } catch (err) {
      setCreateErr(humanCreateError(errorMessage(err)));
    } finally {
      setSubmitting(false);
    }
  }

  // Selected display
  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg border border-primary/40 bg-primary/5">
        <div className="min-w-0">
          <p className="font-medium truncate text-sm">{value.full_name}</p>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-0.5">
            <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{value.email}</span>
            {value.organization_name && (
              <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{value.organization_name}</span>
            )}
            {value.role_title && <span>· {value.role_title}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          disabled={disabled}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          Change
        </button>
      </div>
    );
  }

  // Inline create form
  if (showCreate && canCreate) {
    return (
      <div className="space-y-2 px-3 py-3 rounded-lg border border-border bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground">New external contact</p>
        {/* No nested <form> — see comment on onCreate(). Enter-to-submit is
            wired via onKeyDown on each Input. */}
        <div className="space-y-2" onKeyDown={(e) => {
          if (e.key === "Enter" && !submitting) {
            e.preventDefault();
            void onCreate();
          }
        }}>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Full name *"
            disabled={submitting}
          />
          <Input
            type="email"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="Email *"
            disabled={submitting}
          />
          <Input
            value={draftOrg}
            onChange={(e) => setDraftOrg(e.target.value)}
            placeholder="Organization (optional)"
            disabled={submitting}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value)}
              placeholder="Role / title (optional)"
              disabled={submitting}
            />
            <Input
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder="Phone (optional)"
              disabled={submitting}
            />
          </div>
          {createErr && <ErrorAlert message={createErr} />}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setShowCreate(false); resetCreateForm(); }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => { void onCreate(); }}
              disabled={submitting}
            >
              {submitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save & select"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Combobox
  return (
    <div className="space-y-2" ref={wrapperRef}>
      <div className="relative">
        <Input
          placeholder="Search by name, email, or organization…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          disabled={disabled || loading}
        />
        {open && (
          <div className="absolute z-20 w-full bg-[var(--input-background)] border border-border rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-3 inline-flex items-center justify-center gap-1.5 w-full">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No matching contacts.
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors text-sm"
                  onMouseDown={() => onPick(c)}
                >
                  <p className="font-medium">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-0.5">
                    <span>{c.email}</span>
                    {c.organization_name && <span>· {c.organization_name}</span>}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {loadErr && <ErrorAlert message={loadErr} />}

      {canCreate && !creating && (
        <button
          type="button"
          onClick={() => { setShowCreate(true); setCreating(true); setOpen(false); }}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add a new external contact
        </button>
      )}
    </div>
  );
}


function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.hint    === "string" && o.hint)    return o.hint;
    if (typeof o.details === "string" && o.details) return o.details;
    try { return JSON.stringify(o); } catch { /* fall through */ }
  }
  return String(err);
}

function humanCreateError(msg?: string): string {
  if (!msg) return "Couldn't create the contact. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    return "Only school admins can add external contacts.";
  }
  if (/duplicate key/i.test(msg)) {
    return "A contact with that email already exists in your school.";
  }
  return msg;
}
