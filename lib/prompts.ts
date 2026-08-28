import type { EnhancementStyleId } from "./types";

export const ENHANCEMENT_STYLES: Record<EnhancementStyleId, { label: string; instruction: string }> = {
  natural: {
    label: "Natural correction",
    instruction:
      "Correct exposure and white balance only. Keep colors true-to-life and understated — a light, honest cleanup, not a stylized grade.",
  },
  editorial: {
    label: "Warm editorial",
    instruction:
      "Apply a warm, inviting color grade with soft contrast and gentle sharpening, like a professional photo essay.",
  },
  dramatic: {
    label: "Dramatic B&W",
    instruction:
      "Convert to rich black and white with deep, dramatic contrast and strong shadow detail.",
  },
};

const IDENTITY_CLAUSE =
  "Preserve every person's exact facial identity, expression, and likeness — do not beautify, reshape, or morph any face.";

export function buildEnhancementPrompt(
  narrativeSummary: string,
  styleId: EnhancementStyleId,
  feedback?: string,
): string {
  const style = ENHANCEMENT_STYLES[styleId] ?? ENHANCEMENT_STYLES.editorial;

  const base = [
    `Retouch this photo: ${style.instruction}`,
    "Remove sensor dust, blemishes, and distracting background clutter; smooth harsh shadows.",
    "Keep the subject, composition, and framing exactly as in the original photo — this is a retouch, not a reimagining.",
    IDENTITY_CLAUSE,
    `Match the tone of a professional photo essay about: ${narrativeSummary || "this set of photos"}.`,
  ].join(" ");

  return feedback ? `${base}\n\nAdditional revision requested by the reviewer: ${feedback}` : base;
}
