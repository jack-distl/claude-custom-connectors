import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  listAccessibleCustomers,
  getCampaigns,
  getAdGroups,
  getKeywords,
  getPerformanceReport,
  getSearchTerms,
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
    "list_customers",
    "List all Google Ads customer accounts accessible by the authenticated user. Returns customer resource names.",
    {
      access_token: z.string().describe("Google OAuth access token"),
      developer_token: z
        .string()
        .describe("Google Ads API developer token"),
    },
    async ({ access_token, developer_token }) => {
      try {
        const result = await listAccessibleCustomers(
          access_token,
          developer_token
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_campaigns",
    "List campaigns for a Google Ads customer account. Can filter by status (ENABLED, PAUSED, REMOVED). Returns campaign details with basic metrics.",
    {
      access_token: z.string().describe("Google OAuth access token"),
      developer_token: z.string().describe("Google Ads API developer token"),
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      status: z
        .string()
        .optional()
        .describe("Filter by status: ENABLED, PAUSED, REMOVED"),
      login_customer_id: z
        .string()
        .optional()
        .describe("Manager account ID if accessing via MCC"),
      limit: z.number().optional().describe("Max results (default 50)"),
    },
    async ({
      access_token,
      developer_token,
      customer_id,
      status,
      login_customer_id,
      limit,
    }) => {
      try {
        const result = await getCampaigns(
          access_token,
          developer_token,
          customer_id,
          { status, loginCustomerId: login_customer_id, limit }
        );
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ad_groups",
    "List ad groups within a Google Ads campaign. Returns ad group details with basic metrics.",
    {
      access_token: z.string().describe("Google OAuth access token"),
      developer_token: z.string().describe("Google Ads API developer token"),
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      campaign_id: z.string().describe("Campaign ID"),
      login_customer_id: z
        .string()
        .optional()
        .describe("Manager account ID if accessing via MCC"),
      limit: z.number().optional().describe("Max results (default 50)"),
    },
    async ({
      access_token,
      developer_token,
      customer_id,
      campaign_id,
      login_customer_id,
      limit,
    }) => {
      try {
        const result = await getAdGroups(
          access_token,
          developer_token,
          customer_id,
          campaign_id,
          { loginCustomerId: login_customer_id, limit }
        );
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_keywords",
    "List keywords within a Google Ads ad group. Returns keyword text, match type, and performance metrics.",
    {
      access_token: z.string().describe("Google OAuth access token"),
      developer_token: z.string().describe("Google Ads API developer token"),
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      ad_group_id: z.string().describe("Ad group ID"),
      login_customer_id: z
        .string()
        .optional()
        .describe("Manager account ID if accessing via MCC"),
      limit: z.number().optional().describe("Max results (default 100)"),
    },
    async ({
      access_token,
      developer_token,
      customer_id,
      ad_group_id,
      login_customer_id,
      limit,
    }) => {
      try {
        const result = await getKeywords(
          access_token,
          developer_token,
          customer_id,
          ad_group_id,
          { loginCustomerId: login_customer_id, limit }
        );
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
      access_token: z.string().describe("Google OAuth access token"),
      developer_token: z.string().describe("Google Ads API developer token"),
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      resource: z
        .string()
        .optional()
        .describe(
          "Report resource: campaign, ad_group, or ad_group_ad (default: campaign)"
        ),
      date_range: z
        .string()
        .describe(
          "GAQL date range: LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, or custom like '20240101..20240131'"
        ),
      metrics: z
        .array(z.string())
        .optional()
        .describe(
          "Metrics to include (e.g. impressions, clicks, cost_micros, conversions). Defaults to standard set."
        ),
      login_customer_id: z
        .string()
        .optional()
        .describe("Manager account ID if accessing via MCC"),
      limit: z.number().optional().describe("Max results (default 100)"),
    },
    async ({
      access_token,
      developer_token,
      customer_id,
      resource,
      date_range,
      metrics,
      login_customer_id,
      limit,
    }) => {
      try {
        const result = await getPerformanceReport(
          access_token,
          developer_token,
          customer_id,
          {
            resource: resource ?? "campaign",
            dateRange: date_range,
            metrics,
            loginCustomerId: login_customer_id,
            limit,
          }
        );
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
      access_token: z.string().describe("Google OAuth access token"),
      developer_token: z.string().describe("Google Ads API developer token"),
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      campaign_id: z
        .string()
        .optional()
        .describe("Filter to a specific campaign ID"),
      date_range: z
        .string()
        .optional()
        .describe(
          "GAQL date range: LAST_7_DAYS, LAST_30_DAYS, etc. Defaults to all time."
        ),
      login_customer_id: z
        .string()
        .optional()
        .describe("Manager account ID if accessing via MCC"),
      limit: z.number().optional().describe("Max results (default 100)"),
    },
    async ({
      access_token,
      developer_token,
      customer_id,
      campaign_id,
      date_range,
      login_customer_id,
      limit,
    }) => {
      try {
        const result = await getSearchTerms(
          access_token,
          developer_token,
          customer_id,
          {
            campaignId: campaign_id,
            dateRange: date_range,
            loginCustomerId: login_customer_id,
            limit,
          }
        );
        return toolResult(result.results);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
