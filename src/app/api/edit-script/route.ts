import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";

export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an editor reviewing a graphic novel script adapted from a Foreign Affairs article. Your job is to improve the script's readability and dramatic quality while preserving all factual content.

Rules:
1. Convert narration-on-behalf-of into dialogue where possible (e.g., "The analyst argues that X" should become a dialogue overlay from "Analyst": "X")
2. Tighten verbose narration boxes — max 2 sentences per narration overlay
3. Remove redundant overlays that repeat the same point
4. Ensure every panel still has at least one overlay
5. Keep all factual content intact — this is educational material
6. Keep speaker names exactly as they are — do not rename any speakers
7. Keep artworkPrompt, sourceExcerpt, layout, focalPoint, panelIndex unchanged — only edit overlay text and types
8. When converting narration to dialogue, set type to "dialogue" and include the appropriate speaker name

Output the same JSON structure you receive, with only the overlays array modified on each panel. Output valid JSON only, no markdown fences, no commentary.`;

/** Strip markdown fences and trim. */
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { panels, password } = body as {
      panels: Array<{
        panelIndex: number;
        artworkPrompt: string;
        sourceExcerpt: string;
        layout: string;
        focalPoint?: string;
        overlays: Array<{
          type: string;
          text: string;
          speaker?: string;
          characterPosition?: string;
        }>;
      }>;
      password: string;
    };

    if (!panels || !password) {
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

    const userPrompt = `Here is the graphic novel script as a JSON array of panels. Edit the overlays according to the rules, then return the full panels array with your edits:

${JSON.stringify(panels, null, 2)}`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16000,
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

          const cleaned = sanitizeJsonControlChars(stripFences(fullText));
          const parsed = JSON.parse(cleaned);
          controller.enqueue(
            encoder.encode(JSON.stringify({ success: true, panels: parsed }))
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                success: false,
                error:
                  err instanceof Error ? err.message : "Script editing failed",
              })
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
    console.error("Edit script error:", error);
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Script editing failed",
      },
      { status: 500 }
    );
  }
}
