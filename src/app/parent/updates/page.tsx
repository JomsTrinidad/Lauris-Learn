"use client";
import { useEffect, useState } from "react";
import { MessageSquare, ExternalLink, RotateCw, X, ChevronLeft, ChevronRight, Camera } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";

interface Update {
  id: string;
  content: string;
  author: string;
  className: string;
  createdAt: string;
  imageUrls: string[];
  expanded: boolean;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// ── Compact media indicator ───────────────────────────────────────────────────

function MediaPreview({ urls, onOpen }: { urls: string[]; onOpen: (idx: number) => void }) {
  if (urls.length === 0) return null;
  const extra = urls.length - 2;
  return (
    <button
      type="button"
      onClick={() => onOpen(0)}
      className="mt-3 flex items-center gap-2.5 rounded-xl hover:bg-accent/50 transition-colors -mx-1 px-1.5 py-1.5 group w-full text-left"
    >
      {/* Thumbnails — up to 2 */}
      <div className="flex gap-1.5 flex-shrink-0">
        {urls.slice(0, 2).map((url, i) => (
          <img
            key={i}
            src={url}
            alt=""
            className="w-12 h-12 rounded-lg object-cover ring-1 ring-border"
          />
        ))}
      </div>
      {/* Count label */}
      <div className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          <Camera className="w-3.5 h-3.5 flex-shrink-0" />
          {urls.length === 1 ? "1 photo" : `${urls.length} photos`}
        </span>
        {extra > 0 && (
          <span className="text-[10px] text-muted-foreground">+{extra} more</span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-foreground transition-colors flex-shrink-0" />
    </button>
  );
}

// ── Full-screen photo gallery modal ──────────────────────────────────────────

function PhotoGallery({
  urls,
  startIdx,
  onClose,
}: {
  urls: string[];
  startIdx: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")  setIdx((i) => (i > 0 ? i - 1 : urls.length - 1));
      if (e.key === "ArrowRight") setIdx((i) => (i < urls.length - 1 ? i + 1 : 0));
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [urls.length, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* Header: counter + close */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white/80 text-sm tabular-nums">
          {idx + 1} / {urls.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close gallery"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center px-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={urls[idx]}
          alt={`Photo ${idx + 1} of ${urls.length}`}
          className="max-h-full max-w-full object-contain rounded-xl"
        />
      </div>

      {/* Navigation + dots */}
      {urls.length > 1 && (
        <div
          className="flex items-center justify-between px-4 py-4 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setIdx((i) => (i > 0 ? i - 1 : urls.length - 1))}
            className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Dot indicators — show up to 8, truncate with ellipsis dot */}
          <div className="flex items-center gap-1.5">
            {urls.slice(0, 8).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Go to photo ${i + 1}`}
                className={`rounded-full transition-all ${
                  i === idx
                    ? "w-2 h-2 bg-white"
                    : "w-1.5 h-1.5 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
            {urls.length > 8 && (
              <span className="text-white/40 text-[10px] ml-0.5">…</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIdx((i) => (i < urls.length - 1 ? i + 1 : 0))}
            className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PREVIEW_CHARS = 180;

export default function ParentUpdatesPage() {
  const { classId, schoolId, messengerLink } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [gallery, setGallery] = useState<{ urls: string[]; idx: number } | null>(null);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, classId]);

  async function loadUpdates() {
    setLoading(true);
    if (!schoolId) { setLoading(false); return; }

    const classFilter = classId
      ? `class_id.eq.${classId},class_id.is.null`
      : "class_id.is.null";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("parent_updates")
      .select("id, content, image_url, image_urls, created_at, author:profiles(full_name), class:classes(name)")
      .eq("school_id", schoolId)
      .or(classFilter)
      .eq("status", "posted")
      .order("created_at", { ascending: false })
      .limit(50);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawUpdates = (data ?? []) as any[];

    // Collect all unique storage paths and sign them in one batch
    const allPaths: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of rawUpdates) {
      const paths: string[] = Array.isArray(u.image_urls) && u.image_urls.length > 0
        ? u.image_urls : (u.image_url ? [u.image_url] : []);
      for (const p of paths) {
        if (p && !p.startsWith("http") && !allPaths.includes(p)) allPaths.push(p);
      }
    }

    const signedMap = new Map<string, string>();
    if (allPaths.length > 0) {
      const { data: signed } = await supabase.storage.from("updates-media").createSignedUrls(allPaths, 3600);
      // Use index-based mapping — s.path from the API may differ from what we stored
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (signed ?? []).forEach((s: any, i: number) => {
        if (s.signedUrl) signedMap.set(allPaths[i], s.signedUrl);
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setUpdates(rawUpdates.map((u: any) => {
      const paths: string[] = Array.isArray(u.image_urls) && u.image_urls.length > 0
        ? u.image_urls : (u.image_url ? [u.image_url] : []);
      const imageUrls = paths
        .map((p) => p.startsWith("http") ? p : (signedMap.get(p) ?? ""))
        .filter(Boolean);
      return {
        id: u.id,
        content: u.content,
        author: u.author?.full_name ?? "Teacher",
        className: u.class?.name ?? "",
        createdAt: u.created_at,
        imageUrls,
        expanded: false,
      };
    }));
    setLoading(false);
  }

  function toggleExpand(id: string) {
    setUpdates((prev) => prev.map((u) => u.id === id ? { ...u, expanded: !u.expanded } : u));
  }

  function openGallery(urls: string[], idx: number) {
    setGallery({ urls, idx });
  }

  if (loading) return <PageSpinner />;

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Updates from School</h1>
            <button
              onClick={async () => { setRefreshing(true); await loadUpdates(); setRefreshing(false); }}
              disabled={refreshing}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RotateCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          {messengerLink && (
            <a
              href={messengerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Join Class Chat
            </a>
          )}
        </div>

        {updates.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground space-y-3">
              <MessageSquare className="w-12 h-12 mx-auto opacity-30" />
              <p>No updates yet. Check back later!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => {
              const isLong = u.content.length > PREVIEW_CHARS;
              const displayText = isLong && !u.expanded
                ? u.content.slice(0, PREVIEW_CHARS).trimEnd() + "…"
                : u.content;
              return (
                <Card key={u.id}>
                  <CardContent className="p-4">
                    {/* Author row */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {getInitials(u.author)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{u.author}</p>
                        <p className="text-xs text-muted-foreground">{u.className}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(u.createdAt)}</span>
                    </div>

                    {/* Update text */}
                    <p className="text-sm leading-relaxed whitespace-pre-line">{displayText}</p>

                    {/* Compact media preview — replaces inline photo grid */}
                    {u.imageUrls.length > 0 && (
                      <MediaPreview
                        urls={u.imageUrls}
                        onOpen={(idx) => openGallery(u.imageUrls, idx)}
                      />
                    )}

                    {/* Read more toggle */}
                    {isLong && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(u.id)}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        {u.expanded ? "Show less" : "Read more"}
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Gallery modal — rendered outside the card stack to avoid z-index issues */}
      {gallery && (
        <PhotoGallery
          urls={gallery.urls}
          startIdx={gallery.idx}
          onClose={() => setGallery(null)}
        />
      )}
    </>
  );
}
