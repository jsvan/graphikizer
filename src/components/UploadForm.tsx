"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  UserDecision,
  PendingDecision,
} from "@/lib/types";
import { placeOverlays } from "@/lib/bubblePlacement";
import { buildVoiceProfiles } from "@/lib/voiceMapping";
import GenerationProgress from "./GenerationProgress";
import FailureDecision from "./FailureDecision";

const CONCURRENCY_LIMIT = 5;
const VOICE_CONCURRENCY_LIMIT = 2; // ElevenLabs allows max 3 concurrent; keep headroom
const TARGET_WORDS_PER_CHUNK = 600;
const PANELS_PER_PAGE = 10;
const EDIT_BATCH_SIZE = 15;

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

/** Get human-readable labels for missing TTS items. */
function getMissingAudioLabels(script: ComicScript): string[] {
  const labels: string[] = [];
  for (const page of script.pages) {
    for (const panel of page.panels) {
      for (const overlay of panel.overlays) {
        if (overlay.type === "dialogue" && overlay.speaker && !overlay.audioUrl) {
          labels.push(`Panel ${panel.panelIndex + 1}: ${overlay.speaker}`);
        }
      }
    }
  }
  return labels;
}

export default function UploadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeSlug = searchParams.get("resume");

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
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [resumeReady, setResumeReady] = useState(false);
  const [editBatch, setEditBatch] = useState(0);
  const [totalEditBatches, setTotalEditBatches] = useState(0);
  const abortRef = useRef(false);

  // Persistent refs for retry across function calls
  const scriptRef = useRef<ComicScript | null>(null);
  const voiceMapRef = useRef<Record<string, { voiceId: string; description: string }>>({});
  const voiceDescriptionsRef = useRef<Record<string, string>>({});
  const sampleLinesRef = useRef<Map<string, string>>(new Map());
  const speakerListRef = useRef<string[]>([]);
  // Maps original speaker name → consolidated voice name (identity if no consolidation)
  const voiceGroupRef = useRef<Record<string, string>>({});
  const decisionResolverRef = useRef<((d: UserDecision) => void) | null>(null);

  /** Pause generation and wait for user input. */
  async function waitForDecision(info: PendingDecision): Promise<UserDecision> {
    return new Promise((resolve) => {
      decisionResolverRef.current = resolve;
      setPendingDecision(info);
    });
  }

  function handleDecision(decision: UserDecision) {
    setPendingDecision(null);
    decisionResolverRef.current?.(decision);
    decisionResolverRef.current = null;
  }

  /** Save manifest at any point. */
  async function saveCurrentState(
    script: ComicScript,
    status: "partial" | "complete" | "generating",
    skipAudio?: boolean
  ) {
    const voiceProfiles = buildVoiceProfiles(voiceMapRef.current);
    const audioEnabled = !skipAudio && speakerListRef.current.length > 0;

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
      status,
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
  }

  /** Delete created ElevenLabs voices to free up voice slots. Fire-and-forget. */
  function cleanupVoices() {
    const voiceIds = Object.values(voiceMapRef.current).map((v) => v.voiceId);
    if (voiceIds.length === 0) return;

    console.log(`[Cleanup] Deleting ${voiceIds.length} created voices...`);
    fetch("/api/delete-voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceIds, password }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log(`[Cleanup] Voice deletion: ${data.deleted} deleted, ${data.failed} failed`);
      })
      .catch((err) => {
        console.warn("[Cleanup] Voice deletion error:", err);
      });
  }

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
                layout: panel.layout,
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
            // Look up voice via consolidation mapping (falls back to original name)
            const voiceName = voiceGroupRef.current[overlay.speaker] || overlay.speaker;
            const voice = voiceMap.get(voiceName);
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
      { length: Math.min(VOICE_CONCURRENCY_LIMIT, tasks.length) },
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
      { length: Math.min(VOICE_CONCURRENCY_LIMIT, q.length) },
      () => worker()
    );
    if (workers.length > 0) await Promise.all(workers);
  }

  /** Extract all unique speakers from a script's dialogue overlays. */
  function extractSpeakers(script: ComicScript): string[] {
    const speakers = new Set<string>();
    for (const page of script.pages) {
      for (const panel of page.panels) {
        for (const overlay of panel.overlays) {
          if (overlay.type === "dialogue" && overlay.speaker) {
            speakers.add(overlay.speaker);
          }
        }
      }
    }
    return [...speakers];
  }

  /** Collect a sample dialogue line per speaker for Voice Design. */
  function collectSampleLines(script: ComicScript): Map<string, string> {
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
    return sampleLines;
  }

  /** Describe voices for speakers that don't already have descriptions. */
  async function describeVoicesForSpeakers(speakerList: string[], articleTitle: string) {
    const needDescriptions = speakerList.filter(
      (s) => !voiceDescriptionsRef.current[s]
    );
    if (needDescriptions.length === 0) return;

    setStage("voices");
    setVoiceSubStage("describing");
    console.log(`[Voices] Describing ${needDescriptions.length} speakers...`);

    const descRes = await fetch("/api/describe-voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speakers: needDescriptions,
        articleTitle,
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
    voiceDescriptionsRef.current = {
      ...voiceDescriptionsRef.current,
      ...descResult.descriptions,
    };
  }

  /**
   * Run voice creation with interactive decision loop.
   * Returns true if pipeline should continue, false if terminated.
   * Sets skipAudio=true via the returned flag if user chose "skip_section".
   */
  async function runVoiceCreationWithDecisions(
    speakerList: string[]
  ): Promise<{ continue: boolean; skipAudio: boolean }> {
    setStage("voices");
    setVoiceSubStage("creating");
    setTotalVoices(speakerList.length);
    setCurrentVoice(0);

    // First pass
    await createVoicesForSpeakers(speakerList);

    // Decision loop
    while (true) {
      const failedSpeakers = speakerList.filter(
        (s) => !(s in voiceMapRef.current)
      );
      if (failedSpeakers.length === 0) break;

      const decision = await waitForDecision({
        section: "voice_creation",
        failedDetails: failedSpeakers.map((s) => `Speaker: ${s}`),
        succeededCount: speakerList.length - failedSpeakers.length,
        failedCount: failedSpeakers.length,
        totalCount: speakerList.length,
      });

      if (decision === "retry") {
        setStage("voices");
        setVoiceSubStage("creating");
        setTotalVoices(failedSpeakers.length);
        setCurrentVoice(0);
        await createVoicesForSpeakers(failedSpeakers);
        continue;
      }
      if (decision === "skip") {
        break; // continue to TTS with whatever voices we have
      }
      if (decision === "skip_section") {
        return { continue: true, skipAudio: true };
      }
      if (decision === "terminate") {
        return { continue: false, skipAudio: false };
      }
    }

    return { continue: true, skipAudio: false };
  }

  /**
   * Run TTS with interactive decision loop.
   * Returns true if pipeline should continue, false if terminated.
   */
  async function runTTSWithDecisions(
    script: ComicScript
  ): Promise<{ continue: boolean }> {
    const voiceProfiles = buildVoiceProfiles(voiceMapRef.current);
    if (voiceProfiles.length === 0) return { continue: true };

    setStage("voices");
    setVoiceSubStage("speaking");

    // First pass
    await generateVoicesWithConcurrency(script, voiceProfiles);

    // Decision loop
    while (true) {
      const missing = countMissingAudio(script);
      if (missing === 0) break;

      const totalDialogues = script.pages.reduce(
        (sum, page) =>
          sum +
          page.panels.reduce(
            (pSum, panel) =>
              pSum +
              panel.overlays.filter(
                (o) => o.type === "dialogue" && o.speaker
              ).length,
            0
          ),
        0
      );

      const decision = await waitForDecision({
        section: "tts",
        failedDetails: getMissingAudioLabels(script),
        succeededCount: totalDialogues - missing,
        failedCount: missing,
        totalCount: totalDialogues,
      });

      if (decision === "retry") {
        setStage("voices");
        setVoiceSubStage("speaking");
        await generateVoicesWithConcurrency(script, voiceProfiles);
        continue;
      }
      if (decision === "skip" || decision === "skip_section") {
        break; // continue to panels with partial audio
      }
      if (decision === "terminate") {
        return { continue: false };
      }
    }

    return { continue: true };
  }

  /**
   * Run panel generation with interactive decision loop.
   */
  async function runPanelsWithDecisions(
    script: ComicScript
  ): Promise<void> {
    const allPanels = script.pages.flatMap((p) => p.panels);
    const pending = allPanels.filter((p) => !p.imageUrl);

    setTotalPanels(pending.length);
    setCurrentPanel(0);
    setLatestImageUrl("");
    setStage("panels");

    // First pass
    await generatePanelsWithConcurrency(script);

    // Decision loop
    while (true) {
      const failed = script.pages
        .flatMap((p) => p.panels)
        .filter((p) => !p.imageUrl);
      if (failed.length === 0) break;

      const total = script.pages.flatMap((p) => p.panels).length;
      const decision = await waitForDecision({
        section: "panels",
        failedDetails: failed.map((p) => `Panel ${p.panelIndex + 1}`),
        succeededCount: total - failed.length,
        failedCount: failed.length,
        totalCount: total,
      });

      if (decision === "retry") {
        setTotalPanels(failed.length);
        setCurrentPanel(0);
        setStage("panels");
        await generatePanelsWithConcurrency(script);
        continue;
      }
      // "skip" or "terminate" — both mean save as-is for the last stage
      break;
    }
  }

  /**
   * Run the voice + panel pipeline with decision loops.
   * Used by both handleSubmit (new articles) and handleResume.
   */
  async function runPipelineFromVoices(
    script: ComicScript,
    articleTitle: string,
    needVoiceDescriptions: boolean
  ) {
    // Check if ElevenLabs is available
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

    // Clean slate: delete any leftover graphikizer voices before creating new ones
    console.log("[Voices] Cleaning up old voices before starting...");
    try {
      await fetch("/api/delete-voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, deleteAll: true }),
      });
    } catch (err) {
      console.warn("[Voices] Pre-cleanup failed (non-fatal):", err);
    }

    const allSpeakers = extractSpeakers(script);

    // Consolidate voice assignments — decides which speakers share a voice actor
    voiceGroupRef.current = {};
    if (allSpeakers.length > 0) {
      console.log(`[Speakers] ${allSpeakers.length} speakers — consolidating voice assignments...`);
      setStage("voices");
      setVoiceSubStage("describing");

      try {
        const consRes = await fetch("/api/consolidate-speakers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speakers: allSpeakers,
            articleTitle,
            password,
          }),
        });

        const consText = await consRes.text();
        const consLines = consText.split("\n").filter(Boolean);
        const consResult = consLines.length > 0
          ? JSON.parse(consLines[consLines.length - 1])
          : { success: false };

        if (consResult.success && consResult.mapping) {
          voiceGroupRef.current = consResult.mapping;
          const voiceTargets = [...new Set(Object.values(consResult.mapping) as string[])];
          console.log(`[Speakers] ${allSpeakers.length} speakers → ${voiceTargets.length} voices: ${voiceTargets.join(", ")}`);
        } else {
          console.warn("[Speakers] Consolidation failed, proceeding with original list");
        }
      } catch (err) {
        console.warn("[Speakers] Consolidation error (non-fatal):", err);
      }
    }

    // speakerList = unique voice names to create (consolidated targets, or original names if no consolidation)
    const speakerList = Object.keys(voiceGroupRef.current).length > 0
      ? [...new Set(Object.values(voiceGroupRef.current))]
      : allSpeakers;
    speakerListRef.current = speakerList;

    let skipAudio = false;

    if (speakerList.length > 0) {
      // Step 2a: Describe voices (if needed)
      if (needVoiceDescriptions) {
        await describeVoicesForSpeakers(speakerList, articleTitle);
      }

      // Collect sample lines (always needed for voice creation)
      sampleLinesRef.current = collectSampleLines(script);

      // Step 2b: Create voices (only for speakers missing voiceIds)
      const speakersNeedingVoices = speakerList.filter(
        (s) => !(s in voiceMapRef.current)
      );

      if (speakersNeedingVoices.length > 0) {
        const voiceResult = await runVoiceCreationWithDecisions(speakersNeedingVoices);
        if (!voiceResult.continue) {
          await saveCurrentState(script, "partial");
          cleanupVoices();
          setStage("partial");
          return;
        }
        skipAudio = voiceResult.skipAudio;
      }

      // Step 2c: TTS (skip if user chose "Skip All Audio")
      if (!skipAudio) {
        const ttsResult = await runTTSWithDecisions(script);
        if (!ttsResult.continue) {
          await saveCurrentState(script, "partial");
          cleanupVoices();
          setStage("partial");
          return;
        }
      }
    }

    // Step 3: Panels
    const hasMissingPanels = script.pages
      .flatMap((p) => p.panels)
      .some((p) => !p.imageUrl);

    if (hasMissingPanels) {
      await runPanelsWithDecisions(script);
    }

    // Step 4: Final save
    const hasAnyFailures =
      script.pages.flatMap((p) => p.panels).some((p) => !p.imageUrl) ||
      (!skipAudio && countMissingAudio(script) > 0);
    const finalStatus = hasAnyFailures ? "partial" : "complete";

    await saveCurrentState(script, finalStatus, skipAudio);
    cleanupVoices();

    if (finalStatus === "complete") {
      setStage("done");
      setTimeout(() => {
        router.push(`/article/${script.slug}`);
      }, 1500);
    } else {
      setStage("partial");
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
    setPendingDecision(null);

    // Reset refs
    scriptRef.current = null;
    voiceMapRef.current = {};
    voiceDescriptionsRef.current = {};
    sampleLinesRef.current = new Map();
    speakerListRef.current = [];
    voiceGroupRef.current = {};

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

      // Save early manifest so article appears on main page immediately
      const earlyManifest: ArticleManifest = {
        title: script.title,
        slug: script.slug,
        sourceUrl: script.sourceUrl,
        artStyle: script.artStyle,
        createdAt: new Date().toISOString(),
        totalPanels: script.totalPanels,
        pages: script.pages,
        scriptUrl: script.scriptUrl,
        placementVersion: 4,
        status: "generating",
      };
      await fetch("/api/save-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: earlyManifest, password }),
      });

      // Step 1b: Editorial pass — tighten narration, convert to dialogue (batched)
      setStage("editing");
      try {
        // Send full panel context (including layout/focalPoint as read-only context)
        // The editor prompt tells Claude to output only panelIndex + artworkPrompt + overlays
        const allPanelsFlat = script.pages.flatMap((page) =>
          page.panels.map((p) => ({
            panelIndex: p.panelIndex,
            artworkPrompt: p.artworkPrompt,
            layout: p.layout,
            focalPoint: p.focalPoint,
            overlays: p.overlays.map((o) => ({
              type: o.type,
              text: o.text,
              speaker: o.speaker,
              characterPosition: o.characterPosition,
            })),
          }))
        );

        // Split panels into batches of EDIT_BATCH_SIZE
        const editBatches: typeof allPanelsFlat[] = [];
        for (let i = 0; i < allPanelsFlat.length; i += EDIT_BATCH_SIZE) {
          editBatches.push(allPanelsFlat.slice(i, i + EDIT_BATCH_SIZE));
        }

        setTotalEditBatches(editBatches.length);
        console.log(`[Editor] Editing ${allPanelsFlat.length} panels in ${editBatches.length} batches of ~${EDIT_BATCH_SIZE}`);

        for (let bi = 0; bi < editBatches.length; bi++) {
          setEditBatch(bi + 1);
          const batch = editBatches[bi];

          const editRes = await fetch("/api/edit-script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              panels: batch,
              password,
              articleText,
              articleTitle: title,
              batchIndex: bi,
              totalBatches: editBatches.length,
              totalPanelCount: allPanelsFlat.length,
            }),
          });

          const editText = await editRes.text();
          const editLines = editText.split("\n").filter(Boolean);
          const editResult =
            editLines.length > 0
              ? JSON.parse(editLines[editLines.length - 1])
              : { success: false };

          if (editResult.success && Array.isArray(editResult.panels)) {
            const editedPanelMap = new Map(
              editResult.panels.map((p: { panelIndex: number; overlays: unknown[]; artworkPrompt?: string }) => [p.panelIndex, p])
            );
            for (const page of script.pages) {
              for (const panel of page.panels) {
                const edited = editedPanelMap.get(panel.panelIndex) as {
                  overlays: Array<{
                    type: string;
                    text: string;
                    speaker?: string;
                    characterPosition?: string;
                  }>;
                  artworkPrompt?: string;
                } | undefined;
                if (edited?.overlays && edited.overlays.length > 0) {
                  panel.overlays = edited.overlays.map((o) => ({
                    type: o.type as "dialogue" | "narration" | "caption",
                    text: o.text,
                    x: 0,
                    y: 0,
                    anchor: "top-left" as const,
                    ...(o.speaker ? { speaker: o.speaker } : {}),
                    ...(o.characterPosition ? { characterPosition: o.characterPosition as import("@/lib/types").FocalPoint } : {}),
                  }));
                  panel.overlays = placeOverlays(panel.overlays, panel.layout, panel.focalPoint);
                }
                if (edited?.artworkPrompt) {
                  panel.artworkPrompt = edited.artworkPrompt;
                }
              }
            }
            console.log(`[Editor] Batch ${bi + 1}/${editBatches.length} complete`);
          } else {
            console.warn(`[Editor] Batch ${bi + 1} failed or returned bad data, keeping original`);
          }
        }

        console.log("[Editor] Script editing complete — all batches processed");
      } catch (editErr) {
        console.warn("[Editor] Script editing error (non-fatal):", editErr);
      }

      scriptRef.current = script;

      // Run voice + panel pipeline with decision loops
      await runPipelineFromVoices(script, title, true);
    } catch (error) {
      setStage("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  /** Resume an incomplete article. */
  const handleResume = useCallback(async () => {
    if (!resumeSlug || !password) return;

    abortRef.current = false;
    setStage("saving"); // show "loading" state while fetching manifest
    setErrorMessage("");
    setPendingDecision(null);

    try {
      const res = await fetch("/api/get-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: resumeSlug, password }),
      });

      const data = await res.json();
      if (!data.success || !data.manifest) {
        throw new Error(data.error || "Failed to load article");
      }

      const manifest: ArticleManifest = data.manifest;

      // Reconstruct script from manifest
      const script: ComicScript = {
        title: manifest.title,
        slug: manifest.slug,
        sourceUrl: manifest.sourceUrl,
        artStyle: manifest.artStyle,
        totalPanels: manifest.totalPanels,
        pages: manifest.pages,
        scriptUrl: manifest.scriptUrl,
      };

      scriptRef.current = script;
      setScriptPreview(script);
      setTitle(manifest.title);
      setSourceUrl(manifest.sourceUrl);

      // Reconstruct voiceMapRef from existing voice data
      voiceMapRef.current = {};
      voiceDescriptionsRef.current = {};
      voiceGroupRef.current = {};
      if (manifest.voiceData?.voices) {
        for (const voice of manifest.voiceData.voices) {
          voiceMapRef.current[voice.speaker] = {
            voiceId: voice.voiceId,
            description: voice.voiceDescription,
          };
          voiceDescriptionsRef.current[voice.speaker] = voice.voiceDescription;
        }
      }

      // Determine what needs to be done
      const speakers = extractSpeakers(script);
      speakerListRef.current = speakers;
      sampleLinesRef.current = collectSampleLines(script);

      const speakersWithoutVoices = speakers.filter(
        (s) => !(s in voiceMapRef.current)
      );
      const needVoiceDescriptions = speakersWithoutVoices.length > 0;

      console.log(
        `[Resume] Article "${manifest.title}": ${speakersWithoutVoices.length} speakers need voices, ${countMissingAudio(script)} missing TTS, ${script.pages.flatMap((p) => p.panels).filter((p) => !p.imageUrl).length} missing panels`
      );

      // Run the pipeline for missing items
      await runPipelineFromVoices(script, manifest.title, needVoiceDescriptions);
    } catch (error) {
      setStage("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Resume failed"
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSlug, password]);

  // If we have a resume slug, show the password prompt + resume button
  useEffect(() => {
    if (resumeSlug) {
      setResumeReady(true);
      setExpanded(false); // hide the create form
    }
  }, [resumeSlug]);

  const isFormDisabled = stage !== "idle" && stage !== "error";
  const isResuming = !!resumeSlug && resumeReady;

  return (
    <div>
      {/* Resume mode UI */}
      {isResuming && stage === "idle" && (
        <div className="max-w-xl mx-auto mb-6">
          <div className="p-6 bg-gray-900 rounded-xl border border-amber-400/30">
            <h3 className="text-amber-400 text-lg font-semibold mb-2">
              Resume Incomplete Article
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Resuming: <span className="text-gray-200">{resumeSlug}</span>
            </p>
            <div className="mb-4">
              <label
                htmlFor="resumePassword"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Password
              </label>
              <input
                id="resumePassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                required
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <button
              onClick={handleResume}
              disabled={!password}
              className="w-full py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Resume Generation
            </button>
          </div>
        </div>
      )}

      {/* Create new article toggle */}
      {!isResuming && (
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
      )}

      {!isResuming && expanded && (
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

      {/* Decision UI takes precedence over progress when paused */}
      {pendingDecision ? (
        <FailureDecision
          decision={pendingDecision}
          onDecision={handleDecision}
        />
      ) : (
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
          editBatch={editBatch}
          totalEditBatches={totalEditBatches}
        />
      )}

      {stage === "partial" && scriptRef.current && (
        <div className="w-full max-w-xl mx-auto mt-4">
          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800 text-center">
            <p className="text-gray-400 text-sm mb-3">
              Saved as incomplete. You can resume from the home page later.
            </p>
            <button
              onClick={() => router.push(`/article/${scriptRef.current!.slug}`)}
              className="px-6 py-2.5 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors"
            >
              View Article
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
