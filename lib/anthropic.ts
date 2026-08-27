import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PhotoInput {
  id: string;
  url: string;
  filename: string;
}

export interface PhotoEvaluation {
  id: string;
  score: number;
  recommended: boolean;
  reason: string;
  issues: string[];
  duplicateOf: string | null;
}

export interface EvaluationResult {
  narrativeSummary: string;
  recommendedCount: number;
  photos: PhotoEvaluation[];
}

// Claude's vision input is capped per-request; keep evaluation batches under this.
export const MAX_PHOTOS_PER_EVALUATION = 20;

async function toBase64Image(url: string): Promise<{ mediaType: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image ${url}: ${res.status}`);
  const mediaType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { mediaType, data: buf.toString("base64") };
}

export async function evaluatePhotoSet(
  photos: PhotoInput[],
  narrativeBrief: string,
): Promise<EvaluationResult> {
  if (photos.length === 0) throw new Error("No photos to evaluate");
  if (photos.length > MAX_PHOTOS_PER_EVALUATION) {
    throw new Error(
      `Too many photos (${photos.length}) — evaluate at most ${MAX_PHOTOS_PER_EVALUATION} at a time`,
    );
  }

  const images = await Promise.all(photos.map((p) => toBase64Image(p.url)));

  const content: Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam> = [];
  photos.forEach((p, i) => {
    content.push({ type: "text", text: `Photo id: ${p.id} (filename: ${p.filename})` });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: images[i].mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: images[i].data,
      },
    });
  });

  content.push({
    type: "text",
    text: [
      `Narrative brief from the user: ${
        narrativeBrief.trim() || "(none given — infer the strongest coherent narrative yourself from the photos)"
      }`,
      "",
      "Evaluate this set of photos as material for a single coherent narrative/story.",
      "For each photo, judge relevance to the narrative, technical quality (focus, exposure, composition), and redundancy with other photos in the set — flag near-duplicates/burst shots and keep only the best one of each cluster.",
      "Recommend the subset of photos that best tells the narrative without redundancy — usually somewhere between a third and two-thirds of the set, but use your judgment.",
      "Call the record_evaluation tool with your results.",
    ].join("\n"),
  });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    tools: [
      {
        name: "record_evaluation",
        description: "Record the narrative summary and per-photo evaluation for this photo set.",
        input_schema: {
          type: "object",
          properties: {
            narrativeSummary: {
              type: "string",
              description: "A one or two sentence description of the narrative this photo set best supports.",
            },
            recommendedCount: {
              type: "integer",
              description: "How many photos should be in the recommended subset.",
            },
            photos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  score: { type: "integer", minimum: 0, maximum: 100 },
                  recommended: { type: "boolean" },
                  reason: { type: "string" },
                  issues: { type: "array", items: { type: "string" } },
                  duplicateOf: { type: ["string", "null"] },
                },
                required: ["id", "score", "recommended", "reason", "issues", "duplicateOf"],
              },
            },
          },
          required: ["narrativeSummary", "recommendedCount", "photos"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_evaluation" },
    messages: [{ role: "user", content }],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  ) as Anthropic.Messages.ToolUseBlock | undefined;
  if (!toolUse) throw new Error("Claude did not return an evaluation");
  return toolUse.input as EvaluationResult;
}
