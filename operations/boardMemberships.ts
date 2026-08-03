/**
 * @fileoverview Board membership operations for the MCP Kanban server
 *
 * This module provides functions for managing board memberships in the Planka Kanban system,
 * including creating, retrieving, updating, and deleting board memberships, which control
 * user access and permissions to boards.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";

export const CreateBoardMembershipSchema = z.object({
  boardId: z.string().describe("Board ID"),
  userId: z.string().describe("User ID"),
  role: z
    .enum(["editor", "viewer"])
    .describe("Membership role (editor or viewer)"),
});

export const GetBoardMembershipsSchema = z.object({
  boardId: z.string().describe("Board ID"),
});

export const GetBoardMembershipSchema = z.object({
  id: z.string().describe("Board Membership ID"),
});

export const UpdateBoardMembershipSchema = z.object({
  id: z.string().describe("Board Membership ID"),
  role: z
    .enum(["editor", "viewer"])
    .describe("Membership role (editor or viewer)"),
  canComment: z
    .boolean()
    .optional()
    .describe("Whether the user can comment on cards"),
});

export const DeleteBoardMembershipSchema = z.object({
  id: z.string().describe("Board Membership ID"),
});

export type CreateBoardMembershipOptions = z.infer<
  typeof CreateBoardMembershipSchema
>;
export type UpdateBoardMembershipOptions = z.infer<
  typeof UpdateBoardMembershipSchema
>;

const BoardMembershipSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  userId: z.string(),
  role: z.string(),
  canComment: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

const BoardMembershipsResponseSchema = z.object({
  items: z.array(BoardMembershipSchema),
  included: z.record(z.any()).optional(),
});

const BoardMembershipResponseSchema = z.object({
  item: BoardMembershipSchema,
  included: z.record(z.any()).optional(),
});

/**
 * Creates a new board membership. Real endpoint is /board-memberships,
 * not /memberships.
 */
export async function createBoardMembership(
  options: CreateBoardMembershipOptions,
) {
  try {
    const response = await plankaRequest(
      `/api/boards/${options.boardId}/board-memberships`,
      {
        method: "POST",
        body: {
          userId: options.userId,
          role: options.role,
        },
      },
    );
    const parsedResponse = BoardMembershipResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to create board membership: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getBoardMemberships(boardId: string) {
  try {
    const response = await plankaRequest(
      `/api/boards/${boardId}/board-memberships`,
    );

    try {
      const parsedResponse = BoardMembershipsResponseSchema.parse(response);
      return parsedResponse.items;
    } catch (parseError) {
      if (Array.isArray(response)) {
        return z.array(BoardMembershipSchema).parse(response);
      }

      throw new Error(
        `Could not parse board memberships response: ${JSON.stringify(
          response,
        )}`,
      );
    }
  } catch (error) {
    return [];
  }
}

export async function getBoardMembership(id: string) {
  try {
    const response = await plankaRequest(`/api/board-memberships/${id}`);
    const parsedResponse = BoardMembershipResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to get board membership: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function updateBoardMembership(
  id: string,
  options: Partial<Omit<CreateBoardMembershipOptions, "boardId" | "userId">>,
) {
  try {
    const response = await plankaRequest(`/api/board-memberships/${id}`, {
      method: "PATCH",
      body: options,
    });
    const parsedResponse = BoardMembershipResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to update board membership: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function deleteBoardMembership(id: string) {
  try {
    await plankaRequest(`/api/board-memberships/${id}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (error) {
    throw new Error(
      `Failed to delete board membership: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
