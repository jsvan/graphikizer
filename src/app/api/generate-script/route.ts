import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { getOpenAIClient } from "@/lib/openai";
import { buildScriptPrompt } from "@/lib/prompts";
import type {
  GenerateScriptRequest,
  GenerateScriptResponse,
  ComicScript,
} from "@/lib/types";

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

    const openai = getOpenAIClient();
    const prompt = buildScriptPrompt(title, articleText);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a graphic novel script writer. You output only valid JSON, no markdown fences.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 16000,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json<GenerateScriptResponse>(
        { success: false, error: "No response from AI" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(content);

    // Build slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    const script: ComicScript = {
      title,
      slug,
      sourceUrl: sourceUrl || "",
      artStyle: parsed.artStyle,
      totalPanels: parsed.totalPanels,
      pages: parsed.pages,
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
