import { apiRequest } from "@custom-connectors/shared";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v18";

interface GoogleAdsSearchResponse {
  results: Record<string, unknown>[];
  totalResultsCount?: string;
  nextPageToken?: string;
}

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

/**
 * Execute a Google Ads Query Language (GAQL) query.
 */
export async function searchGoogleAds(
  accessToken: string,
  developerToken: string,
  customerId: string,
  query: string,
  options: { loginCustomerId?: string; pageSize?: number; pageToken?: string } = {}
): Promise<GoogleAdsSearchResponse> {
  return apiRequest(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,
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
    }
  );
}

export async function listAccessibleCustomers(
  accessToken: string,
  developerToken: string
): Promise<{ resourceNames: string[] }> {
  return apiRequest(
    `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
    { headers: authHeaders(accessToken, developerToken) }
  );
}

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
      campaign_budget.amount_micros,
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

export async function getKeywords(
  accessToken: string,
  developerToken: string,
  customerId: string,
  adGroupId: string,
  options: { loginCustomerId?: string; limit?: number } = {}
): Promise<GoogleAdsSearchResponse> {
  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
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
