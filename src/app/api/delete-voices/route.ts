import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";

export const maxDuration = 60;

const VOICE_PREFIX = "graphikizer-";

interface DeleteVoicesRequest {
  password: string;
  voiceIds?: string[];
  deleteAll?: boolean; // Delete all graphikizer-* voices
}

async function listGraphikizerVoices(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!res.ok) {
    console.warn(`[DeleteVoices] Failed to list voices: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const voices: { voice_id: string; name: string }[] = data.voices || [];
  return voices
    .filter((v) => v.name.startsWith(VOICE_PREFIX))
    .map((v) => v.voice_id);
}

async function deleteVoiceIds(
  apiKey: string,
  voiceIds: string[]
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;

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

  return { deleted, failed };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DeleteVoicesRequest;
    const { password, voiceIds, deleteAll } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: "Missing password" },
        { status: 400 }
      );
    }

    if (!deleteAll && (!voiceIds || voiceIds.length === 0)) {
      return NextResponse.json(
        { success: false, error: "Provide voiceIds or set deleteAll: true" },
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

    const idsToDelete = deleteAll
      ? await listGraphikizerVoices(apiKey)
      : voiceIds!;

    if (idsToDelete.length === 0) {
      console.log("[DeleteVoices] No voices to delete");
      return NextResponse.json({ success: true, deleted: 0, failed: 0 });
    }

    console.log(
      `[DeleteVoices] Deleting ${idsToDelete.length} voice(s)${deleteAll ? " (all graphikizer-*)" : ""}...`
    );

    const { deleted, failed } = await deleteVoiceIds(apiKey, idsToDelete);

    console.log(
      `[DeleteVoices] Done: ${deleted} deleted, ${failed} failed out of ${idsToDelete.length}`
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
