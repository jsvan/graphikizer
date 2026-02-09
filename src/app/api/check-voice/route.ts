import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { password } = (await req.json()) as { password: string };

    if (!password) {
      return NextResponse.json(
        { success: false, error: "Missing password" },
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

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ElevenLabs API key required for voice generation. Set ELEVENLABS_API_KEY in environment variables.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Check failed",
      },
      { status: 500 }
    );
  }
}
