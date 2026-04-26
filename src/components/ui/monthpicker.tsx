"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MonthPickerProps {
  value: string; // YYYY-MM or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  min?: string; // YYYY-MM — months before this are dimmed/disabled
  disabled?: boolean;
}

export function MonthPicker({ value, onChange, className, placeholder = "Select month", min, disabled }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [viewYear, setViewYear] = useState(() => {
    if (value) return parseInt(value.split("-")[0]);
    return new Date().getFullYear();
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setViewYear(parseInt(value.split("-")[0]));
  }, [value]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) close();
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  function openPicker() {
    if (disabled) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPos({
        top: spaceBelow >= 240 ? rect.bottom + 4 : rect.top - 240 - 4,
        left: rect.left,
      });
    }
    setOpen((v) => !v);
  }

  function select(monthIdx: number) {
    const str = `${viewYear}-${String(monthIdx + 1).padStart(2, "0")}`;
    onChange(str);
    setOpen(false);
  }

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const displayValue = value
    ? (() => {
        const [y, m] = value.split("-").map(Number);
        return `${MONTHS[m - 1]} ${y}`;
      })()
    : "";

  function isDisabled(monthIdx: number) {
    if (!min) return false;
    const str = `${viewYear}-${String(monthIdx + 1).padStart(2, "0")}`;
    return str < min;
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 h-10",
          "bg-[var(--input-background)] border border-border rounded-lg text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
          "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
          "hover:border-ring/50",
        )}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {displayValue || placeholder}
        </span>
        <CalendarDays className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-xl p-3 w-52"
        >
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month grid — 4 rows × 3 cols */}
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => {
              const monthStr = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
              const isSelected = monthStr === value;
              const isCurrent = monthStr === currentYM;
              const disabled = isDisabled(i);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => !disabled && select(i)}
                  disabled={disabled}
                  className={cn(
                    "py-2 text-sm rounded-lg transition-colors font-normal",
                    isSelected && "bg-primary text-primary-foreground font-medium",
                    !isSelected && isCurrent && "ring-1 ring-primary text-primary font-medium hover:bg-muted",
                    !isSelected && !isCurrent && !disabled && "text-foreground hover:bg-muted",
                    disabled && "text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={() => { onChange(currentYM); setOpen(false); }}
              className="text-xs text-primary hover:underline font-medium"
            >
              This month
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
