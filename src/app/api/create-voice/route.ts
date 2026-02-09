import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import type { CreateVoiceRequest, CreateVoiceResponse } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateVoiceRequest;
    const { voiceDescription, speakerLabel, sampleText, password } = body;

    if (!voiceDescription || !speakerLabel || !sampleText || !password) {
      return NextResponse.json<CreateVoiceResponse>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json<CreateVoiceResponse>(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json<CreateVoiceResponse>(
        { success: false, error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    // Cap at exactly 100 chars (API minimum) to minimize credit usage —
    // Voice Design synthesizes audio from this text, costing 1 credit/char
    const trimmedSample = sampleText.slice(0, 100);
    const paddedSample =
      trimmedSample.length < 100
        ? (trimmedSample + " This is a sample of how I speak naturally.").slice(0, 100)
        : trimmedSample;

    // Step 1: Design a voice from the description
    console.log(`[CreateVoice] Designing voice for "${speakerLabel}": ${voiceDescription}`);
    const designRes = await fetch("https://api.elevenlabs.io/v1/text-to-voice/design", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        voice_description: voiceDescription,
        text: paddedSample,
        auto_generate_text: false,
      }),
    });

    if (!designRes.ok) {
      const errText = await designRes.text();
      console.error(`[CreateVoice] Design failed for "${speakerLabel}":`, errText);
      return NextResponse.json<CreateVoiceResponse>(
        {
          success: false,
          error: `Voice Design failed (${designRes.status}): ${errText.slice(0, 200)}`,
        },
        { status: 500 }
      );
    }

    const designData = await designRes.json();
    const generatedVoiceId = designData?.previews?.[0]?.generated_voice_id;

    if (!generatedVoiceId) {
      console.error(`[CreateVoice] No generated_voice_id for "${speakerLabel}"`, designData);
      return NextResponse.json<CreateVoiceResponse>(
        { success: false, error: "Voice Design returned no preview" },
        { status: 500 }
      );
    }

    console.log(`[CreateVoice] Got preview for "${speakerLabel}": ${generatedVoiceId}`);

    // Step 2: Save the preview as a permanent voice
    const saveRes = await fetch("https://api.elevenlabs.io/v1/text-to-voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        voice_name: `graphikizer-${speakerLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
        voice_description: voiceDescription,
        generated_voice_id: generatedVoiceId,
      }),
    });

    if (!saveRes.ok) {
      const errText = await saveRes.text();
      console.error(`[CreateVoice] Save failed for "${speakerLabel}":`, errText);
      return NextResponse.json<CreateVoiceResponse>(
        {
          success: false,
          error: `Voice save failed (${saveRes.status}): ${errText.slice(0, 200)}`,
        },
        { status: 500 }
      );
    }

    const saveData = await saveRes.json();
    const voiceId = saveData?.voice_id;

    if (!voiceId) {
      console.error(`[CreateVoice] No voice_id returned for "${speakerLabel}"`, saveData);
      return NextResponse.json<CreateVoiceResponse>(
        { success: false, error: "Voice save returned no voice_id" },
        { status: 500 }
      );
    }

    console.log(`[CreateVoice] Created permanent voice for "${speakerLabel}": ${voiceId}`);

    return NextResponse.json<CreateVoiceResponse>({
      success: true,
      voiceId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Create voice error:", msg);
    return NextResponse.json<CreateVoiceResponse>(
      { success: false, error: msg || "Voice creation failed" },
      { status: 500 }
    );
  }
}
