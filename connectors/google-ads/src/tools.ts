import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  listAccessibleCustomers,
  searchGoogleAds,
  getCampaigns,
  getAdGroups,
  getAds,
  getKeywords,
  getPerformanceReport,
  getSearchTerms,
  getCampaignBudgets,
  getBiddingStrategies,
  getChangeHistory,
  getAudienceSegments,
  searchGeoTargets,
} from "./api.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

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
    content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
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

function getDeveloperToken(): string {
  const token = process.env.GOOGLE_DEVELOPER_TOKEN;
  if (!token) {
    throw new ConnectorError("GOOGLE_DEVELOPER_TOKEN environment variable is not set on the server.", "CONFIG_ERROR", 500);
  }
  return token;
}

// Common Zod schemas reused across tools
const customerIdSchema = z.string().describe("Google Ads customer ID (10 digits, no dashes)");
const loginCustomerIdSchema = z.string().optional().describe("Manager account ID if accessing via MCC");
const limitSchema = z.number().optional();

// ── Read Tools ──────────────────────────────────────────────────────────────

function registerReadTools(server: McpServer) {
  server.tool(
    "list_customers",
    "List all Google Ads customer accounts accessible by the authenticated user. Returns customer resource names.",
    {},
    async (_params, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await listAccessibleCustomers(access_token, developer_token);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_campaigns",
    "List campaigns for a Google Ads customer account. Can filter by status (ENABLED, PAUSED, REMOVED). Returns campaign details with basic metrics and resource names.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      status: z.string().optional().describe("Filter by status: ENABLED, PAUSED, REMOVED"),
      limit: limitSchema.describe("Max results (default 50)"),
    },
    async ({ customer_id, status, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getCampaigns(access_token, developer_token, customer_id, {
          status,
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ad_groups",
    "List ad groups within a Google Ads campaign. Returns ad group details with basic metrics and resource names.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      campaign_id: z.string().describe("Campaign ID"),
      limit: limitSchema.describe("Max results (default 50)"),
    },
    async ({ customer_id, campaign_id, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getAdGroups(access_token, developer_token, customer_id, campaign_id, {
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ads",
    "List ads within a Google Ads ad group. Returns ad type, status, headlines, descriptions, final URLs, and performance metrics.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_id: z.string().describe("Ad group ID"),
      limit: limitSchema.describe("Max results (default 50)"),
    },
    async ({ customer_id, ad_group_id, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getAds(access_token, developer_token, customer_id, ad_group_id, {
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_keywords",
    "List keywords within a Google Ads ad group. Returns keyword text, match type, status, bids, and performance metrics.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_id: z.string().describe("Ad group ID"),
      limit: limitSchema.describe("Max results (default 100)"),
    },
    async ({ customer_id, ad_group_id, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getKeywords(access_token, developer_token, customer_id, ad_group_id, {
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_performance_report",
    "Pull a performance report for a Google Ads account using GAQL. Supports campaign, ad_group, or ad_group_ad level reporting with custom date ranges and metrics.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      resource: z.string().optional().describe("Report resource: campaign, ad_group, or ad_group_ad (default: campaign)"),
      date_range: z.string().describe("GAQL date range: LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, or custom like '20240101..20240131'"),
      metrics: z.array(z.string()).optional().describe("Metrics to include (e.g. impressions, clicks, cost_micros, conversions). Defaults to standard set."),
      limit: limitSchema.describe("Max results (default 100)"),
    },
    async ({ customer_id, resource, date_range, metrics, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getPerformanceReport(access_token, developer_token, customer_id, {
          resource: resource ?? "campaign",
          dateRange: date_range,
          metrics,
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_search_terms",
    "Get the search terms report showing what people actually searched for that triggered your ads. Useful for finding new keyword opportunities and negatives.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      campaign_id: z.string().optional().describe("Filter to a specific campaign ID"),
      date_range: z.string().optional().describe("GAQL date range: LAST_7_DAYS, LAST_30_DAYS, etc. Defaults to all time."),
      limit: limitSchema.describe("Max results (default 100)"),
    },
    async ({ customer_id, campaign_id, date_range, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getSearchTerms(access_token, developer_token, customer_id, {
          campaignId: campaign_id,
          dateRange: date_range,
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_campaign_budgets",
    "List campaign budgets in the account. Returns budget resource names, amounts, delivery method, and sharing status.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      limit: limitSchema.describe("Max results (default 50)"),
    },
    async ({ customer_id, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getCampaignBudgets(access_token, developer_token, customer_id, {
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_bidding_strategies",
    "List portfolio bidding strategies in the account. Returns strategy names, types, and campaign counts.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      limit: limitSchema.describe("Max results (default 50)"),
    },
    async ({ customer_id, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getBiddingStrategies(access_token, developer_token, customer_id, {
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_change_history",
    "View recent changes made to the Google Ads account. Shows who changed what, when, and the old/new values.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      date_range: z.string().optional().describe("GAQL date range: LAST_7_DAYS, LAST_14_DAYS, etc."),
      resource_type: z.string().optional().describe("Filter by resource type: CAMPAIGN, AD_GROUP, AD_GROUP_AD, AD_GROUP_CRITERION, etc."),
      limit: limitSchema.describe("Max results (default 50)"),
    },
    async ({ customer_id, date_range, resource_type, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getChangeHistory(access_token, developer_token, customer_id, {
          dateRange: date_range,
          resourceType: resource_type,
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_audience_segments",
    "List audience segments available for targeting in the account.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      limit: limitSchema.describe("Max results (default 50)"),
    },
    async ({ customer_id, login_customer_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await getAudienceSegments(access_token, developer_token, customer_id, {
          loginCustomerId: login_customer_id,
          limit,
        });
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_geo_targets",
    "Search for geographic targeting locations by name. Returns geo target constants for cities, regions, countries, etc.",
    {
      query: z.string().describe("Location name to search for (e.g. 'New York', 'France')"),
      country_code: z.string().optional().describe("ISO 3166-1 alpha-2 country code to restrict results"),
      locale: z.string().optional().describe("Locale for results (e.g. 'en', 'es'). Default: en"),
    },
    async ({ query, country_code, locale }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await searchGeoTargets(access_token, developer_token, query, {
          countryCode: country_code,
          locale,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "run_gaql_query",
    "Execute an arbitrary GAQL query for custom analysis. Always include a LIMIT clause (recommended: 100 or less) to conserve API quota. Prefer the dedicated read tools when they cover your use case, as they are pre-optimized.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      query: z.string().describe("Full GAQL query (e.g. 'SELECT campaign.name, metrics.clicks FROM campaign WHERE metrics.clicks > 100 LIMIT 50')"),
    },
    async ({ customer_id, query, login_customer_id }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        let safeQuery = query;
        if (!/\bLIMIT\b/i.test(safeQuery)) {
          safeQuery += " LIMIT 100";
        }
        const result = await searchGoogleAds(access_token, developer_token, customer_id, safeQuery, {
          loginCustomerId: login_customer_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

// ── Main Registration ───────────────────────────────────────────────────────

export function registerTools(server: McpServer) {
  registerReadTools(server);
}
