"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ComicScript,
  GenerateScriptResponse,
  GeneratePanelResponse,
  SaveArticleResponse,
  ArticleManifest,
} from "@/lib/types";
import GenerationProgress from "./GenerationProgress";

const CONCURRENCY_LIMIT = 5;

export default function UploadForm() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"idle" | "script" | "panels" | "saving" | "done" | "error">("idle");
  const [currentPanel, setCurrentPanel] = useState(0);
  const [totalPanels, setTotalPanels] = useState(0);
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
              // Retry on throttle/timeout errors
              if (attempt < CLIENT_RETRIES - 1 && (lastError.includes("429") || lastError.includes("throttled") || lastError.includes("timed out"))) {
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

    // Launch workers
    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, allPanels.length) },
      () => worker()
    );
    await Promise.all(workers);

    // Assign image URLs back to the script
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

    try {
      // Step 1: Generate script
      const scriptRes = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceUrl, articleText, password }),
      });

      const scriptData: GenerateScriptResponse = await scriptRes.json();

      if (!scriptData.success || !scriptData.script) {
        throw new Error(scriptData.error || "Script generation failed");
      }

      const script = scriptData.script;
      setScriptPreview(scriptData.script);
      const allPanels = script.pages.flatMap((p) => p.panels);
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

      // Redirect after brief delay
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? "Hide form" : "Create new graphic novel"}
      </button>

      {expanded && (
      <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
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
          <label htmlFor="sourceUrl" className="block text-sm font-medium text-gray-300 mb-1">
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
          <label htmlFor="articleText" className="block text-sm font-medium text-gray-300 mb-1">
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
          <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
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
      />
    </div>
  );
}
