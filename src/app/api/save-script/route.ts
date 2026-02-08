import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { saveScript } from "@/lib/blob";

export async function POST(req: NextRequest) {
  try {
    const { slug, content, password } = await req.json();

    if (!slug || !content || !password) {
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

    const url = await saveScript(slug, content);

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("Save script error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Save failed",
      },
      { status: 500 }
    );
  }
}
