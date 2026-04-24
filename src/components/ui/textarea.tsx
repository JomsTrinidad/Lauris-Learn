import { cn } from "@/lib/utils";
import { forwardRef, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full px-3 py-2 bg-[var(--input-background)] border border-border rounded-lg",
        "text-foreground placeholder:text-muted-foreground resize-y min-h-[80px]",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
