import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { PhotoCrop } from "./types";

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
  suggestedCrop: PhotoCrop | null;
}

export interface EvaluationResult {
  narrativeSummary: string;
  recommendedCount: number;
  photos: PhotoEvaluation[];
}

// Claude's vision input is capped per-request; keep evaluation batches under this.
export const MAX_PHOTOS_PER_EVALUATION = 20;

// Claude downscales vision input to fit within ~1568px on the long edge anyway, so
// sending full-resolution phone photos just wastes bandwidth and blows past the
// API's request size limit on larger batches. Resize before base64-encoding.
async function toBase64Image(url: string): Promise<{ mediaType: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(buf)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { mediaType: "image/jpeg", data: resized.toString("base64") };
}

export async function evaluatePhotoSet(
  photos: PhotoInput[],
  narrativeBrief: string,
): Promise<EvaluationResult> {
  if (photos.length === 0) throw new Error("No photos to evaluate");

  const batches: PhotoInput[][] = [];
  for (let i = 0; i < photos.length; i += MAX_PHOTOS_PER_EVALUATION) {
    batches.push(photos.slice(i, i + MAX_PHOTOS_PER_EVALUATION));
  }

  let narrativeSummary = "";
  let results: EvaluationResult[];

  if (narrativeBrief.trim() || batches.length === 1) {
    // Every batch can run against the same (user-given) brief independently.
    results = await Promise.all(batches.map((batch) => evaluateBatch(batch, narrativeBrief)));
    narrativeSummary = results[0]?.narrativeSummary ?? "";
  } else {
    // No brief given: run the first batch alone to infer a narrative, then score the
    // rest against that same inferred narrative (in parallel) instead of each guessing separately.
    const [first, ...rest] = batches;
    const firstResult = await evaluateBatch(first, narrativeBrief);
    narrativeSummary = firstResult.narrativeSummary;
    const restResults = await Promise.all(rest.map((batch) => evaluateBatch(batch, narrativeSummary)));
    results = [firstResult, ...restResults];
  }

  const allPhotos = results.flatMap((r) => r.photos);

  return {
    narrativeSummary,
    recommendedCount: allPhotos.filter((p) => p.recommended).length,
    photos: allPhotos,
  };
}

async function evaluateBatch(photos: PhotoInput[], narrativeBrief: string): Promise<EvaluationResult> {
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
      "If a photo's framing would clearly benefit from a tighter crop (e.g. the subject is small in the frame, or there's a lot of dead space), suggest one as suggestedCrop: fractions from 0 to 1 of the image's width/height, with x,y as the top-left corner. Leave it null when the existing framing is already fine — most photos should get null.",
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
                  suggestedCrop: {
                    type: ["object", "null"],
                    properties: {
                      x: { type: "number", minimum: 0, maximum: 1 },
                      y: { type: "number", minimum: 0, maximum: 1 },
                      width: { type: "number", minimum: 0, maximum: 1 },
                      height: { type: "number", minimum: 0, maximum: 1 },
                    },
                    required: ["x", "y", "width", "height"],
                  },
                },
                required: ["id", "score", "recommended", "reason", "issues", "duplicateOf", "suggestedCrop"],
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
