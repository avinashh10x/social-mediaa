"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Terminal,
  Upload,
  Video,
  Link2,
  X,
  Plus,
  AlertTriangle,
  Film,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Config, Video as VideoRecord } from "@/lib/types";

const MAX_ITEMS = 5;

interface AnalysisItem {
  id: string;
  type: "file" | "url";
  file?: File;
  url?: string;
  label: string;
  previewUrl?: string;
}

interface BatchItemProgress {
  label: string;
  status: "pending" | "running" | "completed" | "error";
  step: string;
  error?: string;
}

interface BatchProgress {
  status: "running" | "completed" | "error";
  currentIndex: number;
  total: number;
  items: BatchItemProgress[];
  log: string[];
  videos: VideoRecord[];
  errors: string[];
}

let itemCounter = 0;

export default function AnalyzeVideoPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/configs")
      .then((r) => r.json())
      .then(setConfigs);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progress?.log.length]);

  const addFiles = (fileList: FileList) => {
    const remaining = MAX_ITEMS - items.length;
    const files = Array.from(fileList).slice(0, remaining);
    const newItems: AnalysisItem[] = files.map((file) => ({
      id: `item-${++itemCounter}`,
      type: "file" as const,
      file,
      label: file.name.replace(/\.[^.]+$/, ""),
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const addUrl = () => {
    const url = urlInput.trim();
    if (!url || items.length >= MAX_ITEMS) return;
    setItems((prev) => [
      ...prev,
      {
        id: `item-${++itemCounter}`,
        type: "url" as const,
        url,
        label:
          url
            .split("/")
            .pop()
            ?.split("?")[0] || `URL ${items.length + 1}`,
      },
    ]);
    setUrlInput("");
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const updateLabel = (id: string, label: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, label } : i)),
    );
  };

  async function handleSubmit() {
    if (!selectedConfig || items.length === 0) return;
    setLoading(true);
    setError("");
    setProgress(null);

    const formData = new FormData();
    formData.set("configName", selectedConfig);
    formData.set("count", String(items.length));

    items.forEach((item, i) => {
      formData.set(`type_${i}`, item.type);
      formData.set(`label_${i}`, item.label);
      if (item.type === "file" && item.file) {
        formData.set(`file_${i}`, item.file);
      } else if (item.type === "url" && item.url) {
        formData.set(`url_${i}`, item.url);
      }
    });

    try {
      const response = await fetch("/api/analyze-video", {
        method: "POST",
        body: formData,
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let finalProgress: BatchProgress | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as BatchProgress;
          finalProgress = data;
          setProgress(data);
        }
      }

      if (
        finalProgress?.status === "error" &&
        finalProgress.videos.length === 0
      ) {
        throw new Error(finalProgress.errors[0] || "All analyses failed");
      }

      // Clear items on success
      items.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setItems([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const canAdd = items.length < MAX_ITEMS;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analyze Videos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload up to {MAX_ITEMS} videos or paste direct video file URLs
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold">Batch Analysis</h2>
          <Badge
            variant="secondary"
            className="ml-auto rounded-md text-[10px] bg-white/[0.05] border border-white/[0.06]"
          >
            {items.length}/{MAX_ITEMS}
          </Badge>
        </div>

        {/* Config selector */}
        <div>
          <Label className="text-xs text-muted-foreground">Config</Label>
          <Select value={selectedConfig} onValueChange={setSelectedConfig}>
            <SelectTrigger className="mt-1.5 rounded-xl glass border-white/[0.08] h-11">
              <SelectValue placeholder="Select a config..." />
            </SelectTrigger>
            <SelectContent>
              {configs.map((config) => (
                <SelectItem key={config.id} value={config.configName}>
                  {config.configName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Items list */}
        {items.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Videos to analyze
            </Label>
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5"
              >
                {/* Preview thumbnail */}
                <div className="relative h-12 w-9 shrink-0 rounded-lg overflow-hidden bg-white/[0.02]">
                  {item.type === "file" && item.previewUrl ? (
                    <video
                      src={item.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      preload="metadata"
                      playsInline
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {item.type === "url" ? (
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground/40" />
                      ) : (
                        <Film className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </div>
                  )}
                </div>

                {/* Type badge */}
                <Badge
                  variant="secondary"
                  className={`shrink-0 rounded-md text-[9px] px-1.5 py-0.5 ${
                    item.type === "file"
                      ? "bg-purple-500/10 text-purple-400 border border-purple-500/15"
                      : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/15"
                  }`}
                >
                  {item.type === "file" ? "FILE" : "URL"}
                </Badge>

                {/* Label input */}
                <Input
                  value={item.label}
                  onChange={(e) => updateLabel(item.id, e.target.value)}
                  placeholder="Label..."
                  className="flex-1 h-8 rounded-lg text-xs glass border-white/[0.06]"
                  disabled={loading}
                />

                {/* Remove button */}
                <button
                  onClick={() => removeItem(item.id)}
                  disabled={loading}
                  className="shrink-0 text-muted-foreground/40 hover:text-red-400 transition-colors disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add inputs */}
        {canAdd && !loading && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl h-11 glass border-white/[0.06] text-muted-foreground hover:text-foreground gap-2"
              >
                <Upload className="h-4 w-4" />
                Add Video Files
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                placeholder="https://.../video.mp4"
                className="flex-1 rounded-xl glass border-white/[0.08] h-11"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={addUrl}
                disabled={!urlInput.trim()}
                className="shrink-0 rounded-xl h-11 px-3 glass border-white/[0.06] text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && !loading && (
          <div className="text-center py-6">
            <Film className="mx-auto h-8 w-8 text-muted-foreground/20" />
            <p className="mt-2 text-xs text-muted-foreground">
              Add video files or paste URLs to get started
            </p>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={loading || !selectedConfig || items.length === 0}
          size="lg"
          className="w-full rounded-xl h-12 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 border-0 glow-sm transition-all duration-300 hover:glow text-sm font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing {progress?.total || items.length} video
              {(progress?.total || items.length) !== 1 ? "s" : ""}...
            </>
          ) : (
            <>
              <Video className="h-4 w-4" />
              Analyze {items.length} Video{items.length !== 1 ? "s" : ""}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Batch progress — pipeline-style */}
      {progress && (
        <div className="space-y-4">
          {/* Status card */}
          <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {progress.status === "running" && (
                  <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                )}
                {progress.status === "completed" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
                {progress.status === "error" && (
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                )}
                <h2 className="text-sm font-semibold">
                  {progress.status === "running" &&
                    `Analyzing video ${progress.currentIndex + 1} of ${progress.total}...`}
                  {progress.status === "completed" && "Analysis complete"}
                  {progress.status === "error" && "Analysis failed"}
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Done:{" "}
                  <span className="text-foreground">
                    {progress.videos.length}/{progress.total}
                  </span>
                </span>
                {progress.errors.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    {progress.errors.length}
                  </span>
                )}
              </div>
            </div>

            {/* Overall progress bar */}
            <div>
              <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    progress.status === "completed"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : progress.status === "error"
                        ? "bg-gradient-to-r from-red-500 to-orange-500"
                        : "bg-gradient-to-r from-purple-500 to-indigo-500"
                  }`}
                  style={{
                    width: `${
                      progress.status === "completed"
                        ? 100
                        : progress.total > 0
                          ? ((progress.videos.length +
                              progress.errors.length) /
                              progress.total) *
                            100
                          : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Per-item status rows */}
            <div className="space-y-2">
              {progress.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.04] px-3 py-2"
                >
                  {item.status === "running" && (
                    <Loader2 className="h-3 w-3 text-purple-400 animate-spin shrink-0" />
                  )}
                  {item.status === "completed" && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                  )}
                  {item.status === "error" && (
                    <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
                  )}
                  {item.status === "pending" && (
                    <div className="h-3 w-3 rounded-full border border-white/[0.1] shrink-0" />
                  )}
                  <span className="text-xs font-medium text-foreground/80 truncate">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                    {item.step}
                  </span>
                </div>
              ))}
            </div>

            {/* Completion CTA */}
            {progress.status === "completed" &&
              progress.videos.length > 0 && (
                <Button
                  asChild
                  className="w-full rounded-xl h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 font-semibold gap-2"
                >
                  <Link href="/videos">
                    <Film className="h-4 w-4" />
                    View {progress.videos.length} New Video
                    {progress.videos.length > 1 ? "s" : ""}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}

            {/* Errors summary */}
            {progress.errors.length > 0 && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-3 space-y-1">
                <p className="text-[11px] font-medium text-red-400">
                  Errors ({progress.errors.length})
                </p>
                {progress.errors.map((err, i) => (
                  <p
                    key={i}
                    className="text-[11px] text-red-400/70 leading-relaxed"
                  >
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Log — collapsible, same style as pipeline page */}
          <details className="glass rounded-2xl overflow-hidden">
            <summary className="p-4 flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
              {progress.status === "running" ? (
                <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
              ) : progress.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Terminal className="h-4 w-4" />
              )}
              <span className="font-medium">Log</span>
              <Badge
                variant="secondary"
                className="ml-auto rounded-md text-[10px] bg-white/[0.05] border border-white/[0.06]"
              >
                {progress.log.length} entries
              </Badge>
            </summary>
            <div className="border-t border-white/[0.06]">
              <ScrollArea className="h-[300px] p-4">
                <div className="space-y-0.5 font-mono text-[11px]">
                  {progress.log.map((line, i) => (
                    <div
                      key={i}
                      className={`leading-5 ${
                        line.includes("Error") ||
                        line.includes("error") ||
                        line.includes("✗")
                          ? "text-red-400"
                          : line.includes("✓") ||
                              line.includes("complete") ||
                              line.includes("Complete")
                            ? "text-emerald-400/80"
                            : "text-muted-foreground"
                      }`}
                    >
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
