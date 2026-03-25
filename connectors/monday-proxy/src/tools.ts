import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  listPublicBoards,
  getBoardInfo,
  getBoardItems,
  getItemUpdates,
  searchBoards,
  createUpdate,
  changeColumnValues,
  createItem,
  rawGraphQL,
  getCacheStats,
} from "./api.js";

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(error: unknown) {
  if (error instanceof ConnectorError) {
    return error.toToolResult();
  }
  return {
    content: [{ type: "text" as const, text: `Error: ${error}` }],
    isError: true,
  };
}

export function registerTools(server: McpServer) {
  // ─── list_public_boards ──────────────────────────────────────────────────

  server.tool(
    "list_public_boards",
    "List all public boards in Monday.com with pagination. Returns board name, description, columns, groups, owners, and item count. Only public boards are returned.",
    {
      limit: z
        .number()
        .optional()
        .describe("Max boards per page (default 25, max 500)"),
      page: z.number().optional().describe("Page number (default 1)"),
    },
    async ({ limit, page }) => {
      try {
        const result = await listPublicBoards(limit ?? 25, page ?? 1);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── get_board ───────────────────────────────────────────────────────────

  server.tool(
    "get_board",
    "Get detailed information about a specific public board including columns, groups, views, owners, and workspace. Only works with public boards.",
    {
      board_id: z.number().describe("The numeric ID of the board"),
    },
    async ({ board_id }) => {
      try {
        const result = await getBoardInfo(board_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── get_board_items ─────────────────────────────────────────────────────

  server.tool(
    "get_board_items",
    "Get items from a public board with column values and subitems. Supports cursor-based pagination. Only works with public boards.",
    {
      board_id: z.number().describe("The numeric ID of the board"),
      limit: z
        .number()
        .optional()
        .describe("Max items per page (default 25)"),
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor from a previous response. When provided, board_id is ignored and the next page is fetched."
        ),
      group_id: z
        .string()
        .optional()
        .describe("Filter items to a specific group ID"),
    },
    async ({ board_id, limit, cursor, group_id }) => {
      try {
        const result = await getBoardItems(
          board_id,
          limit ?? 25,
          cursor,
          group_id
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── get_item_updates ────────────────────────────────────────────────────

  server.tool(
    "get_item_updates",
    "Get comments/updates on a specific item, including replies and creator info. The item must belong to a public board.",
    {
      item_id: z.number().describe("The numeric ID of the item"),
      limit: z
        .number()
        .optional()
        .describe("Max updates to return (default 25)"),
      page: z.number().optional().describe("Page number (default 1)"),
    },
    async ({ item_id, limit, page }) => {
      try {
        const result = await getItemUpdates(item_id, limit ?? 25, page ?? 1);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── search_boards ───────────────────────────────────────────────────────

  server.tool(
    "search_boards",
    "Search for public boards by name. Returns only public boards matching the search query.",
    {
      name: z.string().describe("Board name to search for (partial match)"),
    },
    async ({ name }) => {
      try {
        const result = await searchBoards(name);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── create_update ───────────────────────────────────────────────────────

  server.tool(
    "create_update",
    "Add a comment/update to an item. The item must belong to a public board. Supports rich text in the body.",
    {
      item_id: z.number().describe("The numeric ID of the item"),
      body: z
        .string()
        .describe("The update/comment body text (supports HTML)"),
    },
    async ({ item_id, body }) => {
      try {
        const result = await createUpdate(item_id, body);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── change_column_values ────────────────────────────────────────────────

  server.tool(
    "change_column_values",
    "Update column values on an item. The board must be public. Column values should be a JSON string matching Monday.com's column value format.",
    {
      board_id: z.number().describe("The numeric ID of the board"),
      item_id: z.number().describe("The numeric ID of the item"),
      column_values: z
        .string()
        .describe(
          'JSON string of column values to update, e.g. \'{"status": {"label": "Done"}, "text0": "Hello"}\''
        ),
    },
    async ({ board_id, item_id, column_values }) => {
      try {
        const result = await changeColumnValues(
          board_id,
          item_id,
          column_values
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── create_item ─────────────────────────────────────────────────────────

  server.tool(
    "create_item",
    "Create a new item on a public board. Optionally specify a group and initial column values.",
    {
      board_id: z.number().describe("The numeric ID of the board"),
      item_name: z.string().describe("Name of the new item"),
      group_id: z
        .string()
        .optional()
        .describe("Group ID to place the item in"),
      column_values: z
        .string()
        .optional()
        .describe(
          'JSON string of initial column values, e.g. \'{"status": {"label": "Working on it"}}\''
        ),
    },
    async ({ board_id, item_name, group_id, column_values }) => {
      try {
        const result = await createItem(
          board_id,
          item_name,
          group_id,
          column_values
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── raw_graphql ─────────────────────────────────────────────────────────

  server.tool(
    "raw_graphql",
    "Execute a raw GraphQL query against the Monday.com API with automatic public board filtering. All boards() calls will have board_kind: public injected, and any specific board IDs will be validated as public before execution. Use this for advanced queries not covered by other tools.",
    {
      query: z.string().describe("The GraphQL query or mutation string"),
      variables: z
        .string()
        .optional()
        .describe("JSON string of GraphQL variables"),
    },
    async ({ query, variables }) => {
      try {
        const parsedVars = variables ? JSON.parse(variables) : undefined;
        const result = await rawGraphQL(query, parsedVars);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── cache_status ────────────────────────────────────────────────────────

  server.tool(
    "cache_status",
    "Check the status of the public board cache, including how many boards are cached and when the cache was last refreshed.",
    {},
    async () => {
      const stats = getCacheStats();
      return toolResult({
        cached_public_boards: stats.size,
        last_refreshed: stats.lastRefreshed
          ? new Date(stats.lastRefreshed).toISOString()
          : "never",
        refresh_interval: "5 minutes",
      });
    }
  );
}
