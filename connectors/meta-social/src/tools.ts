import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  getPages,
  getPageInsights,
  getPagePosts,
  getPostInsights,
  getInstagramAccounts,
  getInstagramInsights,
  getInstagramMedia,
  getInstagramMediaInsights,
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
  // ---- Facebook Pages ----

  server.tool(
    "get_pages",
    "List all Facebook Pages the authenticated user manages. Returns page ID, name, category, fan count, followers count, and page URL. Use the page ID from this response with other page tools.",
    {
      limit: z.number().optional().describe("Max results (default 100)"),
    },
    async (_params, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getPages(access_token);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_page_insights",
    "Get organic (non-paid) performance metrics for a Facebook Page over a date range. Metrics include total impressions, unique reach, engaged users, post engagements, fan count, new fans, lost fans, and page views. Use period='day' for daily timeseries, 'week'/'days_28'/'month' for aggregates.",
    {
      page_id: z
        .string()
        .describe("Facebook Page ID (from get_pages)"),
      period: z
        .enum(["day", "week", "days_28", "month"])
        .optional()
        .describe("Aggregation period (default: day)"),
      since: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Use with until."),
      until: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Use with since."),
      metrics: z
        .array(z.string())
        .optional()
        .describe(
          "Specific metrics to fetch. Defaults to: page_impressions, page_impressions_unique, page_engaged_users, page_post_engagements, page_fans, page_fan_adds, page_fan_removes, page_views_total"
        ),
    },
    async ({ page_id, period, since, until, metrics }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getPageInsights(access_token, page_id, {
          metrics,
          period,
          since,
          until,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_page_posts",
    "List recent organic posts on a Facebook Page. Returns post ID, message text, story text, created time, image URL, permalink, and attachment info. Use get_post_insights with the post ID to get performance metrics for individual posts.",
    {
      page_id: z
        .string()
        .describe("Facebook Page ID (from get_pages)"),
      limit: z
        .number()
        .optional()
        .describe("Max number of posts to return (default 25)"),
      since: z
        .string()
        .optional()
        .describe("Return posts after this date (UNIX timestamp or YYYY-MM-DD)"),
      until: z
        .string()
        .optional()
        .describe("Return posts before this date (UNIX timestamp or YYYY-MM-DD)"),
    },
    async ({ page_id, limit, since, until }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getPagePosts(access_token, page_id, {
          limit,
          since,
          until,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_post_insights",
    "Get detailed performance metrics for a specific Facebook Page post. Returns lifetime impressions, unique reach, engaged users, link clicks, and a breakdown of all reaction types (like, love, wow, haha, sorry, anger). Post ID comes from get_page_posts.",
    {
      post_id: z
        .string()
        .describe(
          "Facebook post ID (format: {pageId}_{postId}, from get_page_posts)"
        ),
    },
    async ({ post_id }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getPostInsights(access_token, post_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ---- Instagram ----

  server.tool(
    "get_instagram_accounts",
    "List all Instagram Business accounts connected to the user's Facebook Pages. Returns the Instagram User ID (needed for all other Instagram tools), username, name, biography, follower count, following count, media count, and the connected Facebook Page name/ID.",
    {},
    async (_params, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getInstagramAccounts(access_token);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_instagram_insights",
    "Get account-level organic analytics for an Instagram Business account over a date range. Metrics include impressions, reach, profile views, and follower count. Use period='day' for daily timeseries. The ig_user_id comes from get_instagram_accounts.",
    {
      ig_user_id: z
        .string()
        .describe("Instagram Business Account user ID (from get_instagram_accounts)"),
      period: z
        .enum(["day", "week", "days_28", "month"])
        .optional()
        .describe("Aggregation period (default: day)"),
      since: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Use with until."),
      until: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Use with since."),
      metrics: z
        .array(z.string())
        .optional()
        .describe(
          "Specific metrics to fetch. Defaults to: impressions, reach, profile_views, follower_count. Other options: email_contacts, phone_call_clicks, website_clicks, get_directions_clicks"
        ),
    },
    async ({ ig_user_id, period, since, until, metrics }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getInstagramInsights(access_token, ig_user_id, {
          metrics,
          period,
          since,
          until,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_instagram_media",
    "List recent Instagram media (posts, reels, stories, carousels) for an Instagram Business account. Returns media ID, caption, media type, thumbnail URL, permalink, timestamp, like count, and comment count. Use get_instagram_media_insights with the media ID for detailed performance data.",
    {
      ig_user_id: z
        .string()
        .describe("Instagram Business Account user ID (from get_instagram_accounts)"),
      limit: z
        .number()
        .optional()
        .describe("Max number of media items to return (default 25)"),
      since: z
        .string()
        .optional()
        .describe("Return media after this date (UNIX timestamp or YYYY-MM-DD)"),
      until: z
        .string()
        .optional()
        .describe("Return media before this date (UNIX timestamp or YYYY-MM-DD)"),
    },
    async ({ ig_user_id, limit, since, until }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getInstagramMedia(access_token, ig_user_id, {
          limit,
          since,
          until,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_instagram_media_insights",
    "Get detailed performance metrics for a specific Instagram post, reel, or story. Metrics vary by type — images/carousels: impressions, reach, likes, comments, shares, saves, total_interactions; reels/videos: also includes plays; stories: impressions, reach, exits, replies, taps_forward, taps_back. Media ID and type come from get_instagram_media.",
    {
      ig_media_id: z
        .string()
        .describe("Instagram media ID (from get_instagram_media)"),
      media_type: z
        .enum(["IMAGE", "VIDEO", "REEL", "STORY", "CAROUSEL_ALBUM"])
        .optional()
        .describe(
          "Media type — used to select the correct metrics. If omitted, image/carousel metrics are fetched."
        ),
    },
    async ({ ig_media_id, media_type }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getInstagramMediaInsights(
          access_token,
          ig_media_id,
          media_type
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
