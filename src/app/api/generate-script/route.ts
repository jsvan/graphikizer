import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";
import {
  buildFirstChunkPrompt,
  buildContinuationChunkPrompt,
} from "@/lib/prompts";
import type { ArtStyle } from "@/lib/types";

export const maxDuration = 60;

const SYSTEM_PROMPT =
  "You are a graphic novel script writer who adapts policy articles into educational comics. Your comics must convey the FULL substance of the source material — every major argument, key evidence, and conclusion. You output only valid JSON, no markdown fences, no commentary.";

/** Strip markdown fences and trim whitespace. */
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
    const {
      title,
      articleChunk,
      chunkNumber,
      totalChunks,
      password,
      artStyle,
      startPanelIndex,
    } = body as {
      title: string;
      articleChunk: string;
      chunkNumber: number;
      totalChunks: number;
      password: string;
      artStyle?: ArtStyle;
      startPanelIndex?: number;
    };

    if (!title || !articleChunk || !password || !chunkNumber || !totalChunks) {
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

    // First chunk picks art style; continuation chunks receive it
    const prompt =
      artStyle && startPanelIndex !== undefined
        ? buildContinuationChunkPrompt(
            title,
            articleChunk,
            artStyle,
            startPanelIndex,
            chunkNumber,
            totalChunks
          )
        : buildFirstChunkPrompt(title, articleChunk, chunkNumber, totalChunks);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
      system: SYSTEM_PROMPT,
      temperature: 0.7,
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = sanitizeJsonControlChars(stripFences(rawText));
    const parsed = JSON.parse(cleaned);

    return Response.json({ success: true, data: parsed });
  } catch (error) {
    console.error("Script generation error:", error);
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Script generation failed",
      },
      { status: 500 }
    );
  }
}
