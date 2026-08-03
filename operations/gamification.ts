/**
 * @fileoverview Gamification operations for the MCP Kanban server
 *
 * Reads a user's XP/level/badge progress from Planka's gamification feature.
 * There is no create/update surface here — XP, levels, and badge unlocks are
 * all computed server-side when a card is completed; this is read-only.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import {
  PlankaGamificationBadgeSchema,
  PlankaGamificationStatsSchema,
} from "../common/types.js";

export const GetGamificationStatsSchema = z.object({
  userId: z
    .string()
    .describe("User ID, or 'me' for the currently authenticated user"),
});

export type GetGamificationStatsOptions = z.infer<
  typeof GetGamificationStatsSchema
>;

const GamificationStatsResponseSchema = z.object({
  item: PlankaGamificationStatsSchema,
  included: z.object({
    badges: z.array(PlankaGamificationBadgeSchema),
  }),
});

/**
 * Retrieves a user's gamification stats: XP, level, progress to the next
 * level, completion counters, and the full badge catalog annotated with
 * which ones this user has unlocked (and when).
 *
 * @param {string} userId - The user ID, or "me" for the current user
 * @returns {Promise<object>} Stats plus a flattened `badges` array
 */
export async function getUserGamificationStats(userId: string) {
  const response = await plankaRequest(
    `/api/users/${userId}/gamification-stats`,
  );
  const parsed = GamificationStatsResponseSchema.parse(response);

  return {
    ...parsed.item,
    badges: parsed.included.badges,
  };
}
