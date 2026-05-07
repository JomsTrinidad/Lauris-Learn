"use client";

import { Component, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring/reportError";

interface Props {
  children: ReactNode;
  /** Section name for error context (e.g., "billing", "documents") */
  section?: string;
  /** Fallback UI or "minimal" for a simple error card */
  fallback?: ReactNode | "minimal";
  /** Called when error is caught (e.g., to reset state) */
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — Lightweight React error boundary
 *
 * Catches React rendering errors and displays a safe fallback.
 * Logs error context for debugging.
 * Provides a reset button to retry.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary section="billing" fallback="minimal">
 *   <BillingPage />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Report error with context
    reportError(error, {
      module: this.props.section || "unknown",
      action: "react_render_error",
      metadata: {
        componentStack: errorInfo.componentStack,
      },
    });

    // Call optional callback
    this.props.onError?.(error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Minimal fallback (default)
      if (this.props.fallback === "minimal" || !this.props.fallback) {
        return (
          <div className="p-6 border border-red-200 rounded-lg bg-red-50 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">
                  Something went wrong
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  {this.state.error?.message ||
                    "An unexpected error occurred. Please try again."}
                </p>
              </div>
            </div>
            <Button
              onClick={this.handleReset}
              variant="outline"
              size="sm"
              className="text-red-700 border-red-200 hover:bg-red-100"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        );
      }

      // Custom fallback
      return this.props.fallback;
    }

    return this.props.children;
  }
}
