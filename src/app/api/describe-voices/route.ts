import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";
import type { DescribeVoicesRequest, DescribeVoicesResponse } from "@/lib/types";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a voice casting director for a dramatic graphic novel. Given a list of speaker names from a news/policy article, produce a rich vocal description for each speaker that can be used to synthesize a custom voice.

Rules:
- Voices must sound CHARISMATIC, COMPELLING, and ENGAGING — these are voices for a dramatic graphic novel, not a dry news read. Think stage actors, not newsreaders.
- NEVER use real names, titles, or identifying information — describe the ARCHETYPE and vocal qualities, not the person
- Include: gender, approximate age range, accent/regional speech pattern, vocal tone, speaking cadence, any distinctive qualities
- Emphasize personality and presence: confident delivery, emotional range, commanding tone
- Each description must be 50-150 characters
- For any speaker that is clearly a narrator/author role, use: "Rich, commanding narrator voice with gravitas, neutral accent, dramatic pacing" (adjust gender if discernible)
- Output valid JSON only: an object mapping each speaker name to its voice description string`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DescribeVoicesRequest;
    const { speakers, articleTitle, password } = body;

    if (!speakers || speakers.length === 0 || !password) {
      return Response.json(
        { success: false, error: "Missing required fields" } satisfies DescribeVoicesResponse,
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return Response.json(
        { success: false, error: "Invalid password" } satisfies DescribeVoicesResponse,
        { status: 401 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const userPrompt = `Article title: "${articleTitle}"

Speakers to describe:
${speakers.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Produce a JSON object mapping each speaker name (exactly as listed) to a voice description string. Example format:
{
  "Speaker Name": "Warm, gravelly American male in his 60s, Midwestern accent, speaks in deliberate measured phrases"
}`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [{ role: "user", content: userPrompt }],
      system: SYSTEM_PROMPT,
      temperature: 0.7,
    });

    // Stream keepalive newlines, then send JSON as final line
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

          // Strip markdown fences if present
          const cleaned = fullText
            .replace(/^[\s\n]*```(?:json)?[\s\n]*/i, "")
            .replace(/[\s\n]*```[\s\n]*$/i, "")
            .trim();

          const descriptions: Record<string, string> = JSON.parse(cleaned);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ success: true, descriptions } satisfies DescribeVoicesResponse)
            )
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Voice description failed",
              } satisfies DescribeVoicesResponse)
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
    console.error("Describe voices error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Voice description failed",
      } satisfies DescribeVoicesResponse,
      { status: 500 }
    );
  }
}
