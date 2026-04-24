"use client";
import { useEffect, useState, useCallback } from "react";
import { ImagePlus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

interface Update {
  id: string;
  author: string;
  classId: string | null;
  className: string;
  content: string;
  createdAt: string;
}

interface ClassOption {
  id: string;
  name: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ParentUpdatesPage() {
  const { schoolId, activeYear, userId, userName } = useSchoolContext();
  const supabase = createClient();

  const [updates, setUpdates] = useState<Update[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [postContent, setPostContent] = useState("");
  const [postClass, setPostClass] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadClasses(), loadUpdates()]);
    setLoading(false);
  }

  async function loadClasses() {
    if (!activeYear?.id) { setClassOptions([]); return; }
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("start_time");

    const opts = (data ?? []) as ClassOption[];
    setClassOptions(opts);
    if (opts.length > 0 && !postClass) setPostClass(opts[0].id);
  }

  const loadUpdates = useCallback(async () => {
    const result = await supabase
      .from("parent_updates")
      .select("id, class_id, content, created_at, author:profiles(full_name), class:classes(name)")
      .eq("school_id", schoolId!)
      .order("created_at", { ascending: false })
      .limit(50) as any;

    if (result.error) { setError(result.error.message); return; }

    setUpdates(
      ((result.data ?? []) as any[]).map((u: any) => ({
        id: u.id,
        author: u.author?.full_name ?? "Unknown",
        classId: u.class_id,
        className: u.class?.name ?? "All Classes",
        content: u.content,
        createdAt: u.created_at,
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  async function handlePost() {
    if (!postContent.trim() || !userId) return;
    setPosting(true);
    setError(null);

    const payload = {
      school_id: schoolId!,
      author_id: userId,
      content: postContent.trim(),
      class_id: postClass || null,
    };

    const result = await (supabase.from("parent_updates") as any).insert(payload);
    if (result.error) { setError(result.error.message); setPosting(false); return; }

    setPostContent("");
    setPosting(false);
    await loadUpdates();
  }

  const filtered = classFilter === "all"
    ? updates
    : updates.filter((u) => u.classId === classFilter);

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1>Parent Updates</h1>
        <p className="text-muted-foreground text-sm mt-1">Share updates with parents about class activities</p>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Compose box */}
      <Card>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Post to class</label>
            <Select
              value={postClass}
              onChange={(e) => setPostClass(e.target.value)}
              className="w-52"
              disabled={classOptions.length === 0}
            >
              {classOptions.length === 0
                ? <option value="">No classes</option>
                : classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
              }
            </Select>
          </div>
          <Textarea
            placeholder="What happened today? Share an update with parents..."
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            rows={3}
          />
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-accent"
              title="Photo upload — coming soon"
            >
              <ImagePlus className="w-4 h-4" />
              Add Photo
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">coming soon</span>
            </button>
            <Button onClick={handlePost} disabled={!postContent.trim() || posting}>
              <Send className="w-4 h-4" />
              {posting ? "Posting…" : "Post Update"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">Filter by class:</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setClassFilter("all")}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              classFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-accent text-foreground"
            }`}
          >
            All Classes
          </button>
          {classOptions.map((c) => (
            <button
              key={c.id}
              onClick={() => setClassFilter(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                classFilter === c.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent text-foreground"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="text-center py-10 text-muted-foreground">
              No updates yet. Post the first one above!
            </CardContent>
          </Card>
        ) : (
          filtered.map((update) => (
            <Card key={update.id} className="overflow-hidden">
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {getInitials(update.author)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{update.author}</p>
                        <p className="text-xs text-muted-foreground">{update.className}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {timeAgo(update.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{update.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
