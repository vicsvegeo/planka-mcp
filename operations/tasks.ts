/**
 * @fileoverview Task operations for the MCP Kanban server
 *
 * This module provides functions for interacting with tasks in the Planka Kanban board,
 * including creating, retrieving, updating, and deleting tasks, as well as batch operations.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaTaskSchema } from "../common/types.js";

export const CreateTaskSchema = z.object({
  cardId: z.string().describe("Card ID"),
  name: z.string().describe("Task name"),
  position: z.number().optional().describe("Task position (default: 65535)"),
});

export const BatchCreateTasksSchema = z.object({
  tasks: z.array(CreateTaskSchema).describe("Array of tasks to create"),
});

export const GetTasksSchema = z.object({
  cardId: z.string().describe("Card ID"),
});

export const GetTaskSchema = z.object({
  id: z.string().describe("Task ID"),
  cardId: z.string().optional().describe("Card ID containing the task"),
});

export const UpdateTaskSchema = z.object({
  id: z.string().describe("Task ID"),
  name: z.string().optional().describe("Task name"),
  isCompleted: z.boolean().optional().describe("Whether the task is completed"),
  position: z.number().optional().describe("Task position"),
});

export const DeleteTaskSchema = z.object({
  id: z.string().describe("Task ID"),
});

export type CreateTaskOptions = z.infer<typeof CreateTaskSchema>;
export type BatchCreateTasksOptions = z.infer<typeof BatchCreateTasksSchema>;
export type UpdateTaskOptions = z.infer<typeof UpdateTaskSchema>;

const TasksResponseSchema = z.object({
  items: z.array(PlankaTaskSchema),
  included: z.record(z.any()).optional(),
});

const TaskResponseSchema = z.object({
  item: PlankaTaskSchema,
  included: z.record(z.any()).optional(),
});

// Map to store task ID to card ID mapping (kept as a fallback cache;
// getTask/getTasks work without it, but it speeds up repeated lookups)
const taskCardIdMap: Record<string, string> = {};

// Cache of "a task list we can use" per card, so a batch of task creations
// on the same card doesn't create a redundant task list per task.
const cardDefaultTaskListId: Record<string, string> = {};

/**
 * Finds an existing task list on a card, or creates one if none exists.
 * Planka requires tasks to live inside a TaskList (a checklist container)
 * — there's no way to attach a task directly to a card.
 */
async function getOrCreateDefaultTaskList(cardId: string): Promise<string> {
  if (cardDefaultTaskListId[cardId]) {
    return cardDefaultTaskListId[cardId];
  }

  const cardResponse = (await plankaRequest(`/api/cards/${cardId}`)) as {
    item: any;
    included?: { taskLists?: any[] };
  };

  const existing = cardResponse?.included?.taskLists?.[0];
  if (existing?.id) {
    cardDefaultTaskListId[cardId] = existing.id;
    return existing.id;
  }

  const created = (await plankaRequest(`/api/cards/${cardId}/task-lists`, {
    method: "POST",
    body: { name: "Tasks", position: 65535 },
  })) as { item: any };

  cardDefaultTaskListId[cardId] = created.item.id;
  return created.item.id;
}

/**
 * Creates a new task for a card. Under the hood, ensures a TaskList exists
 * on the card first (Planka has no direct card→task relationship).
 */
export async function createTask(params: {
  cardId: string;
  name: string;
  position?: number;
}) {
  try {
    const { cardId, name, position = 65535 } = params;

    const taskListId = await getOrCreateDefaultTaskList(cardId);

    const response: any = await plankaRequest(
      `/api/task-lists/${taskListId}/tasks`,
      {
        method: "POST",
        body: { name, position },
      },
    );

    if (response.item && response.item.id) {
      taskCardIdMap[response.item.id] = cardId;
    }

    return response.item;
  } catch (error) {
    console.error("Error creating task:", error);
    throw new Error(
      `Failed to create task: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function batchCreateTasks(options: BatchCreateTasksOptions) {
  try {
    const results: Array<any> = [];
    const successes: Array<any> = [];
    const failures: Array<any> = [];

    interface TaskError {
      index: number;
      task: CreateTaskOptions;
      error: string;
    }

    for (let i = 0; i < options.tasks.length; i++) {
      const task = options.tasks[i];

      if (!task.position) {
        task.position = 65535 * (i + 1);
      }

      try {
        const result = await createTask(task);
        results.push({ success: true, result });
        successes.push(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          success: false,
          error: { message: errorMessage },
        });
        failures.push({
          index: i,
          task,
          error: errorMessage,
        });
      }
    }

    return { results, successes, failures };
  } catch (error) {
    throw new Error(
      `Failed to batch create tasks: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getTasks(cardId: string) {
  try {
    const response = (await plankaRequest(`/api/cards/${cardId}`)) as {
      item: any;
      included?: { tasks?: any[] };
    };

    if (response?.included?.tasks && Array.isArray(response.included.tasks)) {
      return response.included.tasks;
    }

    return [];
  } catch (error) {
    console.error(`Error getting tasks for card ${cardId}:`, error);
    return [];
  }
}

export async function getTask(id: string, cardId?: string) {
  try {
    const taskCardId = cardId || taskCardIdMap[id];

    if (!taskCardId) {
      throw new Error(
        "Card ID is required to get a task. Either provide it directly or create the task first.",
      );
    }

    const response = (await plankaRequest(`/api/cards/${taskCardId}`)) as {
      item: any;
      included?: { tasks?: any[] };
    };

    if (!response?.included?.tasks || !Array.isArray(response.included.tasks)) {
      throw new Error(`Failed to get tasks for card ${taskCardId}`);
    }

    const task = response.included.tasks.find((task: any) => task.id === id);

    if (!task) {
      throw new Error(`Task with ID ${id} not found in card ${taskCardId}`);
    }

    return task;
  } catch (error) {
    console.error(`Error getting task with ID ${id}:`, error);
    throw new Error(
      `Failed to get task: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function updateTask(
  id: string,
  options: Partial<Omit<CreateTaskOptions, "cardId">>,
) {
  const response = await plankaRequest(`/api/tasks/${id}`, {
    method: "PATCH",
    body: options,
  });
  const parsedResponse = TaskResponseSchema.parse(response);
  return parsedResponse.item;
}

export async function deleteTask(id: string) {
  await plankaRequest(`/api/tasks/${id}`, {
    method: "DELETE",
  });
  return { success: true };
}
