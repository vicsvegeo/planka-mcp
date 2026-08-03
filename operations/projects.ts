/**
 * @fileoverview Project operations for the MCP Kanban server
 *
 * This module provides functions for interacting with projects in the Planka Kanban system,
 * including creating, retrieving, updating, and deleting projects.
 */

import { z } from "zod";
import { plankaRequest, validateProjectName } from "../common/utils.js";
import { PlankaProjectSchema } from "../common/types.js";

// Schema definitions
/**
 * Schema for creating a new project
 * @property {string} name - The name of the project
 */
export const CreateProjectSchema = z.object({
  name: z.string().describe("Project name"),
});

/**
 * Schema for retrieving projects with pagination
 * @property {number} [page] - Page number for pagination (default: 1)
 * @property {number} [perPage] - Number of results per page (default: 30, max: 100)
 */
export const GetProjectsSchema = z.object({
  page: z
    .number()
    .optional()
    .describe("Page number for pagination (default: 1)"),
  perPage: z
    .number()
    .optional()
    .describe("Number of results per page (default: 30, max: 100)"),
});

/**
 * Schema for retrieving a specific project
 * @property {string} id - The ID of the project to retrieve
 */
export const GetProjectSchema = z.object({
  id: z.string().describe("Project ID"),
});

/**
 * Schema for updating a project
 * @property {string} id - The ID of the project to update
 * @property {string} [name] - The new name for the project
 */
export const UpdateProjectSchema = z.object({
  id: z.string().describe("Project ID"),
  name: z.string().optional().describe("Project name"),
});

/**
 * Schema for deleting a project
 * @property {string} id - The ID of the project to delete
 */
export const DeleteProjectSchema = z.object({
  id: z.string().describe("Project ID"),
});

// Type exports
/**
 * Type definition for project creation options
 */
export type CreateProjectOptions = z.infer<typeof CreateProjectSchema>;

/**
 * Type definition for project update options
 */
export type UpdateProjectOptions = z.infer<typeof UpdateProjectSchema>;

// Response schemas
const ProjectsResponseSchema = z.object({
  items: z.array(PlankaProjectSchema),
  included: z.record(z.any()).optional(),
});

const ProjectResponseSchema = z.object({
  item: PlankaProjectSchema,
  included: z.record(z.any()).optional(),
});

/**
 * Retrieves projects with pagination support
 *
 * @param {number} [page=1] - The page number to retrieve (1-indexed)
 * @param {number} [perPage=30] - The number of projects per page (max: 100)
 * @returns {Promise<{items: Array<object>, included?: object}>} Paginated projects
 * @throws {Error} If retrieving projects fails
 */
export async function getProjects(page: number = 1, perPage: number = 30) {
  try {
    // Ensure perPage is within limits
    if (perPage > 100) {
      perPage = 100;
    }

    const queryParams = new URLSearchParams();
    queryParams.append("page", page.toString());
    queryParams.append("per_page", perPage.toString());

    const response = await plankaRequest(
      `/api/projects?${queryParams.toString()}`,
      {
        method: "GET",
      },
    );

    const parsedResponse = ProjectsResponseSchema.parse(response);
    return parsedResponse;
  } catch (error) {
    throw new Error(
      `Failed to get projects: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Retrieves a specific project by ID
 *
 * @param {string} id - The ID of the project to retrieve
 * @returns {Promise<object>} The requested project
 * @throws {Error} If retrieving the project fails
 */
export async function getProject(id: string) {
  try {
    const response = await plankaRequest(`/api/projects/${id}`);
    const parsedResponse = ProjectResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to get project: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Creates a new project
 *
 * @param {string} name - The name of the project to create
 * @returns {Promise<object>} The created project
 * @throws {Error} If creating the project fails
 */
export async function createProject(
  name: string,
  type: "private" | "shared" = "private",
) {
  try {
    const sanitizedName = validateProjectName(name);
    const response = await plankaRequest("/api/projects", {
      method: "POST",
      body: { name: sanitizedName, type },
    });
    const parsedResponse = ProjectResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to create project: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Updates an existing project
 *
 * @param {string} id - The ID of the project to update
 * @param {object} options - Fields to update (currently: name)
 * @returns {Promise<object>} The updated project
 * @throws {Error} If updating the project fails
 */
export async function updateProject(id: string, options: { name?: string }) {
  try {
    const body: Record<string, unknown> = {};
    if (options.name !== undefined) {
      body.name = validateProjectName(options.name);
    }
    const response = await plankaRequest(`/api/projects/${id}`, {
      method: "PATCH",
      body,
    });
    const parsedResponse = ProjectResponseSchema.parse(response);
    return parsedResponse.item;
  } catch (error) {
    throw new Error(
      `Failed to update project: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Deletes a project
 *
 * @param {string} id - The ID of the project to delete
 * @returns {Promise<object>} The deletion result
 * @throws {Error} If deleting the project fails
 */
export async function deleteProject(id: string) {
  try {
    const response = await plankaRequest(`/api/projects/${id}`, {
      method: "DELETE",
    });
    return response;
  } catch (error) {
    throw new Error(
      `Failed to delete project: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
