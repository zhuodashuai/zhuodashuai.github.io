import { scheduleReview } from "../../vocab/js/review.js";
import { ApiError } from "./security";

export interface PersonalReview {
  schemaVersion: 1; entryId: string; revision: number; level: number; dueAt: string;
  reviewCount: number; lapseCount: number; lastRating: string;
  history: { at: string; rating: string; fromLevel: number; toLevel: number }[]; updatedAt: string;
}
export interface LearningMetadata { revision: number; reviewBytes: number; ledgerBytes: number; ledgerCount: number }
export const EMPTY_LEARNING: LearningMetadata = { revision: 0, reviewBytes: 0, ledgerBytes: 0, ledgerCount: 0 };
export const LEARNING_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, ledger: 512 });

export function nextPersonalReview(entryId: string, previous: PersonalReview | undefined, rating: unknown, now = new Date()): PersonalReview {
  if (typeof rating !== "string" || !["again", "hard", "good", "easy"].includes(rating)) throw new ApiError(400, "invalid_rating", "请选择有效的复习评分。");
  return { ...scheduleReview(previous || { entryId }, rating, now), schemaVersion: 1, entryId, revision: (previous?.revision || 0) + 1 };
}
