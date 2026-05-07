/**
 * validateEnvironment — Check runtime environment for common misconfigurations
 *
 * Goals:
 * - Catch deployment mistakes early (missing env vars, hardcoded values, etc.)
 * - Prevent subtle bugs from environment-specific issues
 * - Run at app startup, not on every page load
 * - Log warnings (not errors) for safe degradations
 *
 * Usage: Call once in root layout or app initialization
 */

export interface EnvironmentIssue {
  severity: "error" | "warn";
  variable: string;
  message: string;
}

const issues: EnvironmentIssue[] = [];

/**
 * Validate required environment variables
 */
function validateRequiredVars() {
  const required = [
    {
      name: "NEXT_PUBLIC_SUPABASE_URL",
      shouldNotContain: "localhost",
      dev: false,
    },
    {
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      shouldNotContain: "temp_key",
      dev: false,
    },
  ];

  for (const req of required) {
    const value = process.env[req.name];

    if (!value) {
      issues.push({
        severity: "error",
        variable: req.name,
        message: `Missing required environment variable: ${req.name}`,
      });
    }

    // In production, check for unsafe defaults
    if (
      process.env.NODE_ENV === "production" &&
      req.shouldNotContain &&
      value?.includes(req.shouldNotContain)
    ) {
      issues.push({
        severity: "error",
        variable: req.name,
        message: `${req.name} appears to contain development value (${req.shouldNotContain}). Check .env.production.`,
      });
    }
  }
}

/**
 * Validate common unsafe patterns
 */
function validateSafePatterns() {
  // Check for localhost/127.0.0.1 URLs in production
  if (process.env.NODE_ENV === "production") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    if (url.includes("localhost") || url.includes("127.0.0.1")) {
      issues.push({
        severity: "error",
        variable: "NEXT_PUBLIC_SUPABASE_URL",
        message:
          "Supabase URL contains localhost. This will fail in production.",
      });
    }
  }
}

/**
 * Validate optional configurations with warnings
 */
function validateOptionalConfigs() {
  // Warn if analytics/monitoring not configured in production
  if (process.env.NODE_ENV === "production") {
    const hasMonitoring =
      process.env.NEXT_PUBLIC_SENTRY_DSN ||
      process.env.NEXT_PUBLIC_AXIOM_TOKEN;

    if (!hasMonitoring) {
      issues.push({
        severity: "warn",
        variable: "monitoring",
        message:
          "No error monitoring configured in production. Consider adding Sentry or similar.",
      });
    }
  }
}

/**
 * Run all validations and return issues
 */
export function validateEnvironment(): EnvironmentIssue[] {
  // Reset issues
  issues.length = 0;

  // Run validators
  validateRequiredVars();
  validateSafePatterns();
  validateOptionalConfigs();

  // Log results
  if (issues.length > 0) {
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warn");

    if (errors.length > 0) {
      console.error(
        `[ENV VALIDATION] ${errors.length} critical issue(s) found:`,
      );
      errors.forEach((e) => {
        console.error(`  ❌ ${e.variable}: ${e.message}`);
      });
    }

    if (warnings.length > 0) {
      console.warn(
        `[ENV VALIDATION] ${warnings.length} warning(s) found:`,
      );
      warnings.forEach((w) => {
        console.warn(`  ⚠️  ${w.variable}: ${w.message}`);
      });
    }
  } else {
    console.log("[ENV VALIDATION] All checks passed ✓");
  }

  return issues;
}

/**
 * Check if environment is safe to proceed (no critical errors)
 */
export function isEnvironmentSafe(): boolean {
  const issues = validateEnvironment();
  return !issues.some((i) => i.severity === "error");
}
