import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyPassword } from "@/lib/auth";
import { saveScript } from "@/lib/blob";
import { buildScriptPrompt } from "@/lib/prompts";
import type {
  GenerateScriptRequest,
  GenerateScriptResponse,
  ComicScript,
} from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateScriptRequest;
    const { title, sourceUrl, articleText, password } = body;

    if (!title || !articleText || !password) {
      return NextResponse.json<GenerateScriptResponse>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json<GenerateScriptResponse>(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = buildScriptPrompt(title, articleText);

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 64000,
      messages: [
        { role: "user", content: prompt },
      ],
      system: "You are a graphic novel script writer who adapts policy articles into educational comics. Your comics must convey the FULL substance of the source article — every major argument, key evidence, and conclusion. You output only valid JSON, no markdown fences, no commentary.",
      temperature: 0.7,
    });

    const message = await stream.finalMessage();

    const textBlock = message.content.find((b) => b.type === "text");
    const content = textBlock?.text;

    if (!content) {
      return NextResponse.json<GenerateScriptResponse>(
        { success: false, error: "No response from AI" },
        { status: 500 }
      );
    }

    // Strip markdown fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    // Build slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    // Save raw AI response to blob
    const scriptUrl = await saveScript(slug, jsonStr);

    const script: ComicScript = {
      title,
      slug,
      sourceUrl: sourceUrl || "",
      artStyle: parsed.artStyle,
      totalPanels: parsed.totalPanels,
      pages: parsed.pages,
      scriptUrl,
    };

    return NextResponse.json<GenerateScriptResponse>({
      success: true,
      script,
    });
  } catch (error) {
    console.error("Script generation error:", error);
    return NextResponse.json<GenerateScriptResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Script generation failed",
      },
      { status: 500 }
    );
  }
}
