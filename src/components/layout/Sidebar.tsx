"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  School,
  CheckSquare,
  MessageSquare,
  CreditCard,
  Calendar,
  UserPlus,
  Settings,
  Video,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "super_admin" | "school_admin" | "teacher" | "parent" | null;

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean; // hidden from teachers
}

const mainNavItems: NavItem[] = [
  { path: "/dashboard",      label: "Dashboard",      icon: LayoutDashboard },
  { path: "/students",       label: "Students",       icon: Users },
  { path: "/classes",        label: "Classes",        icon: School },
  { path: "/attendance",     label: "Attendance",     icon: CheckSquare },
  { path: "/enrollment",     label: "Enrollment",     icon: UserPlus,     adminOnly: true },
  { path: "/updates",        label: "Parent Updates", icon: MessageSquare },
  { path: "/billing",        label: "Billing",        icon: CreditCard,   adminOnly: true },
  { path: "/events",         label: "Events",         icon: Calendar },
  { path: "/online-classes", label: "Online Classes", icon: Video },
  { path: "/progress",       label: "Progress",       icon: BookOpen },
  { path: "/settings",       label: "Settings",       icon: Settings,     adminOnly: true },
];

interface SidebarProps {
  open: boolean;
  schoolName?: string;
  schoolYear?: string;
  userRole?: Role;
}

export function Sidebar({
  open,
  schoolName = "Lauris Learn",
  schoolYear = "SY 2025–2026",
  userRole,
}: SidebarProps) {
  const pathname = usePathname();

  const isAdmin = userRole === "school_admin" || userRole === "super_admin";
  const visibleItems = mainNavItems.filter((item) => isAdmin || !item.adminOnly);

  return (
    <aside
      className={cn(
        "flex-shrink-0 bg-sidebar border-r border-sidebar-border transition-all duration-300 overflow-hidden",
        open ? "w-64" : "w-0"
      )}
    >
      <div className="h-full flex flex-col min-w-64">
        {/* Brand */}
        <Link href="/dashboard" className="block p-5 border-b border-sidebar-border hover:bg-sidebar-accent transition-colors">
          <div className="flex items-center gap-2.5">
            <Image
              src="/assets/logo/lauris-learn-logo.png"
              alt="Lauris Learn"
              width={36}
              height={36}
              className="object-contain flex-shrink-0"
            />
            <div>
              <h2 className="text-sm font-semibold text-sidebar-foreground leading-tight">{schoolName}</h2>
              <p className="text-xs text-muted-foreground">{schoolYear}</p>
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const active =
                item.path === "/dashboard"
                  ? pathname === "/dashboard" || pathname === "/"
                  : pathname.startsWith(item.path);
              return (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
                      active
                        ? "bg-primary text-white font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Super Admin link */}
          {userRole === "super_admin" && (
            <div className="mt-4 pt-4 border-t border-sidebar-border">
              <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Platform
              </p>
              <Link
                href="/super-admin/schools"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
                  pathname.startsWith("/super-admin")
                    ? "bg-primary text-white font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                <span>Super Admin</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground text-center">Lauris Learn v0.2</p>
        </div>
      </div>
    </aside>
  );
}
