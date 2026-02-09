import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";

export const maxDuration = 60;

const MAX_SPEAKERS = 10;

const SYSTEM_PROMPT = `You are an editor consolidating character voices for a graphic novel adaptation. Given a list of speaker names, merge them down to at most ${MAX_SPEAKERS} distinct speakers.

Rules:
1. Keep named real people (e.g. "Emmanuel Macron", "Olaf Scholz") as individual speakers — but if the same person appears under multiple names or titles, merge them to one canonical name.
2. Merge generic/unnamed voices aggressively. Analyst types ("European Defense Analyst", "Strategic Analyst", "Security Expert", "Policy Expert", "Realist Scholar") → a single "Analyst". Officials → "Official". Critics → "Critic". Observers → "Narrator".
3. Groups and collective voices ("European Leaders", "Polish Officials", "German Policymakers") → "Narrator" — narration doesn't need a voice.
4. The speaker "Narrator" always exists and costs nothing. Use it liberally for generic voices.
5. If you must keep more than ${MAX_SPEAKERS} because there are that many distinct named individuals, that's OK — but never exceed ${MAX_SPEAKERS + 2}.
6. Output a JSON object mapping EVERY original speaker name to its consolidated name. If a speaker stays unchanged, still include it mapping to itself.`;

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
  "European Critics": "Narrator"
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

          // Ensure every original speaker is in the mapping
          for (const s of speakers) {
            if (!(s in mapping)) {
              mapping[s] = "Narrator";
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
