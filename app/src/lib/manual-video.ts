import { v4 as uuid } from "uuid";
import { appendVideo, readConfigs } from "./csv";
import { generateNewConcepts } from "./claude";
import { analyzeVideo, uploadVideo } from "./gemini";
import type { Video } from "./types";

interface AnalyzeManualVideoParams {
  configName: string;
  videoBuffer: Buffer;
  mimeType: string;
  link?: string;
  source?: string;
  creator?: string;
  datePosted?: string;
  save?: boolean;
  onProgress?: (message: string) => void;
}

export async function analyzeManualVideo({
  configName,
  videoBuffer,
  mimeType,
  link = "",
  source = "",
  creator = "manual-upload",
  datePosted = "",
  save = true,
  onProgress,
}: AnalyzeManualVideoParams): Promise<Video> {
  const configs = readConfigs();
  const config = configs.find((c) => c.configName === configName);
  if (!config) throw new Error(`Config "${configName}" not found`);
  onProgress?.(`Loaded config: ${config.configName}`);

  onProgress?.("Uploading video to Gemini");
  const fileData = await uploadVideo(videoBuffer, mimeType || "video/mp4");
  onProgress?.("Gemini analyzing video");
  const analysis = await analyzeVideo(
    fileData.uri,
    fileData.mimeType,
    config.analysisInstruction,
  );
  onProgress?.("Claude generating concepts");
  const newConcepts = await generateNewConcepts(
    analysis,
    config.newConceptsInstruction,
  );

  const video: Video = {
    id: uuid(),
    link,
    source,
    thumbnail: "",
    creator: creator.trim() || "manual-upload",
    views: 0,
    likes: 0,
    comments: 0,
    analysis,
    newConcepts,
    datePosted,
    dateAdded: new Date().toISOString().slice(0, 10),
    configName,
    starred: false,
  };

  if (save) {
    onProgress?.("Saving analysis");
    appendVideo(video);
  }

  return video;
}
