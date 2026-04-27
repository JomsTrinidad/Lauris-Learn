"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  ImagePlus, Send, Lightbulb, ChevronDown, ChevronUp, X,
  Eye, EyeOff, Trash2, RotateCcw, AlertTriangle, FileText, Pencil, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { getInitials } from "@/lib/utils";
import { compressImage, UPDATE_PHOTO_MAX_W, UPDATE_PHOTO_MAX_BYTES } from "@/lib/image-compress";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

const MAX_PHOTOS = 4;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

type UpdateStatus = "draft" | "posted" | "hidden" | "deleted";
type StatusFilter = "posted" | "draft" | "hidden" | "all";

interface Update {
  id: string;
  author: string;
  classId: string | null;
  className: string;
  content: string;
  createdAt: string;
  imageUrls: string[];   // signed URLs for display (1-hour TTL)
  imagePaths: string[];  // raw storage paths for reuse when editing drafts
  status: UpdateStatus;
  hiddenReason: string | null;
}

interface ClassOption { id: string; name: string; }

// A photo item can be a newly selected file OR an already-uploaded file (from a saved draft)
interface PhotoItem {
  file: File | null;
  previewUrl: string;
  uploadedPath: string | null; // storage path if already uploaded
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type DraftType = "announcement" | "reminder" | "progress" | "event" | "individual";
const DRAFT_LABELS: Record<DraftType, string> = {
  announcement: "Class Announcement",
  reminder: "Reminder",
  progress: "Progress Note",
  event: "Event Notice",
  individual: "Student Update",
};

function buildDraft(type: DraftType, className: string): string {
  switch (type) {
    case "announcement":
      return `Good day, parents of ${className}!\n\nWe have an update to share with you.\n\n[Write your announcement here.]\n\nThank you for your continued support! 😊`;
    case "reminder":
      return `Hi parents! Just a friendly reminder:\n\n📌 [Write what parents need to remember or bring.]\n\nDate/Deadline: [date]\n\nPlease don't hesitate to reach out if you have questions. Thank you!`;
    case "progress":
      return `Hi parents of ${className}!\n\nWe're happy to share a progress update for this period.\n\nThis week, the class worked on:\n• [Topic/Activity 1]\n• [Topic/Activity 2]\n\nOverall, the students have been [describe how they're doing]. Keep encouraging them at home by [suggestion].\n\nThank you! 🌟`;
    case "event":
      return `Dear parents,\n\nWe would like to inform you of an upcoming event:\n\n📅 Event: [Event name]\n🗓 Date: [Date]\n⏰ Time: [Time]\n📍 Location: [Location or Online]\n\n[Additional details or what to prepare.]\n\nKindly confirm your child's attendance by [RSVP date]. Thank you!`;
    case "individual":
      return `Hi [Parent name],\n\nWe wanted to share a quick update about [child's name].\n\nToday, [he/she/they] [describe observation or achievement].\n\nWe encourage you to [action at home or follow-up].\n\nFeel free to message us if you have questions. Thank you! 💛`;
  }
}

function PhotoGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return <img src={urls[0]} alt="" className="mt-3 rounded-xl w-full object-cover max-h-80" />;
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
      {urls.slice(0, 4).map((url, i) => (
        <img key={i} src={url} alt="" className="w-full h-40 object-cover" />
      ))}
    </div>
  );
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  posted: "Posted", draft: "Drafts", hidden: "Hidden", all: "All",
};

