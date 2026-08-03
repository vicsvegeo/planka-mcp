import { AsyncLocalStorage } from "node:async_hooks";
import { getUserAgent } from "universal-user-agent";
import { createPlankaError } from "./errors.js";
import { VERSION } from "./version.js";

// Per-request context: holds the CALLING USER's own Planka token.
// Every incoming MCP request runs inside requestContext.run(token, ...),
// so concurrent requests from different Planka users never share a token,
// and every underlying Planka API call is made as that specific user —
// meaning Planka's own permission system enforces what each person can do.
export const requestContext = new AsyncLocalStorage<{ token: string }>();

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export function buildUrl(
  baseUrl: string,
  params: Record<string, string | number | undefined>,
): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });
  return url.toString();
}

const USER_AGENT =
  `modelcontextprotocol/servers/planka/v${VERSION} ${getUserAgent()}`;

async function getAuthToken(): Promise<string> {
  const ctx = requestContext.getStore();
  if (!ctx?.token) {
    throw new Error(
      "No Planka access token found for this request. The MCP client must " +
        "send the user's own Planka token as a Bearer token in the " +
        "Authorization header when connecting.",
    );
  }
  return ctx.token;
}

export async function plankaRequest(
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  const baseUrl = process.env.PLANKA_BASE_URL || "http://localhost:3000";

  // Normalize the base URL to not end with /api
  const normalizedBaseUrl = baseUrl.endsWith("/api")
    ? baseUrl.slice(0, -4)
    : baseUrl;

  // Ensure path starts with /api/
  const normalizedPath = path.startsWith("/api/") ? path : `/api/${path}`;

  const url = new URL(normalizedPath, normalizedBaseUrl).toString();

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    ...options.headers,
  };

  // Remove Content-Type header for FormData
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  // Add authentication token if not skipped
  if (!options.skipAuth) {
    try {
      const token = await getAuthToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      throw new Error(`Failed to get authentication token: ${errorMessage}`);
    }
  }

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body instanceof FormData
        ? options.body
        : options.body
        ? JSON.stringify(options.body)
        : undefined,
      credentials: "include", // Include cookies for Planka authentication
    });

    const responseBody = await parseResponseBody(response);

    if (!response.ok) {
      throw createPlankaError(response.status, responseBody);
    }

    return responseBody;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to make Planka request to ${url}: ${errorMessage}`);
  }
}

export function validateProjectName(name: string): string {
  const sanitized = name.trim();
  if (!sanitized) {
    throw new Error("Project name cannot be empty");
  }
  return sanitized;
}

export function validateBoardName(name: string): string {
  const sanitized = name.trim();
  if (!sanitized) {
    throw new Error("Board name cannot be empty");
  }
  return sanitized;
}

export function validateListName(name: string): string {
  const sanitized = name.trim();
  if (!sanitized) {
    throw new Error("List name cannot be empty");
  }
  return sanitized;
}

export function validateCardName(name: string): string {
  const sanitized = name.trim();
  if (!sanitized) {
    throw new Error("Card name cannot be empty");
  }
  return sanitized;
}

/**
 * Looks up a user ID by email
 *
 * @param {string} email - The email of the user to look up
 * @returns {Promise<string | null>} The user ID if found, null otherwise
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    // Get all users
    const response = await plankaRequest("/api/users");
    const { items } = response as {
      items: Array<{ id: string; email: string }>;
    };

    // Find the user with the matching email
    const user = items.find((user) => user.email === email);
    return user ? user.id : null;
  } catch (error) {
    console.error(
      `Failed to get user ID by email: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * Looks up a user ID by username
 *
 * @param {string} username - The username of the user to look up
 * @returns {Promise<string | null>} The user ID if found, null otherwise
 */
export async function getUserIdByUsername(
  username: string,
): Promise<string | null> {
  try {
    // Get all users
    const response = await plankaRequest("/api/users");
    const { items } = response as {
      items: Array<{ id: string; username: string }>;
    };

    // Find the user with the matching username
    const user = items.find((user) => user.username === username);
    return user ? user.id : null;
  } catch (error) {
    console.error(
      `Failed to get user ID by username: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
