"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import type { Video as VideoRecord } from "@/lib/types";

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

export interface AnalysisItem {
  id: string;
  type: "file" | "url";
  file?: File;
  url?: string;
  label: string;
  previewUrl?: string;
}

interface ManualVideoContextValue {
  running: boolean;
  progress: BatchProgress | null;
  runAnalysis: (configName: string, items: AnalysisItem[]) => void;
  clearProgress: () => void;
}

const ManualVideoContext = createContext<ManualVideoContextValue | null>(null);

export function ManualVideoProvider({ children }: { children: React.ReactNode }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearProgress = useCallback(() => {
    if (!running) setProgress(null);
  }, [running]);

  const runAnalysis = useCallback(async (configName: string, items: AnalysisItem[]) => {
    if (running) return;
    setRunning(true);
    setProgress(null);

    abortRef.current = new AbortController();

    const formData = new FormData();
    formData.set("configName", configName);
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
        signal: abortRef.current.signal,
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
          try {
            const data = JSON.parse(line.slice(6)) as BatchProgress;
            finalProgress = data;
            setProgress(data);
          } catch(e) {
            // skip bad parse
          }
        }
      }

      if (
        finalProgress?.status === "error" &&
        finalProgress.videos.length === 0
      ) {
        throw new Error(finalProgress.errors[0] || "All analyses failed");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setProgress((prev) => ({
        ...(prev || { currentIndex: 0, total: items.length, items: [], log: [], videos: [] }),
        status: "error" as const,
        errors: [(err as Error).message || "Unknown error"],
      }));
    } finally {
      setRunning(false);
    }
  }, [running]);

  return (
    <ManualVideoContext.Provider value={{ running, progress, runAnalysis, clearProgress }}>
      {children}
    </ManualVideoContext.Provider>
  );
}

export function useManualVideo() {
  const ctx = useContext(ManualVideoContext);
  if (!ctx) throw new Error("useManualVideo must be used within ManualVideoProvider");
  return ctx;
}
