/** Type-only boundary for the existing pure browser scheduler, not a reimplementation. */
declare module "*vocab/js/review.js" {
  export function scheduleReview(current: unknown, rating: string, now?: Date): {
    schemaVersion: 1;
    entryId: string;
    level: number;
    dueAt: string;
    reviewCount: number;
    lapseCount: number;
    lastRating: string;
    history: { at: string; rating: string; fromLevel: number; toLevel: number }[];
    updatedAt: string;
  };
}
