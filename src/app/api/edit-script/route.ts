import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";

export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an editor for a graphic novel adapted from a Foreign Affairs article. You have the full source article for context. You are editing a batch of panels from the larger script.

Rules:
1. Tighten verbose narration — max 2 sentences per narration box
2. Convert narration-on-behalf-of into dialogue where a speaker is identifiable
3. Remove redundant overlays that repeat points already clear from other overlays or the artwork
4. Reclassify overlay types freely (dialogue↔narration↔caption) when it improves clarity
5. Keep all factual content — this is educational
6. Keep speaker names as-is
7. You may edit artworkPrompt to better match your editorial changes (e.g., if you turn narration about "France's uneasiness" into dialogue, update the artwork to show the speaker). Follow the same artwork rules: concrete visual details, real names, no text/words in images, content-safe.
8. sourceExcerpt, layout, and focalPoint are provided as INPUT CONTEXT ONLY — use them to understand what each panel adapts, but do NOT include them in your output
9. You may remove overlays or add new ones, but every panel must keep at least one overlay
10. When converting narration to dialogue, set type to "dialogue" and include the appropriate speaker name

Output a JSON array where each element has ONLY these fields: panelIndex, artworkPrompt, overlays. Do NOT include sourceExcerpt, layout, or focalPoint in the output — they are read-only context. Output valid JSON only, no markdown fences, no commentary.`;

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
    const { panels, password, articleText, articleTitle, batchIndex, totalBatches, totalPanelCount } = body as {
      panels: Array<{
        panelIndex: number;
        artworkPrompt: string;
        sourceExcerpt?: string;
        layout?: string;
        focalPoint?: string;
        overlays: Array<{
          type: string;
          text: string;
          speaker?: string;
          characterPosition?: string;
        }>;
      }>;
      password: string;
      articleText?: string;
      articleTitle?: string;
      batchIndex?: number;
      totalBatches?: number;
      totalPanelCount?: number;
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

    // Build context-rich user prompt
    const articleSection = articleText
      ? `FULL ARTICLE (for context):\n"${articleTitle || "Untitled"}"\n${articleText}\n\n---\n\n`
      : "";

    const batchLabel =
      batchIndex !== undefined && totalBatches !== undefined && totalPanelCount !== undefined
        ? `PANELS TO EDIT (batch ${batchIndex + 1} of ${totalBatches}, panels ${panels[0]?.panelIndex ?? 0}-${panels[panels.length - 1]?.panelIndex ?? 0} of ${totalPanelCount}):`
        : "PANELS TO EDIT:";

    const userPrompt = `${articleSection}${batchLabel}
${JSON.stringify(panels, null, 2)}`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 12000,
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
