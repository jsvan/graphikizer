"use client";

import Link from "next/link";
import type { ArticleIndexEntry } from "@/lib/types";

interface ArticleCardProps {
  article: ArticleIndexEntry;
  onDelete?: (slug: string) => void;
}

export default function ArticleCard({ article, onDelete }: ArticleCardProps) {
  const date = new Date(article.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="group relative bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-amber-400/50 transition-all hover:shadow-lg hover:shadow-amber-400/5">
      {onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(article.slug);
          }}
          className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800/90 text-gray-400 hover:bg-red-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
          title="Delete article"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <Link href={`/article/${article.slug}`}>
        {/* Thumbnail */}
        <div className="aspect-[4/3] bg-gray-800 overflow-hidden">
          {article.thumbnailUrl ? (
            <img
              src={article.thumbnailUrl}
              alt={article.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600">
              No preview
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="text-gray-100 font-semibold text-lg leading-tight group-hover:text-amber-400 transition-colors">
            {article.title}
          </h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className="text-amber-400/70">{article.artStyleName}</span>
            <span>&middot;</span>
            <span>{article.totalPanels} panels</span>
            <span>&middot;</span>
            <span>{date}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
