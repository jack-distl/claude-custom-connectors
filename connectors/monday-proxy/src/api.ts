import { ConnectorError, ApiError } from "@custom-connectors/shared";

const MONDAY_API_URL = "https://api.monday.com/v2";
const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── API Token ───────────────────────────────────────────────────────────────

function getApiToken(): string {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new ConnectorError(
      "MONDAY_API_TOKEN environment variable is not set.",
      "CONFIG_ERROR",
      500
    );
  }
  return token;
}

// ─── GraphQL Client ──────────────────────────────────────────────────────────

interface MondayResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  account_id?: number;
}

export async function mondayQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = getApiToken();

  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      `Monday.com API returned ${response.status}: ${text}`,
      response.status
    );
  }

  const json = (await response.json()) as MondayResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new ConnectorError(
      `Monday.com API error: ${json.errors.map((e) => e.message).join("; ")}`,
      "MONDAY_API_ERROR",
      400
    );
  }

  return json.data as T;
}

// ─── Public Board Cache ──────────────────────────────────────────────────────

let publicBoardIds: Set<number> = new Set();
let cacheLastRefreshed = 0;
let cacheRefreshTimer: ReturnType<typeof setInterval> | null = null;

async function fetchAllPublicBoardIds(): Promise<Set<number>> {
  const ids = new Set<number>();
  let page = 1;
  const limit = 500;

  while (true) {
    const data = await mondayQuery<{
      boards: Array<{ id: string }>;
    }>(
      `query ($limit: Int!, $page: Int!) {
        boards(board_kind: public, limit: $limit, page: $page) {
          id
        }
      }`,
      { limit, page }
    );

    if (!data.boards || data.boards.length === 0) break;

    for (const board of data.boards) {
      ids.add(Number(board.id));
    }

    if (data.boards.length < limit) break;
    page++;
  }

  return ids;
}

export async function refreshBoardCache(): Promise<void> {
  try {
    publicBoardIds = await fetchAllPublicBoardIds();
    cacheLastRefreshed = Date.now();
    console.log(
      `Board cache refreshed: ${publicBoardIds.size} public boards`
    );
  } catch (error) {
    console.error("Failed to refresh board cache:", error);
    // Keep existing cache on failure
  }
}

export function startCacheRefresh(): void {
  if (cacheRefreshTimer) return;
  cacheRefreshTimer = setInterval(refreshBoardCache, CACHE_REFRESH_INTERVAL_MS);
}

export function getCacheStats(): {
  size: number;
  lastRefreshed: number;
} {
  return { size: publicBoardIds.size, lastRefreshed: cacheLastRefreshed };
}

// ─── Security: Board Validation ──────────────────────────────────────────────

/**
 * Check if a board is public. Uses the cache first, then does a direct API
 * check as fallback (handles newly created boards).
 */
export async function assertBoardIsPublic(boardId: number): Promise<void> {
  // Check cache first
  if (publicBoardIds.has(boardId)) return;

  // Cache miss — do a direct API check (board might be newly created)
  const data = await mondayQuery<{
    boards: Array<{ id: string; board_kind: string }>;
  }>(
    `query ($ids: [ID!]!) {
      boards(ids: $ids) {
        id
        board_kind
      }
    }`,
    { ids: [boardId] }
  );

  if (!data.boards || data.boards.length === 0) {
    throw new ConnectorError(
      `Board ${boardId} not found.`,
      "BOARD_NOT_FOUND",
      404
    );
  }

  const board = data.boards[0];
  if (board.board_kind !== "public") {
    throw new ConnectorError(
      `Access denied: Board ${boardId} is not a public board. This connector only allows access to public boards.`,
      "PRIVATE_BOARD_ACCESS",
      403
    );
  }

  // Board is public but wasn't in cache — add it
  publicBoardIds.add(boardId);
}

/**
 * Trace an item back to its parent board and validate that the board is public.
 */
export async function assertItemOnPublicBoard(itemId: number): Promise<void> {
  const data = await mondayQuery<{
    items: Array<{ id: string; board: { id: string; board_kind: string } }>;
  }>(
    `query ($ids: [ID!]!) {
      items(ids: $ids) {
        id
        board {
          id
          board_kind
        }
      }
    }`,
    { ids: [itemId] }
  );

  if (!data.items || data.items.length === 0) {
    throw new ConnectorError(
      `Item ${itemId} not found.`,
      "ITEM_NOT_FOUND",
      404
    );
  }

  const item = data.items[0];
  if (item.board.board_kind !== "public") {
    throw new ConnectorError(
      `Access denied: Item ${itemId} belongs to a non-public board. This connector only allows access to items on public boards.`,
      "PRIVATE_BOARD_ACCESS",
      403
    );
  }
}

