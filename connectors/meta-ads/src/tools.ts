import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  getAdAccounts,
  getCampaigns,
  getAdSets,
  getAds,
  getInsights,
  getAudiences,
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
  server.tool(
    "get_ad_accounts",
    "List all Meta/Facebook ad accounts accessible by the authenticated user. Returns account ID, name, status, and currency.",
    {
      access_token: z.string().describe("Meta API access token"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ access_token, limit }) => {
      try {
        const result = await getAdAccounts(access_token, limit);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_campaigns",
    "List campaigns for a Meta ad account. Can filter by status (ACTIVE, PAUSED, etc). Returns campaign name, status, objective, and budget.",
    {
      access_token: z.string().describe("Meta API access token"),
      ad_account_id: z
        .string()
        .describe("Ad account ID (numeric, without 'act_' prefix)"),
      status: z
        .string()
        .optional()
        .describe("Filter by status: ACTIVE, PAUSED, DELETED, ARCHIVED"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ access_token, ad_account_id, status, limit }) => {
      try {
        const result = await getCampaigns(access_token, ad_account_id, {
          status,
          limit,
        });
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ad_sets",
    "List ad sets within a Meta campaign. Returns ad set name, status, budget, and targeting info.",
    {
      access_token: z.string().describe("Meta API access token"),
      campaign_id: z.string().describe("Campaign ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ access_token, campaign_id, limit }) => {
      try {
        const result = await getAdSets(access_token, campaign_id, limit);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ads",
    "List ads within a Meta ad set. Returns ad name, status, and creative info.",
    {
      access_token: z.string().describe("Meta API access token"),
      ad_set_id: z.string().describe("Ad set ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ access_token, ad_set_id, limit }) => {
      try {
        const result = await getAds(access_token, ad_set_id, limit);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_insights",
    "Pull performance metrics (impressions, clicks, spend, CPC, CPM, CTR, reach) for a Meta ad account, campaign, ad set, or ad. Supports date ranges and breakdowns.",
    {
      access_token: z.string().describe("Meta API access token"),
      object_id: z
        .string()
        .describe(
          "ID of the object to get insights for (ad account as act_XXXX, campaign ID, ad set ID, or ad ID)"
        ),
      date_preset: z
        .string()
        .optional()
        .describe(
          "Predefined date range: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month"
        ),
      since: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Use with 'until'."),
      until: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Use with 'since'."),
      breakdowns: z
        .array(z.string())
        .optional()
        .describe(
          "Breakdowns: age, gender, country, placement, device_platform"
        ),
      level: z
        .string()
        .optional()
        .describe("Aggregation level: account, campaign, adset, ad"),
    },
    async ({
      access_token,
      object_id,
      date_preset,
      since,
      until,
      breakdowns,
      level,
    }) => {
      try {
        const timeRange =
          since && until ? { since, until } : undefined;
        const result = await getInsights(access_token, object_id, {
          datePreset: date_preset,
          timeRange,
          breakdowns,
          level,
        });
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_audiences",
    "List custom and lookalike audiences for a Meta ad account. Returns audience name, type, approximate size, and delivery status.",
    {
      access_token: z.string().describe("Meta API access token"),
      ad_account_id: z
        .string()
        .describe("Ad account ID (numeric, without 'act_' prefix)"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ access_token, ad_account_id, limit }) => {
      try {
        const result = await getAudiences(access_token, ad_account_id, limit);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
