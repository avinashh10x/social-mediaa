import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";

const THUMB_DIR = path.join(process.cwd(), "..", "data", "thumbs");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Serve from local cache if thumbnail was saved during pipeline
  if (url.startsWith("cached:")) {
    const hash = url.replace("cached:", "");
    const filePath = path.join(THUMB_DIR, `${hash}.jpg`);
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath);
      return new Response(buffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    return new Response(null, { status: 404 });
  }

  // Also check if this CDN URL was previously cached (for old videos)
  try {
    const { createHash } = await import("crypto");
    const hash = createHash("md5").update(url).digest("hex");
    const filePath = path.join(THUMB_DIR, `${hash}.jpg`);
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath);
      return new Response(buffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch {
    /* continue to CDN fetch */
  }

  // Fall back to fetching from CDN (works for fresh URLs)
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return new Response(null, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
