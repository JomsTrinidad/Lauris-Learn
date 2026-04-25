"use client";
import { useEffect, useState } from "react";
import { MessageSquare, ExternalLink, RotateCw } from "lucide-react";
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

function PhotoGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return <img src={urls[0]} alt="" className="mt-3 rounded-xl w-full object-cover max-h-72" />;
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
      {urls.slice(0, 4).map((url, i) => (
        <img key={i} src={url} alt="" className="w-full h-36 object-cover" />
      ))}
    </div>
  );
}

const PREVIEW_CHARS = 180;

export default function ParentUpdatesPage() {
  const { classId, schoolId, messengerLink } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, classId]);

  async function loadUpdates() {
    setLoading(true);
    if (!schoolId) { setLoading(false); return; }

    // Fetch updates for this class AND school-wide updates (class_id is null)
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

  if (loading) return <PageSpinner />;

  return (
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

                  <p className="text-sm leading-relaxed whitespace-pre-line">{displayText}</p>

                  <PhotoGrid urls={u.imageUrls} />

                  {isLong && (
                    <button
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
  );
}
