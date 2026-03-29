import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  getProfile,
  getOrganization,
  getPosts,
  getPost,
  getComments,
  getReactions,
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

export function registerTools(server: McpServer) {
  server.tool(
    "get_profile",
    "Get the authenticated LinkedIn member's profile. Returns name, email, profile picture URL, and locale.",
    {},
    async (_params, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getProfile(accessToken);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_organization",
    "Get a LinkedIn organization/company page by ID. Returns name, description, vanity name, type, website, and logo.",
    {
      organization_id: z
        .string()
        .describe("The LinkedIn organization/company ID (numeric)"),
    },
    async ({ organization_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getOrganization(accessToken, organization_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_posts",
    "Get LinkedIn posts by a person or organization. Requires the author's full URN (e.g., 'urn:li:person:{id}' or 'urn:li:organization:{id}'). Returns post content, visibility, lifecycle state, and publish timestamp. Use get_organization_posts if you only have an organization ID.",
    {
      author_urn: z
        .string()
        .describe(
          "Author URN, e.g. 'urn:li:person:{id}' or 'urn:li:organization:{id}'"
        ),
      start: z.number().optional().describe("Pagination offset (default 0)"),
      count: z
        .number()
        .optional()
        .describe("Number of results to return (default 10, max 100)"),
    },
    async ({ author_urn, start, count }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getPosts(accessToken, author_urn, {
          start,
          count,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_post",
    "Get a single LinkedIn post by its URN. Returns full post details including content, visibility, author, and timestamps.",
    {
      post_urn: z
        .string()
        .describe(
          "The post URN, e.g. 'urn:li:share:{id}' or 'urn:li:ugcPost:{id}'"
        ),
    },
    async ({ post_urn }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getPost(accessToken, post_urn);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_comments",
    "Get comments on a LinkedIn post. Returns comment text, author, timestamp, and parent comment reference (for replies).",
    {
      post_urn: z
        .string()
        .describe("The post URN to get comments for"),
      start: z.number().optional().describe("Pagination offset (default 0)"),
      count: z
        .number()
        .optional()
        .describe("Number of results to return (default 10, max 100)"),
    },
    async ({ post_urn, start, count }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getComments(accessToken, post_urn, {
          start,
          count,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_reactions",
    "Get reactions on a LinkedIn post. Returns reaction type (LIKE, CELEBRATE, SUPPORT, LOVE, INSIGHTFUL, FUNNY), actor URN, and timestamp.",
    {
      post_urn: z
        .string()
        .describe("The post URN to get reactions for"),
      start: z.number().optional().describe("Pagination offset (default 0)"),
      count: z
        .number()
        .optional()
        .describe("Number of results to return (default 10, max 100)"),
    },
    async ({ post_urn, start, count }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getReactions(accessToken, post_urn, {
          start,
          count,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_organization_posts",
    "Get posts from a LinkedIn organization/company page by its numeric ID. Convenience wrapper that builds the organization URN automatically. Returns paginated posts with content, visibility, and timestamps.",
    {
      organization_id: z
        .string()
        .describe("The LinkedIn organization/company ID (numeric)"),
      start: z.number().optional().describe("Pagination offset (default 0)"),
      count: z
        .number()
        .optional()
        .describe("Number of results to return (default 10, max 100)"),
    },
    async ({ organization_id, start, count }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const authorUrn = `urn:li:organization:${organization_id}`;
        const result = await getPosts(accessToken, authorUrn, {
          start,
          count,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
