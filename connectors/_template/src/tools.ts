import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import { getExampleResource } from "./api.js";

/**
 * Register all tools for this connector.
 * Each tool should:
 *  1. Define a clear description (Claude uses this to decide when to call it)
 *  2. Define input parameters with Zod schemas
 *  3. Call the API and return structured results
 *  4. Handle errors gracefully
 */
export function registerTools(server: McpServer) {
  server.tool(
    "get_example_resource",
    "Retrieves an example resource by ID. Replace this with a real tool.",
    {
      access_token: z.string().describe("OAuth access token"),
      resource_id: z.string().describe("The ID of the resource to retrieve"),
    },
    async ({ access_token, resource_id }) => {
      try {
        const result = await getExampleResource(access_token, resource_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof ConnectorError) {
          return error.toToolResult();
        }
        return {
          content: [
            { type: "text" as const, text: `Unexpected error: ${error}` },
          ],
          isError: true,
        };
      }
    }
  );
}
