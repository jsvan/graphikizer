"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ComicScript,
  ComicPanel as ComicPanelType,
  ComicPage,
  ArtStyle,
  GeneratePanelResponse,
  SaveArticleResponse,
  ArticleManifest,
} from "@/lib/types";
import GenerationProgress from "./GenerationProgress";

const CONCURRENCY_LIMIT = 5;
const TARGET_WORDS_PER_CHUNK = 800;
const PANELS_PER_PAGE = 10;

/** Split article text into chunks on paragraph boundaries. */
function splitIntoChunks(text: string, targetWords: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean).length;
    if (currentWords + paraWords > targetWords && currentWords > 0) {
      chunks.push(current.trim());
      current = para;
      currentWords = paraWords;
    } else {
      current += (current ? "\n\n" : "") + para;
      currentWords += paraWords;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

/** Group flat panels into pages of ~N panels each. */
function groupIntoPages(
  panels: ComicPanelType[],
  perPage: number
): ComicPage[] {
  const pages: ComicPage[] = [];
  for (let i = 0; i < panels.length; i += perPage) {
    pages.push({
      pageNumber: pages.length + 1,
      panels: panels.slice(i, i + perPage),
    });
  }
  return pages;
}

/** Strip markdown fences and trim whitespace. */
function stripFences(text: string): string {
  return text
    .replace(/^[\s\n]*```(?:json)?[\s\n]*/i, "")
    .replace(/[\s\n]*```[\s\n]*$/i, "")
    .trim();
}

/** Escape control characters inside JSON string values. */
function sanitizeJsonControlChars(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString && code <= 0x1f) {
      if (ch === "\n") result += "\\n";
      else if (ch === "\r") result += "\\r";
      else if (ch === "\t") result += "\\t";
      else result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    result += ch;
  }
  return result;
}

