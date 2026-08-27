export interface EnhancementVersion {
  id: string;
  historyId: string;
  prompt: string;
  feedback?: string;
  status: "pending" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
  createdAt: string;
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
