import { put, list } from "@vercel/blob";
import type { ArticleIndexEntry, ArticleManifest } from "./types";

export async function uploadPanelImage(
  imageBuffer: Buffer,
  slug: string,
  panelIndex: number
): Promise<string> {
  const paddedIndex = String(panelIndex).padStart(3, "0");
  const pathname = `articles/${slug}/panels/panel-${paddedIndex}.webp`;

  const blob = await put(pathname, imageBuffer, {
    access: "public",
    contentType: "image/webp",
    addRandomSuffix: false,
  });

  return blob.url;
}

export async function saveManifest(manifest: ArticleManifest): Promise<string> {
  const pathname = `articles/${manifest.slug}/manifest.json`;

  const blob = await put(pathname, JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });

  return blob.url;
}

export async function getManifest(slug: string): Promise<ArticleManifest | null> {
  try {
    const { blobs } = await list({ prefix: `articles/${slug}/manifest.json` });
    if (blobs.length === 0) return null;

    const response = await fetch(blobs[0].url);
    if (!response.ok) return null;

    return (await response.json()) as ArticleManifest;
  } catch {
    return null;
  }
}

export async function getArticleIndex(): Promise<ArticleIndexEntry[]> {
  try {
    const { blobs } = await list({ prefix: "articles/index.json" });
    if (blobs.length === 0) return [];

    const response = await fetch(blobs[0].url);
    if (!response.ok) return [];

    return (await response.json()) as ArticleIndexEntry[];
  } catch {
    return [];
  }
}

export async function updateArticleIndex(entry: ArticleIndexEntry): Promise<void> {
  const existing = await getArticleIndex();

  // Replace if slug exists, otherwise append
  const index = existing.findIndex((e) => e.slug === entry.slug);
  if (index >= 0) {
    existing[index] = entry;
  } else {
    existing.unshift(entry);
  }

  await put("articles/index.json", JSON.stringify(existing, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}
