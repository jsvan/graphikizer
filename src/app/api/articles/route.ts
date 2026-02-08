import { NextResponse } from "next/server";
import { getArticleIndex } from "@/lib/blob";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const articles = await getArticleIndex();
    return NextResponse.json(articles);
  } catch (error) {
    console.error("List articles error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
