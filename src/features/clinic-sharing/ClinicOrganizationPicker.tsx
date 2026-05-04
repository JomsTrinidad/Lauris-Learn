"use client";

/**
 * ClinicOrganizationPicker — search-first combobox over
 * clinic / medical_practice organizations.
 *
 * Search-first behaviour (Phase 6D adjustment 2):
 *   • The "Add new clinic" form is HIDDEN until the user has typed a
 *     search query.
 *   • If matches are returned, the create form is collapsed behind a
 *     small "Can't find it? Add new clinic" link, forcing the user to
 *     consider existing rows first.
 *   • If no matches are returned for a non-empty query, the create
 *     form is automatically expanded and pre-fills the name with the
 *     query string.
 *
 * Implementation:
 *   • Combobox is open while the input has focus or an active query.
 *   • Search debounced ~250ms via setTimeout reset.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Building2, Stethoscope, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  searchClinicOrganizations,
  createClinicOrganization,
} from "./queries";
import type { ClinicOrgKind, ClinicOrgOption } from "./types";

interface Props {
  value: ClinicOrgOption | null;
  onChange: (org: ClinicOrgOption | null) => void;
  disabled?: boolean;
}

export function ClinicOrganizationPicker({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClinicOrgOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<ClinicOrgKind>("clinic");
  const [createName, setCreateName] = useState("");
  const [createCountry, setCreateCountry] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value) return; // already picked — no need to keep searching
    if (query.trim().length === 0) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const rows = await searchClinicOrganizations(query, 50);
      setResults(rows);
      setSearching(false);
      setSearched(true);
      // Auto-expand create when there are zero results AND a real query.
      if (rows.length === 0 && query.trim().length > 0) {
        setCreateOpen(true);
        setCreateName(query.trim());
      } else {
        setCreateOpen(false);
        setCreateError(null);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const hasQuery = trimmedQuery.length > 0;

  function clearSelection() {
    onChange(null);
    setQuery("");
    setResults([]);
    setSearched(false);
    setCreateOpen(false);
    setCreateName("");
    setCreateCountry("");
    setCreateError(null);
  }

  async function handleCreate() {
    setCreateError(null);
    const name = createName.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    setCreating(true);
    const result = await createClinicOrganization({
      kind: createKind,
      name,
      countryCode: createCountry.trim().toUpperCase() || null,
    });
    setCreating(false);
    if ("error" in result) {
      setCreateError(result.error);
      return;
    }
    const newOrg: ClinicOrgOption = {
      id: result.id,
      name,
      kind: createKind,
      countryCode: createCountry.trim().toUpperCase() || null,
      createdAt: new Date().toISOString(),
    };
    onChange(newOrg);
    setQuery("");
    setResults([]);
    setSearched(false);
    setCreateOpen(false);
    setCreateName("");
    setCreateCountry("");
  }

  // Selected state
  if (value) {
    return (
      <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg flex items-start gap-2">
        <KindIcon kind={value.kind} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{value.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kindLabel(value.kind)}
            {value.countryCode ? ` · ${value.countryCode}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          disabled={disabled}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clinic or medical practice…"
          disabled={disabled}
          className="pl-8"
        />
      </div>

      {/* Results list */}
      {hasQuery && (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          {searching ? (
            <div className="px-3 py-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {searched
                ? "No clinics match. Add a new one below."
                : "Type to search."}
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto divide-y divide-border">
              {results.map((org) => (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => onChange(org)}
                    disabled={disabled}
                    className="w-full text-left px-3 py-2 hover:bg-muted flex items-start gap-2"
                  >
                    <KindIcon kind={org.kind} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{org.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {kindLabel(org.kind)}
                        {org.countryCode ? ` · ${org.countryCode}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Inline create — collapsed by default; auto-expands on zero results */}
      {hasQuery && !searching && !createOpen && results.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setCreateName(trimmedQuery);
          }}
          disabled={disabled}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Can&apos;t find it? Add a new clinic
        </button>
      )}

      {createOpen && (
        <div className="px-3 py-3 bg-muted/30 border border-border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Add new clinic
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={disabled || creating}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={createKind}
              onChange={(e) => setCreateKind(e.target.value as ClinicOrgKind)}
              disabled={disabled || creating}
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="clinic">Clinic</option>
              <option value="medical_practice">Medical practice</option>
            </select>
            <Input
              type="text"
              value={createCountry}
              onChange={(e) => setCreateCountry(e.target.value.toUpperCase())}
              placeholder="Country (e.g. PH)"
              maxLength={3}
              disabled={disabled || creating}
            />
          </div>
          <Input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Clinic name"
            disabled={disabled || creating}
          />
          {createError && (
            <p className="text-xs text-red-700">{createError}</p>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleCreate}
            disabled={disabled || creating || createName.trim().length === 0}
          >
            {creating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add &amp; select
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: ClinicOrgKind }) {
  const Icon = kind === "clinic" ? Building2 : Stethoscope;
  return <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />;
}

function kindLabel(kind: ClinicOrgKind): string {
  return kind === "clinic" ? "Clinic" : "Medical practice";
}
