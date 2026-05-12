"use client";

import { useState, useEffect, useMemo } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { PlanSaveInput } from "../queries";

// ── Row type aliases (re-exported for step files and IEPPlanModal) ──────────

export type GoalRow = PlanSaveInput["goals"][number];
export type InterventionRow = PlanSaveInput["interventions"][number];
export type ProgressRow = PlanSaveInput["progress"][number];

// ── Common option shapes ───────────────────────────────────────────────────

export interface StudentOption {
  id: string;
  full_name: string;
  student_code: string | null;
}

export interface DocOption {
  id: string;
  title: string;
  document_type: string;
}

// ── Presentational helpers ─────────────────────────────────────────────────

export function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SectionHeader({ title, hint, onAdd, addLabel }: {
  title: string; hint?: string; onAdd?: () => void; addLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {onAdd && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />{addLabel ?? "Add"}
        </Button>
      )}
    </div>
  );
}

export function BlockCard({ index, onRemove, onDuplicate, children }: {
  index: number; onRemove?: () => void; onDuplicate?: () => void; children: ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
        <div className="flex items-center gap-1.5">
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              title="Duplicate this entry"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-muted-foreground hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground italic">{children}</div>;
}

/** Inline "Not applicable" checkbox shown at the top-right of a section panel. */
export function NaToggle({ checked, onChange, label = "Not applicable", disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-3.5 w-3.5 rounded"
      />
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
    </label>
  );
}

// ── Sub-row update helpers ─────────────────────────────────────────────────

export function updateGoal(
  setter: Dispatch<SetStateAction<GoalRow[]>>,
  id: string,
  patch: Partial<GoalRow>,
) {
  setter((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
}

export function updateIntervention(
  setter: Dispatch<SetStateAction<InterventionRow[]>>,
  id: string,
  patch: Partial<InterventionRow>,
) {
  setter((prev) => prev.map((iv) => (iv.id === id ? { ...iv, ...patch } : iv)));
}

export function updateProgress(
  setter: Dispatch<SetStateAction<ProgressRow[]>>,
  id: string,
  patch: Partial<ProgressRow>,
) {
  setter((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

// ── StaffPicker ────────────────────────────────────────────────────────────

export function StaffPicker({ schoolId, role, value, onChange, disabled }: {
  schoolId: string;
  role: "teacher" | "school_admin";
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [opts, setOpts] = useState<Array<{ id: string; full_name: string; role: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("list_school_staff_for_sharing", { p_school_id: schoolId })
      .then(({ data }) => {
        if (cancelled) return;
        const all = (data ?? []) as Array<{ id: string; full_name: string; role: string }>;
        setOpts(all.filter((p) => p.role === role));
      });
    return () => { cancelled = true; };
  }, [schoolId, role, supabase]);

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">— Not yet —</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
    </Select>
  );
}
