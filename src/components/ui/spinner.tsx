import { cn } from "@/lib/utils";
import { Button } from "./button";
import { RotateCw } from "lucide-react";

interface SpinnerProps { className?: string; size?: "sm" | "md" | "lg" }

const sizeMap = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" };

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-border border-t-primary",
        sizeMap[size],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <Spinner size="lg" />
    </div>
  );
}

interface ErrorAlertProps { message: string; onRetry?: () => void }
export function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
      <span>{message}</span>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="text-red-700 border-red-200 hover:bg-red-100 ml-4 flex-shrink-0"
        >
          <RotateCw className="w-4 h-4 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}

interface EmptyStateProps { message?: string; children?: React.ReactNode }
export function EmptyState({ message = "Nothing here yet.", children }: EmptyStateProps) {
  return (
    <div className="text-center py-12 text-muted-foreground space-y-3">
      <p className="text-sm">{message}</p>
      {children}
    </div>
  );
}
