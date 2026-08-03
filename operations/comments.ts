/**
 * @fileoverview Comment operations for the MCP Kanban server
 *
 * This module provides functions for interacting with comments in the Planka Kanban board,
 * including creating, retrieving, updating, and deleting comments on cards.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaCommentSchema } from "../common/types.js";

export const CreateCommentSchema = z.object({
  cardId: z.string().describe("Card ID"),
  text: z.string().describe("Comment text"),
});

export const GetCommentsSchema = z.object({
  cardId: z.string().describe("Card ID"),
});

export const GetCommentSchema = z.object({
  id: z.string().describe("Comment ID"),
});

export const UpdateCommentSchema = z.object({
  id: z.string().describe("Comment ID"),
  text: z.string().describe("Comment text"),
});

export const DeleteCommentSchema = z.object({
  id: z.string().describe("Comment ID"),
});

export type CreateCommentOptions = z.infer<typeof CreateCommentSchema>;
export type UpdateCommentOptions = z.infer<typeof UpdateCommentSchema>;

// Response schemas — Planka's real comment endpoints (see routes.js:
// GET/POST /api/cards/:cardId/comments, PATCH/DELETE /api/comments/:id)
// return the actual Comment model, not an "action" wrapper.
const CommentsResponseSchema = z.object({
  items: z.array(PlankaCommentSchema),
  included: z.record(z.any()).optional(),
});

const CommentResponseSchema = z.object({
  item: PlankaCommentSchema,
  included: z.record(z.any()).optional(),
});

export async function createComment(options: CreateCommentOptions) {
  try {
    const response = await plankaRequest(
      `/api/cards/${options.cardId}/comments`,
      {
        method: "POST",
        body: { text: options.text },
      },
    );
    const parsedResponse = CommentResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to create comment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getComments(cardId: string) {
  try {
    const response = await plankaRequest(`/api/cards/${cardId}/comments`);
    const parsedResponse = CommentsResponseSchema.parse(response);
    return parsedResponse.items;
  } catch (error) {
    throw new Error(
      `Failed to get comments: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Retrieves a specific comment by ID.
 *
 * Note: Planka has no single-comment GET endpoint — only list-by-card. If
 * you don't already know the parent cardId, list the card's comments and
 * find the one you want instead of calling this directly with just an id.
 */
export async function getComment(id: string, cardId?: string) {
  if (!cardId) {
    throw new Error(
      "Fetching a single comment requires its parent cardId — Planka has no direct GET /api/comments/:id endpoint. List the card's comments instead.",
    );
  }
  const comments = await getComments(cardId);
  const comment = (comments as any[]).find((c) => c.id === id);
  if (!comment) {
    throw new Error(`Comment not found: ${id}`);
  }
  return comment;
}

export async function updateComment(
  id: string,
  options: Partial<Omit<CreateCommentOptions, "cardId">>,
) {
  try {
    const response = await plankaRequest(`/api/comments/${id}`, {
      method: "PATCH",
      body: { text: options.text },
    });
    const parsedResponse = CommentResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to update comment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function deleteComment(id: string) {
  try {
    await plankaRequest(`/api/comments/${id}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (error) {
    throw new Error(
      `Failed to delete comment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
