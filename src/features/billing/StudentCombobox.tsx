"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { StudentOption } from "./types";

export function StudentCombobox({ options, value, searchValue, onSearchChange, onSelect, onClear }: {
  options: StudentOption[]; value: string; searchValue: string;
  onSearchChange: (v: string) => void; onSelect: (s: StudentOption) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = searchValue
    ? options.filter((s) =>
        s.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        s.className.toLowerCase().includes(searchValue.toLowerCase()) ||
        (s.studentCode ?? "").toLowerCase().includes(searchValue.toLowerCase()))
    : options.slice(0, 30);
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input placeholder="Search by name, code, or class…" value={searchValue}
          onChange={(e) => { onSearchChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} className={value ? "pr-8 border-primary/60" : ""} />
        {value && (
          <button onClick={onClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" type="button">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && !value && (
        <div className="absolute z-20 w-full bg-[var(--input-background)] border border-border rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
          {filtered.length === 0
            ? <p className="text-sm text-muted-foreground text-center py-4">No students found.</p>
            : filtered.map((s) => (
              <button key={s.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors text-sm"
                onMouseDown={() => { onSelect(s); setOpen(false); }}>
                <span className="font-medium">{s.name}</span>
                {s.studentCode && <span className="text-muted-foreground ml-1.5 text-xs font-mono">· {s.studentCode}</span>}
                <span className="text-muted-foreground ml-2 text-xs">{s.className}{s.level ? ` · ${s.level}` : ""}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
