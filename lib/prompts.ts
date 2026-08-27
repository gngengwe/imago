export function buildEnhancementPrompt(narrativeSummary: string, feedback?: string): string {
  const base = [
    "Retouch this photo to a professional editorial standard: correct exposure and white balance,",
    "deepen contrast tastefully, sharpen fine detail, smooth harsh shadows, and remove sensor dust,",
    "blemishes, and distracting background clutter.",
    "Keep the subject, composition, framing, and people's likeness exactly as in the original photo —",
    "this is a retouch, not a reimagining.",
    `Match the tone of a professional photo essay about: ${narrativeSummary || "this set of photos"}.`,
  ].join(" ");

  return feedback ? `${base}\n\nAdditional revision requested by the reviewer: ${feedback}` : base;
}
