import type { ArtStyle } from "./types";

export function buildScriptPrompt(title: string, articleText: string): string {
  return `You are adapting a Foreign Affairs article into a graphic novel. Your #1 goal: a reader who ONLY reads the comic should understand the article's full argument — every major claim, the evidence behind it, the key actors, and the conclusions. This is an educational tool, not a highlight reel.

ARTICLE TITLE: "${title}"

ARTICLE TEXT:
${articleText}

---

CONTENT RULES (MOST IMPORTANT — read these first):

1. COVER THE ENTIRE ARTICLE. Walk through the article paragraph by paragraph, in order. Do not skip sections. Do not cherry-pick a few quotes and ignore everything else. Every significant argument, data point, and piece of evidence in the article must appear somewhere in the comic's text overlays.

2. NARRATION BOXES CARRY THE SUBSTANCE. Each narration overlay should be 2-4 full sentences of analytical content — the article's actual claims, reasoning, and evidence, rewritten in accessible but substantive language. Do NOT reduce paragraphs to single vague sentences like "Things began to change." Instead, explain WHAT changed, WHY, and what the implications are.

3. EVERY PANEL MUST HAVE AT LEAST ONE TEXT OVERLAY. Most panels should have 2 overlays (e.g., a narration box plus a caption, or narration plus dialogue). A panel with only a one-sentence caption and nothing else is a wasted panel.

4. USE DIRECT QUOTES GENEROUSLY. When the article quotes someone, include that quote as a "dialogue" overlay with the speaker's name. These bring the comic to life and ground the analysis in real voices.

5. CAPTIONS PROVIDE CONTEXT. Use captions for dates, locations, statistics, and short contextual labels ("Berlin, 2024" or "Defense spending as % of GDP"). These orient the reader.

6. sourceExcerpt FIELD: For each panel, copy the specific passage (1-3 sentences) from the article that the panel is illustrating. This forces you to map panels to actual article content sequentially.

7. AIM FOR 30-40 PANELS across 3-4 pages (~10 panels per page). A 3,000-word article needs this many panels to do justice to its content. If you find yourself with fewer than 25 panels, you are summarizing too aggressively.

---

ART STYLE:
Choose ONE style that matches the article's tone:
- "Cold War Propaganda Poster" — bold, flat colors, heroic/ominous. Geopolitics, power rivalry.
- "European Ligne Claire" — clean outlines, flat fills (Tintin). European politics, diplomacy.
- "Dark Graphic Novel" — heavy shadows, muted palette. Conflict, security, dark topics.
- "Watercolor Editorial" — soft washes, expressive. Cultural, humanitarian, reflective.
- "Retro-Futurist" — mid-century sci-fi. Technology, AI, future-focused.
- "Ukiyo-e Inspired" — Japanese woodblock style. East Asian geopolitics.
- "Socialist Realism" — monumental figures, warm palette. Authoritarianism, state power.
- Or invent a style if none fit.

PANEL LAYOUT (each panel gets a "layout" field):
- "normal" (2-col span, ~60%) — standard panel
- "wide" (3-col span, ~20%) — panoramic, landscapes, maps, establishing shots
- "tall" (2-col, 2-row, ~10%) — vertical, tall figures, buildings, dramatic reveals
- "large" (3-col, 2-row, ~10%) — big moments, splash panels

TEXT OVERLAY POSITIONING:
- x (0-100): horizontal position, left to right
- y (0-100): vertical position, top to bottom
- anchor: "top-left", "top-right", "bottom-left", "bottom-right", or "center"
- maxWidthPercent: width of text box as % of panel (default 40, use 35-50 for narration)
- Types: "narration" (analytical content, in corners), "dialogue" (quotes, needs "speaker" field, near speaker), "caption" (labels/dates/locations, at edges)

ARTWORK DESCRIPTIONS:
- NEVER include text, words, letters, numbers, labels, or writing in artwork descriptions
- Describe ONLY visual imagery: people, places, objects, lighting, composition, mood
- 2-4 sentences per description, vivid and specific
- Reference the chosen art style in each description
- Include composition details: foreground/background, camera angle, lighting

---

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
          "sourceExcerpt": "The specific passage from the article this panel covers",
          "layout": "wide",
          "overlays": [
            {
              "type": "narration",
              "text": "2-4 sentences of substantive analytical content from the article...",
              "x": 5,
              "y": 5,
              "anchor": "top-left",
              "maxWidthPercent": 40
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
