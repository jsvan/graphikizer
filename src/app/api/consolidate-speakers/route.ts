import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";

export const maxDuration = 60;

const MAX_SPEAKERS = 10;

const SYSTEM_PROMPT = `You are an editor consolidating character voices for a graphic novel adaptation. Given a list of speaker names, merge them down to at most ${MAX_SPEAKERS} distinct voice actors.

This controls which VOICE is used, not the displayed name. The original speaker attribution stays visible in the comic — you are just deciding which speakers should SOUND alike (share a voice).

Rules:
1. Keep named real people (e.g. "Emmanuel Macron", "Olaf Scholz") as individual voices — but if the same person appears under multiple names or titles, pick one canonical name for the voice.
2. Merge generic/unnamed speakers aggressively. Analyst types ("European Defense Analyst", "Strategic Analyst", "Security Expert", "Policy Expert", "Realist Scholar") → a single "Analyst" voice. Officials → "Official". Critics → "Critic".
3. Groups and collective voices ("European Leaders", "Polish Officials", "German Policymakers") → merge into a suitable generic voice like "Official" or "Analyst". Every speaker must map to a real voice that will be created.
4. Do NOT map anything to "Narrator" — that is reserved for narration boxes which have no voice. Every speaker needs a voice.
5. If you must keep more than ${MAX_SPEAKERS} because there are that many distinct named individuals, that's OK — but never exceed ${MAX_SPEAKERS + 2}.
6. Output a JSON object mapping EVERY original speaker name to its consolidated voice name. If a speaker keeps its own voice, map it to itself.`;

interface ConsolidateRequest {
  speakers: string[];
  articleTitle: string;
  password: string;
}

export interface ConsolidateResponse {
  success: boolean;
  mapping?: Record<string, string>;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ConsolidateRequest;
    const { speakers, articleTitle, password } = body;

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

    // If already under the limit, return identity mapping
    if (speakers.length <= MAX_SPEAKERS) {
      const mapping: Record<string, string> = {};
      for (const s of speakers) mapping[s] = s;
      return Response.json({ success: true, mapping } satisfies ConsolidateResponse);
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const userPrompt = `Article: "${articleTitle}"

There are ${speakers.length} speakers — too many. Consolidate to at most ${MAX_SPEAKERS}.

Current speakers:
${speakers.map((s, i) => `${i + 1}. "${s}"`).join("\n")}

Return a JSON object mapping every original name to its consolidated name. Example:
{
  "European Defense Analyst": "Analyst",
  "Strategic Analyst": "Analyst",
  "Emmanuel Macron": "Emmanuel Macron",
  "French President": "Emmanuel Macron",
  "European Critics": "Critic",
  "Polish Officials": "Official"
}`;

    // Use streaming with keepalive pattern (same as describe-voices)
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
            `[Consolidate] ${speakers.length} speakers → ${uniqueTargets.size} (${[...uniqueTargets].join(", ")})`
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
