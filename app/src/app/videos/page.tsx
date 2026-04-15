"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Heart,
  MessageCircle,
  Film,
  Sparkles,
  Search,
  Star,
  Play,
  ArrowUpDown,
  ExternalLink,
  Trash2,
  CheckSquare,
  Square,
  X,
  Download,
} from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { exportConceptPdf } from "@/lib/export-pdf";
import type { Video, Config, Creator } from "@/lib/types";

function formatViews(n: number): string {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

type SortOption = "views" | "date-posted" | "date-added" | "starred";

export default function VideosPage() {
  return (
    <Suspense>
      <VideosContent />
    </Suspense>
  );
}

function VideosContent() {
  const searchParams = useSearchParams();
  const [videos, setVideos] = useState<Video[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [allCreators, setAllCreators] = useState<Creator[]>([]);
  const [filterConfig, setFilterConfig] = useState<string>("all");
  const [filterCreator, setFilterCreator] = useState<string>(
    searchParams.get("creator") || "all",
  );
  const [filterManual, setFilterManual] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortOption>("date-added");
  const [modalVideo, setModalVideo] = useState<Video | null>(null);
  const [modalSection, setModalSection] = useState<"analysis" | "concepts">(
    "analysis",
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/videos")
      .then((r) => r.json())
      .then(setVideos);
    fetch("/api/configs")
      .then((r) => r.json())
      .then(setConfigs);
    fetch("/api/creators")
      .then((r) => r.json())
      .then(setAllCreators);
  }, []);

  const uniqueCreators = [
    ...new Set([
      ...allCreators.map((c) => c.username),
      ...videos.map((v) => v.creator),
    ]),
  ].sort();

  const filtered = videos
    .filter((v) => {
      if (filterConfig !== "all" && v.configName !== filterConfig) return false;
      if (filterCreator !== "all" && v.creator !== filterCreator) return false;
      if (filterManual && v.creator !== "manual-upload") return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "starred") {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return b.views - a.views;
      }
      if (sortBy === "views") return b.views - a.views;
      if (sortBy === "date-posted")
        return (b.datePosted || "").localeCompare(a.datePosted || "");
      if (sortBy === "date-added")
        return (b.dateAdded || "").localeCompare(a.dateAdded || "");
      return 0;
    });

  const openModal = (video: Video, section: "analysis" | "concepts") => {
    setModalVideo(video);
    setModalSection(section);
  };

  const toggleStar = async (id: string, currentStarred: boolean) => {
    const newStarred = !currentStarred;
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, starred: newStarred } : v)),
    );
    await fetch("/api/videos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, starred: newStarred }),
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const allIds = filtered.map((v) => v.id || v.link);
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const yes = window.confirm(`Delete ${selected.size} video${selected.size > 1 ? "s" : ""}? This cannot be undone.`);
    if (!yes) return;
    setDeleting(true);
    try {
      await fetch("/api/videos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setVideos((prev) => prev.filter((v) => !selected.has(v.id)));
      setSelected(new Set());
      setSelectMode(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Videos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse analyzed competitor reels with AI insights
        </p>
      </div>

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterConfig} onValueChange={setFilterConfig}>
          <SelectTrigger className="w-[220px] rounded-xl glass border-white/[0.08] h-10">
            <SelectValue placeholder="Filter by config" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Configs</SelectItem>
            {configs.map((c) => (
              <SelectItem key={c.id} value={c.configName}>
                {c.configName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCreator} onValueChange={setFilterCreator}>
          <SelectTrigger className="w-[200px] rounded-xl glass border-white/[0.08] h-10">
            <SelectValue placeholder="Filter by creator" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Creators</SelectItem>
            {uniqueCreators.map((c) => (
              <SelectItem key={c} value={c}>
                @{c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortOption)}
        >
          <SelectTrigger className="w-[180px] rounded-xl glass border-white/[0.08] h-10">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="views">Most Views</SelectItem>
            <SelectItem value="date-posted">Date Posted</SelectItem>
            <SelectItem value="date-added">Date Added</SelectItem>
            <SelectItem value="starred">Starred First</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => setFilterManual((v) => !v)}
          className={`rounded-xl px-3 py-1.5 text-xs border transition-colors ${
            filterManual
              ? "bg-purple-500/15 text-purple-300 border-purple-500/20"
              : "bg-white/[0.05] text-muted-foreground border-white/[0.08] hover:text-foreground"
          }`}
        >
          Manual Uploads
        </button>

        <button
          onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
          className={`rounded-xl px-3 py-1.5 text-xs border transition-colors flex items-center gap-1.5 ${
            selectMode
              ? "bg-red-500/15 text-red-300 border-red-500/20"
              : "bg-white/[0.05] text-muted-foreground border-white/[0.08] hover:text-foreground"
          }`}
        >
          {selectMode ? <X className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
          {selectMode ? "Cancel" : "Select"}
        </button>

        <Badge
          variant="secondary"
          className="rounded-lg px-3 py-1.5 text-xs bg-white/[0.05] border border-white/[0.08]"
        >
          {filtered.length} videos
        </Badge>
      </div>

      {/* Floating delete bar */}
      {selectMode && (
        <div className="sticky top-0 z-30 glass rounded-2xl p-3 flex items-center gap-3 border border-white/[0.08] animate-in slide-in-from-top-2 duration-200">
          <button
            onClick={selectAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {selected.size === filtered.length ? (
              <CheckSquare className="h-4 w-4 text-purple-400" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selected.size === filtered.length ? "Deselect All" : "Select All"}
          </button>
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={selected.size === 0 || deleting}
            onClick={deleteSelected}
            className="ml-auto rounded-xl text-xs h-8 gap-1.5 bg-red-500/10 text-red-400 border border-red-500/15 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? "Deleting..." : `Delete${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </Button>
        </div>
      )}

      {/* Video Grid — Instagram-style */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((video) => {
          const id = video.id || video.link;
          const isSelected = selected.has(id);

          return (
            <div
              key={id}
              className={`group ${selectMode ? "cursor-pointer" : ""}`}
              onClick={selectMode ? () => toggleSelect(id) : undefined}
            >
              <div className={`glass rounded-2xl overflow-hidden transition-all duration-300 ${
                isSelected
                  ? "border-purple-500/40 ring-2 ring-purple-500/20"
                  : "hover:border-white/[0.12]"
              }`}>
                {/* Thumbnail — clickable, 9:16 ratio */}
                <a
                  href={selectMode ? undefined : (video.link || "#")}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    if (selectMode || !video.link) event.preventDefault();
                  }}
                  className="relative block aspect-[9/16] w-full bg-white/[0.02] overflow-hidden"
                >
                  {/* Selection checkbox overlay */}
                  {selectMode && (
                    <div className="absolute top-2 left-2 z-10">
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-purple-400 drop-shadow-lg" />
                      ) : (
                        <Square className="h-5 w-5 text-white/60 drop-shadow-lg" />
                      )}
                    </div>
                  )}
                  {video.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(video.thumbnail)}`}
                      alt={`@${video.creator}`}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                        const next = target.nextElementSibling as HTMLElement;
                        if (next) next.style.display = "block";
                      }}
                    />
                  ) : null}
                  {/* Video fallback — shown when no thumbnail or img fails */}
                  {video.link && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(video.link) ? (
                    <video
                      src={video.link}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ display: video.thumbnail ? "none" : "block" }}
                      muted
                      preload="metadata"
                      playsInline
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex h-full items-center justify-center flex-col gap-2"
                      style={{ display: video.thumbnail ? "none" : "flex" }}
                    >
                      <Film className="h-10 w-10 text-muted-foreground/20" />
                      <span className="text-[10px] text-muted-foreground/30">
                        @{video.creator}
                      </span>
                    </div>
                  )}
                  {/* Views overlay — Instagram style */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent pt-8 pb-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <Play className="h-4 w-4 text-white fill-white" />
                      <span className="text-[15px] font-bold text-white">
                        {formatViews(video.views)}
                      </span>
                    </div>
                  </div>
                </a>

                {/* Info bar */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold truncate">
                      {video.source && video.creator === "manual-upload" ? video.source : `@${video.creator}`}
                    </p>
                    <button
                      onClick={() => toggleStar(id, video.starred)}
                      className="shrink-0 ml-1.5 transition-colors"
                    >
                      <Star
                        className={`h-4 w-4 ${video.starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400/60"}`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatViews(video.likes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {formatViews(video.comments)}
                    </span>
                    <span className="ml-auto text-[10px]">
                      {video.datePosted}
                    </span>
                  </div>

                  <Badge
                    variant="secondary"
                    className="rounded-md text-[10px] bg-white/[0.05] border border-white/[0.06] text-muted-foreground"
                  >
                    {video.configName}
                  </Badge>

                  {/* Action buttons */}
                  <div className="flex gap-1.5 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal(video, "analysis")}
                      className="flex-1 rounded-xl text-[11px] h-7 gap-1 transition-all duration-200 glass border-white/[0.06] text-muted-foreground hover:text-foreground"
                    >
                      <Search className="h-3 w-3" />
                      Analysis
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal(video, "concepts")}
                      className="flex-1 rounded-xl text-[11px] h-7 gap-1 transition-all duration-200 glass border-white/[0.06] text-muted-foreground hover:text-foreground"
                    >
                      <Sparkles className="h-3 w-3" />
                      Concepts
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportConceptPdf(video);
                      }}
                      title="Export concepts as PDF"
                      className="shrink-0 rounded-xl text-[11px] h-7 w-7 p-0 transition-all duration-200 glass border-white/[0.06] text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/20"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center">
          <Film className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <h3 className="mt-4 font-semibold">No videos found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Run a pipeline analysis to generate results, or adjust your filters.
          </p>
        </div>
      )}

      {/* Analysis / Concepts Modal */}
      <Dialog
        open={!!modalVideo}
        onOpenChange={(open) => {
          if (!open) setModalVideo(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border-white/[0.08] p-0 gap-0 bg-white">
          <DialogTitle className="sr-only">
            {modalSection === "analysis" ? "Video Analysis" : "New Concepts"}
          </DialogTitle>
          {modalVideo && (
            <>
              {/* Modal header */}
              <div className="flex items-center gap-4 p-5 border-b border-white/[0.06]">
                {/* Mini thumbnail */}
                <div className="relative h-16 w-12 shrink-0 rounded-lg overflow-hidden bg-white/[0.02]">
                  {modalVideo.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(modalVideo.thumbnail)}`}
                      alt={`@${modalVideo.creator}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Film className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      @{modalVideo.creator}
                    </p>
                    {modalVideo.link && (
                      <a
                        href={modalVideo.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-purple-400 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Play className="h-3 w-3 fill-current" />
                      {formatViews(modalVideo.views)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatViews(modalVideo.likes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {formatViews(modalVideo.comments)}
                    </span>
                  </div>
                </div>
                {/* Section toggle */}
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalSection("analysis")}
                    className={`rounded-xl text-xs h-8 gap-1.5 transition-all duration-200 ${
                      modalSection === "analysis"
                        ? "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Search className="h-3 w-3" />
                    Analysis
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalSection("concepts")}
                    className={`rounded-xl text-xs h-8 gap-1.5 transition-all duration-200 ${
                      modalSection === "concepts"
                        ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    Concepts
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportConceptPdf(modalVideo)}
                    title="Export concepts as PDF"
                    className="rounded-xl text-xs h-8 gap-1.5 transition-all duration-200 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent"
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </Button>
                </div>
              </div>

              {/* Modal body — scrollable */}
              <div className="overflow-y-auto max-h-[calc(90vh-100px)] p-6">
                <MarkdownContent
                  content={
                    modalSection === "analysis"
                      ? modalVideo.analysis
                      : modalVideo.newConcepts
                  }
                  variant={
                    modalSection === "analysis" ? "analysis" : "concepts"
                  }
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