// ─── Security: GraphQL Query Filtering ───────────────────────────────────────

/**
 * Inject `board_kind: public` into boards() calls that don't already specify it.
 * Skips injection when boards(ids: ...) is used (those are validated by ID).
 */
export function injectPublicBoardKind(query: string): string {
  // Match boards(...) calls. We need to handle:
  // - boards { ... }              → boards(board_kind: public) { ... }
  // - boards() { ... }            → boards(board_kind: public) { ... }
  // - boards(limit: 10) { ... }   → boards(limit: 10, board_kind: public) { ... }
  // - boards(ids: [...]) { ... }  → leave alone (validated by ID)
  // - boards(board_kind: ...) ... → leave alone (already specified)

  return query.replace(
    /\bboards\s*(\([^)]*\))?\s*\{/g,
    (match, argsGroup: string | undefined) => {
      // If no args at all: boards { → boards(board_kind: public) {
      if (!argsGroup) {
        return "boards(board_kind: public) {";
      }

      const args = argsGroup;

      // Already has board_kind — leave alone
      if (/board_kind\s*:/.test(args)) {
        return match;
      }

      // Has ids — leave alone (validated by ID separately)
      if (/\bids\s*:/.test(args)) {
        return match;
      }

      // Inject board_kind: public into existing args
      const injected = args.replace(/\)$/, ", board_kind: public)");
      return `boards${injected} {`;
    }
  );
}

/**
 * Extract board IDs referenced in a GraphQL query string.
 * Matches patterns like: boards(ids: [123, 456]), board_id: 123, boardId: 123
 */
export function extractBoardIdsFromQuery(query: string): number[] {
  const ids: number[] = [];

  // Match boards(ids: [123, 456, ...])
  const boardsIdsMatch = query.match(
    /boards\s*\(\s*ids\s*:\s*\[([^\]]+)\]/
  );
  if (boardsIdsMatch) {
    const nums = boardsIdsMatch[1].match(/\d+/g);
    if (nums) ids.push(...nums.map(Number));
  }

  // Match board_id: 123 or board_id: "123"
  const boardIdMatches = query.matchAll(/board_id\s*:\s*"?(\d+)"?/g);
  for (const m of boardIdMatches) {
    ids.push(Number(m[1]));
  }

  // Match boardId: 123 or boardId: "123"
  const camelMatches = query.matchAll(/boardId\s*:\s*"?(\d+)"?/g);
  for (const m of camelMatches) {
    ids.push(Number(m[1]));
  }

  return [...new Set(ids)];
}

/**
 * Validate all board IDs found in a raw GraphQL query.
 */
export async function validateQueryBoardIds(query: string): Promise<void> {
  const ids = extractBoardIdsFromQuery(query);
  for (const id of ids) {
    await assertBoardIsPublic(id);
  }
}

// ─── Board API Functions ─────────────────────────────────────────────────────

export async function listPublicBoards(
  limit: number = 25,
  page: number = 1
): Promise<unknown> {
  return mondayQuery(
    `query ($limit: Int!, $page: Int!) {
      boards(board_kind: public, limit: $limit, page: $page) {
        id
        name
        description
        state
        board_kind
        permissions
        item_terminology
        items_count
        columns {
          id
          title
          type
        }
        groups {
          id
          title
          color
        }
        owners {
          id
          name
        }
        workspace {
          id
          name
        }
      }
    }`,
    { limit, page }
  );
}

export async function getBoardInfo(boardId: number): Promise<unknown> {
  await assertBoardIsPublic(boardId);

  return mondayQuery(
    `query ($ids: [ID!]!) {
      boards(ids: $ids) {
        id
        name
        description
        state
        board_kind
        permissions
        item_terminology
        items_count
        columns {
          id
          title
          type
          description
          settings_str
        }
        groups {
          id
          title
          color
          position
        }
        views {
          id
          name
          type
        }
        owners {
          id
          name
          email
        }
        workspace {
          id
          name
        }
      }
    }`,
    { ids: [boardId] }
  );
}

