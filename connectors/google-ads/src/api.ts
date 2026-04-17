import { apiRequest } from "@custom-connectors/shared";

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v23";
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

// ── Types ───────────────────────────────────────────────────────────────────

interface GoogleAdsSearchResponse {
  results: Record<string, unknown>[];
  totalResultsCount?: string;
  nextPageToken?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(accessToken: string, developerToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
  };
}

function loginCustomerHeader(loginCustomerId?: string): Record<string, string> {
  if (!loginCustomerId) return {};
  return { "login-customer-id": loginCustomerId };
}

// ── Core: GAQL Search ───────────────────────────────────────────────────────

export async function searchGoogleAds(
  accessToken: string,
  developerToken: string,
  customerId: string,
  query: string,
  options: { loginCustomerId?: string; pageSize?: number; pageToken?: string; retries?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  return apiRequest(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, developerToken),
        ...loginCustomerHeader(options.loginCustomerId),
      },
      body: {
        query,
        ...(options.pageSize && { pageSize: options.pageSize }),
        ...(options.pageToken && { pageToken: options.pageToken }),
      },
      retries: options.retries ?? 1,
    }
  );
}

// ── Read: Customers ─────────────────────────────────────────────────────────

export async function listAccessibleCustomers(
  accessToken: string,
  developerToken: string
): Promise<{ resourceNames: string[] }> {
  return apiRequest(
    `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
    { headers: authHeaders(accessToken, developerToken) }
  );
}

// ── Read: Campaigns ─────────────────────────────────────────────────────────

export async function getCampaigns(
  accessToken: string,
  developerToken: string,
  customerId: string,
  options: { status?: string; loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  let query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign.resource_name,
      campaign_budget.amount_micros,
      campaign_budget.resource_name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM campaign
  `;

  if (options.status) {
    query += ` WHERE campaign.status = '${options.status}'`;
  }

  query += ` LIMIT ${options.limit ?? 50}`;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Ad Groups ─────────────────────────────────────────────────────────

export async function getAdGroups(
  accessToken: string,
  developerToken: string,
  customerId: string,
  campaignId: string,
  options: { loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      ad_group.resource_name,
      ad_group.cpc_bid_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM ad_group
    WHERE campaign.id = ${campaignId}
    LIMIT ${options.limit ?? 50}
  `;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Ads ───────────────────────────────────────────────────────────────

export async function getAds(
  accessToken: string,
  developerToken: string,
  customerId: string,
  adGroupId: string,
  options: { loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.final_urls,
      ad_group_ad.status,
      ad_group_ad.resource_name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE ad_group.id = ${adGroupId}
    LIMIT ${options.limit ?? 50}
  `;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Keywords ──────────────────────────────────────────────────────────

export async function getKeywords(
  accessToken: string,
  developerToken: string,
  customerId: string,
  adGroupId: string,
  options: { loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  const query = `
    SELECT
      ad_group_criterion.resource_name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.cpc_bid_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.average_cpc
    FROM keyword_view
    WHERE ad_group.id = ${adGroupId}
    LIMIT ${options.limit ?? 100}
  `;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Performance Report ────────────────────────────────────────────────

export async function getPerformanceReport(
  accessToken: string,
  developerToken: string,
  customerId: string,
  options: {
    resource: string;
    dateRange: string;
    metrics?: string[];
    loginCustomerId?: string;
    limit?: number;
  }
): Promise<GoogleAdsSearchResponse> {
  const defaultMetrics = [
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
    "metrics.conversions",
    "metrics.conversions_value",
  ];

  const metricsFields = options.metrics?.length
    ? options.metrics.map((m) => (m.startsWith("metrics.") ? m : `metrics.${m}`))
    : defaultMetrics;

  const resourceFields: Record<string, string[]> = {
    campaign: ["campaign.id", "campaign.name", "campaign.status"],
    ad_group: ["ad_group.id", "ad_group.name", "campaign.name"],
    ad_group_ad: ["ad_group_ad.ad.id", "ad_group_ad.ad.name", "ad_group.name"],
  };

  const resource = options.resource || "campaign";
  const selectFields = [
    ...(resourceFields[resource] ?? resourceFields.campaign),
    "segments.date",
    ...metricsFields,
  ];

  const query = `
    SELECT ${selectFields.join(", ")}
    FROM ${resource}
    WHERE segments.date DURING ${options.dateRange}
    LIMIT ${options.limit ?? 100}
  `;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Search Terms ──────────────────────────────────────────────────────

export async function getSearchTerms(
  accessToken: string,
  developerToken: string,
  customerId: string,
  options: {
    campaignId?: string;
    dateRange?: string;
    loginCustomerId?: string;
    limit?: number;
  } = {}
): Promise<GoogleAdsSearchResponse> {
  let query = `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.name,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
  `;

  const conditions: string[] = [];
  if (options.campaignId) {
    conditions.push(`campaign.id = ${options.campaignId}`);
  }
  if (options.dateRange) {
    conditions.push(`segments.date DURING ${options.dateRange}`);
  }

  if (conditions.length) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += ` LIMIT ${options.limit ?? 100}`;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Campaign Budgets ──────────────────────────────────────────────────

export async function getCampaignBudgets(
  accessToken: string,
  developerToken: string,
  customerId: string,
  options: { loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  const query = `
    SELECT
      campaign_budget.resource_name,
      campaign_budget.id,
      campaign_budget.name,
      campaign_budget.amount_micros,
      campaign_budget.delivery_method,
      campaign_budget.explicitly_shared,
      campaign_budget.status
    FROM campaign_budget
    LIMIT ${options.limit ?? 50}
  `;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Bidding Strategies ────────────────────────────────────────────────

export async function getBiddingStrategies(
  accessToken: string,
  developerToken: string,
  customerId: string,
  options: { loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  const query = `
    SELECT
      bidding_strategy.resource_name,
      bidding_strategy.id,
      bidding_strategy.name,
      bidding_strategy.type,
      bidding_strategy.campaign_count,
      bidding_strategy.status
    FROM bidding_strategy
    LIMIT ${options.limit ?? 50}
  `;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Change History ────────────────────────────────────────────────────

export async function getChangeHistory(
  accessToken: string,
  developerToken: string,
  customerId: string,
  options: {
    dateRange?: string;
    resourceType?: string;
    loginCustomerId?: string;
    limit?: number;
  } = {}
): Promise<GoogleAdsSearchResponse> {
  let query = `
    SELECT
      change_event.change_date_time,
      change_event.change_resource_type,
      change_event.change_resource_name,
      change_event.client_type,
      change_event.user_email,
      change_event.old_resource,
      change_event.new_resource,
      change_event.resource_change_operation
    FROM change_event
  `;

  const conditions: string[] = [];
  if (options.dateRange) {
    conditions.push(`change_event.change_date_time DURING ${options.dateRange}`);
  }
  if (options.resourceType) {
    conditions.push(
      `change_event.change_resource_type = '${options.resourceType}'`
    );
  }

  if (conditions.length) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += ` ORDER BY change_event.change_date_time DESC`;
  query += ` LIMIT ${options.limit ?? 50}`;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Audience Segments ─────────────────────────────────────────────────

export async function getAudienceSegments(
  accessToken: string,
  developerToken: string,
  customerId: string,
  options: { loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  const query = `
    SELECT
      audience.resource_name,
      audience.id,
      audience.name,
      audience.status,
      audience.description
    FROM audience
    LIMIT ${options.limit ?? 50}
  `;

  return searchGoogleAds(accessToken, developerToken, customerId, query, {
    loginCustomerId: options.loginCustomerId,
  });
}

// ── Read: Geo Targets ───────────────────────────────────────────────────────

export async function searchGeoTargets(
  accessToken: string,
  developerToken: string,
  query: string,
  options: { countryCode?: string; locale?: string } = {}
): Promise<unknown> {
  return apiRequest(
    `${GOOGLE_ADS_API_BASE}/geoTargetConstants:suggest`,
    {
      method: "POST",
      headers: authHeaders(accessToken, developerToken),
      body: {
        locationNames: { names: [query] },
        ...(options.locale && { locale: options.locale }),
        ...(options.countryCode && { countryCode: options.countryCode }),
      },
    }
  );
}
