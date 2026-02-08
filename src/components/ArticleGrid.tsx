"use client";

import { useState, useEffect, useCallback } from "react";
import type { ArticleIndexEntry } from "@/lib/types";
import ArticleCard from "./ArticleCard";

export default function ArticleGrid() {
  const [articles, setArticles] = useState<ArticleIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/articles")
      .then((res) => res.json())
      .then((data) => {
        setArticles(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = useCallback(async (slug: string) => {
    const password = prompt("Enter admin password to delete:");
    if (!password) return;

    setDeleting(slug);
    try {
      const res = await fetch("/api/delete-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });
      const data = await res.json();
      if (data.success) {
        setArticles((prev) => prev.filter((a) => a.slug !== slug));
      } else {
        alert(data.error || "Delete failed");
      }
    } catch {
      alert("Network error");
    } finally {
      setDeleting(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading articles...
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <p className="text-lg">No articles yet</p>
        <p className="text-sm mt-1">Generate your first graphic novel above!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {articles.map((article) => (
        <div key={article.slug} className={deleting === article.slug ? "opacity-50 pointer-events-none" : ""}>
          <ArticleCard article={article} onDelete={handleDelete} />
        </div>
      ))}
    </div>
  );
}
