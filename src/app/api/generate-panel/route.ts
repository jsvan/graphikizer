import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { verifyPassword } from "@/lib/auth";
import { buildPanelImagePrompt } from "@/lib/prompts";
import { uploadPanelImage, checkPanelExists } from "@/lib/blob";
import type { GeneratePanelRequest, GeneratePanelResponse } from "@/lib/types";

export const maxDuration = 120;

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

    const MAX_RETRIES = 6;
    let output: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        output = await replicate.run("black-forest-labs/flux-1.1-pro", {
          input: {
            prompt,
            width: 1024,
            height: 1024,
            prompt_upsampling: true,
          },
        });
        break;
      } catch (err: unknown) {
        // Stringify the error to catch 429 regardless of error class
        const errStr = String(err && typeof err === "object" && "message" in err ? err.message : err);
        const is429 = errStr.includes("429") || errStr.includes("throttled");
        if (is429 && attempt < MAX_RETRIES - 1) {
          const retryMatch = errStr.match(/retry_after.*?(\d+)/i);
          const waitSeconds = retryMatch ? Math.max(Number(retryMatch[1]), 10) : 15;
          console.log(`Panel ${panelIndex}: 429 throttled, retry ${attempt + 1}/${MAX_RETRIES - 1} in ${waitSeconds}s`);
          await new Promise((r) => setTimeout(r, waitSeconds * 1000));
          continue;
        }
        throw err;
      }
    }

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
  } catch (error: unknown) {
    const msg = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
    console.error("Panel generation error:", msg);
    return NextResponse.json<GeneratePanelResponse>(
      { success: false, error: msg || "Panel generation failed" },
      { status: 500 }
    );
  }
}
