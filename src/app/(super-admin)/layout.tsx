"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { ShieldCheck, School, LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const navItems = [
  { path: "/super-admin/schools", label: "Schools", icon: School },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", authUser.id)
        .single();

      if (profile?.role !== "super_admin") {
        router.push("/dashboard");
        return;
      }

      setUser({
        id: authUser.id,
        name: profile.full_name,
        email: authUser.email ?? "",
        role: "Super Admin",
      });
      setLoading(false);
    })();
  }, [router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Brand */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <Image
              src="/assets/logo/lauris-learn-logo.png"
              alt="Lauris Learn"
              width={36}
              height={36}
              className="object-contain flex-shrink-0"
            />
            <div>
              <h2 className="text-sm font-semibold text-sidebar-foreground leading-tight">Lauris Learn</h2>
              <p className="text-xs text-muted-foreground">Platform Admin</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
                    pathname.startsWith(item.path)
                      ? "bg-primary text-white font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground text-center">Lauris Learn v0.2</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Super Admin Panel</span>
          </div>

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 bg-muted rounded-lg hover:bg-accent transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                {getInitials(user?.name ?? "SA")}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium leading-tight">{user?.name}</p>
                <p className="text-xs text-muted-foreground leading-tight">{user?.role}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-10">
                <div className="p-2">
                  <Link
                    href="/dashboard"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-lg transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <School className="w-4 h-4" />
                    Go to Dashboard
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
