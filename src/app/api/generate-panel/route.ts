import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { getOpenAIClient } from "@/lib/openai";
import { buildPanelImagePrompt } from "@/lib/prompts";
import { uploadPanelImage } from "@/lib/blob";
import type { GeneratePanelRequest, GeneratePanelResponse } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GeneratePanelRequest;
    const { artworkPrompt, artStyle, slug, panelIndex, password } = body;

    if (!artworkPrompt || !artStyle || !slug || panelIndex === undefined || !password) {
      return NextResponse.json<GeneratePanelResponse>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json<GeneratePanelResponse>(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const openai = getOpenAIClient();
    const prompt = buildPanelImagePrompt(artworkPrompt, artStyle);

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
    });

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      return NextResponse.json<GeneratePanelResponse>(
        { success: false, error: "No image generated" },
        { status: 500 }
      );
    }

    const imageBuffer = Buffer.from(imageData.b64_json, "base64");
    const imageUrl = await uploadPanelImage(imageBuffer, slug, panelIndex);

    return NextResponse.json<GeneratePanelResponse>({
      success: true,
      imageUrl,
      panelIndex,
    });
  } catch (error) {
    console.error("Panel generation error:", error);
    return NextResponse.json<GeneratePanelResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Panel generation failed",
      },
      { status: 500 }
    );
  }
}
