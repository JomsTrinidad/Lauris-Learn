import { cn } from "@/lib/utils";
import { forwardRef, type SelectHTMLAttributes } from "react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full px-3 py-2 bg-[var(--input-background)] border border-border rounded-lg",
        "text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
        "disabled:opacity-50 disabled:cursor-not-allowed appearance-none",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";
