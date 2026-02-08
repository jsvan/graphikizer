import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { deleteArticleBlobs, removeFromArticleIndex } from "@/lib/blob";
import type { DeleteArticleRequest, DeleteArticleResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DeleteArticleRequest;
    const { slug, password } = body;

    if (!slug || !password) {
      return NextResponse.json<DeleteArticleResponse>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json<DeleteArticleResponse>(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    await deleteArticleBlobs(slug);
    await removeFromArticleIndex(slug);

    return NextResponse.json<DeleteArticleResponse>({ success: true });
  } catch (error) {
    console.error("Delete article error:", error);
    return NextResponse.json<DeleteArticleResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Delete failed",
      },
      { status: 500 }
    );
  }
}
