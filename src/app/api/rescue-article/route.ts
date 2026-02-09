import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { verifyPassword } from "@/lib/auth";
import { saveManifest, updateArticleIndex } from "@/lib/blob";
import type {
  ArticleManifest,
  ArticleIndexEntry,
  ComicPanel,
  ComicPage,
  ArtStyle,
} from "@/lib/types";

export const maxDuration = 30;

/** GET: List all article slugs in Blob storage (for discovering the right slug) */
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "articles/" });
    // Extract unique slugs from paths like articles/{slug}/script.json
    const slugs = new Set<string>();
    const files: Record<string, string[]> = {};
    for (const blob of blobs) {
      const match = blob.pathname.match(/^articles\/([^/]+)\//);
      if (match && match[1] !== "index.json") {
        const s = match[1];
        slugs.add(s);
        if (!files[s]) files[s] = [];
        files[s].push(blob.pathname.replace(`articles/${s}/`, ""));
      }
    }
    return NextResponse.json({
      slugs: [...slugs],
      details: Object.fromEntries(
        [...slugs].map((s) => [s, { fileCount: files[s].length, files: files[s].slice(0, 10) }])
      ),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to list blobs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { slug, password, title, sourceUrl } = (await req.json()) as {
      slug: string;
      password: string;
      title?: string;
      sourceUrl?: string;
    };

    if (!slug || !password) {
      return NextResponse.json(
        { success: false, error: "Missing slug or password" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    // 1. Read the script.json
    const { blobs: scriptBlobs } = await list({
      prefix: `articles/${slug}/script.json`,
    });
    if (scriptBlobs.length === 0) {
      return NextResponse.json(
        { success: false, error: `No script.json found for "${slug}"` },
        { status: 404 }
      );
    }

    const scriptRes = await fetch(scriptBlobs[0].url);
    const scriptText = await scriptRes.text();
    let scriptData: {
      artStyle: ArtStyle;
      totalPanels: number;
      pages: ComicPage[];
    };
    try {
      scriptData = JSON.parse(scriptText);
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: `script.json parse failed: ${e instanceof Error ? e.message : e}`,
        scriptLength: scriptText.length,
        scriptPreview: scriptText.slice(0, 200),
        scriptEnd: scriptText.slice(-200),
      });
    }

    // 2. Discover all panel images
    const { blobs: panelBlobs } = await list({
      prefix: `articles/${slug}/panels/`,
    });
    const panelUrlMap = new Map<number, string>();
    for (const blob of panelBlobs) {
      // e.g. articles/slug/panels/panel-003.webp
      const match = blob.pathname.match(/panel-(\d+)\./);
      if (match) {
        panelUrlMap.set(parseInt(match[1], 10), blob.url);
      }
    }

    // 3. Discover all audio clips
    const { blobs: audioBlobs } = await list({
      prefix: `articles/${slug}/audio/`,
    });
    const audioUrlMap = new Map<string, string>();
    for (const blob of audioBlobs) {
      // e.g. articles/slug/audio/panel-3-overlay-0.mp3
      const match = blob.pathname.match(/panel-(\d+)-overlay-(\d+)\./);
      if (match) {
        audioUrlMap.set(`${match[1]}-${match[2]}`, blob.url);
      }
    }

    // 4. Reconstruct manifest by merging script + discovered media
    let hasAudio = false;
    for (const page of scriptData.pages) {
      for (const panel of page.panels) {
        const imgUrl = panelUrlMap.get(panel.panelIndex);
        if (imgUrl) {
          panel.imageUrl = imgUrl;
        }
        for (let oi = 0; oi < panel.overlays.length; oi++) {
          const audioKey = `${panel.panelIndex}-${oi}`;
          const audioUrl = audioUrlMap.get(audioKey);
          if (audioUrl) {
            panel.overlays[oi].audioUrl = audioUrl;
            hasAudio = true;
          }
        }
      }
    }

    const panelsWithImages = scriptData.pages
      .flatMap((p) => p.panels)
      .filter((p) => p.imageUrl).length;
    const totalPanels = scriptData.totalPanels;
    const isComplete =
      panelsWithImages === totalPanels && (!hasAudio || audioBlobs.length > 0);

    const manifest: ArticleManifest = {
      title: title || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      slug,
      sourceUrl: sourceUrl || "",
      artStyle: scriptData.artStyle,
      createdAt: new Date().toISOString(),
      totalPanels,
      pages: scriptData.pages,
      scriptUrl: scriptBlobs[0].url,
      placementVersion: 4,
      status: panelsWithImages === totalPanels ? "complete" : "partial",
      ...(hasAudio && { audioEnabled: true }),
    };

    // 5. Save manifest and update index
    await saveManifest(manifest);

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

    const entry: ArticleIndexEntry = {
      title: manifest.title,
      slug: manifest.slug,
      sourceUrl: manifest.sourceUrl,
      artStyleName: manifest.artStyle.name,
      createdAt: manifest.createdAt,
      totalPanels: manifest.totalPanels,
      pageCount: manifest.pages.length,
      thumbnailUrl,
      status: manifest.status,
    };

    await updateArticleIndex(entry);

    return NextResponse.json({
      success: true,
      slug,
      panelsWithImages,
      totalPanels,
      audioClips: audioBlobs.length,
      status: manifest.status,
    });
  } catch (error) {
    console.error("Rescue article error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Rescue failed",
      },
      { status: 500 }
    );
  }
}
