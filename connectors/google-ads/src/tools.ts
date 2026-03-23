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
  createCampaignBudget,
  updateCampaignBudget,
  createCampaign,
  updateCampaign,
  removeCampaign,
  createAdGroup,
  updateAdGroup,
  removeAdGroup,
  createResponsiveSearchAd,
  updateAdGroupAdStatus,
  removeAdGroupAd,
  addKeywords,
  updateKeyword,
  removeKeyword,
  addNegativeKeywords,
  createLabel,
  applyCampaignLabel,
  applyAdGroupLabel,
  applyAdGroupAdLabel,
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
    "Execute an arbitrary GAQL (Google Ads Query Language) query. Power-user tool for custom analysis and reporting beyond what other tools provide.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      query: z.string().describe("Full GAQL query (e.g. 'SELECT campaign.name, metrics.clicks FROM campaign WHERE metrics.clicks > 100')"),
    },
    async ({ customer_id, query, login_customer_id }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await searchGoogleAds(access_token, developer_token, customer_id, query, {
          loginCustomerId: login_customer_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

// ── Campaign & Budget Tools ─────────────────────────────────────────────────

function registerCampaignTools(server: McpServer) {
  server.tool(
    "create_campaign_budget",
    "Create a campaign budget. Amount is in micros (multiply dollars by 1,000,000). Returns the budget resource name needed when creating campaigns.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      name: z.string().describe("Budget name"),
      amount_micros: z.string().describe("Daily budget in micros (e.g. '50000000' for $50)"),
      delivery_method: z.enum(["STANDARD", "ACCELERATED"]).optional().describe("Budget delivery method (default: STANDARD)"),
      explicitly_shared: z.boolean().optional().describe("Whether this budget is shared across campaigns"),
    },
    async ({ customer_id, login_customer_id, name, amount_micros, delivery_method, explicitly_shared }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await createCampaignBudget(access_token, developer_token, customer_id, {
          name,
          amountMicros: amount_micros,
          deliveryMethod: delivery_method,
          explicitlyShared: explicitly_shared,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_campaign_budget",
    "Update a campaign budget's amount or name.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      budget_resource_name: z.string().describe("Budget resource name (e.g. customers/1234567890/campaignBudgets/111)"),
      amount_micros: z.string().optional().describe("New daily budget in micros"),
      name: z.string().optional().describe("New budget name"),
    },
    async ({ customer_id, login_customer_id, budget_resource_name, amount_micros, name }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await updateCampaignBudget(access_token, developer_token, customer_id, {
          resourceName: budget_resource_name,
          amountMicros: amount_micros,
          name,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_campaign",
    "Create a new Google Ads campaign. First create a budget with create_campaign_budget, then reference it here. Campaigns are created as PAUSED by default.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      name: z.string().describe("Campaign name"),
      budget_resource_name: z.string().describe("Budget resource name from create_campaign_budget"),
      advertising_channel_type: z.enum(["SEARCH", "DISPLAY", "SHOPPING", "VIDEO", "PERFORMANCE_MAX"]).describe("Campaign channel type"),
      status: z.enum(["ENABLED", "PAUSED"]).optional().describe("Campaign status (default: PAUSED)"),
      bidding_strategy_type: z.enum(["MANUAL_CPC", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_SPEND"]).optional().describe("Bidding strategy type"),
      target_cpa_micros: z.string().optional().describe("Target CPA in micros (for MAXIMIZE_CONVERSIONS with target)"),
      target_roas: z.number().optional().describe("Target ROAS as decimal (e.g. 3.0 for 300%)"),
    },
    async ({ customer_id, login_customer_id, name, budget_resource_name, advertising_channel_type, status, bidding_strategy_type, target_cpa_micros, target_roas }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await createCampaign(access_token, developer_token, customer_id, {
          name,
          budgetResourceName: budget_resource_name,
          advertisingChannelType: advertising_channel_type,
          status,
          biddingStrategyType: bidding_strategy_type,
          targetCpaMicros: target_cpa_micros,
          targetRoas: target_roas,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_campaign",
    "Update campaign settings. Change name, pause/enable, or modify bidding strategy. Only provided fields are updated.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      campaign_resource_name: z.string().describe("Campaign resource name (e.g. customers/1234567890/campaigns/111)"),
      name: z.string().optional().describe("New campaign name"),
      status: z.enum(["ENABLED", "PAUSED"]).optional().describe("New status"),
      bidding_strategy_type: z.enum(["MANUAL_CPC", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_SPEND"]).optional().describe("New bidding strategy"),
      target_cpa_micros: z.string().optional().describe("Target CPA in micros"),
      target_roas: z.number().optional().describe("Target ROAS as decimal"),
    },
    async ({ customer_id, login_customer_id, campaign_resource_name, name, status, bidding_strategy_type, target_cpa_micros, target_roas }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await updateCampaign(access_token, developer_token, customer_id, {
          resourceName: campaign_resource_name,
          name,
          status,
          biddingStrategyType: bidding_strategy_type,
          targetCpaMicros: target_cpa_micros,
          targetRoas: target_roas,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "remove_campaign",
    "Remove (delete) a campaign. This sets its status to REMOVED permanently.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      campaign_resource_name: z.string().describe("Campaign resource name (e.g. customers/1234567890/campaigns/111)"),
    },
    async ({ customer_id, login_customer_id, campaign_resource_name }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await removeCampaign(access_token, developer_token, customer_id, campaign_resource_name, {
          loginCustomerId: login_customer_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

// ── Ad Group Tools ──────────────────────────────────────────────────────────

function registerAdGroupTools(server: McpServer) {
  server.tool(
    "create_ad_group",
    "Create an ad group within a campaign. Specify a CPC bid and type (defaults to SEARCH_STANDARD).",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      campaign_resource_name: z.string().describe("Campaign resource name (e.g. customers/1234567890/campaigns/111)"),
      name: z.string().describe("Ad group name"),
      status: z.enum(["ENABLED", "PAUSED"]).optional().describe("Ad group status (default: ENABLED)"),
      cpc_bid_micros: z.string().optional().describe("Default CPC bid in micros (e.g. '2000000' for $2)"),
      type: z.enum(["SEARCH_STANDARD", "DISPLAY_STANDARD", "SHOPPING_PRODUCT_ADS"]).optional().describe("Ad group type (default: SEARCH_STANDARD)"),
    },
    async ({ customer_id, login_customer_id, campaign_resource_name, name, status, cpc_bid_micros, type }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await createAdGroup(access_token, developer_token, customer_id, {
          campaignResourceName: campaign_resource_name,
          name,
          status,
          cpcBidMicros: cpc_bid_micros,
          type,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_ad_group",
    "Update ad group settings: name, status (pause/enable), or CPC bid. Only provided fields are updated.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_resource_name: z.string().describe("Ad group resource name (e.g. customers/1234567890/adGroups/111)"),
      name: z.string().optional().describe("New ad group name"),
      status: z.enum(["ENABLED", "PAUSED"]).optional().describe("New status"),
      cpc_bid_micros: z.string().optional().describe("New default CPC bid in micros"),
    },
    async ({ customer_id, login_customer_id, ad_group_resource_name, name, status, cpc_bid_micros }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await updateAdGroup(access_token, developer_token, customer_id, {
          resourceName: ad_group_resource_name,
          name,
          status,
          cpcBidMicros: cpc_bid_micros,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "remove_ad_group",
    "Remove an ad group and all its ads and keywords.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_resource_name: z.string().describe("Ad group resource name (e.g. customers/1234567890/adGroups/111)"),
    },
    async ({ customer_id, login_customer_id, ad_group_resource_name }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await removeAdGroup(access_token, developer_token, customer_id, ad_group_resource_name, {
          loginCustomerId: login_customer_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

// ── Ad Tools ────────────────────────────────────────────────────────────────

function registerAdTools(server: McpServer) {
  server.tool(
    "create_responsive_search_ad",
    "Create a Responsive Search Ad (RSA). Requires 3-15 headlines (max 30 chars each) and 2-4 descriptions (max 90 chars each). Google tests combinations automatically.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_resource_name: z.string().describe("Ad group resource name to create the ad in"),
      headlines: z.array(z.string()).min(3).max(15).describe("3-15 headline texts (max 30 characters each)"),
      descriptions: z.array(z.string()).min(2).max(4).describe("2-4 description texts (max 90 characters each)"),
      final_urls: z.array(z.string()).min(1).describe("Landing page URLs"),
      path1: z.string().optional().describe("First display URL path segment (max 15 chars)"),
      path2: z.string().optional().describe("Second display URL path segment (max 15 chars)"),
    },
    async ({ customer_id, login_customer_id, ad_group_resource_name, headlines, descriptions, final_urls, path1, path2 }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await createResponsiveSearchAd(access_token, developer_token, customer_id, {
          adGroupResourceName: ad_group_resource_name,
          headlines,
          descriptions,
          finalUrls: final_urls,
          path1,
          path2,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_ad",
    "Pause or enable an ad.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_ad_resource_name: z.string().describe("Ad resource name (e.g. customers/1234567890/adGroupAds/111~222)"),
      status: z.enum(["ENABLED", "PAUSED"]).describe("New ad status"),
    },
    async ({ customer_id, login_customer_id, ad_group_ad_resource_name, status }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await updateAdGroupAdStatus(access_token, developer_token, customer_id, {
          resourceName: ad_group_ad_resource_name,
          status,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "remove_ad",
    "Remove an ad from an ad group.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_ad_resource_name: z.string().describe("Ad resource name (e.g. customers/1234567890/adGroupAds/111~222)"),
    },
    async ({ customer_id, login_customer_id, ad_group_ad_resource_name }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await removeAdGroupAd(access_token, developer_token, customer_id, ad_group_ad_resource_name, {
          loginCustomerId: login_customer_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

// ── Keyword Tools ───────────────────────────────────────────────────────────

function registerKeywordTools(server: McpServer) {
  server.tool(
    "add_keywords",
    "Add one or more keywords to an ad group. Supports batch adding with different match types and bids.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      ad_group_resource_name: z.string().describe("Ad group resource name to add keywords to"),
      keywords: z.array(z.object({
        text: z.string().describe("Keyword text"),
        match_type: z.enum(["EXACT", "PHRASE", "BROAD"]).describe("Keyword match type"),
        cpc_bid_micros: z.string().optional().describe("Keyword-level CPC bid in micros"),
      })).min(1).describe("Array of keywords to add"),
    },
    async ({ customer_id, login_customer_id, ad_group_resource_name, keywords }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await addKeywords(access_token, developer_token, customer_id, {
          adGroupResourceName: ad_group_resource_name,
          keywords: keywords.map((kw: { text: string; match_type: string; cpc_bid_micros?: string }) => ({
            text: kw.text,
            matchType: kw.match_type,
            cpcBidMicros: kw.cpc_bid_micros,
          })),
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_keyword",
    "Update a keyword's status (pause/enable) or CPC bid.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      criterion_resource_name: z.string().describe("Keyword criterion resource name (e.g. customers/1234567890/adGroupCriteria/111~222)"),
      status: z.enum(["ENABLED", "PAUSED"]).optional().describe("New keyword status"),
      cpc_bid_micros: z.string().optional().describe("New CPC bid in micros"),
    },
    async ({ customer_id, login_customer_id, criterion_resource_name, status, cpc_bid_micros }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await updateKeyword(access_token, developer_token, customer_id, {
          resourceName: criterion_resource_name,
          status,
          cpcBidMicros: cpc_bid_micros,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "remove_keyword",
    "Remove a keyword from an ad group.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      criterion_resource_name: z.string().describe("Keyword criterion resource name (e.g. customers/1234567890/adGroupCriteria/111~222)"),
    },
    async ({ customer_id, login_customer_id, criterion_resource_name }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await removeKeyword(access_token, developer_token, customer_id, criterion_resource_name, {
          loginCustomerId: login_customer_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "add_negative_keywords",
    "Add negative keywords at the campaign or ad group level to exclude search terms from triggering ads.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      level: z.enum(["campaign", "ad_group"]).describe("Level to add negatives: campaign or ad_group"),
      parent_resource_name: z.string().describe("Resource name of the campaign or ad group to add negatives to"),
      keywords: z.array(z.object({
        text: z.string().describe("Negative keyword text"),
        match_type: z.enum(["EXACT", "PHRASE", "BROAD"]).describe("Negative keyword match type"),
      })).min(1).describe("Array of negative keywords to add"),
    },
    async ({ customer_id, login_customer_id, level, parent_resource_name, keywords }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await addNegativeKeywords(access_token, developer_token, customer_id, {
          level,
          parentResourceName: parent_resource_name,
          keywords: keywords.map((kw: { text: string; match_type: string }) => ({
            text: kw.text,
            matchType: kw.match_type,
          })),
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

// ── Label Tools ─────────────────────────────────────────────────────────────

function registerLabelTools(server: McpServer) {
  server.tool(
    "create_label",
    "Create a label for organizing campaigns, ad groups, or ads. Labels help with filtering and reporting.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      name: z.string().describe("Label name"),
      text_color: z.string().optional().describe("Hex text color (e.g. '#FFFFFF')"),
      background_color: z.string().optional().describe("Hex background color (e.g. '#0000FF')"),
    },
    async ({ customer_id, login_customer_id, name, text_color, background_color }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        const result = await createLabel(access_token, developer_token, customer_id, {
          name,
          textColor: text_color,
          backgroundColor: background_color,
        }, { loginCustomerId: login_customer_id });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "apply_label",
    "Apply a label to a campaign, ad group, or ad for organization and reporting.",
    {
      customer_id: customerIdSchema,
      login_customer_id: loginCustomerIdSchema,
      label_resource_name: z.string().describe("Label resource name (e.g. customers/1234567890/labels/111)"),
      entity_resource_name: z.string().describe("Resource name of the campaign, ad group, or ad to label"),
      entity_type: z.enum(["campaign", "ad_group", "ad"]).describe("Type of entity being labeled"),
    },
    async ({ customer_id, login_customer_id, label_resource_name, entity_resource_name, entity_type }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const developer_token = getDeveloperToken();
        let result;
        const opts = { loginCustomerId: login_customer_id };

        switch (entity_type) {
          case "campaign":
            result = await applyCampaignLabel(access_token, developer_token, customer_id, {
              campaignResourceName: entity_resource_name,
              labelResourceName: label_resource_name,
            }, opts);
            break;
          case "ad_group":
            result = await applyAdGroupLabel(access_token, developer_token, customer_id, {
              adGroupResourceName: entity_resource_name,
              labelResourceName: label_resource_name,
            }, opts);
            break;
          case "ad":
            result = await applyAdGroupAdLabel(access_token, developer_token, customer_id, {
              adGroupAdResourceName: entity_resource_name,
              labelResourceName: label_resource_name,
            }, opts);
            break;
        }

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
  registerCampaignTools(server);
  registerAdGroupTools(server);
  registerAdTools(server);
  registerKeywordTools(server);
  registerLabelTools(server);
}
