"use client";
import { Menu, X, ChevronDown, LogOut } from "lucide-react";
import { useState } from "react";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  userName?: string;
  userRole?: string;
  schoolYear?: string;
}

export function Header({
  sidebarOpen,
  onToggleSidebar,
  userName = "Admin User",
  userRole = "School Admin",
  schoolYear = "SY 2025–2026",
}: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
      {/* Left: sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg hover:bg-accent transition-colors"
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Right: school year + user */}
      <div className="flex items-center gap-3">
        {/* Active school year pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm cursor-pointer hover:bg-accent transition-colors">
          <span className="text-muted-foreground">{schoolYear}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-muted rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              {getInitials(userName)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium leading-tight">{userName}</p>
              <p className="text-xs text-muted-foreground leading-tight">{userRole}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-10">
              <div className="p-2">
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
      </div>
    </header>
  );
}
