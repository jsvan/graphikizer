import type { ArtStyle } from "./types";

const CONTENT_RULES = `CONTENT RULES (MOST IMPORTANT — read these first):

1. COVER EVERY ARGUMENT in this section. Walk through paragraph by paragraph, in order. Do not skip any significant argument, data point, or piece of evidence.

2. DIALOGUE IS THE PRIMARY VEHICLE. This is a graphic novel, not an essay with pictures. The majority of content should be delivered through speech bubbles, not narration boxes. Follow these priorities:
   a. DIRECT QUOTES from the article → dialogue overlay with real speaker name. Use the exact quote.
   b. ARGUMENTS AND POSITIONS attributable to a person, country, or group → put them in a speech bubble. If the article says "Finland believes X" or "Stubb argues Y", that's dialogue for that speaker.
   c. PARAPHRASED POSITIONS → create dialogue. If the article says "Critics contend that..." or "The global South demands...", write a speech bubble from a named representative or a labeled group spokesperson.
   d. NARRATION ONLY for transitions, background context, and pure exposition that cannot be attributed to any actor. Narration should be short (1-2 sentences max). If you find yourself writing a 3-4 sentence narration box, ask: could a character say this instead?

3. EVERY PANEL MUST HAVE AT LEAST ONE TEXT OVERLAY. Most panels should have 2-3 overlays. The ideal panel: a dialogue bubble + a caption (date/location). Or two characters in conversation.

4. AT LEAST 50% OF ALL PANELS must contain a dialogue overlay.

5. CAPTIONS PROVIDE CONTEXT. Use captions liberally for dates, locations, statistics, and contextual labels.

6. sourceExcerpt FIELD: For each panel, copy the specific passage (1-3 sentences) from the article that the panel is illustrating.

7. VARY OVERLAY POSITIONS. Do NOT put every overlay at x:5, y:5. Dialogue should be positioned near the speaker (often upper portion). Narration in corners. Captions at top or bottom edges. Use the full range of positions and anchors.

8. SPEAKER CONSOLIDATION (CRITICAL): Limit the total number of unique speaker names to AT MOST 8-10 across the entire graphic novel. Each speaker requires an expensive custom voice, so consolidation is essential. Follow these rules:
   a. Use the SAME speaker name consistently for the same person across all panels. Do NOT create variants like "Emmanuel Macron" in one panel and "French President" in another — pick ONE name and reuse it.
   b. For unnamed or generic voices (analysts, officials, critics), consolidate into a small set of recurring characters: e.g., "Analyst", "Critic", "Official". Do NOT create unique speakers like "European Defense Analyst", "Strategic Analyst", "Security Expert", "Policy Expert" — merge these into one or two generic speakers.
   c. For groups or collective voices ("European Leaders", "Polish Officials"), attribute them to a generic speaker like "Official" or "Analyst" rather than inventing a new name.
   d. Before creating a new speaker, ask: can an existing speaker deliver this line? If yes, reuse them.`;

const PANEL_LAYOUT_RULES = `PANEL LAYOUT (each panel gets a "layout" field):
- "normal" (2-col span, ~60%) — standard panel
- "wide" (3-col span, ~20%) — panoramic, landscapes, maps, establishing shots
- "tall" (2-col, 2-row, ~10%) — vertical, tall figures, buildings, dramatic reveals
- "large" (3-col, 2-row, ~10%) — big moments, splash panels`;

const OVERLAY_RULES = `TEXT OVERLAYS:
- Types: "narration" (analytical content), "dialogue" (quotes, needs "speaker" field), "caption" (labels/dates/locations)
- Positioning (x, y, anchor, maxWidthPercent) will be computed automatically by the layout engine — you may provide rough values but they will be overridden. Focus on text content, type, and speaker.
- anchor: "top-left", "top-right", "bottom-left", "bottom-right", or "center"
- x (0-100), y (0-100): approximate position hints
- For DIALOGUE overlays, include "characterPosition": where the speaking character is located in the panel composition. Uses same values as focalPoint: "center", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right". This is used for audio playback indicator placement.

FOCAL POINT (each panel gets a "focalPoint" field):
Where is the main visual subject in this panel's composition? The layout engine uses this to place text AWAY from the focal point, so faces and key imagery stay visible. VARY this across panels — not every scene is centered.
Values: "center", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"
- A person speaking on the left → "left" or "top-left"
- Two people facing each other → "center"
- A crowd in the lower half → "bottom"
- A skyline or landscape → "top" or "center"
- A close-up portrait → "center"
- A map or document on a table → "bottom" or "center"`;

const ARTWORK_RULES = `ARTWORK DESCRIPTIONS (artworkPrompt field):
The artworkPrompt for each panel will be sent directly to an AI image generation model (FLUX) as its prompt. Write it accordingly — this is a prompt for an image AI, not prose for a human reader.
- Write in image-prompt style: concrete visual details, comma-separated descriptors, specific and literal. The image model cannot interpret metaphors, abstract concepts, or narrative context — it only renders what you literally describe.
- NEVER include text, words, letters, numbers, labels, or writing in the prompt — the image model will render them as garbled gibberish.
- Describe ONLY visual imagery: specific people, specific places, objects, lighting, composition, mood, camera angle, foreground/background.
- 2-4 sentences, vivid and specific. Favor concrete nouns and adjectives over abstract descriptions.
- USE REAL NAMES, NOT GENERIC TITLES. Write "Emmanuel Macron in a dark suit" not "the French leader", "Olaf Scholz at a podium" not "the German chancellor". When the article names a person, your prompt must use that specific name.
- CONTENT SAFETY: Keep all artwork prompts suitable for general audiences. NEVER describe nudity, gore, graphic violence, blood, torture, sexual content, or gratuitous suffering. Depict conflicts through body language, facial expressions, symbolic imagery (broken objects, shadows, maps with arrows), and dramatic composition — NOT through graphic depictions. For military/war topics, show strategy rooms, leaders at tables, soldiers in formation, maps, equipment — not combat injuries or casualties.
- BAD: "A scene showing the tension between European powers over defense spending" (abstract, the image model can't render 'tension' or 'defense spending')
- GOOD: "In European Ligne Claire style, Emmanuel Macron and Olaf Scholz seated across a long oak table in the Élysée Palace, Macron leaning forward with hands clasped, Scholz looking down at documents, warm overhead lighting casting long shadows, French and German flags in the background"`;

