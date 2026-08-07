import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { z } from "zod";

import { requestContext } from "./common/utils.js";

// Import Planka operations
import * as boardMemberships from "./operations/boardMemberships.js";
import * as boards from "./operations/boards.js";
import * as cards from "./operations/cards.js";
import * as comments from "./operations/comments.js";
import * as labels from "./operations/labels.js";
import * as lists from "./operations/lists.js";
import * as projects from "./operations/projects.js";
import * as tasks from "./operations/tasks.js";
import * as gamification from "./operations/gamification.js";

// Import custom tools
import {
  createCardWithTasks,
  getBoardSummary,
  getCardDetails,
} from "./tools/index.js";

import { VERSION } from "./common/version.js";

const server = new McpServer(
  {
    name: "planka-mcp-server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ----- SHARED RESOURCE TYPE ENUM -----
// Every tool below takes the same `resourceType` value so the four tools
// (get/create/update/delete) form a consistent grid: one axis is the verb,
// the other is what it acts on.
const resourceTypeEnum = z
  .enum([
    "project",
    "board",
    "list",
    "card",
    "card_with_tasks", // create-only: card + tasks + optional comment in one call
    "label",
    "card_label", // create/delete-only: attach/detach a label to a card
    "comment",
    "task",
    "membership",
    "stopwatch", // get/update-only: card time tracking
    "board_summary", // get-only: aggregated board view
    "card_details", // get-only: aggregated card view
    "gamification_stats", // get-only: a user's XP/level/badge progress
  ])
  .describe("The kind of Planka resource to operate on");

function err(action: string, resourceType: string, missing: string): never {
  throw new Error(
    `${missing} required for ${action} on resourceType "${resourceType}"`,
  );
}

// ----- PERSONAL CONVENTIONS -----
// Board-building conventions used across projects, surfaced only when the
// Planka tools are actually loaded (not injected into general chat context).
// Update this block as conventions evolve.
const CONVENTIONS = `
Personal conventions:
- Default list color palette: backlog=dark-granite, todo=lagoon-blue, doing=pumpkin-orange, done=bright-moss.
- Apply these defaults automatically when creating boards/lists unless the user specifies otherwise.
- Mark "done" lists as type=closed.`;

// ----- 1. GET (read-only — safe to call without confirmation) -----
server.registerTool(
  "planka_get",
  {
    description:
      "Read Planka data: projects, boards, lists, cards, labels, comments, tasks, " +
      "board memberships, card stopwatches, aggregated board/card summaries, or " +
      "a user's gamification stats (XP, level, badges). Cards carry gamification " +
      "fields (baseXp, softDueDate, bonusAwarded) alongside their normal fields. " +
      "Pass `id` to fetch a single item, or omit it (with the relevant parent " +
      "id) to list items.",
    inputSchema: {
      resourceType: resourceTypeEnum,
      id: z.string().optional().describe("ID of the single item to fetch"),
      projectId: z
        .string()
        .optional()
        .describe("Parent project ID (for listing boards)"),
      boardId: z
        .string()
        .optional()
        .describe(
          "Parent board ID (for listing lists/labels/memberships, or board_summary)",
        ),
      listId: z
        .string()
        .optional()
        .describe("Parent list ID (for listing cards)"),
      cardId: z
        .string()
        .optional()
        .describe(
          "Parent card ID (for listing comments/tasks, or card_details/stopwatch)",
        ),
      page: z
        .number()
        .optional()
        .describe("Page number for paginated project listing (1-indexed)"),
      perPage: z
        .number()
        .optional()
        .describe("Items per page for paginated project listing"),
      includeTaskDetails: z
        .boolean()
        .optional()
        .default(false)
        .describe("For board_summary: include per-card task detail"),
      includeComments: z
        .boolean()
        .optional()
        .default(false)
        .describe("For board_summary: include per-card comments"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async (args) => {
    let result;
    const { resourceType, id } = args;

    switch (resourceType) {
      case "project":
        if (id) {
          result = await projects.getProject(id);
        } else {
          if (!args.page || !args.perPage)
            err("list", resourceType, "page and perPage");
          result = await projects.getProjects(args.page!, args.perPage!);
        }
        break;

      case "board":
        if (id) {
          result = await boards.getBoard(id);
        } else {
          if (!args.projectId) err("list", resourceType, "projectId");
          result = await boards.getBoards(args.projectId!);
        }
        break;

      case "list":
        if (id) {
          result = await lists.getList(id);
        } else {
          if (!args.boardId) err("list", resourceType, "boardId");
          result = await lists.getLists(args.boardId!);
        }
        break;

      case "card":
        if (id) {
          result = await cards.getCard(id);
        } else {
          if (!args.listId) err("list", resourceType, "listId");
          result = await cards.getCards(args.listId!);
        }
        break;

      case "label":
        // Planka has no single-label GET endpoint — only list-by-board.
        // If an id was passed, filter the list client-side.
        if (!args.boardId) err("list", resourceType, "boardId");
        result = await labels.getLabels(args.boardId!);
        if (id) {
          const list = (result as any)?.items ?? result;
          result = Array.isArray(list)
            ? list.find((l: any) => l.id === id)
            : result;
        }
        break;

      case "comment":
        if (id) {
          result = await comments.getComment(id, args.cardId);
        } else {
          if (!args.cardId) err("list", resourceType, "cardId");
          result = await comments.getComments(args.cardId!);
        }
        break;

      case "task":
        if (id) {
          result = await tasks.getTask(id, args.cardId);
        } else {
          if (!args.cardId) err("list", resourceType, "cardId");
          result = await tasks.getTasks(args.cardId!);
        }
        break;

      case "membership":
        if (id) {
          result = await boardMemberships.getBoardMembership(id);
        } else {
          if (!args.boardId) err("list", resourceType, "boardId");
          result = await boardMemberships.getBoardMemberships(args.boardId!);
        }
        break;

      case "stopwatch":
        if (!id) err("get", resourceType, "id (card ID)");
        result = await cards.getCardStopwatch(id!);
        break;

      case "board_summary":
        if (!id) err("get", resourceType, "id (board ID)");
        result = await getBoardSummary({
          boardId: id!,
          includeTaskDetails: args.includeTaskDetails ?? false,
          includeComments: args.includeComments ?? false,
        });
        break;

      case "card_details":
        if (!id) err("get", resourceType, "id (card ID)");
        result = await getCardDetails({ cardId: id! });
        break;

      case "gamification_stats":
        if (!id) err("get", resourceType, "id (user ID, or 'me')");
        result = await gamification.getUserGamificationStats(id!);
        break;

      default:
        throw new Error(`Unknown resourceType: ${resourceType}`);
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ----- 2. CREATE (safe to call without confirmation) -----
server.registerTool(
  "planka_create",
  {
    description:
      "Create new Planka resources: projects, boards, lists, cards (optionally " +
      "with tasks/comment in one call), labels, comments, tasks (single or " +
      "batch), board memberships, or attach a label to a card. Set " +
      "`duplicateFromId` (resourceType card) to duplicate an existing card " +
      "instead of creating from scratch. Cards use gamification: `baseXp` " +
      "defaults to 10 if omitted (Planka requires every card to have a value); " +
      "`softDueDate` is optional and grants bonus XP if the card is completed " +
      "on or before it." +
      CONVENTIONS,
    inputSchema: {
      resourceType: resourceTypeEnum,
      // Parents
      projectId: z.string().optional(),
      boardId: z.string().optional(),
      listId: z.string().optional(),
      cardId: z.string().optional(),
      // Common fields
      name: z.string().optional(),
      projectType: z
        .enum(["private", "shared"])
        .optional()
        .describe("For resourceType project: private (default) or shared"),
      description: z.string().optional(),
      position: z.number().optional(),
      dueDate: z.string().optional().describe("ISO date, for cards"),
      color: z.string().optional().describe("Label or list color"),
      text: z.string().optional().describe("Comment text"),
      // Gamification (cards / card_with_tasks)
      baseXp: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "XP awarded on completing this card. Defaults to 10 if omitted.",
        ),
      softDueDate: z
        .string()
        .optional()
        .describe(
          "ISO date-time. Completing the card on or before it grants bonus XP.",
        ),
      // Card-with-tasks / duplicate
      tasks: z
        .array(z.string())
        .optional()
        .describe("Task names, for card_with_tasks"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment, for card_with_tasks"),
      duplicateFromId: z
        .string()
        .optional()
        .describe("Existing card ID to duplicate (resourceType: card)"),
      // Batch task creation
      taskBatch: z
        .array(
          z.object({
            cardId: z.string(),
            name: z.string(),
            position: z.number().optional(),
          }),
        )
        .optional()
        .describe(
          "For resourceType task: create multiple tasks (possibly across cards) in one call",
        ),
      // Membership
      userId: z.string().optional(),
      role: z.enum(["editor", "viewer"]).optional(),
      canComment: z.boolean().optional(),
      // card_label
      labelId: z.string().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  async (args) => {
    let result;
    const { resourceType } = args;

    switch (resourceType) {
      case "project":
        if (!args.name) err("create", resourceType, "name");
        result = await projects.createProject(
          args.name,
          (args as any).projectType ?? "private",
        );
        break;

      case "board":
        if (!args.projectId || !args.name)
          err("create", resourceType, "projectId and name");
        result = await boards.createBoard({
          projectId: args.projectId!,
          name: args.name!,
          position: args.position ?? 65535,
        });
        break;

      case "list":
        if (!args.boardId || !args.name)
          err("create", resourceType, "boardId and name");
        result = await lists.createList({
          boardId: args.boardId!,
          name: args.name!,
          position: args.position ?? 65535,
          color: args.color,
        });
        break;

      case "card":
        if (args.duplicateFromId) {
          result = await cards.duplicateCard(
            args.duplicateFromId,
            args.position,
          );
        } else {
          if (!args.listId || !args.name)
            err("create", resourceType, "listId and name");
          result = await cards.createCard({
            listId: args.listId!,
            name: args.name!,
            description: args.description,
            position: args.position ?? 65535,
            baseXp: args.baseXp,
            softDueDate: args.softDueDate,
          });
        }
        break;

      case "card_with_tasks":
        if (!args.listId || !args.name)
          err("create", resourceType, "listId and name");
        result = await createCardWithTasks({
          listId: args.listId!,
          name: args.name!,
          description: args.description,
          tasks: args.tasks,
          comment: args.comment,
          position: args.position ?? 65535,
          baseXp: args.baseXp,
          softDueDate: args.softDueDate,
        });
        break;

      case "label":
        if (!args.boardId || !args.name || !args.color)
          err("create", resourceType, "boardId, name, and color");
        result = await labels.createLabel({
          boardId: args.boardId!,
          name: args.name!,
          color: args.color as any,
          position: args.position,
        });
        break;

      case "card_label":
        if (!args.cardId || !args.labelId)
          err("create", resourceType, "cardId and labelId");
        result = await labels.addLabelToCard(args.cardId!, args.labelId!);
        break;

      case "comment":
        if (!args.cardId || !args.text)
          err("create", resourceType, "cardId and text");
        result = await comments.createComment({
          cardId: args.cardId!,
          text: args.text!,
        });
        break;

      case "task":
        if (args.taskBatch && args.taskBatch.length > 0) {
          result = await tasks.batchCreateTasks({ tasks: args.taskBatch });
        } else {
          if (!args.cardId || !args.name)
            err("create", resourceType, "cardId and name (or taskBatch)");
          result = await tasks.createTask({
            cardId: args.cardId!,
            name: args.name!,
            position: args.position,
          });
        }
        break;

      case "membership":
        if (!args.boardId || !args.userId || !args.role)
          err("create", resourceType, "boardId, userId, and role");
        result = await boardMemberships.createBoardMembership({
          boardId: args.boardId!,
          userId: args.userId!,
          role: args.role!,
        });
        break;

      default:
        throw new Error(
          `resourceType "${resourceType}" cannot be created directly (use planka_get or planka_update instead)`,
        );
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ----- 3. UPDATE (destructive — Claude should confirm with you first) -----
server.registerTool(
  "planka_update",
  {
    description:
      "Modify existing Planka resources: rename/edit projects, boards, lists, " +
      "cards, labels, comments, tasks; move a card to a different list " +
      "(set listId, optionally boardId/projectId); mark a task complete; " +
      "change a board membership's role; start/stop/reset a card's " +
      "stopwatch (resourceType stopwatch, id = card ID, set stopwatchAction); " +
      "or edit a card's XP value / soft due date (baseXp, softDueDate)." +
      CONVENTIONS,
    inputSchema: {
      resourceType: resourceTypeEnum,
      id: z.string().describe("ID of the item to update"),
      name: z.string().optional(),
      description: z.string().optional(),
      position: z.number().optional(),
      dueDate: z.string().optional(),
      isCompleted: z.boolean().optional(),
      color: z.string().optional(),
      text: z.string().optional().describe("New comment text"),
      type: z.string().optional().describe("Board type"),
      role: z.enum(["editor", "viewer"]).optional(),
      canComment: z.boolean().optional(),
      // Card move
      listId: z.string().optional().describe("Target list ID, to move a card"),
      boardId: z
        .string()
        .optional()
        .describe("Target board ID, if moving a card across boards"),
      projectId: z
        .string()
        .optional()
        .describe("Target project ID, if moving a card across projects"),
      // Stopwatch
      stopwatchAction: z.enum(["start", "stop", "reset"]).optional(),
      // Gamification (card)
      baseXp: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("XP awarded on completing this card"),
      softDueDate: z
        .string()
        .nullable()
        .optional()
        .describe(
          "ISO date-time. Completing on/before it grants bonus XP. Pass null to clear it.",
        ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  },
  async (args) => {
    let result;
    const { resourceType, id } = args;

    switch (resourceType) {
      case "project":
        result = await projects.updateProject(id, { name: args.name });
        break;

      case "board": {
        const opts: any = {};
        if (args.name !== undefined) opts.name = args.name;
        if (args.position !== undefined) opts.position = args.position;
        if (args.type !== undefined) opts.type = args.type;
        result = await boards.updateBoard(id, opts);
        break;
      }

      case "list": {
        const opts: any = {};
        if (args.name !== undefined) opts.name = args.name;
        if (args.position !== undefined) opts.position = args.position;
        if (args.color !== undefined) opts.color = args.color;
        result = await lists.updateList(id, opts);
        break;
      }

      case "card":
        if (args.listId) {
          // A listId means this is a move, not a plain field edit.
          result = await cards.moveCard(
            id,
            args.listId,
            args.position ?? 65535,
            args.boardId,
            args.projectId,
          );
        } else {
          result = await cards.updateCard(id, {
            name: args.name,
            description: args.description,
            position: args.position,
            dueDate: args.dueDate,
            isCompleted: args.isCompleted,
            baseXp: args.baseXp,
            softDueDate: args.softDueDate,
          } as any);
        }
        break;

      case "label":
        result = await labels.updateLabel(id, {
          name: args.name,
          color: args.color as any,
          position: args.position,
        });
        break;

      case "comment":
        if (!args.text) err("update", resourceType, "text");
        result = await comments.updateComment(id, { text: args.text });
        break;

      case "task":
        result = await tasks.updateTask(id, {
          name: args.name,
          isCompleted: args.isCompleted,
          position: args.position,
        } as any);
        break;

      case "membership": {
        const opts: any = {};
        if (args.role !== undefined) opts.role = args.role;
        if (args.canComment !== undefined) opts.canComment = args.canComment;
        result = await boardMemberships.updateBoardMembership(id, opts);
        break;
      }

      case "stopwatch":
        if (!args.stopwatchAction)
          err("update", resourceType, "stopwatchAction");
        if (args.stopwatchAction === "start")
          result = await cards.startCardStopwatch(id);
        else if (args.stopwatchAction === "stop")
          result = await cards.stopCardStopwatch(id);
        else result = await cards.resetCardStopwatch(id);
        break;

      default:
        throw new Error(
          `resourceType "${resourceType}" cannot be updated directly`,
        );
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ----- 4. DELETE (destructive — Claude should confirm with you first) -----
server.registerTool(
  "planka_delete",
  {
    description:
      "Permanently delete Planka resources: projects, boards, lists, cards, " +
      "labels, comments, tasks, board memberships, or detach a label from a " +
      "card (resourceType card_label, with cardId and labelId).",
    inputSchema: {
      resourceType: resourceTypeEnum,
      id: z
        .string()
        .optional()
        .describe("ID of the item to delete (not used for card_label)"),
      cardId: z
        .string()
        .optional()
        .describe("For card_label: the card to remove the label from"),
      labelId: z
        .string()
        .optional()
        .describe("For card_label: the label to remove"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  },
  async (args) => {
    let result;
    const { resourceType, id } = args;

    switch (resourceType) {
      case "project":
        if (!id) err("delete", resourceType, "id");
        result = await projects.deleteProject(id!);
        break;
      case "board":
        if (!id) err("delete", resourceType, "id");
        result = await boards.deleteBoard(id!);
        break;
      case "list":
        if (!id) err("delete", resourceType, "id");
        result = await lists.deleteList(id!);
        break;
      case "card":
        if (!id) err("delete", resourceType, "id");
        result = await cards.deleteCard(id!);
        break;
      case "label":
        if (!id) err("delete", resourceType, "id");
        result = await labels.deleteLabel(id!);
        break;
      case "card_label":
        if (!args.cardId || !args.labelId)
          err("delete", resourceType, "cardId and labelId");
        result = await labels.removeLabelFromCard(args.cardId!, args.labelId!);
        break;
      case "comment":
        if (!id) err("delete", resourceType, "id");
        result = await comments.deleteComment(id!);
        break;
      case "task":
        if (!id) err("delete", resourceType, "id");
        result = await tasks.deleteTask(id!);
        break;
      case "membership":
        if (!id) err("delete", resourceType, "id");
        result = await boardMemberships.deleteBoardMembership(id!);
        break;
      default:
        throw new Error(
          `resourceType "${resourceType}" cannot be deleted directly`,
        );
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ----- HTTP SERVER (Streamable HTTP transport for remote/Cloud Run hosting) -----
//
// Auth model: this server holds NO Planka credentials of its own. Every
// caller must send their OWN Planka access token (obtained once by POSTing
// their email/password to /api/access-tokens on their Planka instance) as a
// standard Bearer token, OR embed it in the URL path (/mcp/<token>) for
// clients that can't yet set custom headers. That token is threaded through
// AsyncLocalStorage (see common/utils.ts) and used for every underlying
// Planka API call, so Planka's own permission system decides what each
// person can do — this server never needs its own notion of roles.

const app = express();
app.use(express.json());

// Simple health check for Cloud Run.
// Note: "/healthz" is a reserved path on GCP's frontend infrastructure and
// gets intercepted before ever reaching the container — hence "/health".
app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// Primary auth path: Authorization header (used once request-header auth
// is available on your Claude account, or by other MCP clients that
// support it).
app.post("/mcp", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : undefined;

  await handleMcpRequest(token, req, res);
});

// Fallback auth path: token embedded in the URL itself, e.g.
// https://mcp.blappsdev.com/mcp/<token>
// Needed because Claude's custom connector dialog only accepts a URL on
// accounts without request-header auth enabled yet. Same security model
// as a bearer token, but note it will appear in Cloud Run access logs and
// in Claude's stored connector URL — acceptable for a personal single-user
// setup, but rotate the token (via Planka: log out other sessions /
// change password) if that ever becomes a concern.
app.post("/mcp/:token", async (req, res) => {
  await handleMcpRequest(req.params.token, req, res);
});

async function handleMcpRequest(
  token: string | undefined,
  req: express.Request,
  res: express.Response,
) {
  if (!token) {
    res.status(401).json({
      error:
        "Missing Planka access token. Send your own Planka token as: Authorization: Bearer <token>",
    });
    return;
  }

  try {
    // Stateless mode: a fresh transport per request. The underlying `server`
    // (with all tools already registered) is reused, but AsyncLocalStorage
    // keeps each concurrent request's token fully isolated from every other.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
    });

    await requestContext.run({ token }, async () => {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// Streamable HTTP also expects GET/DELETE on the same endpoint for
// server-initiated streams and session teardown; in stateless mode these
// are simply not supported, so return 405 rather than hanging.
app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode." });
});
app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode." });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
app.listen(PORT, () => {
  console.error(
    `Planka MCP server (Streamable HTTP) listening on port ${PORT}`,
  );
});
