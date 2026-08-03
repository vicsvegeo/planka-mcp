import { z } from "zod";
import { getCard } from "../operations/cards.js";
import { getTasks } from "../operations/tasks.js";
import { getComments } from "../operations/comments.js";
import { getLabels } from "../operations/labels.js";
import { getProjects } from "../operations/projects.js";
import { getBoards } from "../operations/boards.js";
import { getLists } from "../operations/lists.js";

export const getCardDetailsSchema = z.object({
  cardId: z.string().describe("The ID of the card to get details for"),
});

export type GetCardDetailsParams = z.infer<typeof getCardDetailsSchema>;

export async function getCardDetails(params: GetCardDetailsParams) {
  const { cardId } = params;

  try {
    const card = await getCard(cardId);

    if (!card) {
      throw new Error(`Card with ID ${cardId} not found`);
    }

    const tasks = await getTasks(card.id);
    const comments = await getComments(card.id);

    let boardId = null;

    const projectsResponse = await getProjects(1, 100);
    const projects = projectsResponse.items;

    for (const project of projects) {
      if (boardId) break;

      const boards = await getBoards(project.id);

      for (const board of boards) {
        if (boardId) break;

        const lists = await getLists(board.id);

        const matchingList = lists.find((list: any) => list.id === card.listId);

        if (matchingList) {
          boardId = board.id;
          break;
        }
      }
    }

    if (!boardId) {
      throw new Error(`Could not determine board ID for card ${cardId}`);
    }

    const labels = await getLabels(boardId);

    const completedTasks = tasks.filter((task: any) => task.isCompleted).length;
    const totalTasks = tasks.length;
    const completionPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const sortedComments = comments.sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const hasRecentHumanFeedback =
      sortedComments.length > 0 &&
      sortedComments[0].text &&
      !sortedComments[0].text.includes("Implemented feature") &&
      !sortedComments[0].text.includes("Awaiting human review");

    return {
      card,
      taskItems: tasks,
      taskStats: {
        total: totalTasks,
        completed: completedTasks,
        completionPercentage,
      },
      comments: sortedComments,
      labels,
      analysis: {
        hasRecentHumanFeedback,
        isComplete: completionPercentage === 100,
        needsAttention: hasRecentHumanFeedback || completedTasks === 0,
      },
    };
  } catch (error) {
    console.error("Error in getCardDetails:", error);
    throw error;
  }
}
