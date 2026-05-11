"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface StarterIdeasPanelProps {
  items: string[];
  onInsert: (text: string) => void;
  disabled?: boolean;
  searchable?: boolean;
}

export function StarterIdeasPanel({ items, onInsert, disabled, searchable }: StarterIdeasPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const isSearchable = searchable ?? items.length > 8;

  const filtered = isSearchable && query.trim()
    ? items.filter((item) => item.toLowerCase().includes(query.toLowerCase()))
    : items;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Starter ideas
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-border/60 bg-card p-2 space-y-1.5">
          {isSearchable && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search starters…"
              className="w-full rounded-md border border-border px-2 py-1 text-xs bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )}
          <div className="max-h-52 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-1 py-1">No matches</p>
            )}
            {filtered.map((item, i) => (
              <div key={i} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-muted/40 transition-colors">
                <span className="flex-1 text-xs text-muted-foreground leading-snug">{item}</span>
                <button
                  type="button"
                  onClick={() => { onInsert(item); setOpen(false); setQuery(""); }}
                  disabled={disabled}
                  className="shrink-0 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
