import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import { getExampleResource } from "./api.js";

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

/**
 * Extract the OAuth access token from the MCP transport layer.
 * The token is provided automatically by Claude's integration — it is NOT
 * a tool parameter. It arrives via extra.authInfo.token on every request.
 */
function getAccessToken(extra: { authInfo?: { token?: string } }): string {
  const token = extra.authInfo?.token;
  if (!token) {
    throw new ConnectorError(
      "No access token found. Please reconnect to authenticate.",
      "AUTH_REQUIRED",
      401
    );
  }
  return token;
}

/**
 * Register all tools for this connector.
 * Each tool should:
 *  1. Define a clear description (Claude uses this to decide when to call it)
 *  2. Define input parameters with Zod schemas (do NOT include access_token)
 *  3. Use (params, extra) => handler signature to get the auth token from extra
 *  4. Call the API and return structured results via toolResult()
 *  5. Handle errors via errorResult()
 */
export function registerTools(server: McpServer) {
  server.tool(
    "get_example_resource",
    "Retrieves an example resource by ID. Replace this with a real tool.",
    {
      resource_id: z.string().describe("The ID of the resource to retrieve"),
    },
    async ({ resource_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getExampleResource(accessToken, resource_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
