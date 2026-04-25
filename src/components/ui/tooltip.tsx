import { HelpCircle } from "lucide-react";

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-60 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100 leading-relaxed whitespace-normal">
        {text}
      </span>
    </span>
  );
}
