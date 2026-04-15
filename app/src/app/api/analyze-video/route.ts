import { analyzeManualVideo } from "@/lib/manual-video";
import type { Video } from "@/lib/types";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ITEMS = 5;

class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanVideoMimeType(mimeType: string, url = ""): string {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (type.startsWith("video/")) return type;

  if (
    type === "application/octet-stream" ||
    type === "binary/octet-stream" ||
    (!type && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url))
  ) {
    return "video/mp4";
  }

  throw new RequestError(
    `That URL returned ${mimeType || "an unknown file type"}, not a video file. Instagram post URLs are web pages, so upload the video file or use a direct .mp4/video CDN URL.`,
  );
}

interface BatchItem {
  type: "file" | "url";
  label: string;
  url?: string;
  fileBuffer?: Buffer;
  mimeType?: string;
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
  videos: Video[];
  errors: string[];
}

async function videoFromUrl(url: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new RequestError(`Video download failed: ${response.status}`);
  }

  const mimeType = cleanVideoMimeType(
    response.headers.get("content-type") || "",
    url,
  );

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType,
  };
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const progress: BatchProgress = {
    status: "running",
    currentIndex: 0,
    total: 0,
    items: [],
    log: [],
    videos: [],
    errors: [],
  };

  const stream = new ReadableStream({
    async start(controller) {
      const emit = () => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(progress)}\n\n`),
        );
      };

      const log = (message: string) => {
        progress.log.push(`[${new Date().toLocaleTimeString()}] ${message}`);
        emit();
      };

      try {
        let formData: FormData;
        try {
          formData = await request.formData();
        } catch (parseError) {
          throw new RequestError(
            `Failed to parse the upload. The video file may be too large. Try a smaller file or compress it first. (${parseError instanceof Error ? parseError.message : "unknown error"})`,
          );
        }
        const configName = String(formData.get("configName") || "");
        const count = parseInt(String(formData.get("count") || "0"), 10);

        if (!configName) throw new RequestError("configName is required");
        if (count === 0) throw new RequestError("No videos provided");
        if (count > MAX_ITEMS)
          throw new RequestError(`Maximum ${MAX_ITEMS} videos at a time`);

        // Parse all items from the indexed form fields
        const items: BatchItem[] = [];
        for (let i = 0; i < count; i++) {
          const type = String(formData.get(`type_${i}`) || "");
          const label = String(formData.get(`label_${i}`) || "");

          if (type === "file") {
            const file = formData.get(`file_${i}`);
            if (file instanceof File && file.size > 0) {
              const mimeType = cleanVideoMimeType(file.type || "video/mp4");
              items.push({
                type: "file",
                label: label || file.name || `Video ${i + 1}`,
                fileBuffer: Buffer.from(await file.arrayBuffer()),
                mimeType,
              });
            }
          } else if (type === "url") {
            const url = String(formData.get(`url_${i}`) || "");
            if (url) {
              items.push({
                type: "url",
                label: label || url,
                url,
              });
            }
          }
        }

        if (items.length === 0) throw new RequestError("No valid videos found");

        progress.total = items.length;
        progress.items = items.map((item) => ({
          label: item.label,
          status: "pending" as const,
          step: "",
        }));

        log(
          `Starting batch analysis: ${items.length} video${items.length > 1 ? "s" : ""}`,
        );
        emit();

        // Process each item sequentially
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          progress.currentIndex = i;
          progress.items[i].status = "running";
          progress.items[i].step = "Preparing";
          log(`[${i + 1}/${items.length}] Starting: ${item.label}`);

          try {
            let videoBuffer: Buffer;
            let mimeType: string;
            let link = "";

            if (item.type === "file" && item.fileBuffer) {
              videoBuffer = item.fileBuffer;
              mimeType = item.mimeType || "video/mp4";

              // Save uploaded file to public/uploads so it shows a preview in the grid
              const ext =
                mimeType.split("/")[1]?.replace("quicktime", "mov") || "mp4";
              const uploadDir = path.join(
                process.cwd(),
                "public",
                "uploads",
              );
              if (!existsSync(uploadDir))
                mkdirSync(uploadDir, { recursive: true });
              const uploadFilename = `${uuid()}.${ext}`;
              writeFileSync(
                path.join(uploadDir, uploadFilename),
                videoBuffer,
              );
              link = `/uploads/${uploadFilename}`;
              progress.items[i].step = "File saved";
              log(
                `[${i + 1}/${items.length}] Saved local copy: ${uploadFilename}`,
              );
            } else if (item.type === "url" && item.url) {
              link = item.url;
              progress.items[i].step = "Downloading";
              log(`[${i + 1}/${items.length}] Downloading video from URL`);
              const downloaded = await videoFromUrl(item.url);
              videoBuffer = downloaded.buffer;
              mimeType = downloaded.mimeType;
              progress.items[i].step = "Downloaded";
              log(
                `[${i + 1}/${items.length}] Downloaded (${mimeType})`,
              );
            } else {
              throw new Error("No video data");
            }

            const video = await analyzeManualVideo({
              configName,
              videoBuffer,
              mimeType,
              link,
              source: item.label,
              save: true,
              onProgress: (msg) => {
                progress.items[i].step = msg;
                log(`[${i + 1}/${items.length}] ${msg}`);
              },
            });

            progress.items[i].status = "completed";
            progress.items[i].step = "Done";
            progress.videos.push(video);
            log(`[${i + 1}/${items.length}] ✓ Complete: ${item.label}`);
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : "Unknown error";
            progress.items[i].status = "error";
            progress.items[i].step = "Error";
            progress.items[i].error = errorMsg;
            progress.errors.push(`${item.label}: ${errorMsg}`);
            log(`[${i + 1}/${items.length}] ✗ Error: ${errorMsg}`);
          }
          emit();
        }

        progress.status =
          progress.errors.length === items.length ? "error" : "completed";
        log(
          `Batch complete: ${progress.videos.length} succeeded, ${progress.errors.length} failed`,
        );
      } catch (err) {
        progress.status = "error";
        progress.errors.push(
          err instanceof Error ? err.message : "Unknown error",
        );
        emit();
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
