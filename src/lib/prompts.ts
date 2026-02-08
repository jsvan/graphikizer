import type { ArtStyle } from "./types";

export function buildScriptPrompt(title: string, articleText: string): string {
  return `You are adapting a Foreign Affairs article into a graphic novel. Your #1 goal: a reader who ONLY reads the comic should understand the article's full argument — every major claim, the evidence behind it, the key actors, and the conclusions. This is an educational tool, not a highlight reel.

ARTICLE TITLE: "${title}"

ARTICLE TEXT:
${articleText}

---

CONTENT RULES (MOST IMPORTANT — read these first):

1. COVER THE ENTIRE ARTICLE. Walk through the article paragraph by paragraph, in order. Do not skip sections. Every significant argument, data point, and piece of evidence must appear in the comic.

2. DIALOGUE IS THE PRIMARY VEHICLE. This is a graphic novel, not an essay with pictures. The majority of content should be delivered through speech bubbles, not narration boxes. Follow these priorities:
   a. DIRECT QUOTES from the article → dialogue overlay with real speaker name. Use the exact quote.
   b. ARGUMENTS AND POSITIONS attributable to a person, country, or group → put them in a speech bubble. If the article says "Finland believes X" or "Stubb argues Y", that's dialogue for that speaker. If a paragraph presents someone's worldview, let them say it.
   c. PARAPHRASED POSITIONS → create dialogue. If the article says "Critics contend that..." or "The global South demands...", write a speech bubble from a named representative or a labeled group spokesperson.
   d. NARRATION ONLY for transitions, background context, and pure exposition that cannot be attributed to any actor. Narration should be short (1-2 sentences max) — just enough to bridge between dialogue panels. If you find yourself writing a 3-4 sentence narration box, ask: could a character say this instead?

3. EVERY PANEL MUST HAVE AT LEAST ONE TEXT OVERLAY. Most panels should have 2-3 overlays. The ideal panel: a dialogue bubble + a caption (date/location). Or two characters in conversation. Panels with only narration should be the exception, not the rule.

4. AT LEAST 50% OF ALL PANELS must contain a dialogue overlay. If your script has 35 panels, at least 18 should have speech bubbles. Count them before finalizing.

5. CAPTIONS PROVIDE CONTEXT. Use captions liberally for dates, locations, statistics, and contextual labels ("Helsinki, 1975", "UN Security Council", "70% of global trade under WTO rules"). These orient the reader and reduce the need for narration.

6. sourceExcerpt FIELD: For each panel, copy the specific passage (1-3 sentences) from the article that the panel is illustrating. This maps panels to actual article content sequentially.

7. AIM FOR 30-40 PANELS across 3-4 pages (~10 panels per page). A 3,000-word article needs this many panels to do justice to its content.

8. VARY OVERLAY POSITIONS. Do NOT put every overlay at x:5, y:5. Dialogue should be positioned near the speaker (often upper portion of panel). Narration can go in corners. Captions at top or bottom edges. Use the full range of positions and anchors.

---

ART STYLE:
Choose ONE style that matches the article's tone. DO NOT default to dark/gritty styles — most Foreign Affairs articles are analytical, not apocalyptic. Prefer styles with color, energy, and visual variety. Only use dark palettes when the article is genuinely about tragedy, war, or crisis.
- "European Ligne Claire" — clean outlines, flat vivid fills (Tintin/Hergé). Great default for politics, diplomacy, international relations.
- "Watercolor Editorial" — soft washes, warm expressive colors. Cultural, humanitarian, economic, or reflective pieces.
- "Cold War Propaganda Poster" — bold, saturated flat colors, heroic/dramatic compositions. Power rivalry, strategic competition.
- "Retro-Futurist" — mid-century sci-fi aesthetic, optimistic palette. Technology, AI, space, future-focused.
- "Pop Art Political" — Lichtenstein-style bold colors, halftone dots, high contrast. Domestic politics, elections, personalities.
- "Ukiyo-e Inspired" — Japanese woodblock style, rich natural palette. East Asian geopolitics.
- "Socialist Realism" — monumental figures, warm earthy palette. Authoritarianism, state power.
- "Dark Graphic Novel" — heavy shadows, muted palette. ONLY for articles specifically about active conflict, violence, or humanitarian crisis.
- Or invent a style if none fit. Be creative — match the article's actual subject, not a generic "serious = dark" assumption.

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

ARTWORK DESCRIPTIONS (artworkPrompt field):
The artworkPrompt for each panel will be sent directly to an AI image generation model (FLUX) as its prompt. Write it accordingly — this is a prompt for an image AI, not prose for a human reader.
- Write in image-prompt style: concrete visual details, comma-separated descriptors, specific and literal. The image model cannot interpret metaphors, abstract concepts, or narrative context — it only renders what you literally describe.
- NEVER include text, words, letters, numbers, labels, or writing in the prompt — the image model will render them as garbled gibberish.
- Describe ONLY visual imagery: specific people, specific places, objects, lighting, composition, mood, camera angle, foreground/background.
- Start each prompt by naming the art style (e.g., "In European Ligne Claire style, ...").
- 2-4 sentences, vivid and specific. Favor concrete nouns and adjectives over abstract descriptions.
- USE REAL NAMES, NOT GENERIC TITLES. Write "Emmanuel Macron in a dark suit" not "the French leader", "Olaf Scholz at a podium" not "the German chancellor". When the article names a person, your prompt must use that specific name. Generic descriptions produce generic clip-art; named people produce recognizable, grounded imagery.
- BAD: "A scene showing the tension between European powers over defense spending" (abstract, the image model can't render 'tension' or 'defense spending')
- GOOD: "In European Ligne Claire style, Emmanuel Macron and Olaf Scholz seated across a long oak table in the Élysée Palace, Macron leaning forward with hands clasped, Scholz looking down at documents, warm overhead lighting casting long shadows, French and German flags in the background"

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
