import type { CharacterVoiceProfile } from "./types";

const NARRATOR_PATTERNS = [
  /^narrator$/i,
  /^author$/i,
  /^the author$/i,
  /\bnarrator\b/i,
  /\bthe author\b/i,
];

export function isNarratorSpeaker(speaker: string): boolean {
  return NARRATOR_PATTERNS.some((pattern) => pattern.test(speaker.trim()));
}

/**
 * Build CharacterVoiceProfile[] from a map of speaker → { voiceId, description }.
 * Produced after the describe-voices + create-voice pipeline completes.
 */
export function buildVoiceProfiles(
  voiceMap: Record<string, { voiceId: string; description: string }>
): CharacterVoiceProfile[] {
  return Object.entries(voiceMap).map(([speaker, { voiceId, description }]) => ({
    speaker,
    voiceId,
    voiceDescription: description,
    isNarrator: isNarratorSpeaker(speaker),
  }));
}
