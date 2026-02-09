import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a voice casting director for a graphic novel adaptation. Given a list of speaker names extracted from the dialogue, decide which speakers should share a voice actor.

This ONLY controls which voice is used for audio — the original speaker name stays visible in the comic bubble. You are deciding who SOUNDS alike, not renaming anyone.

Guidelines:
1. SAME PERSON, DIFFERENT LABELS: If the same real person appears under multiple names or titles (e.g. "Emmanuel Macron" and "French President", or "Sikorski" and "Poland's Foreign Minister"), they must share one voice. Pick the most recognizable name.
2. DISTINCT REAL PEOPLE GET DISTINCT VOICES: "Emmanuel Macron" and "Olaf Scholz" are different people — they get different voices. Don't merge named individuals who are clearly different people.
3. GENERIC ROLES THAT OVERLAP: Unnamed analyst/expert/scholar types that serve the same narrative role should share a voice. "European Defense Analyst", "Strategic Analyst", "Security Expert", and "Policy Expert" are all just "expert commentary" — one voice. Similarly, generic officials, critics, or observers that are interchangeable can share.
4. GROUPS AND COLLECTIVES: "European Leaders", "Polish Officials", "German Policymakers" — these aren't individual characters. Group them into a fitting generic voice like "Official" or "Commentator".
5. USE YOUR JUDGMENT on how many voices are needed. A short article about two leaders might need 3 voices. A sweeping geopolitical epic with 15 named figures might need 15. Don't force merges that would sound wrong — if two speakers have clearly different roles and would sound different, keep them separate.
6. Do NOT map anything to "Narrator" — narration boxes have no voice. Every speaker in this list needs a real voice.
7. Output a JSON object mapping EVERY original speaker name to its voice name. If a speaker keeps its own voice, map it to itself.`;

export interface ConsolidateResponse {
  success: boolean;
  mapping?: Record<string, string>;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { speakers, articleTitle, password } = body as {
      speakers: string[];
      articleTitle: string;
      password: string;
    };

    if (!speakers || speakers.length === 0 || !password) {
      return Response.json(
        { success: false, error: "Missing required fields" } satisfies ConsolidateResponse,
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return Response.json(
        { success: false, error: "Invalid password" } satisfies ConsolidateResponse,
        { status: 401 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const userPrompt = `Article: "${articleTitle}"

These are the ${speakers.length} speaker names found in the dialogue bubbles. Decide which ones should share a voice actor.

Speakers:
${speakers.map((s, i) => `${i + 1}. "${s}"`).join("\n")}

Return a JSON object mapping every original name to the voice name it should use. Example:
{
  "European Defense Analyst": "Analyst",
  "Strategic Analyst": "Analyst",
  "Emmanuel Macron": "Emmanuel Macron",
  "French President": "Emmanuel Macron",
  "Polish Officials": "Official",
  "Olaf Scholz": "Olaf Scholz"
}`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [{ role: "user", content: userPrompt }],
      system: SYSTEM_PROMPT,
      temperature: 0.3,
    });

    let fullText = "";
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              controller.enqueue(encoder.encode("\n"));
            }
          }

          const cleaned = fullText
            .replace(/^[\s\n]*```(?:json)?[\s\n]*/i, "")
            .replace(/[\s\n]*```[\s\n]*$/i, "")
            .trim();

          const mapping: Record<string, string> = JSON.parse(cleaned);

          // Ensure every original speaker is in the mapping (keep original if missing)
          for (const s of speakers) {
            if (!(s in mapping)) {
              mapping[s] = s;
            }
          }

          const uniqueTargets = new Set(Object.values(mapping));
          console.log(
            `[Consolidate] ${speakers.length} speakers → ${uniqueTargets.size} voices (${[...uniqueTargets].join(", ")})`
          );

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ success: true, mapping } satisfies ConsolidateResponse)
            )
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Consolidation failed",
              } satisfies ConsolidateResponse)
            )
          );
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Consolidate speakers error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Consolidation failed",
      } satisfies ConsolidateResponse,
      { status: 500 }
    );
  }
}
