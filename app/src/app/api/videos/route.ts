import { NextResponse } from "next/server";
import { readVideos, writeVideos } from "@/lib/csv";
import { existsSync, unlinkSync } from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const configName = searchParams.get("configName");
  const creator = searchParams.get("creator");

  let videos = readVideos();

  if (configName) videos = videos.filter((v) => v.configName === configName);
  if (creator) videos = videos.filter((v) => v.creator === creator);

  // Sort by dateAdded desc, then views desc
  videos.sort((a, b) => {
    const dateDiff = (b.dateAdded || "").localeCompare(a.dateAdded || "");
    if (dateDiff !== 0) return dateDiff;
    return b.views - a.views;
  });

  return NextResponse.json(videos);
}

export async function PATCH(request: Request) {
  const { id, starred } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const videos = readVideos();
  const video = videos.find((v) => v.id === id);
  if (!video) return NextResponse.json({ error: "not found" }, { status: 404 });

  video.starred = starred;
  writeVideos(videos);
  return NextResponse.json(video);
}

export async function DELETE(request: Request) {
  const { ids } = (await request.json()) as { ids: string[] };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }

  const idSet = new Set(ids);
  const videos = readVideos();
  const toDelete = videos.filter((v) => idSet.has(v.id));

  // Clean up local upload files
  for (const video of toDelete) {
    if (video.link?.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", video.link);
      if (existsSync(filePath)) {
        try { unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
  }

  const remaining = videos.filter((v) => !idSet.has(v.id));
  writeVideos(remaining);

  return NextResponse.json({ deleted: toDelete.length });
}
