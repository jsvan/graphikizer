import type { ArtStyle } from "./types";

const CONTENT_RULES = `CONTENT RULES:
1. COVER EVERY ARGUMENT. Walk through the section paragraph by paragraph. Do not skip significant arguments, data, or evidence.
2. DIALOGUE IS PRIMARY. This is a graphic novel, not an illustrated essay.
   - Direct quotes → dialogue with the real speaker name
   - Positions attributable to a person/country/group → dialogue ("Finland believes X" → speech from that speaker)
   - Paraphrased positions ("Critics contend...") → dialogue from a named or labeled speaker
   - Narration ONLY for transitions, background context, pure exposition. Keep narration to 1-2 sentences max.
3. Every panel needs at least one overlay. Most panels should have 2-3. At least half of all panels must have dialogue.
4. Use captions liberally for dates, locations, statistics, and contextual labels.
5. SPEAKERS: Use consistent names. Consolidate generic voices (analysts, officials, experts) into a small set like "Analyst", "Official", "Critic" — don't invent unique names for each.`;

const PANEL_LAYOUT_RULES = `PANEL LAYOUT ("layout" field):
- "normal" (2-col span, ~60%) — standard panel
- "wide" (3-col span, ~20%) — panoramic, landscapes, establishing shots
- "tall" (2-col, 2-row, ~10%) — vertical, dramatic reveals
- "large" (3-col, 2-row, ~10%) — big moments, splash panels

TEXT-ONLY PANELS ("textOnly" field):
- Set "textOnly": true for panels that are purely narration/caption transitions with no strong visual.
- Text-only panels still need an artworkPrompt (for metadata) but no image is generated.
- Do NOT use textOnly for dialogue panels, action, or panels with specific visual subjects.
- Typically 0-2 per section. Most panels should have images.`;

const OVERLAY_RULES = `TEXT OVERLAYS:
- Types: "narration", "dialogue" (requires "speaker"), "caption" (labels/dates/locations)
- Overlay positioning is auto-computed — do NOT include x, y, anchor, or maxWidthPercent. Focus on content.
- For dialogue, include "characterPosition": where the speaker is in the panel. Values: "center", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right".

FOCAL POINT ("focalPoint" field):
Where the main visual subject is. The layout engine places text AWAY from this point. Vary across panels.
Values: "center", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"`;

const ARTWORK_RULES = `ARTWORK (artworkPrompt field — sent directly to an image AI):
- Image-prompt style: concrete visual details, specific and literal. No metaphors or abstract concepts.
- NEVER include text, words, letters, numbers, or labels — they render as gibberish.
- Describe: specific people, places, objects, lighting, composition, camera angle. 2-4 vivid sentences.
- USE REAL NAMES: "Emmanuel Macron in a dark suit" not "the French leader".
- CONTENT SAFETY: No nudity, gore, graphic violence, or sexual content. Depict conflict through body language, symbolic imagery, and dramatic composition. Show strategy rooms, leaders, maps — not casualties.`;

const ART_STYLE_OPTIONS = `ART STYLE — choose ONE matching the article's tone. Don't default to dark/gritty — most FA articles are analytical. Prefer color and visual variety.
- "European Ligne Claire" — clean outlines, vivid fills (Tintin). Politics, diplomacy.
- "Watercolor Editorial" — soft washes, warm colors. Cultural, humanitarian, economic.
- "Cold War Propaganda Poster" — bold saturated flats, heroic compositions. Power rivalry.
- "Retro-Futurist" — mid-century sci-fi. Technology, AI, future.
- "Pop Art Political" — Lichtenstein-style, halftone dots. Elections, personalities.
- "Ukiyo-e Inspired" — Japanese woodblock. East Asian geopolitics.
- "Socialist Realism" — monumental figures, earthy palette. Authoritarianism.
- "Dark Graphic Novel" — heavy shadows, muted palette. ONLY for active conflict/crisis.
- Or invent a style if none fit.`;

/**
 * Prompt for the first chunk of an article. Picks art style and generates initial panels.
 */
