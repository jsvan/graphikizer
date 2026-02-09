import { put, list, del } from "@vercel/blob";
import type { ArticleIndexEntry, ArticleManifest } from "./types";

export async function checkPanelExists(
  slug: string,
  panelIndex: number
): Promise<string | null> {
  try {
    const paddedIndex = String(panelIndex).padStart(3, "0");
    const prefix = `articles/${slug}/panels/panel-${paddedIndex}`;
    const { blobs } = await list({ prefix });
    if (blobs.length > 0) {
      return blobs[0].url;
    }
    return null;
  } catch {
    return null;
  }
}

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
    allowOverwrite: true,
  });

  return blob.url;
}

export async function saveManifest(manifest: ArticleManifest): Promise<string> {
  const pathname = `articles/${manifest.slug}/manifest.json`;

  const blob = await put(pathname, JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
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
    allowOverwrite: true,
  });
}

export async function removeFromArticleIndex(slug: string): Promise<void> {
  const existing = await getArticleIndex();
  const filtered = existing.filter((e) => e.slug !== slug);

  await put("articles/index.json", JSON.stringify(filtered, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function deleteArticleBlobs(slug: string): Promise<void> {
  // List all blobs under the article's prefix and delete them
  let cursor: string | undefined;
  const urls: string[] = [];

  do {
    const result = await list({ prefix: `articles/${slug}/`, cursor });
    urls.push(...result.blobs.map((b) => b.url));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  if (urls.length > 0) {
    await del(urls);
  }
}

export async function saveScript(slug: string, rawJson: string): Promise<string> {
  const pathname = `articles/${slug}/script.json`;

  const blob = await put(pathname, rawJson, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return blob.url;
}

export async function uploadAudioClip(
  audioBuffer: Buffer,
  slug: string,
  panelIndex: number,
  overlayIndex: number
): Promise<string> {
  const pathname = `articles/${slug}/audio/panel-${panelIndex}-overlay-${overlayIndex}.mp3`;

  const blob = await put(pathname, audioBuffer, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return blob.url;
}

export async function getScriptUrl(slug: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: `articles/${slug}/script.json` });
    if (blobs.length === 0) return null;
    return blobs[0].url;
  } catch {
    return null;
  }
}
