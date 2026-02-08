import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";
import { buildScriptPrompt } from "@/lib/prompts";

export const maxDuration = 60;

const SYSTEM_PROMPT =
  "You are a graphic novel script writer who adapts policy articles into educational comics. Your comics must convey the FULL substance of the source article — every major argument, key evidence, and conclusion. You output only valid JSON, no markdown fences, no commentary.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, sourceUrl, articleText, password, partialResponse } = body;

    if (!title || !articleText || !password) {
      return Response.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return Response.json(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = buildScriptPrompt(title, articleText);

    // Build messages — either fresh or continuation via true prefill.
    // When partialResponse is provided, it becomes the last (assistant)
    // message. The API then continues generating tokens from that exact
    // point — no re-generation, no overlap.
    const messages: Anthropic.MessageParam[] = partialResponse
      ? [
          { role: "user", content: prompt },
          { role: "assistant", content: partialResponse },
        ]
      : [{ role: "user", content: prompt }];

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 64000,
      messages,
      system: SYSTEM_PROMPT,
      temperature: 0.7,
    });

    // Stream text deltas to the client as they arrive
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
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
    console.error("Script generation error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Script generation failed",
      },
      { status: 500 }
    );
  }
}
