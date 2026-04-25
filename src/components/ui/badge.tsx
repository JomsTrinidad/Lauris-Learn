import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "enrolled" | "waitlisted" | "inquiry" | "withdrawn" | "completed"
  | "paid" | "partial" | "unpaid" | "overdue" | "cancelled" | "refunded" | "waived"
  | "present" | "late" | "absent" | "excused"
  | "active" | "draft" | "archived"
  | "scheduled" | "live";

const variantMap: Record<Variant, string> = {
  default:     "bg-gray-100 text-gray-700",
  enrolled:    "bg-green-100 text-green-700",
  waitlisted:  "bg-yellow-100 text-yellow-700",
  inquiry:     "bg-blue-100 text-blue-700",
  withdrawn:   "bg-gray-100 text-gray-600",
  completed:   "bg-purple-100 text-purple-700",
  paid:        "bg-green-100 text-green-700",
  partial:     "bg-yellow-100 text-yellow-700",
  unpaid:      "bg-red-100 text-red-700",
  overdue:     "bg-orange-100 text-orange-700",
  cancelled:   "bg-gray-100 text-gray-500",
  refunded:    "bg-purple-100 text-purple-700",
  waived:      "bg-sky-100 text-sky-700",
  present:     "bg-green-100 text-green-700",
  late:        "bg-yellow-100 text-yellow-700",
  absent:      "bg-red-100 text-red-700",
  excused:     "bg-gray-100 text-gray-600",
  active:      "bg-green-100 text-green-700",
  draft:       "bg-yellow-100 text-yellow-700",
  archived:    "bg-gray-100 text-gray-600",
  scheduled:   "bg-blue-100 text-blue-700",
  live:        "bg-green-100 text-green-700",
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        variantMap[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