export default function ParentUpdatesPage() {
  const { schoolId, activeYear, userId } = useSchoolContext();
  const supabase = createClient();
  const composeRef = useRef<HTMLDivElement>(null);

  const [updates, setUpdates] = useState<Update[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [postContent, setPostContent] = useState("");
  const [postClass, setPostClass] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("posted");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDraftSuggestions, setShowDraftSuggestions] = useState(false);
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Broadcast modal state
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<string>("all");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [broadcastPhotos, setBroadcastPhotos] = useState<PhotoItem[]>([]);
  const [broadcastStep, setBroadcastStep] = useState<"compose" | "preview">("compose");
  const [broadcastPhotoLoading, setBroadcastPhotoLoading] = useState(false);
  const broadcastFileRef = useRef<HTMLInputElement>(null);

  // Action modal state
  const [actionUpdate, setActionUpdate] = useState<Update | null>(null);
  const [actionType, setActionType] = useState<"hide" | "restore" | "delete" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  // Revoke object URLs for new-file items only on unmount
  useEffect(() => {
    return () => {
      photoItems.forEach((p) => { if (p.file) URL.revokeObjectURL(p.previewUrl); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadClasses(), loadUpdates()]);
    setLoading(false);
  }

  async function handleBroadcastPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const remaining = 2 - broadcastPhotos.length;
    if (remaining <= 0) return;
    setBroadcastPhotoLoading(true);
    const newItems: PhotoItem[] = [];
    for (const file of files.slice(0, remaining)) {
      const compressed = await compressImage(file, UPDATE_PHOTO_MAX_W, UPDATE_PHOTO_MAX_BYTES);
      newItems.push({ file: compressed, previewUrl: URL.createObjectURL(compressed), uploadedPath: null });
    }
    setBroadcastPhotos((prev) => [...prev, ...newItems]);
    setBroadcastPhotoLoading(false);
  }

  function removeBroadcastPhoto(index: number) {
    setBroadcastPhotos((prev) => {
      const item = prev[index];
      if (item.file) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function sendBroadcast() {
    if (!broadcastMessage.trim() || !schoolId || !userId) return;
    setBroadcastSending(true);
    setBroadcastError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: inserted, error: err } = await sb
      .from("parent_updates")
      .insert({
        school_id: schoolId,
        class_id: broadcastTarget === "all" ? null : broadcastTarget,
        author_id: userId,
        content: broadcastMessage.trim(),
        status: "posted",
        image_urls: [],
      })
      .select("id")
      .single();
    if (err || !inserted) {
      setBroadcastError(err?.message ?? "Failed to send broadcast.");
      setBroadcastSending(false);
      return;
    }
    if (broadcastPhotos.length > 0) {
      const imagePaths = await uploadPhotos(inserted.id, broadcastPhotos);
      if (imagePaths.length > 0) {
        await sb.from("parent_updates").update({ image_urls: imagePaths }).eq("id", inserted.id);
      }
    }
    setBroadcastSending(false);
    setBroadcastSent(true);
    setBroadcastMessage("");
    broadcastPhotos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.previewUrl); });
    setBroadcastPhotos([]);
    setTimeout(() => {
      setBroadcastOpen(false);
      setBroadcastSent(false);
      setBroadcastTarget("all");
      setBroadcastStep("compose");
    }, 1500);
    await loadUpdates();
  }

  async function loadClasses() {
    if (!activeYear?.id) { setClassOptions([]); return; }
    const { data } = await supabase
      .from("classes").select("id, name")
      .eq("school_id", schoolId!).eq("school_year_id", activeYear.id).eq("is_active", true).order("start_time");
    const opts = (data ?? []) as ClassOption[];
    setClassOptions(opts);
    if (opts.length > 0 && !postClass) setPostClass(opts[0].id);
  }

  const loadUpdates = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any)
      .from("parent_updates")
      .select("id, class_id, content, image_url, image_urls, status, hidden_reason, created_at, author:profiles(full_name), class:classes(name)")
      .eq("school_id", schoolId!)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(100);

    if (result.error) { setError(result.error.message); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawUpdates = (result.data ?? []) as any[];

    // Collect all unique storage paths to sign in one batch request
    const allPaths: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPathsMap = new Map<string, string[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of rawUpdates) {
      const paths: string[] = Array.isArray(u.image_urls) && u.image_urls.length > 0
        ? u.image_urls : (u.image_url ? [u.image_url] : []);
      rawPathsMap.set(u.id, paths);
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

    function resolveUrls(paths: string[]): string[] {
      return paths
        .map((p) => p.startsWith("http") ? p : (signedMap.get(p) ?? ""))
        .filter(Boolean);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setUpdates(rawUpdates.map((u: any) => {
      const paths = rawPathsMap.get(u.id) ?? [];
      return {
        id: u.id,
        author: u.author?.full_name ?? "Unknown",
        classId: u.class_id,
        className: u.class?.name ?? "All Classes",
        content: u.content,
        createdAt: u.created_at,
        imageUrls: resolveUrls(paths),
        imagePaths: paths,
        status: (u.status ?? "posted") as UpdateStatus,
        hiddenReason: u.hidden_reason ?? null,
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  // ── Photo handling ──────────────────────────────────────────────────────────

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const remaining = MAX_PHOTOS - photoItems.length;
    if (remaining <= 0) { setError(`Maximum ${MAX_PHOTOS} photos per update.`); return; }

    setAddingPhoto(true);
    setError(null);
    const newItems: PhotoItem[] = [];

    for (const file of files.slice(0, remaining)) {
      const compressed = await compressImage(file, UPDATE_PHOTO_MAX_W, UPDATE_PHOTO_MAX_BYTES);
      if (compressed.size > UPDATE_PHOTO_MAX_BYTES) {
        setError(`"${file.name}" exceeds 2 MB even after compression. Please use a smaller image.`);
        newItems.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        setAddingPhoto(false);
        return;
      }
      newItems.push({ file: compressed, previewUrl: URL.createObjectURL(compressed), uploadedPath: null });
    }

    const allItems = [...photoItems, ...newItems];
    const newFilesSize = allItems.filter((p) => p.file).reduce((s, p) => s + p.file!.size, 0);
    if (newFilesSize > MAX_TOTAL_BYTES) {
      newItems.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setError("Total photo size exceeds 8 MB. Please remove some photos.");
      setAddingPhoto(false);
      return;
    }

    setPhotoItems(allItems);
    setAddingPhoto(false);
  }

  function removePhoto(index: number) {
    setPhotoItems((prev) => {
      const item = prev[index];
      if (item.file) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function clearCompose() {
    setPhotoItems((prev) => { prev.forEach((p) => { if (p.file) URL.revokeObjectURL(p.previewUrl); }); return []; });
    setPostContent("");
    setEditingDraftId(null);
    setShowPreview(false);
  }

  // ── Upload helpers ──────────────────────────────────────────────────────────

  async function uploadPhotos(updateId: string, items: PhotoItem[]): Promise<string[]> {
    const paths: string[] = [];
    let newIndex = 0;
    for (const item of items) {
      if (item.uploadedPath) {
        paths.push(item.uploadedPath);
      } else if (item.file) {
        const path = `updates/${updateId}/${newIndex++}.jpg`;
        const { error } = await supabase.storage.from("updates-media").upload(path, item.file, { upsert: true });
        if (!error) paths.push(path);
      }
    }
    return paths;
  }

  // ── Post / Draft ────────────────────────────────────────────────────────────

  async function handlePost() {
    if (!postContent.trim() || !userId) return;
    setPosting(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    if (editingDraftId) {
      // Posting an edited draft — update the existing record
      const imageUrls = photoItems.length > 0 ? await uploadPhotos(editingDraftId, photoItems) : [];
      const { error: e } = await sb.from("parent_updates").update({
        content: postContent.trim(),
        class_id: postClass || null,
        status: "posted",
        image_urls: imageUrls,
      }).eq("id", editingDraftId);
      if (e) { setError(e.message); setPosting(false); return; }
    } else {
      // New post — insert then upload photos
      const { data: inserted, error: insertErr } = await sb
        .from("parent_updates")
        .insert({ school_id: schoolId!, author_id: userId, content: postContent.trim(), class_id: postClass || null, status: "posted", image_urls: [] })
        .select("id").single();
      if (insertErr || !inserted) { setError(insertErr?.message ?? "Failed to post update."); setPosting(false); return; }
      if (photoItems.length > 0) {
        const imageUrls = await uploadPhotos(inserted.id, photoItems);
        if (imageUrls.length > 0) {
          await sb.from("parent_updates").update({ image_urls: imageUrls }).eq("id", inserted.id);
        }
      }
    }

    clearCompose();
    setPosting(false);
    setStatusFilter("posted");
    await loadUpdates();
  }

  async function handleSaveDraft() {
    if (!postContent.trim() || !userId) return;
    setSavingDraft(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    if (editingDraftId) {
      // Updating an existing draft
      const imageUrls = photoItems.length > 0 ? await uploadPhotos(editingDraftId, photoItems) : [];
      const { error: e } = await sb.from("parent_updates").update({
        content: postContent.trim(),
        class_id: postClass || null,
        image_urls: imageUrls,
      }).eq("id", editingDraftId);
      if (e) { setError(e.message); setSavingDraft(false); return; }
    } else {
      // New draft — insert first to get ID, then upload photos
      const { data: inserted, error: insertErr } = await sb
        .from("parent_updates")
        .insert({ school_id: schoolId!, author_id: userId, content: postContent.trim(), class_id: postClass || null, status: "draft", image_urls: [] })
        .select("id").single();
      if (insertErr || !inserted) { setError(insertErr?.message ?? "Failed to save draft."); setSavingDraft(false); return; }
      if (photoItems.length > 0) {
        const imageUrls = await uploadPhotos(inserted.id, photoItems);
        if (imageUrls.length > 0) {
          await sb.from("parent_updates").update({ image_urls: imageUrls }).eq("id", inserted.id);
        }
      }
    }

    clearCompose();
    setSavingDraft(false);
    setStatusFilter("draft");
    await loadUpdates();
  }

  function loadDraftForEdit(update: Update) {
    // Clear any existing compose state first
    photoItems.forEach((p) => { if (p.file) URL.revokeObjectURL(p.previewUrl); });

    setPostContent(update.content);
    setPostClass(update.classId ?? classOptions[0]?.id ?? "");
    setEditingDraftId(update.id);
    setShowPreview(false);

    // Load existing uploaded photos — use signed URLs for preview, raw paths for reuse on save
    setPhotoItems(update.imageUrls.map((url, i) => ({
      file: null,
      previewUrl: url,
      uploadedPath: update.imagePaths[i] ?? null,
    })));

    // Scroll compose into view
    setTimeout(() => composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  function openAction(update: Update, type: "hide" | "restore" | "delete") {
    setActionUpdate(update);
    setActionType(type);
    setActionReason("");
  }

  async function executeAction() {
    if (!actionUpdate || !actionType) return;
    if (actionType !== "restore" && !actionReason.trim()) return;
    setActionSaving(true);
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any = {};
    if (actionType === "hide") {
      payload = { status: "hidden", hidden_reason: actionReason.trim(), hidden_at: now, action_by: userId };
    } else if (actionType === "restore") {
      payload = { status: "posted", hidden_reason: null, hidden_at: null };
    } else {
      payload = { status: "deleted", deleted_reason: actionReason.trim(), deleted_at: now, action_by: userId };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("parent_updates").update(payload).eq("id", actionUpdate.id);
    setActionUpdate(null);
    setActionType(null);
    setActionSaving(false);
    await loadUpdates();
  }

  function applyDraft(type: DraftType) {
    const cls = classOptions.find((c) => c.id === postClass);
    setPostContent(buildDraft(type, cls?.name ?? "your class"));
    setShowDraftSuggestions(false);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filtered = updates.filter((u) => {
    const matchClass = classFilter === "all" || u.classId === classFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchClass && matchStatus;
  });

  const previewClass = classOptions.find((c) => c.id === postClass);
  const totalPhotoSize = photoItems.filter((p) => p.file).reduce((s, p) => s + p.file!.size, 0);

  const actionTitle = actionType === "hide" ? "Hide Update"
    : actionType === "restore" ? "Restore Update"
    : "Delete Update";

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1>Parent Updates</h1>
          <p className="text-muted-foreground text-sm mt-1">Share updates with parents about class activities</p>
        </div>
        <Button
          variant="outline"
          onClick={() => { setBroadcastOpen(true); setBroadcastError(null); setBroadcastSent(false); }}
          className="flex-shrink-0"
        >
          <Megaphone className="w-4 h-4" /> Broadcast
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* ── Compose box ─────────────────────────────────────────────────── */}
      <div ref={composeRef}>
        <Card>
          <CardContent className="space-y-3">
            {/* Editing-draft banner */}
            {editingDraftId && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <span className="text-blue-800 font-medium">Editing saved draft</span>
                <button onClick={clearCompose} className="text-blue-600 hover:text-blue-800 text-xs underline">
                  Cancel — start fresh
                </button>
              </div>
            )}

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Post to class</label>
                <Select value={postClass} onChange={(e) => setPostClass(e.target.value)} className="w-52" disabled={classOptions.length === 0}>
                  {classOptions.length === 0
                    ? <option value="">No classes</option>
                    : classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <button
                onClick={() => setShowDraftSuggestions((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium pb-2"
              >
                <Lightbulb className="w-4 h-4" />
                Suggestions
                {showDraftSuggestions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showDraftSuggestions && (
              <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg border border-border">
                <p className="w-full text-xs text-muted-foreground mb-1">Insert a starter template — edit freely before posting:</p>
                {(Object.keys(DRAFT_LABELS) as DraftType[]).map((type) => (
                  <button key={type} onClick={() => applyDraft(type)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background border border-border hover:border-primary hover:text-primary transition-colors">
                    {DRAFT_LABELS[type]}
                  </button>
                ))}
              </div>
            )}

            <Textarea
              placeholder="What happened today? Share an update with parents..."
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              rows={5}
            />

            {/* Photo strip */}
            {photoItems.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photoItems.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.previewUrl} alt="" className="w-20 h-20 object-cover rounded-lg border border-border" />
                    <button onClick={() => removePhoto(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {photoItems.length < MAX_PHOTOS && (
                  <button onClick={() => fileInputRef.current?.click()} disabled={addingPhoto}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    <ImagePlus className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-3">
                {photoItems.length === 0 && (
                  <button onClick={() => fileInputRef.current?.click()} disabled={addingPhoto}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-accent">
                    <ImagePlus className="w-4 h-4" />
                    {addingPhoto ? "Compressing…" : "Add Photos"}
                  </button>
                )}
                {photoItems.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {photoItems.length}/{MAX_PHOTOS} photos
                    {totalPhotoSize > 0 && ` · ${(totalPhotoSize / 1024 / 1024).toFixed(1)} MB`}
                  </span>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhoto} />
              <Button onClick={() => setShowPreview(true)} disabled={!postContent.trim() || addingPhoto}>
                <Eye className="w-4 h-4" />
                Preview & Post
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 items-center text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Show:</span>
          <div className="flex gap-1.5">
            {(["posted", "draft", "hidden", "all"] as StatusFilter[]).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${statusFilter === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>
                {STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
        {classOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Class:</span>
            <div className="flex gap-1.5">
              <button onClick={() => setClassFilter("all")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${classFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>
                All
              </button>
              {classOptions.map((c) => (
                <button key={c.id} onClick={() => setClassFilter(c.id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${classFilter === c.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Feed ────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="text-center py-10 text-muted-foreground">
              {statusFilter === "posted" ? "No posted updates yet. Write one above." :
               statusFilter === "draft" ? "No saved drafts." :
               statusFilter === "hidden" ? "No hidden updates." :
               "No updates yet."}
            </CardContent>
          </Card>
        ) : (
          filtered.map((update) => (
            <Card key={update.id} className={update.status === "hidden" ? "opacity-70" : ""}>
              <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                      {getInitials(update.author)}
                    </div>
                    <div>
                      <p className="font-medium text-sm leading-tight">{update.author}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{update.className}</span>
                        {update.status === "draft" && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md font-medium">Draft</span>
                        )}
                        {update.status === "hidden" && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md font-medium">Hidden</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(update.createdAt)}</span>
                </div>

                {/* Content */}
                <p className="text-sm leading-relaxed whitespace-pre-line">{update.content}</p>

                {update.hiddenReason && (
                  <p className="mt-2 text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                    Reason hidden: {update.hiddenReason}
                  </p>
                )}

                <PhotoGrid urls={update.imageUrls} />

                {/* Action bar */}
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                  {/* Left actions */}
                  <div className="flex items-center gap-3">
                    {update.status === "draft" && (
                      <button
                        onClick={() => loadDraftForEdit(update)}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit Draft
                      </button>
                    )}
                    {update.status === "hidden" && (
                      <button
                        onClick={() => openAction(update, "restore")}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restore
                      </button>
                    )}
                  </div>

                  {/* Right actions */}
                  <div className="flex items-center gap-3">
                    {update.status === "draft" && (
                      <>
                        <button
                          onClick={async () => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await (supabase as any).from("parent_updates").update({ status: "posted" }).eq("id", update.id);
                            await loadUpdates();
                            setStatusFilter("posted");
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" /> Post Now
                        </button>
                        <button
                          onClick={() => openAction(update, "delete")}
                          className="flex items-center gap-1.5 text-xs text-destructive hover:opacity-80"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </>
                    )}
                    {update.status === "posted" && (
                      <button
                        onClick={() => openAction(update, "hide")}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <EyeOff className="w-3.5 h-3.5" /> Hide
                      </button>
                    )}
                    {update.status === "hidden" && (
                      <button
                        onClick={() => openAction(update, "delete")}
                        className="flex items-center gap-1.5 text-xs text-destructive hover:opacity-80"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ── Broadcast Modal ──────────────────────────────────────────────── */}
      <Modal
        open={broadcastOpen}
        onClose={() => {
          setBroadcastOpen(false);
          setBroadcastMessage("");
          setBroadcastError(null);
          broadcastPhotos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.previewUrl); });
          setBroadcastPhotos([]);
          setBroadcastStep("compose");
        }}
        title={broadcastStep === "preview" ? "Preview Broadcast" : "Send Broadcast"}
        className="max-w-lg"
      >
        <div className="space-y-4">

          {/* ── Compose step ── */}
          {broadcastStep === "compose" && (<>
            <p className="text-sm text-muted-foreground">
              Broadcasts go straight to the parent feed — no drafts. Use this for quick announcements, reminders, or school-wide notices.
            </p>

            <div>
              <label className="block text-sm font-medium mb-1">Send to</label>
              <Select value={broadcastTarget} onChange={(e) => setBroadcastTarget(e.target.value)}>
                <option value="all">All Parents (School-wide)</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} parents only</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <Textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Type your announcement or reminder here…"
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">{broadcastMessage.length} characters</p>
            </div>

            {/* Photos */}
            {broadcastPhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {broadcastPhotos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.previewUrl} alt="" className="w-20 h-20 object-cover rounded-lg border border-border" />
                    <button onClick={() => removeBroadcastPhoto(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {broadcastPhotos.length < 2 && (
                  <button onClick={() => broadcastFileRef.current?.click()} disabled={broadcastPhotoLoading}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    <ImagePlus className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Quick templates */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Quick templates:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "No class", text: "Hi parents! Please be informed that there will be NO CLASS on [date] due to [reason]. Classes will resume on [next date]. Thank you!" },
                  { label: "Reminder", text: "Friendly reminder: [what parents need to do or bring] by [date/deadline]. Thank you for your cooperation! 😊" },
                  { label: "Event", text: "We have an upcoming event! 📅\n\nEvent: [name]\nDate: [date]\nTime: [time]\nVenue: [location]\n\nKindly take note. See you there!" },
                ].map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setBroadcastMessage(t.text)}
                    className="text-xs px-2.5 py-1 border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <input ref={broadcastFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleBroadcastPhoto} />

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                onClick={() => broadcastFileRef.current?.click()}
                disabled={broadcastPhotoLoading || broadcastPhotos.length >= 2}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-accent disabled:opacity-40"
              >
                <ImagePlus className="w-4 h-4" />
                {broadcastPhotoLoading ? "Compressing…" : `Add Photos (${broadcastPhotos.length}/2)`}
              </button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setBroadcastOpen(false); setBroadcastMessage(""); }}>Cancel</Button>
                <Button onClick={() => setBroadcastStep("preview")} disabled={!broadcastMessage.trim()}>
                  <Eye className="w-4 h-4" /> Preview Broadcast
                </Button>
              </div>
            </div>
          </>)}

          {/* ── Preview step ── */}
          {broadcastStep === "preview" && (<>
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Once sent, this will be <strong>immediately visible</strong> to{" "}
                <strong>{broadcastTarget === "all" ? "all parents" : `parents of ${classOptions.find((c) => c.id === broadcastTarget)?.name ?? broadcastTarget}`}</strong>.
              </span>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Sending to</p>
              <p className="text-sm font-medium">
                {broadcastTarget === "all" ? "All Parents (School-wide)" : `${classOptions.find((c) => c.id === broadcastTarget)?.name ?? broadcastTarget} parents only`}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Message</p>
              <div className="bg-muted/40 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto">
                {broadcastMessage}
              </div>
            </div>

            {broadcastPhotos.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Photos ({broadcastPhotos.length})</p>
                <div className={`grid gap-1 rounded-xl overflow-hidden ${broadcastPhotos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {broadcastPhotos.map((p, i) => (
                    <img key={i} src={p.previewUrl} alt="" className={`w-full object-cover ${broadcastPhotos.length === 1 ? "max-h-48" : "h-32"}`} />
                  ))}
                </div>
              </div>
            )}

            {broadcastError && <ErrorAlert message={broadcastError} />}
            {broadcastSent && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                <Send className="w-4 h-4" /> Broadcast sent! Parents can see it now.
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setBroadcastStep("compose")}>← Back to Edit</Button>
              <Button onClick={sendBroadcast} disabled={broadcastSending || broadcastSent}>
                {broadcastSending ? "Sending…" : <><Megaphone className="w-4 h-4" /> Send Broadcast</>}
              </Button>
            </div>
          </>)}

        </div>
      </Modal>

      {/* ── Preview Modal ────────────────────────────────────────────────── */}
      <Modal open={showPreview} onClose={() => setShowPreview(false)} title={editingDraftId ? "Preview Draft" : "Preview Update"} className="max-w-lg">
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Once posted, this update will be <strong>visible to parents</strong> of{" "}
              <strong>{previewClass?.name ?? "all classes"}</strong>.
            </span>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Recipients</p>
            <p className="text-sm font-medium">{previewClass ? `Parents of ${previewClass.name}` : "All Classes"}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Message</p>
            <div className="bg-muted/40 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto">
              {postContent}
            </div>
          </div>

          {photoItems.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
                Photos ({photoItems.length})
              </p>
              <div className={`grid gap-1 rounded-xl overflow-hidden ${photoItems.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {photoItems.map((p, i) => (
                  <img key={i} src={p.previewUrl} alt=""
                    className={`w-full object-cover ${photoItems.length === 1 ? "max-h-64" : "h-32"}`} />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              ← Back to Edit
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSaveDraft} disabled={savingDraft || posting}>
                <FileText className="w-4 h-4" />
                {savingDraft ? "Saving…" : editingDraftId ? "Update Draft" : "Save Draft"}
              </Button>
              <Button onClick={handlePost} disabled={posting || savingDraft}>
                <Send className="w-4 h-4" />
                {posting ? "Posting…" : "Post Update"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Action Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={!!actionUpdate && !!actionType}
        onClose={() => { setActionUpdate(null); setActionType(null); }}
        title={actionTitle}
        className="max-w-md"
      >
        <div className="space-y-4">
          {actionType === "restore" ? (
            <p className="text-sm text-muted-foreground">
              This update will be restored to <strong>Posted</strong> status and become visible to parents again.
            </p>
          ) : (
            <>
              {actionType === "hide" && (
                <p className="text-sm text-muted-foreground">
                  The update will be <strong>hidden from parents</strong> but remain visible to school administrators. You can restore it at any time.
                </p>
              )}
              {actionType === "delete" && (
                <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>This update will be soft-deleted and removed from all views. This cannot be reversed through the UI.</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Reason <span className="text-muted-foreground font-normal">(required)</span>
                </label>
                <Textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)}
                  placeholder={actionType === "hide" ? "Why are you hiding this update?" : "Why are you deleting this update?"}
                  rows={2} />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setActionUpdate(null); setActionType(null); }}>Cancel</Button>
            <Button
              variant={actionType === "delete" ? "destructive" : "primary"}
              onClick={executeAction}
              disabled={actionSaving || (actionType !== "restore" && !actionReason.trim())}
            >
              {actionSaving ? "Saving…" :
               actionType === "hide" ? "Hide Update" :
               actionType === "restore" ? "Restore Update" :
               "Delete Update"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