const ART_STYLE_OPTIONS = `ART STYLE:
Choose ONE style that matches the article's tone. DO NOT default to dark/gritty styles — most Foreign Affairs articles are analytical, not apocalyptic. Prefer styles with color, energy, and visual variety. Only use dark palettes when the article is genuinely about tragedy, war, or crisis.
- "European Ligne Claire" — clean outlines, flat vivid fills (Tintin/Hergé). Great default for politics, diplomacy, international relations.
- "Watercolor Editorial" — soft washes, warm expressive colors. Cultural, humanitarian, economic, or reflective pieces.
- "Cold War Propaganda Poster" — bold, saturated flat colors, heroic/dramatic compositions. Power rivalry, strategic competition.
- "Retro-Futurist" — mid-century sci-fi aesthetic, optimistic palette. Technology, AI, space, future-focused.
- "Pop Art Political" — Lichtenstein-style bold colors, halftone dots, high contrast. Domestic politics, elections, personalities.
- "Ukiyo-e Inspired" — Japanese woodblock style, rich natural palette. East Asian geopolitics.
- "Socialist Realism" — monumental figures, warm earthy palette. Authoritarianism, state power.
- "Dark Graphic Novel" — heavy shadows, muted palette. ONLY for articles specifically about active conflict, violence, or humanitarian crisis.
- Or invent a style if none fit. Be creative — match the article's actual subject, not a generic "serious = dark" assumption.`;

/**
 * Prompt for the first chunk of an article. Picks art style and generates initial panels.
 */
export function buildFirstChunkPrompt(
  title: string,
  articleChunk: string,
  chunkNumber: number,
  totalChunks: number
): string {
  return `You are adapting a Foreign Affairs article into a graphic novel, working section by section. This is section ${chunkNumber} of ${totalChunks}. Your #1 goal: a reader who ONLY reads the comic should understand the article's full argument. This is an educational tool, not a highlight reel.

ARTICLE TITLE: "${title}"

THIS SECTION (${chunkNumber}/${totalChunks}):
${articleChunk}

---

${CONTENT_RULES}

Generate EXACTLY 5 to 7 panels for this section (never more than 7). Start at panelIndex 0. Every significant argument and piece of evidence in this section must appear.

---

${ART_STYLE_OPTIONS}

Start each artworkPrompt by naming the chosen art style (e.g., "In European Ligne Claire style, ...").

${PANEL_LAYOUT_RULES}

${OVERLAY_RULES}

${ARTWORK_RULES}

---

OUTPUT FORMAT (strict JSON):
{
  "artStyle": {
    "name": "Style Name",
    "description": "2-3 sentence description of the style",
    "colorPalette": "Describe the color palette",
    "renderingNotes": "Technical rendering notes for consistency"
  },
  "panels": [
    {
      "panelIndex": 0,
      "artworkPrompt": "Detailed visual description for image generation...",
      "sourceExcerpt": "The specific passage from the article this panel covers",
      "layout": "wide",
      "focalPoint": "center",
      "overlays": [
        {
          "type": "narration",
          "text": "Substantive content from the article...",
          "x": 5,
          "y": 5,
          "anchor": "top-left",
          "maxWidthPercent": 40
        },
        {
          "type": "dialogue",
          "speaker": "Speaker Name",
          "text": "What they say...",
          "x": 55,
          "y": 20,
          "anchor": "top-right",
          "maxWidthPercent": 40,
          "characterPosition": "left"
        }
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
  return `You are continuing a graphic novel adaptation of a Foreign Affairs article. This is section ${chunkNumber} of ${totalChunks}. Maintain the same style and quality as previous sections. Cover ALL content in this section thoroughly.

ARTICLE TITLE: "${title}"

ESTABLISHED ART STYLE (use this exactly — do not change):
- Name: "${artStyle.name}"
- Description: ${artStyle.description}
- Color Palette: ${artStyle.colorPalette}
- Rendering: ${artStyle.renderingNotes}

Start each artworkPrompt with: "In ${artStyle.name} style, ..."

CONTINUE FROM panelIndex ${startPanelIndex}.

THIS SECTION (${chunkNumber}/${totalChunks}):
${articleChunk}

---

${CONTENT_RULES}

Generate EXACTLY 5 to 7 panels for this section (never more than 7). Start numbering at panelIndex ${startPanelIndex}. Every significant argument and piece of evidence in this section must appear.

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
      "sourceExcerpt": "The specific passage from the article this panel covers",
      "layout": "normal",
      "focalPoint": "left",
      "overlays": [
        {
          "type": "dialogue",
          "speaker": "Speaker Name",
          "text": "What they say...",
          "x": 55,
          "y": 20,
          "anchor": "top-right",
          "maxWidthPercent": 40,
          "characterPosition": "left"
        }
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
