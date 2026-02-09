"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ComicScript,
  ComicPanel as ComicPanelType,
  ComicPage,
  ArtStyle,
  GenerationStage,
  GeneratePanelResponse,
  GenerateVoiceResponse,
  CreateVoiceResponse,
  DescribeVoicesResponse,
  SaveArticleResponse,
  ArticleManifest,
  CharacterVoiceProfile,
} from "@/lib/types";
import { placeOverlays } from "@/lib/bubblePlacement";
import { buildVoiceProfiles } from "@/lib/voiceMapping";
import GenerationProgress from "./GenerationProgress";
import RetryCarousel from "./RetryCarousel";
import type { FailedItems } from "./RetryCarousel";

const CONCURRENCY_LIMIT = 5;
const TARGET_WORDS_PER_CHUNK = 600;
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

/** Count dialogue overlays missing audioUrl in a script. */
function countMissingAudio(script: ComicScript): number {
  let missing = 0;
  for (const page of script.pages) {
    for (const panel of page.panels) {
      for (const overlay of panel.overlays) {
        if (overlay.type === "dialogue" && overlay.speaker && !overlay.audioUrl) {
          missing++;
        }
      }
    }
  }
  return missing;
}

export default function UploadForm() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [currentPanel, setCurrentPanel] = useState(0);
  const [totalPanels, setTotalPanels] = useState(0);
  const [scriptChunkProgress, setScriptChunkProgress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [scriptPreview, setScriptPreview] = useState<object | null>(null);
  const [latestImageUrl, setLatestImageUrl] = useState("");
  const [currentVoice, setCurrentVoice] = useState(0);
  const [totalVoices, setTotalVoices] = useState(0);
  const [voiceSubStage, setVoiceSubStage] = useState<"describing" | "creating" | "speaking" | undefined>(undefined);
  const [failedItems, setFailedItems] = useState<FailedItems | null>(null);
  const abortRef = useRef(false);

  // Persistent refs for retry across function calls
  const scriptRef = useRef<ComicScript | null>(null);
  const voiceMapRef = useRef<Record<string, { voiceId: string; description: string }>>({});
  const voiceDescriptionsRef = useRef<Record<string, string>>({});
  const sampleLinesRef = useRef<Map<string, string>>(new Map());
  const speakerListRef = useRef<string[]>([]);

  async function generatePanelsWithConcurrency(
    script: ComicScript
  ): Promise<{ script: ComicScript; failedPanels: number[] }> {
    const allPanels = script.pages.flatMap((page) => page.panels);
    // Skip panels that already have images (for retry passes)
    const pending = allPanels.filter((p) => !p.imageUrl);
    let completed = 0;
    const failedPanels: number[] = [];

    const queue = [...pending];
    const results = new Map<number, string>();

    async function worker() {
      while (queue.length > 0 && !abortRef.current) {
        const panel = queue.shift();
        if (!panel) break;

        const CLIENT_RETRIES = 3;
        let lastError = "";
        let succeeded = false;

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
              break;
            }

            results.set(panel.panelIndex, data.imageUrl!);
            setLatestImageUrl(data.imageUrl!);
            succeeded = true;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (attempt < CLIENT_RETRIES - 1) {
              await new Promise((r) => setTimeout(r, 15000));
            }
          }
        }

        completed++;
        setCurrentPanel(completed);

        if (!succeeded) {
          console.warn(`Panel ${panel.panelIndex} failed after retries: ${lastError}`);
          failedPanels.push(panel.panelIndex);
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, pending.length) },
      () => worker()
    );
    if (workers.length > 0) await Promise.all(workers);

    for (const page of script.pages) {
      for (const panel of page.panels) {
        if (results.has(panel.panelIndex)) {
          panel.imageUrl = results.get(panel.panelIndex);
        }
      }
    }

    return { script, failedPanels };
  }

  async function generateVoicesWithConcurrency(
    script: ComicScript,
    voices: CharacterVoiceProfile[]
  ): Promise<ComicScript> {
    const voiceMap = new Map(voices.map((v) => [v.speaker, v]));

    // Collect dialogue overlays that still need TTS (skip already-completed)
    const tasks: {
      pageIdx: number;
      panelIdx: number;
      overlayIdx: number;
      text: string;
      speaker: string;
      voiceId: string;
      panelIndex: number;
    }[] = [];

    for (let pi = 0; pi < script.pages.length; pi++) {
      for (let pj = 0; pj < script.pages[pi].panels.length; pj++) {
        const panel = script.pages[pi].panels[pj];
        for (let oi = 0; oi < panel.overlays.length; oi++) {
          const overlay = panel.overlays[oi];
          if (overlay.type === "dialogue" && overlay.speaker && !overlay.audioUrl) {
            const voice = voiceMap.get(overlay.speaker);
            if (voice) {
              tasks.push({
                pageIdx: pi,
                panelIdx: pj,
                overlayIdx: oi,
                text: overlay.text,
                speaker: overlay.speaker,
                voiceId: voice.voiceId,
                panelIndex: panel.panelIndex,
              });
            }
          }
        }
      }
    }

    setTotalVoices(tasks.length);
    setCurrentVoice(0);

    if (tasks.length === 0) return script;

    let completed = 0;
    const queue = [...tasks];

    async function worker() {
      while (queue.length > 0 && !abortRef.current) {
        const task = queue.shift();
        if (!task) break;

        const res = await fetch("/api/generate-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: task.text,
            speaker: task.speaker,
            voiceId: task.voiceId,
            slug: script.slug,
            panelIndex: task.panelIndex,
            overlayIndex: task.overlayIdx,
            password,
          }),
        });

        const data: GenerateVoiceResponse = await res.json();

        if (!data.success) {
          console.warn(
            `Voice failed for panel ${task.panelIndex}, overlay ${task.overlayIdx}: ${data.error}`
          );
        } else if (data.audioUrl) {
          script.pages[task.pageIdx].panels[task.panelIdx].overlays[
            task.overlayIdx
          ].audioUrl = data.audioUrl;
        }

        completed++;
        setCurrentVoice(completed);
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, tasks.length) },
      () => worker()
    );
    await Promise.all(workers);

    return script;
  }

  /** Create custom ElevenLabs voices for a list of speakers. Updates voiceMapRef. */
  async function createVoicesForSpeakers(speakers: string[]) {
    const q = [...speakers];
    let completed = 0;

    async function worker() {
      while (q.length > 0 && !abortRef.current) {
        const speaker = q.shift();
        if (!speaker) break;

        const description =
          voiceDescriptionsRef.current[speaker] ||
          "Clear, professional narrator voice, neutral accent, measured authoritative cadence";
        const sample =
          sampleLinesRef.current.get(speaker) ||
          `Hello, my name is ${speaker}. Let me explain my perspective on this important topic.`;

        try {
          const res = await fetch("/api/create-voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voiceDescription: description,
              speakerLabel: speaker,
              sampleText: sample,
              password,
            }),
          });

          const data: CreateVoiceResponse = await res.json();

          if (data.success && data.voiceId) {
            voiceMapRef.current[speaker] = { voiceId: data.voiceId, description };
            console.log(`[Voices] Created voice for "${speaker}": ${data.voiceId}`);
          } else {
            console.warn(`[Voices] Failed to create voice for "${speaker}": ${data.error}`);
          }
        } catch (err) {
          console.warn(`[Voices] Error creating voice for "${speaker}":`, err);
        }

        completed++;
        setCurrentVoice(completed);
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, q.length) },
      () => worker()
    );
    if (workers.length > 0) await Promise.all(workers);
  }

  /** Check for remaining failures; save if all good, go to partial if not. */
  async function checkFailuresAndFinalize(failedPanels: number[]) {
    const script = scriptRef.current!;
    const failedSpeakers = speakerListRef.current.filter(
      (s) => !(s in voiceMapRef.current)
    );
    const missingAudio = countMissingAudio(script);

    if (failedPanels.length > 0 || failedSpeakers.length > 0 || missingAudio > 0) {
      setFailedItems({
        panels: failedPanels,
        speakers: failedSpeakers,
        ttsCount: missingAudio,
      });
      setStage("partial");
      return;
    }

    // All items succeeded — save
    const voiceProfiles = buildVoiceProfiles(voiceMapRef.current);
    const audioEnabled = speakerListRef.current.length > 0;

    setStage("saving");

    const manifest: ArticleManifest = {
      title: script.title,
      slug: script.slug,
      sourceUrl: script.sourceUrl,
      artStyle: script.artStyle,
      createdAt: new Date().toISOString(),
      totalPanels: script.totalPanels,
      pages: script.pages,
      scriptUrl: script.scriptUrl,
      placementVersion: 4,
      ...(audioEnabled && {
        audioEnabled: true,
        voiceData: {
          voices: voiceProfiles,
          generatedAt: new Date().toISOString(),
        },
      }),
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
      router.push(`/article/${script.slug}`);
    }, 1500);
  }

  async function handleRetry() {
    if (!scriptRef.current || !failedItems) return;

    abortRef.current = false;
    const script = scriptRef.current;
    const prevFailed = { ...failedItems };
    setFailedItems(null);

    try {
      // Retry voice creation for failed speakers
      if (prevFailed.speakers.length > 0) {
        setStage("voices");
        setVoiceSubStage("creating");
        setTotalVoices(prevFailed.speakers.length);
        setCurrentVoice(0);

        await createVoicesForSpeakers(prevFailed.speakers);
      }

      // Retry TTS for missing audio (includes overlays for newly created voices)
      const voiceProfiles = buildVoiceProfiles(voiceMapRef.current);
      const missingAudio = countMissingAudio(script);
      if (missingAudio > 0 && voiceProfiles.length > 0) {
        setStage("voices");
        setVoiceSubStage("speaking");

        await generateVoicesWithConcurrency(script, voiceProfiles);

        // One more retry pass for TTS
        const stillMissing = countMissingAudio(script);
        if (stillMissing > 0) {
          await generateVoicesWithConcurrency(script, voiceProfiles);
        }
      }

      // Retry panels for missing images
      const missingPanels = script.pages
        .flatMap((p) => p.panels)
        .filter((p) => !p.imageUrl);

      let panelFailures: number[] = [];
      if (missingPanels.length > 0) {
        setStage("panels");
        setTotalPanels(missingPanels.length);
        setCurrentPanel(0);

        const result = await generatePanelsWithConcurrency(script);
        panelFailures = result.failedPanels;

        // One more retry pass for panels
        if (panelFailures.length > 0) {
          const retry = await generatePanelsWithConcurrency(script);
          panelFailures = retry.failedPanels;
        }
      }

      await checkFailuresAndFinalize(panelFailures);
    } catch (error) {
      setStage("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Retry failed"
      );
    }
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
    setFailedItems(null);

    // Reset refs
    scriptRef.current = null;
    voiceMapRef.current = {};
    voiceDescriptionsRef.current = {};
    sampleLinesRef.current = new Map();
    speakerListRef.current = [];

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

        let parsed: { artStyle?: ArtStyle; panels: ComicPanelType[] } | null = null;
        const MAX_RETRIES = 2;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            console.log(`[Script] Chunk ${chunkNumber} retry ${attempt}`);
          }

          const res = await fetch("/api/generate-script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });

          if (!res.ok) {
            throw new Error(`Chunk ${chunkNumber}: server error ${res.status}`);
          }

          // Server streams keepalive newlines, then JSON as the final line
          const text = await res.text();
          const lines = text.split("\n").filter(Boolean);
          if (lines.length === 0) {
            console.warn(`[Script] Chunk ${chunkNumber} attempt ${attempt + 1}: no response (likely timeout)`);
            if (attempt >= MAX_RETRIES - 1) {
              throw new Error(`Chunk ${chunkNumber} timed out after ${MAX_RETRIES} attempts`);
            }
            continue;
          }

          const result = JSON.parse(lines[lines.length - 1]);
          if (!result.success) {
            throw new Error(`Chunk ${chunkNumber}: ${result.error}`);
          }

          parsed = result.data;
          console.log(
            `[Script] Chunk ${chunkNumber} OK: ${parsed!.panels.length} panels`
          );
          break;
        }

        if (!parsed) {
          throw new Error(`Chunk ${chunkNumber} failed`);
        }

        if (isFirstChunk) {
          if (!parsed.artStyle) {
            throw new Error("First chunk did not include artStyle");
          }
          artStyle = parsed.artStyle;
          console.log(`[Script] Art style: ${artStyle.name}`);
        }

        // Run placement algorithm on each panel's overlays
        for (const panel of parsed.panels) {
          panel.overlays = placeOverlays(panel.overlays, panel.layout, panel.focalPoint);
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
      scriptRef.current = script;

      // Step 2: Voice pipeline — describe → create → TTS
      const checkRes = await fetch("/api/check-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const checkData = await checkRes.json();

      if (!checkData.success) {
        throw new Error(
          checkData.error ||
            "ElevenLabs API key required for voice generation. Set ELEVENLABS_API_KEY in environment variables."
        );
      }

      // Extract all unique speakers from dialogue overlays
      const allSpeakers = new Set<string>();
      for (const page of script.pages) {
        for (const panel of page.panels) {
          for (const overlay of panel.overlays) {
            if (overlay.type === "dialogue" && overlay.speaker) {
              allSpeakers.add(overlay.speaker);
            }
          }
        }
      }

      if (allSpeakers.size > 0) {
        const speakerList = [...allSpeakers];
        speakerListRef.current = speakerList;
        setStage("voices");

        // Step 2a: AI-generated voice descriptions
        setVoiceSubStage("describing");
        console.log(`[Voices] Describing ${speakerList.length} speakers...`);

        const descRes = await fetch("/api/describe-voices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakers: speakerList,
            articleTitle: title,
            password,
          }),
        });

        const descText = await descRes.text();
        const descLines = descText.split("\n").filter(Boolean);
        const descResult: DescribeVoicesResponse =
          descLines.length > 0
            ? JSON.parse(descLines[descLines.length - 1])
            : { success: false, error: "Empty response" };

        if (!descResult.success || !descResult.descriptions) {
          throw new Error(descResult.error || "Voice description failed");
        }

        console.log("[Voices] Descriptions:", descResult.descriptions);
        voiceDescriptionsRef.current = descResult.descriptions;

        // Collect a sample dialogue line per speaker for Voice Design
        const sampleLines = new Map<string, string>();
        for (const page of script.pages) {
          for (const panel of page.panels) {
            for (const overlay of panel.overlays) {
              if (
                overlay.type === "dialogue" &&
                overlay.speaker &&
                !sampleLines.has(overlay.speaker)
              ) {
                sampleLines.set(overlay.speaker, overlay.text);
              }
            }
          }
        }
        sampleLinesRef.current = sampleLines;

        // Step 2b: Create custom voices via ElevenLabs Voice Design
        setVoiceSubStage("creating");
        setTotalVoices(speakerList.length);
        setCurrentVoice(0);

        // First pass
        await createVoicesForSpeakers(speakerList);

        // Retry pass for any speakers that failed
        const failedSpeakers = speakerList.filter(
          (s) => !(s in voiceMapRef.current)
        );
        if (failedSpeakers.length > 0) {
          console.log(`[Voices] Retrying ${failedSpeakers.length} failed voice creations...`);
          setTotalVoices(failedSpeakers.length);
          setCurrentVoice(0);
          await createVoicesForSpeakers(failedSpeakers);
        }

        // Step 2c: Generate TTS audio with created voices (for speakers that have voiceIds)
        const voiceProfiles = buildVoiceProfiles(voiceMapRef.current);
        if (voiceProfiles.length > 0) {
          setVoiceSubStage("speaking");

          // First pass
          await generateVoicesWithConcurrency(script, voiceProfiles);

          // Retry pass for failed TTS
          const missingAudio = countMissingAudio(script);
          if (missingAudio > 0) {
            console.log(`[Voices] Retrying ${missingAudio} failed TTS clips...`);
            await generateVoicesWithConcurrency(script, voiceProfiles);
          }
        }
      }

      // Step 3: Generate all panel images
      setTotalPanels(allPanels.length);
      setCurrentPanel(0);
      setLatestImageUrl("");
      setStage("panels");

      // First pass
      const result = await generatePanelsWithConcurrency(script);

      // Retry pass for failed panels
      let panelFailures = result.failedPanels;
      if (panelFailures.length > 0) {
        console.log(`[Panels] Retrying ${panelFailures.length} failed panels...`);
        setTotalPanels(panelFailures.length);
        setCurrentPanel(0);
        const retry = await generatePanelsWithConcurrency(script);
        panelFailures = retry.failedPanels;
      }

      // Check for any remaining failures — save if clean, go partial if not
      await checkFailuresAndFinalize(panelFailures);
    } catch (error) {
      setStage("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  const isFormDisabled = stage !== "idle" && stage !== "error";

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
              disabled={isFormDisabled}
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
              disabled={isFormDisabled}
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
              disabled={isFormDisabled}
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
              disabled={isFormDisabled}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isFormDisabled}
            className="w-full py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFormDisabled ? "Generating..." : "Generate Graphic Novel"}
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
        currentVoice={currentVoice}
        totalVoices={totalVoices}
        voiceSubStage={voiceSubStage}
      />

      {stage === "partial" && scriptRef.current && failedItems && (
        <RetryCarousel
          panels={scriptRef.current.pages
            .flatMap((p) => p.panels)
            .map((p) => ({ panelIndex: p.panelIndex, imageUrl: p.imageUrl }))}
          failedItems={failedItems}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
