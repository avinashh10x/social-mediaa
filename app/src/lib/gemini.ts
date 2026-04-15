const GEMINI_UPLOAD_URL =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
];
let currentModelIndex = 0;

function getGenerateUrl(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[currentModelIndex]}:generateContent`;
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  return key;
}

// Rate limiter: enforce minimum gap between Gemini API calls
let lastCallTime = 0;
const MIN_DELAY_MS = 4000; // 4s between calls (safe for 15 RPM free tier)

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastCallTime = Date.now();
}

function parseRetryDelay(responseText: string): number | null {
  try {
    const data = JSON.parse(responseText);
    const retryInfo = data.error?.details?.find((d: { "@type": string }) =>
      d["@type"]?.includes("RetryInfo"),
    );
    if (retryInfo?.retryDelay) {
      const seconds = parseFloat(retryInfo.retryDelay.replace("s", ""));
      if (!isNaN(seconds)) return seconds * 1000;
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

export async function uploadVideo(
  videoBuffer: Buffer,
  mimeType: string,
): Promise<{ uri: string; mimeType: string }> {
  const key = getApiKey();

  const response = await fetch(`${GEMINI_UPLOAD_URL}?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "start, upload, finalize",
      "X-Goog-Upload-Header-Content-Length": String(videoBuffer.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini upload error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const fileName = data.file.name; // e.g. "files/abc123"
  const fileUri = data.file.uri;
  const fileMimeType = data.file.mimeType;

  // Poll until file is ACTIVE (Gemini needs to process the upload)
  await waitForFileActive(fileName);

  return { uri: fileUri, mimeType: fileMimeType };
}

async function waitForFileActive(
  fileName: string,
  maxWaitMs = 120000,
): Promise<void> {
  const key = getApiKey();
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${key}`,
    );

    if (!response.ok) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    const data = await response.json();
    const state = data.state;

    if (state === "ACTIVE") return;
    if (state === "FAILED")
      throw new Error(`Gemini file processing failed for ${fileName}`);

    // Still PROCESSING — wait and retry
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(
    `Gemini file ${fileName} did not become ACTIVE within ${maxWaitMs / 1000}s`,
  );
}

export async function analyzeVideo(
  fileUri: string,
  mimeType: string,
  analysisPrompt: string,
  maxRetries = 8,
): Promise<string> {
  const key = getApiKey();
  let consecutive503s = 0;
  // Reset to primary model for each new video analysis
  currentModelIndex = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await rateLimitWait();

      const response = await fetch(`${getGenerateUrl()}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri, mimeType } },
                { text: analysisPrompt },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text();

        // Handle rate limit specifically
        if (response.status === 429) {
          const retryDelay = parseRetryDelay(text);
          // Check if it's a daily quota (limit: 0) — no point retrying
          if (text.includes('"limit": 0') || text.includes("PerDay")) {
            throw new Error(
              `Gemini daily quota exhausted. Resets at midnight Pacific time. Try again tomorrow or upgrade to a paid plan at https://aistudio.google.com`,
            );
          }
          const backoff =
            retryDelay || Math.min(10000 * Math.pow(2, attempt), 120000);
          console.log(
            `Gemini 429 — waiting ${Math.round(backoff / 1000)}s before retry ${attempt + 1}/${maxRetries}`,
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        // Handle 404 — model unavailable, immediately switch to next
        if (
          response.status === 404 &&
          currentModelIndex < GEMINI_MODELS.length - 1
        ) {
          currentModelIndex++;
          console.log(
            `Gemini 404 — ${GEMINI_MODELS[currentModelIndex - 1]} unavailable, switching to: ${GEMINI_MODELS[currentModelIndex]}`,
          );
          continue;
        }

        // Handle 503 — temporary overload, try fallback model after 2 failures
        if (response.status === 503) {
          consecutive503s++;
          // After 2 consecutive 503s, switch to fallback model
          if (
            consecutive503s >= 2 &&
            currentModelIndex < GEMINI_MODELS.length - 1
          ) {
            currentModelIndex++;
            console.log(
              `Gemini 503 x${consecutive503s} — switching to fallback model: ${GEMINI_MODELS[currentModelIndex]}`,
            );
            consecutive503s = 0;
            continue;
          }
          if (attempt < maxRetries - 1) {
            const backoff = Math.min(
              20000 * Math.pow(2, consecutive503s - 1),
              120000,
            );
            console.log(
              `Gemini 503 [${GEMINI_MODELS[currentModelIndex]}] — high demand, waiting ${Math.round(backoff / 1000)}s before retry ${attempt + 1}/${maxRetries}`,
            );
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
        }

        if (
          response.status >= 500 &&
          response.status !== 503 &&
          attempt < maxRetries - 1
        ) {
          const backoff = Math.min(15000 * Math.pow(2, attempt), 120000);
          console.log(
            `Gemini ${response.status} — server error, waiting ${Math.round(backoff / 1000)}s before retry ${attempt + 1}/${maxRetries}`,
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        throw new Error(`Gemini analysis error ${response.status}: ${text}`);
      }

      // Reset on success
      consecutive503s = 0;

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const hashIndex = resultText.indexOf("#");
      return hashIndex >= 0 ? resultText.substring(hashIndex) : resultText;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("daily quota") ||
          error.message.startsWith("Gemini analysis error"))
      ) {
        throw error;
      }
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Gemini analysis failed after retries");
}
