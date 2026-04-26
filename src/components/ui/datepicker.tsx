"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface DatePickerProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, className, placeholder = "Select date", disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      setViewDate({ year: d.getFullYear(), month: d.getMonth() });
    }
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

  function openCalendar() {
    if (disabled) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 300;
      setPos({
        top: spaceBelow >= dropdownHeight ? rect.bottom + 4 : rect.top - dropdownHeight - 4,
        left: rect.left,
      });
    }
    setOpen((v) => !v);
  }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const firstOfMonth = new Date(viewDate.year, viewDate.month, 1);
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();
  const startDay = firstOfMonth.getDay();
  const monthLabel = firstOfMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  function prevMonth() {
    setViewDate((p) => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 });
  }
  function nextMonth() {
    setViewDate((p) => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 });
  }
  function select(day: number) {
    const str = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(str);
    setOpen(false);
  }
  function selectToday() {
    onChange(todayStr);
    setOpen(false);
  }

  const displayValue = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={openCalendar}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 h-10",
          "bg-[var(--input-background)] border border-border rounded-lg text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
          "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
          "hover:border-ring/50",
          !value && "text-muted-foreground"
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
          className="bg-card border border-border rounded-xl shadow-xl p-3 w-64"
        >
          {/* Month / year navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: startDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => select(day)}
                  className={cn(
                    "h-8 w-full text-sm rounded-lg transition-colors font-normal",
                    isSelected && "bg-primary text-primary-foreground font-medium",
                    !isSelected && isToday && "ring-1 ring-primary text-primary font-medium hover:bg-muted",
                    !isSelected && !isToday && "text-foreground hover:bg-muted"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={selectToday}
              className="text-xs text-primary hover:underline font-medium"
            >
              Today
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