export async function getBoardItems(
  boardId: number,
  limit: number = 25,
  cursor?: string,
  groupId?: string
): Promise<unknown> {
  await assertBoardIsPublic(boardId);

  if (cursor) {
    return mondayQuery(
      `query ($cursor: String!) {
        next_items_page(cursor: $cursor) {
          cursor
          items {
            id
            name
            state
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
            }
            subitems {
              id
              name
              column_values {
                id
                type
                text
                value
              }
            }
          }
        }
      }`,
      { cursor }
    );
  }

  const variables: Record<string, unknown> = { boardId, limit };
  let queryFilter = "";
  if (groupId) {
    variables.groupId = groupId;
    queryFilter = ", query_params: {rules: [{column_id: \"group\", compare_value: [$groupId]}]}";
  }

  return mondayQuery(
    `query ($boardId: ID!, $limit: Int!${groupId ? ", $groupId: String!" : ""}) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit${queryFilter}) {
          cursor
          items {
            id
            name
            state
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
            }
            subitems {
              id
              name
              column_values {
                id
                type
                text
                value
              }
            }
          }
        }
      }
    }`,
    variables
  );
}

export async function getItemUpdates(
  itemId: number,
  limit: number = 25,
  page: number = 1
): Promise<unknown> {
  await assertItemOnPublicBoard(itemId);

  return mondayQuery(
    `query ($ids: [ID!]!, $limit: Int!, $page: Int!) {
      items(ids: $ids) {
        id
        name
        updates(limit: $limit, page: $page) {
          id
          body
          text_body
          created_at
          updated_at
          creator {
            id
            name
            email
          }
          replies {
            id
            body
            text_body
            created_at
            creator {
              id
              name
            }
          }
        }
      }
    }`,
    { ids: [itemId], limit, page }
  );
}

export async function searchBoards(name: string): Promise<unknown> {
  const data = await mondayQuery<{
    boards: Array<Record<string, unknown>>;
  }>(
    `query {
      boards(board_kind: public, limit: 100) {
        id
        name
        description
        state
        board_kind
        items_count
        workspace {
          id
          name
        }
      }
    }`
  );

  // Filter by name (case-insensitive partial match)
  const query = name.toLowerCase();
  const filtered = data.boards.filter((b: Record<string, unknown>) =>
    String(b.name).toLowerCase().includes(query)
  );

  return { boards: filtered };
}

export async function createUpdate(
  itemId: number,
  body: string
): Promise<unknown> {
  await assertItemOnPublicBoard(itemId);

  return mondayQuery(
    `mutation ($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
        body
        created_at
        creator {
          id
          name
        }
      }
    }`,
    { itemId, body }
  );
}

export async function changeColumnValues(
  boardId: number,
  itemId: number,
  columnValues: string
): Promise<unknown> {
  await assertBoardIsPublic(boardId);

  return mondayQuery(
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
        id
        name
        column_values {
          id
          type
          text
          value
        }
      }
    }`,
    { boardId, itemId, columnValues }
  );
}

export async function createItem(
  boardId: number,
  itemName: string,
  groupId?: string,
  columnValues?: string
): Promise<unknown> {
  await assertBoardIsPublic(boardId);

  const variables: Record<string, unknown> = { boardId, itemName };
  const argDefs: string[] = ["$boardId: ID!", "$itemName: String!"];
  const mutationArgs: string[] = [
    "board_id: $boardId",
    "item_name: $itemName",
  ];

  if (groupId) {
    variables.groupId = groupId;
    argDefs.push("$groupId: String!");
    mutationArgs.push("group_id: $groupId");
  }

  if (columnValues) {
    variables.columnValues = columnValues;
    argDefs.push("$columnValues: JSON!");
    mutationArgs.push("column_values: $columnValues");
  }

  return mondayQuery(
    `mutation (${argDefs.join(", ")}) {
      create_item(${mutationArgs.join(", ")}) {
        id
        name
        group {
          id
          title
        }
        column_values {
          id
          type
          text
          value
        }
      }
    }`,
    variables
  );
}

export async function rawGraphQL(
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  // Security layer 1: Validate any board IDs referenced in the query
  await validateQueryBoardIds(query);

  // Security layer 2: Inject board_kind: public into boards() calls
  const safeQuery = injectPublicBoardKind(query);

  // Also check variables for board IDs
  if (variables) {
    const varStr = JSON.stringify(variables);
    const varBoardIds = extractBoardIdsFromQuery(varStr);
    for (const id of varBoardIds) {
      await assertBoardIsPublic(id);
    }
  }

  return mondayQuery(safeQuery, variables);
}
