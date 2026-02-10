import { notFound } from "next/navigation";
import { getManifest, saveManifest } from "@/lib/blob";
import { placeOverlays } from "@/lib/bubblePlacement";
import ComicReader from "@/components/ComicReader";

/** Current placement algorithm version. Bump to re-run on all articles. */
const PLACEMENT_VERSION = 4;

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const manifest = await getManifest(slug);

  if (!manifest) {
    notFound();
  }

  // Migrate overlay placement if needed
  if ((manifest.placementVersion ?? 0) < PLACEMENT_VERSION) {
    for (const page of manifest.pages) {
      for (const panel of page.panels) {
        if (!panel.textOnly) {
          placeOverlays(panel.overlays, panel.layout, panel.focalPoint);
        }
      }
    }
    manifest.placementVersion = PLACEMENT_VERSION;
    // Fire-and-forget save — don't block rendering
    saveManifest(manifest).catch(() => {});
  }

  return <ComicReader manifest={manifest} />;
}
