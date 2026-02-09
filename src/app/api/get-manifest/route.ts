import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { getManifest } from "@/lib/blob";
import type { ArticleManifest } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, password } = body as { slug: string; password: string };

    if (!slug || !password) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
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

    const manifest: ArticleManifest | null = await getManifest(slug);
    if (!manifest) {
      return NextResponse.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, manifest });
  } catch (error) {
    console.error("Get manifest error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get manifest",
      },
      { status: 500 }
    );
  }
}
