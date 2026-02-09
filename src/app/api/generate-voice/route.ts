import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { uploadAudioClip } from "@/lib/blob";
import type { GenerateVoiceRequest, GenerateVoiceResponse } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateVoiceRequest;
    const { text, speaker, voiceId, slug, panelIndex, overlayIndex, password } =
      body;

    if (
      !text ||
      !speaker ||
      !voiceId ||
      !slug ||
      panelIndex === undefined ||
      overlayIndex === undefined ||
      !password
    ) {
      return NextResponse.json<GenerateVoiceResponse>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json<GenerateVoiceResponse>(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json<GenerateVoiceResponse>(
        {
          success: false,
          error:
            "ElevenLabs API key required for voice generation. Set ELEVENLABS_API_KEY in environment variables.",
        },
        { status: 500 }
      );
    }

    // Call ElevenLabs TTS API
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error(
        `ElevenLabs TTS error for "${speaker}" (panel ${panelIndex}, overlay ${overlayIndex}):`,
        errText
      );
      return NextResponse.json<GenerateVoiceResponse>(
        {
          success: false,
          error: `ElevenLabs TTS failed (${ttsRes.status}): ${errText.slice(0, 200)}`,
        },
        { status: 500 }
      );
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    if (audioBuffer.length < 100) {
      return NextResponse.json<GenerateVoiceResponse>(
        {
          success: false,
          error: `Audio too small (${audioBuffer.length} bytes), likely failed`,
        },
        { status: 500 }
      );
    }

    const audioUrl = await uploadAudioClip(
      audioBuffer,
      slug,
      panelIndex,
      overlayIndex
    );

    return NextResponse.json<GenerateVoiceResponse>({
      success: true,
      audioUrl,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error);
    console.error("Voice generation error:", msg);
    return NextResponse.json<GenerateVoiceResponse>(
      { success: false, error: msg || "Voice generation failed" },
      { status: 500 }
    );
  }
}
