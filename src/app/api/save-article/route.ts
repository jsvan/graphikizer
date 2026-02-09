import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { saveManifest, updateArticleIndex } from "@/lib/blob";
import type {
  SaveArticleRequest,
  SaveArticleResponse,
  ArticleIndexEntry,
} from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveArticleRequest;
    const { manifest, password } = body;

    if (!manifest || !password) {
      return NextResponse.json<SaveArticleResponse>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json<SaveArticleResponse>(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    // Save the full manifest
    await saveManifest(manifest);

    // Find thumbnail: first panel with an imageUrl
    let thumbnailUrl: string | undefined;
    for (const page of manifest.pages) {
      for (const panel of page.panels) {
        if (panel.imageUrl) {
          thumbnailUrl = panel.imageUrl;
          break;
        }
      }
      if (thumbnailUrl) break;
    }

    // Update the index
    const entry: ArticleIndexEntry = {
      title: manifest.title,
      slug: manifest.slug,
      sourceUrl: manifest.sourceUrl,
      artStyleName: manifest.artStyle.name,
      createdAt: manifest.createdAt,
      totalPanels: manifest.totalPanels,
      pageCount: manifest.pages.length,
      thumbnailUrl,
      status: manifest.status || "complete",
    };

    await updateArticleIndex(entry);

    return NextResponse.json<SaveArticleResponse>({
      success: true,
      slug: manifest.slug,
    });
  } catch (error) {
    console.error("Save article error:", error);
    return NextResponse.json<SaveArticleResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Save failed",
      },
      { status: 500 }
    );
  }
}
