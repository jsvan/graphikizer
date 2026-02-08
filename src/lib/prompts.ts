import type { ArtStyle } from "./types";

export function buildScriptPrompt(title: string, articleText: string): string {
  return `You are a graphic novel script writer adapting a Foreign Affairs article into a visually compelling comic.

ARTICLE TITLE: "${title}"

ARTICLE TEXT:
${articleText}

---

YOUR TASK:
1. Read the article carefully. Understand the argument, key actors, geographic context, and emotional tone.
2. Choose an art style that fits the article's subject matter (see style guidelines below).
3. Break the article into 25-40 panels organized into pages of ~10 panels each.
4. For each panel, write a detailed artwork description and position text overlays.

ART STYLE GUIDELINES:
Choose ONE style that matches the article's content and tone. Examples:
- "Cold War Propaganda Poster" — bold, flat colors, heroic/ominous figures. Good for geopolitics, power rivalry.
- "European Ligne Claire" — clean outlines, flat color fills (Tintin-like). Good for European politics, diplomacy.
- "Dark Graphic Novel" — heavy shadows, muted palette, gritty. Good for conflict, security, dark topics.
- "Watercolor Editorial" — soft washes, expressive. Good for cultural, humanitarian, or reflective pieces.
- "Retro-Futurist" — mid-century sci-fi aesthetic. Good for technology, AI, space, future-focused articles.
- "Ukiyo-e Inspired" — Japanese woodblock print style. Good for East Asian geopolitics.
- "Socialist Realism" — monumental figures, warm palette. Good for articles about authoritarianism, state power.
- You may invent a different style if none of these fit.

PANEL LAYOUT:
Each panel gets a "layout" field:
- "normal" (2-col span, ~60% of panels) — standard rectangular panel
- "wide" (3-col span, ~20%) — panoramic, good for landscapes, establishing shots, maps
- "tall" (2-col, 2-row, ~10%) — vertical, good for tall figures, buildings, dramatic reveals
- "large" (3-col, 2-row, ~10%) — big impact moments, splash panels

TEXT OVERLAY RULES:
Each panel can have 0-3 text overlays. Types:
- "narration" — editorial voice, analysis, context. Position in corners. Use for article's analytical content.
- "dialogue" — quotes from named figures. Include "speaker" field. Position near the speaker.
- "caption" — short labels for dates, locations, data points. Position at top or bottom edges.

Position overlays using x (0-100, left to right) and y (0-100, top to bottom) percentages.
Use "anchor" to control positioning: "top-left", "top-right", "bottom-left", "bottom-right", "center".
Set "maxWidthPercent" (default 40) to control text box width.

CRITICAL — ARTWORK DESCRIPTION RULES:
- NEVER include any text, words, letters, numbers, labels, or writing in artwork descriptions
- Describe only visual imagery: people, places, objects, lighting, composition, mood
- Describe the scene as if instructing an illustrator who will draw it in the chosen art style
- Include composition details: foreground/background, camera angle, lighting
- Reference the chosen art style in each description
- Each description should be 2-4 sentences, vivid and specific

OUTPUT FORMAT (strict JSON):
{
  "artStyle": {
    "name": "Style Name",
    "description": "2-3 sentence description of the style",
    "colorPalette": "Describe the color palette",
    "renderingNotes": "Technical rendering notes for consistency"
  },
  "totalPanels": <number>,
  "pages": [
    {
      "pageNumber": 1,
      "panels": [
        {
          "panelIndex": 0,
          "artworkPrompt": "Detailed visual description for image generation...",
          "sourceExcerpt": "The relevant passage from the article this panel illustrates",
          "layout": "wide",
          "overlays": [
            {
              "type": "narration",
              "text": "The narration text here...",
              "x": 5,
              "y": 5,
              "anchor": "top-left",
              "maxWidthPercent": 35
            }
          ]
        }
      ]
    }
  ]
}

Respond ONLY with valid JSON. No markdown, no explanation.`;
}

export function buildPanelImagePrompt(
  artworkPrompt: string,
  artStyle: ArtStyle
): string {
  return `Create a graphic novel panel in the "${artStyle.name}" style.

Style details: ${artStyle.description}
Color palette: ${artStyle.colorPalette}
Rendering: ${artStyle.renderingNotes}

SCENE: ${artworkPrompt}

CRITICAL RULES:
- DO NOT include ANY text, words, letters, numbers, labels, signs, speech bubbles, captions, or writing of any kind in the image
- NO text overlays, watermarks, or typography
- The image must be PURELY visual artwork with ZERO text elements
- Render in the specified art style with consistent quality
- Fill the entire frame with the scene, no borders or margins`;
}