/** Read a streaming response body to completion, returning the full text. */
async function readStream(res: Response): Promise<string> {
  if (!res.body) throw new Error("No response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

export default function UploadForm() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<
    "idle" | "script" | "panels" | "saving" | "done" | "error"
  >("idle");
  const [currentPanel, setCurrentPanel] = useState(0);
  const [totalPanels, setTotalPanels] = useState(0);
  const [scriptChunkProgress, setScriptChunkProgress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [scriptPreview, setScriptPreview] = useState<object | null>(null);
  const [latestImageUrl, setLatestImageUrl] = useState("");
  const abortRef = useRef(false);

  async function generatePanelsWithConcurrency(
    script: ComicScript
  ): Promise<ComicScript> {
    const allPanels = script.pages.flatMap((page) => page.panels);
    let completed = 0;

    const queue = [...allPanels];
    const results = new Map<number, string>();

    async function worker() {
      while (queue.length > 0 && !abortRef.current) {
        const panel = queue.shift();
        if (!panel) break;

        const CLIENT_RETRIES = 3;
        let lastError = "";

        for (let attempt = 0; attempt < CLIENT_RETRIES; attempt++) {
          try {
            const res = await fetch("/api/generate-panel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                artworkPrompt: panel.artworkPrompt,
                artStyle: script.artStyle,
                slug: script.slug,
                panelIndex: panel.panelIndex,
                password,
              }),
            });

            const data: GeneratePanelResponse = await res.json();

            if (!data.success) {
              lastError = data.error || `Panel ${panel.panelIndex} failed`;
              if (
                attempt < CLIENT_RETRIES - 1 &&
                (lastError.includes("429") ||
                  lastError.includes("throttled") ||
                  lastError.includes("timed out"))
              ) {
                await new Promise((r) => setTimeout(r, 15000));
                continue;
              }
              throw new Error(lastError);
            }

            results.set(panel.panelIndex, data.imageUrl!);
            setLatestImageUrl(data.imageUrl!);
            completed++;
            setCurrentPanel(completed);
            break;
          } catch (err) {
            if (attempt >= CLIENT_RETRIES - 1) throw err;
            await new Promise((r) => setTimeout(r, 15000));
          }
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, allPanels.length) },
      () => worker()
    );
    await Promise.all(workers);

    for (const page of script.pages) {
      for (const panel of page.panels) {
        panel.imageUrl = results.get(panel.panelIndex);
      }
    }

    return script;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (stage !== "idle" && stage !== "error") return;

    abortRef.current = false;
    setStage("script");
    setErrorMessage("");
    setScriptPreview(null);
    setLatestImageUrl("");
    setScriptChunkProgress("");

    try {
      // Step 1: Split article into chunks and generate script for each
      const chunks = splitIntoChunks(articleText, TARGET_WORDS_PER_CHUNK);
      const totalChunks = chunks.length;
      console.log(
        `[Script] Split article into ${totalChunks} chunks of ~${TARGET_WORDS_PER_CHUNK} words`
      );

      let artStyle: ArtStyle | null = null;
      const allPanels: ComicPanelType[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunkNumber = i + 1;
        setScriptChunkProgress(`chunk ${chunkNumber} of ${totalChunks}`);
        console.log(
          `[Script] Generating chunk ${chunkNumber}/${totalChunks} (${chunks[i].split(/\s+/).length} words)`
        );

        const isFirstChunk = i === 0;
        const requestBody = isFirstChunk
          ? {
              title,
              articleChunk: chunks[i],
              chunkNumber,
              totalChunks,
              password,
            }
          : {
              title,
              articleChunk: chunks[i],
              chunkNumber,
              totalChunks,
              password,
              artStyle,
              startPanelIndex: allPanels.length,
            };

        // Try generating, with up to 2 continuation retries if truncated
        const MAX_CHUNK_RETRIES = 3;
        let fullText = "";
        let parsed: { artStyle?: ArtStyle; panels: ComicPanelType[] } | null =
          null;

        for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt++) {
          const body =
            attempt === 0
              ? requestBody
              : { ...requestBody, partialResponse: stripFences(fullText) };

          if (attempt > 0) {
            console.log(
              `[Script] Chunk ${chunkNumber} retry ${attempt} with ${fullText.length} char prefill`
            );
          }

          const res = await fetch("/api/generate-script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            let errMsg = `Server error ${res.status}`;
            try {
              const errData = await res.json();
              errMsg = errData.error || errMsg;
            } catch {
              /* non-JSON error body */
            }
            throw new Error(`Chunk ${chunkNumber}: ${errMsg}`);
          }

          const rawText = await readStream(res);

          if (attempt === 0) {
            fullText = rawText;
          } else {
            // Prefill continuation: prepend the trimmed base + new tokens
            const base = stripFences(fullText);
            const lastNl = base.lastIndexOf("\n");
            const trimmed = lastNl > 0 ? base.substring(0, lastNl) : base;
            fullText = trimmed + rawText;
          }

          const cleaned = sanitizeJsonControlChars(stripFences(fullText));
          console.log(
            `[Script] Chunk ${chunkNumber} (attempt ${attempt + 1}): ${cleaned.length} chars`
          );

          try {
            parsed = JSON.parse(cleaned);
            console.log(
              `[Script] Chunk ${chunkNumber} parsed OK: ${parsed!.panels.length} panels`
            );
            break;
          } catch (parseErr) {
            console.warn(
              `[Script] Chunk ${chunkNumber} attempt ${attempt + 1} parse failed:`,
              parseErr
            );
            if (attempt >= MAX_CHUNK_RETRIES - 1) {
              console.error(
                `[Script] Last 200 chars: ${cleaned.slice(-200)}`
              );
              throw new Error(
                `Chunk ${chunkNumber} incomplete after ${MAX_CHUNK_RETRIES} attempts. ${cleaned.length} chars.`
              );
            }
          }
        }

        if (!parsed) throw new Error(`Chunk ${chunkNumber} failed`);

        if (isFirstChunk) {
          if (!parsed.artStyle) {
            throw new Error("First chunk did not include artStyle");
          }
          artStyle = parsed.artStyle;
          console.log(`[Script] Art style: ${artStyle.name}`);
        }

        allPanels.push(...parsed.panels);
        console.log(
          `[Script] Chunk ${chunkNumber} added ${parsed.panels.length} panels (total: ${allPanels.length})`
        );
      }

      if (!artStyle) throw new Error("No art style generated");

      // Build slug from title
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);

      // Re-index panels sequentially and group into pages
      allPanels.forEach((p, idx) => (p.panelIndex = idx));
      const pages = groupIntoPages(allPanels, PANELS_PER_PAGE);

      // Build the full script object for saving
      const fullScriptJson = JSON.stringify(
        { artStyle, totalPanels: allPanels.length, pages },
        null,
        2
      );

      // Save raw script to blob
      const saveScriptRes = await fetch("/api/save-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, content: fullScriptJson, password }),
      });
      const saveScriptData = await saveScriptRes.json();

      const script: ComicScript = {
        title,
        slug,
        sourceUrl: sourceUrl || "",
        artStyle,
        totalPanels: allPanels.length,
        pages,
        scriptUrl: saveScriptData.url,
      };

      setScriptPreview(script);
      setTotalPanels(allPanels.length);
      setCurrentPanel(0);
      setLatestImageUrl("");
      setStage("panels");

      // Step 2: Generate all panel images
      const completedScript = await generatePanelsWithConcurrency(script);

      // Step 3: Save article
      setStage("saving");

      const manifest: ArticleManifest = {
        title: completedScript.title,
        slug: completedScript.slug,
        sourceUrl: completedScript.sourceUrl,
        artStyle: completedScript.artStyle,
        createdAt: new Date().toISOString(),
        totalPanels: completedScript.totalPanels,
        pages: completedScript.pages,
        scriptUrl: completedScript.scriptUrl,
      };

      const saveRes = await fetch("/api/save-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest, password }),
      });

      const saveData: SaveArticleResponse = await saveRes.json();

      if (!saveData.success) {
        throw new Error(saveData.error || "Save failed");
      }

      setStage("done");

      setTimeout(() => {
        router.push(`/article/${completedScript.slug}`);
      }, 1500);
    } catch (error) {
      setStage("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  const isGenerating = stage !== "idle" && stage !== "error";

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 mx-auto text-sm font-medium text-gray-400 hover:text-amber-400 transition-colors mb-4"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
        {expanded ? "Hide form" : "Create new graphic novel"}
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-5">
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Article Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Europe's Next Hegemon"
              required
              disabled={isGenerating}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="sourceUrl"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Source URL
            </label>
            <input
              id="sourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.foreignaffairs.com/..."
              required
              disabled={isGenerating}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="articleText"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Article Text
            </label>
            <textarea
              id="articleText"
              value={articleText}
              onChange={(e) => setArticleText(e.target.value)}
              placeholder="Paste the full article text here..."
              required
              disabled={isGenerating}
              rows={12}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50 resize-y"
            />
            <p className="text-xs text-gray-500 mt-1">
              {articleText.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              required
              disabled={isGenerating}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isGenerating}
            className="w-full py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating..." : "Generate Graphic Novel"}
          </button>
        </form>
      )}

      <GenerationProgress
        stage={stage}
        currentPanel={currentPanel}
        totalPanels={totalPanels}
        errorMessage={errorMessage}
        scriptPreview={scriptPreview}
        latestImageUrl={latestImageUrl}
        scriptChunkProgress={scriptChunkProgress}
      />
    </div>
  );
}
