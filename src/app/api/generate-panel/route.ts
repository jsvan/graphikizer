import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { verifyPassword } from "@/lib/auth";
import { buildPanelImagePrompt } from "@/lib/prompts";
import { uploadPanelImage, checkPanelExists } from "@/lib/blob";
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

    // Check if this panel already exists in blob storage
    const existingUrl = await checkPanelExists(slug, panelIndex);
    if (existingUrl) {
      return NextResponse.json<GeneratePanelResponse>({
        success: true,
        imageUrl: existingUrl,
        panelIndex,
      });
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const prompt = buildPanelImagePrompt(artworkPrompt, artStyle);

    const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
      input: {
        prompt,
        width: 1024,
        height: 1024,
        prompt_upsampling: true,
      },
    });

    // FLUX returns a URL string or a FileOutput object
    let imageUrlFromReplicate: string;
    if (typeof output === "string") {
      imageUrlFromReplicate = output;
    } else if (output && typeof output === "object" && "url" in output) {
      imageUrlFromReplicate = (output as { url: () => string }).url();
    } else {
      return NextResponse.json<GeneratePanelResponse>(
        { success: false, error: "Unexpected output format from Replicate" },
        { status: 500 }
      );
    }

    // Download the image and upload to Vercel Blob
    const imageRes = await fetch(imageUrlFromReplicate);
    if (!imageRes.ok) {
      return NextResponse.json<GeneratePanelResponse>(
        { success: false, error: "Failed to download generated image" },
        { status: 500 }
      );
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
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
