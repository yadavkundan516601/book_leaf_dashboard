/** BookLeaf's production pipeline, in order (from the knowledge base). */
export const PRODUCTION_STAGES = [
  "Manuscript Received",
  "Editing",
  "Cover Design",
  "Typesetting",
  "Proofreading",
  "ISBN Assignment",
  "Printing",
  "Distribution Setup",
  "Published & Live",
] as const;

export interface StageProgress {
  stage: string;
  /** 1-based position in the pipeline. */
  step: number;
  total: number;
  percent: number;
}

/** Reads the stage out of a status like "In Production - Cover Design"; null when it isn't a known stage. */
export function stageProgress(status: string): StageProgress | null {
  const lower = status.toLowerCase();
  const index = PRODUCTION_STAGES.findIndex((s) => lower.includes(s.toLowerCase()));
  if (index < 0) return null;
  const total = PRODUCTION_STAGES.length;
  return { stage: PRODUCTION_STAGES[index]!, step: index + 1, total, percent: Math.round(((index + 1) / total) * 100) };
}
