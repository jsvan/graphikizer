import type { ArtStyle } from "./types";

const CONTENT_RULES = `CONTENT RULES:
1. COVER THE KEY ARGUMENTS. Hit every major claim, but combine related points into single panels. Multiple paragraphs can share one panel if they make the same argument.
2. DIALOGUE IS PRIMARY. This is a graphic novel, not an illustrated essay.
   - Direct quotes → dialogue with the real speaker name
   - Positions attributable to a person/country/group → dialogue from that speaker
   - Paraphrased positions ("Critics contend...") → dialogue from a labeled speaker
   - Narration ONLY for transitions and pure exposition. 1-2 sentences max per narration box.
3. Every panel needs at least one overlay. Most panels should have 2-3 overlays. At least half of all panels must have dialogue.
4. Use captions for dates, locations, statistics.
5. SPEAKERS: Consolidate generic voices into a small set like "Analyst", "Official", "Critic".
6. If a point has no concrete visual (no specific person, place, or event), make it a textOnly panel rather than inventing abstract imagery.`;

const PANEL_LAYOUT_RULES = `PANEL LAYOUT ("layout" field):
- "normal" (2-col span, ~60%) — standard panel
- "wide" (3-col span, ~20%) — panoramic, landscapes, establishing shots
- "tall" (2-col, 2-row, ~10%) — vertical, dramatic reveals
- "large" (3-col, 2-row, ~10%) — big moments, splash panels

TEXT-ONLY PANELS ("textOnly" field):
- "textOnly": true → narration/caption rendered on a dark background, no image generated. Keep the artworkPrompt.
- Use for any panel with no dialogue AND no specific person, place, or action to depict. Don't invent abstract/symbolic imagery — use textOnly instead.`;

const OVERLAY_RULES = `TEXT OVERLAYS:
- Types: "narration", "dialogue" (requires "speaker"), "caption" (labels/dates/locations)
- Overlay positioning is auto-computed — do NOT include x, y, anchor, or maxWidthPercent. Focus on content.
- For dialogue, include "characterPosition": where the speaker is in the panel. Values: "center", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right".

FOCAL POINT ("focalPoint" field):
Where the main visual subject is. The layout engine places text AWAY from this point. Vary across panels.
Values: "center", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"`;

const ARTWORK_RULES = `ARTWORK (artworkPrompt field — sent directly to an image AI):
- Concrete visual details only. Describe specific people, places, objects, lighting, composition. 2-4 sentences.
- USE REAL NAMES: "Emmanuel Macron in a dark suit" not "the French leader".
- NEVER include text, words, letters, numbers — they render as gibberish.
- NO abstract/symbolic imagery ("fragmented map representing division", "chess pieces representing power"). If you can't describe a concrete scene, make it a textOnly panel.
- CONTENT SAFETY: No nudity, gore, graphic violence. Show strategy rooms, leaders, maps — not casualties.`;

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
 * Single-pass prompt: generates the complete graphic novel script from the full article.
 */
export function buildScriptPrompt(
  title: string,
  articleText: string
): string {
  return `You are adapting a Foreign Affairs article into a complete graphic novel. A reader who ONLY reads the comic should understand the article's full argument.

ARTICLE: "${title}"

${articleText}

---

${CONTENT_RULES}

PANEL COUNT: Use as many panels as the article needs — typically 30-50 for a full-length article. Combine related arguments into single panels. Start at panelIndex 0 and number sequentially.

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
