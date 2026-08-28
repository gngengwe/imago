export type EnhancementStyleId = "natural" | "editorial" | "dramatic";

export interface EnhancementVersion {
  id: string;
  historyId: string;
  model: string;
  styleId: EnhancementStyleId;
  prompt: string;
  feedback?: string;
  status: "pending" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
  createdAt: string;
  // Versions submitted together (e.g. the two models in a compare run) share
  // this so the UI can group them instead of treating each as a plain revision.
  batchId: string;
}

export interface PhotoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoRecord {
  id: string;
  filename: string;
  originalUrl: string;
  score?: number;
  recommended?: boolean;
  reason?: string;
  issues?: string[];
  duplicateOf?: string;
  selected: boolean;
  suggestedCrop?: PhotoCrop;
  useCrop: boolean;
  enhancements: EnhancementVersion[];
  finalVersionId?: string;
}

export type ProjectStatus =
  | "created"
  | "uploaded"
  | "evaluated"
  | "enhancing"
  | "reviewing";

export interface ProjectManifest {
  id: string;
  createdAt: string;
  narrativeBrief: string;
  narrativeSummary?: string;
  recommendedCount?: number;
  status: ProjectStatus;
  photos: PhotoRecord[];
}
