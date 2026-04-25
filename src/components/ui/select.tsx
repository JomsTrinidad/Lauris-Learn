import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        className={cn(
          "w-full px-3 py-2 pr-9",
          "bg-[var(--input-background)] border-2 border-border rounded-lg",
          "text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring",
          "disabled:opacity-50 disabled:cursor-not-allowed appearance-none",
          "hover:border-ring/60 transition-colors cursor-pointer",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none",
          props.disabled && "opacity-50",
        )}
      />
    </div>
  )
);
Select.displayName = "Select";
