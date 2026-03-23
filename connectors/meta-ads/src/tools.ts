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
  updateCampaign,
  updateAdSet,
  updateAd,
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
    throw new ConnectorError("No access token found. Please reconnect to authenticate.", "AUTH_REQUIRED", 401);
  }
  return token;
}

export function registerTools(server: McpServer) {
  server.tool(
    "get_ad_accounts",
    "List all Meta/Facebook ad accounts accessible by the authenticated user. Returns account ID, name, status, and currency.",
    {
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
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
      ad_account_id: z
        .string()
        .describe("Ad account ID (numeric, without 'act_' prefix)"),
      status: z
        .string()
        .optional()
        .describe("Filter by status: ACTIVE, PAUSED, DELETED, ARCHIVED"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ ad_account_id, status, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
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
      campaign_id: z.string().describe("Campaign ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ campaign_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
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
      ad_set_id: z.string().describe("Ad set ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ ad_set_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
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
      object_id,
      date_preset,
      since,
      until,
      breakdowns,
      level,
    }, extra) => {
      try {
        const access_token = getAccessToken(extra);
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
      ad_account_id: z
        .string()
        .describe("Ad account ID (numeric, without 'act_' prefix)"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ ad_account_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getAudiences(access_token, ad_account_id, limit);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // --- Write/Edit Tools ---

  server.tool(
    "update_campaign",
    "Update a Meta/Facebook campaign. Can change status (pause/activate), name, or budget. Budget values are in cents (e.g., 5000 = $50.00). Provide at least one field to update.",
    {
      campaign_id: z.string().describe("The campaign ID to update"),
      name: z.string().optional().describe("New campaign name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New campaign status"),
      daily_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New daily budget in cents (e.g., 5000 = $50.00). Cannot be used with lifetime_budget."
        ),
      lifetime_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New lifetime budget in cents (e.g., 100000 = $1,000.00). Cannot be used with daily_budget."
        ),
      special_ad_categories: z
        .array(z.string())
        .optional()
        .describe(
          "Special ad categories: NONE, EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS"
        ),
    },
    async (
      { campaign_id, name, status, daily_budget, lifetime_budget, special_ad_categories },
      extra
    ) => {
      try {
        const access_token = getAccessToken(extra);
        const fields: Record<string, unknown> = {};
        if (name !== undefined) fields.name = name;
        if (status !== undefined) fields.status = status;
        if (daily_budget !== undefined) fields.daily_budget = daily_budget;
        if (lifetime_budget !== undefined) fields.lifetime_budget = lifetime_budget;
        if (special_ad_categories !== undefined)
          fields.special_ad_categories = special_ad_categories;

        if (Object.keys(fields).length === 0) {
          return errorResult(
            new ConnectorError(
              "At least one field must be provided to update",
              "VALIDATION_ERROR",
              400
            )
          );
        }

        const result = await updateCampaign(access_token, campaign_id, fields);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_ad_set",
    "Update a Meta/Facebook ad set. Can change status, name, budget, targeting, bid amount, and schedule. Budget and bid values are in cents (e.g., 5000 = $50.00). Provide at least one field to update.",
    {
      ad_set_id: z.string().describe("The ad set ID to update"),
      name: z.string().optional().describe("New ad set name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New ad set status"),
      daily_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New daily budget in cents (e.g., 5000 = $50.00). Cannot be used with lifetime_budget."
        ),
      lifetime_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New lifetime budget in cents. Cannot be used with daily_budget."
        ),
      bid_amount: z
        .number()
        .int()
        .optional()
        .describe("Bid amount in cents for the ad set"),
      billing_event: z
        .enum([
          "IMPRESSIONS",
          "LINK_CLICKS",
          "APP_INSTALLS",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "VIDEO_VIEWS",
        ])
        .optional()
        .describe("What the ad set is billed on"),
      optimization_goal: z
        .enum([
          "NONE",
          "APP_INSTALLS",
          "BRAND_AWARENESS",
          "CLICKS",
          "ENGAGED_USERS",
          "EVENT_RESPONSES",
          "IMPRESSIONS",
          "LEAD_GENERATION",
          "LINK_CLICKS",
          "OFFSITE_CONVERSIONS",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "REACH",
          "SOCIAL_IMPRESSIONS",
          "VALUE",
          "LANDING_PAGE_VIEWS",
          "CONVERSATIONS",
        ])
        .optional()
        .describe("Optimization goal for the ad set"),
      targeting: z
        .record(z.unknown())
        .optional()
        .describe(
          "Targeting spec object (JSON). See Meta Marketing API docs for structure."
        ),
      start_time: z
        .string()
        .optional()
        .describe(
          "Start time in ISO 8601 format (e.g., 2024-01-15T00:00:00-0800)"
        ),
      end_time: z
        .string()
        .optional()
        .describe(
          "End time in ISO 8601 format. Required if using lifetime_budget."
        ),
    },
    async (
      {
        ad_set_id,
        name,
        status,
        daily_budget,
        lifetime_budget,
        bid_amount,
        billing_event,
        optimization_goal,
        targeting,
        start_time,
        end_time,
      },
      extra
    ) => {
      try {
        const access_token = getAccessToken(extra);
        const fields: Record<string, unknown> = {};
        if (name !== undefined) fields.name = name;
        if (status !== undefined) fields.status = status;
        if (daily_budget !== undefined) fields.daily_budget = daily_budget;
        if (lifetime_budget !== undefined) fields.lifetime_budget = lifetime_budget;
        if (bid_amount !== undefined) fields.bid_amount = bid_amount;
        if (billing_event !== undefined) fields.billing_event = billing_event;
        if (optimization_goal !== undefined)
          fields.optimization_goal = optimization_goal;
        if (targeting !== undefined) fields.targeting = targeting;
        if (start_time !== undefined) fields.start_time = start_time;
        if (end_time !== undefined) fields.end_time = end_time;

        if (Object.keys(fields).length === 0) {
          return errorResult(
            new ConnectorError(
              "At least one field must be provided to update",
              "VALIDATION_ERROR",
              400
            )
          );
        }

        const result = await updateAdSet(access_token, ad_set_id, fields);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_ad",
    "Update a Meta/Facebook ad. Can change status (pause/activate), name, or creative. Provide at least one field to update.",
    {
      ad_id: z.string().describe("The ad ID to update"),
      name: z.string().optional().describe("New ad name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New ad status"),
      creative: z
        .record(z.unknown())
        .optional()
        .describe(
          "Creative spec object (JSON) with creative_id or inline creative fields"
        ),
    },
    async ({ ad_id, name, status, creative }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const fields: Record<string, unknown> = {};
        if (name !== undefined) fields.name = name;
        if (status !== undefined) fields.status = status;
        if (creative !== undefined) fields.creative = creative;

        if (Object.keys(fields).length === 0) {
          return errorResult(
            new ConnectorError(
              "At least one field must be provided to update",
              "VALIDATION_ERROR",
              400
            )
          );
        }

        const result = await updateAd(access_token, ad_id, fields);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
