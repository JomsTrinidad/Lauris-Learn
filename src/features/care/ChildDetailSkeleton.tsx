"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Care Performance Phase 1 — skeleton shell rendered while the
 * primary RPC (get_care_child_with_details) is in flight. Matches
 * the rough layout of ChildDetailView so the layout doesn't jump
 * when content arrives.
 *
 * Pattern follows the existing app convention (see dashboard/page.tsx):
 *   bg-muted/40 rounded-lg animate-pulse
 */
export function ChildDetailShellSkeleton() {
  return (
    <div className="space-y-4">
      <Link
        href="/care/children"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to children
      </Link>

      {/* Header / identity card skeleton */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-muted/60 rounded animate-pulse" />
              <div className="h-3 w-32 bg-muted/40 rounded animate-pulse" />
            </div>
            <div className="h-6 w-28 bg-muted/40 rounded-full animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SkeletonField />
            <SkeletonField />
            <SkeletonField />
            <SkeletonField />
            <SkeletonField />
            <SkeletonField />
          </div>
        </CardContent>
      </Card>

      {/* Identifiers card skeleton */}
      <Card>
        <CardHeader>
          <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-12 bg-muted/30 rounded-lg animate-pulse" />
            <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SkeletonField() {
  return (
    <div className="space-y-1.5">
      <div className="h-3 w-16 bg-muted/40 rounded animate-pulse" />
      <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
    </div>
  );
}

/**
 * Skeleton block for secondary sections (sessions / documents) while
 * Phase 2 fetches are in flight. Used inside ChildDetailView when
 * secondaryLoading is true.
 */
export function SecondarySectionSkeleton({
  title,
}: {
  title?: string;
}) {
  return (
    <div className="space-y-2">
      {title && (
        <div className="px-1">
          <div className="h-4 w-40 bg-muted/50 rounded animate-pulse" />
        </div>
      )}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="h-12 bg-muted/30 rounded-lg animate-pulse" />
          <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    </div>
  );
}