export function buildFirstChunkPrompt(
  title: string,
  articleChunk: string,
  chunkNumber: number,
  totalChunks: number
): string {
  return `You are adapting a Foreign Affairs article into a graphic novel, section by section. This is section ${chunkNumber} of ${totalChunks}. A reader who ONLY reads the comic should understand the article's full argument.

ARTICLE: "${title}"

SECTION ${chunkNumber}/${totalChunks}:
${articleChunk}

---

${CONTENT_RULES}

PANEL COUNT: Aim for roughly 5-8 panels, but use as many or as few as needed to cover all the content. A short transitional section might need only 3; a dense section with many arguments might need 10. Don't pad with filler and don't cram too much into one panel. Start at panelIndex 0.

${ART_STYLE_OPTIONS}

Start each artworkPrompt with the style name (e.g., "In European Ligne Claire style, ...").

${PANEL_LAYOUT_RULES}

${OVERLAY_RULES}

${ARTWORK_RULES}

---

OUTPUT FORMAT (strict JSON):
{
  "artStyle": {
    "name": "Style Name",
    "description": "2-3 sentence description",
    "colorPalette": "Describe the palette",
    "renderingNotes": "Technical notes for consistency"
  },
  "panels": [
    {
      "panelIndex": 0,
      "artworkPrompt": "In [Style] style, ...",
      "layout": "wide",
      "focalPoint": "center",
      "textOnly": false,
      "overlays": [
        { "type": "narration", "text": "..." },
        { "type": "dialogue", "speaker": "Name", "text": "...", "characterPosition": "left" }
      ]
    }
  ]
}

Respond ONLY with valid JSON. No markdown fences, no explanation.`;
}

/**
 * Prompt for continuation chunks. Receives the art style and continues panel numbering.
 */
export function buildContinuationChunkPrompt(
  title: string,
  articleChunk: string,
  artStyle: ArtStyle,
  startPanelIndex: number,
  chunkNumber: number,
  totalChunks: number
): string {
  return `Continuing a graphic novel adaptation. Section ${chunkNumber} of ${totalChunks}. Cover ALL content thoroughly.

ARTICLE: "${title}"

ART STYLE (use exactly):
- Name: "${artStyle.name}"
- Description: ${artStyle.description}
- Color Palette: ${artStyle.colorPalette}
- Rendering: ${artStyle.renderingNotes}

Start each artworkPrompt with: "In ${artStyle.name} style, ..."
Continue from panelIndex ${startPanelIndex}.

SECTION ${chunkNumber}/${totalChunks}:
${articleChunk}

---

${CONTENT_RULES}

PANEL COUNT: Aim for roughly 5-8 panels, but use as many or as few as needed. Don't pad with filler and don't cram too much into one panel. Start at panelIndex ${startPanelIndex}.

${PANEL_LAYOUT_RULES}

${OVERLAY_RULES}

${ARTWORK_RULES}

---

OUTPUT FORMAT (strict JSON):
{
  "panels": [
    {
      "panelIndex": ${startPanelIndex},
      "artworkPrompt": "In ${artStyle.name} style, ...",
      "layout": "normal",
      "focalPoint": "left",
      "textOnly": false,
      "overlays": [
        { "type": "dialogue", "speaker": "Name", "text": "...", "characterPosition": "left" }
      ]
    }
  ]
}

Respond ONLY with valid JSON. No markdown fences, no explanation.`;
}

export function buildPanelImagePrompt(
  artworkPrompt: string,
  artStyle: ArtStyle
): string {
  return `Create a graphic novel panel in the "${artStyle.name}" style.

Style: ${artStyle.description}
Palette: ${artStyle.colorPalette}
Rendering: ${artStyle.renderingNotes}

SCENE: ${artworkPrompt}

RULES:
- NO text, words, letters, numbers, labels, signs, speech bubbles, or writing of any kind
- Purely visual artwork, zero text elements
- Fill the entire frame, no borders or margins`;
}
