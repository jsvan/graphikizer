import { notFound } from "next/navigation";
import { getManifest } from "@/lib/blob";
import ComicReader from "@/components/ComicReader";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const manifest = await getManifest(slug);

  if (!manifest) {
    notFound();
  }

  return <ComicReader manifest={manifest} />;
}
