import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";

export const maxDuration = 60;

interface DeleteVoicesRequest {
  voiceIds: string[];
  password: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DeleteVoicesRequest;
    const { voiceIds, password } = body;

    if (!voiceIds?.length || !password) {
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

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    let deleted = 0;
    let failed = 0;

    // Delete voices sequentially to avoid rate limits
    for (const voiceId of voiceIds) {
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/voices/${voiceId}`,
          {
            method: "DELETE",
            headers: { "xi-api-key": apiKey },
          }
        );

        if (res.ok) {
          deleted++;
          console.log(`[DeleteVoices] Deleted voice ${voiceId}`);
        } else {
          failed++;
          console.warn(
            `[DeleteVoices] Failed to delete ${voiceId}: ${res.status}`
          );
        }
      } catch (err) {
        failed++;
        console.warn(`[DeleteVoices] Error deleting ${voiceId}:`, err);
      }
    }

    console.log(
      `[DeleteVoices] Done: ${deleted} deleted, ${failed} failed out of ${voiceIds.length}`
    );

    return NextResponse.json({ success: true, deleted, failed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Delete voices error:", msg);
    return NextResponse.json(
      { success: false, error: msg || "Voice deletion failed" },
      { status: 500 }
    );
  }
}
