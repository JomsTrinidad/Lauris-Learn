"use client";
import { Menu, ChevronDown, LogOut, Check, ChevronLeft } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { ActiveYear } from "@/contexts/SchoolContext";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  userName?: string;
  userRole?: string;
  schoolYear?: string;
  schoolName?: string;
  userAvatar?: string | null;
  allSchoolYears?: ActiveYear[];
  viewingYear?: ActiveYear | null;
  onSelectYear?: (year: ActiveYear) => void;
  showBackToDashboard?: boolean;
}

export function Header({
  sidebarOpen,
  onToggleSidebar,
  userName = "Admin User",
  userRole = "School Admin",
  schoolYear = "SY 2025–2026",
  schoolName,
  userAvatar,
  allSchoolYears = [],
  viewingYear,
  onSelectYear,
  showBackToDashboard = false,
}: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const router = useRouter();
  const yearMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (yearMenuRef.current && !yearMenuRef.current.contains(e.target as Node)) {
        setYearMenuOpen(false);
      }
    }
    if (yearMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [yearMenuOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const displayYear = viewingYear?.name ?? schoolYear;

  return (
    <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
      {/* Left: hamburger toggle + back link or school name */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        {showBackToDashboard ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Dashboard
          </Link>
        ) : (
          !sidebarOpen && schoolName && (
            <span className="hidden sm:block text-sm font-semibold text-foreground">{schoolName}</span>
          )
        )}
      </div>

      {/* Right: school year + user */}
      <div className="flex items-center gap-3">
        {/* School year pill with dropdown */}
        <div ref={yearMenuRef} className="relative hidden sm:block">
          <button
            onClick={() => setYearMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm hover:bg-accent transition-colors"
          >
            <span className="text-muted-foreground">{displayYear}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {yearMenuOpen && allSchoolYears.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-10">
              <div className="p-1">
                {allSchoolYears.map((year) => {
                  const isActive = year.status === "active";
                  const isSelected = viewingYear?.id === year.id;
                  return (
                    <button
                      key={year.id}
                      disabled={!isActive}
                      onClick={() => {
                        if (!isActive) return;
                        onSelectYear?.(year);
                        setYearMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md text-left transition-colors ${
                        isActive
                          ? "hover:bg-accent cursor-pointer"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span>{year.name}</span>
                      <div className="flex items-center gap-1.5">
                        {isActive && (
                          <span className="text-xs text-emerald-600 font-medium">Active</span>
                        )}
                        {!isActive && (
                          <span className="text-xs text-muted-foreground">Coming soon</span>
                        )}
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-primary" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-muted rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold overflow-hidden flex-shrink-0">
              {userAvatar
                ? <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                : getInitials(userName)
              }
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
