import { apiRequest } from "@custom-connectors/shared";

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v18";
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

// ── Types ───────────────────────────────────────────────────────────────────

interface GoogleAdsSearchResponse {
  results: Record<string, unknown>[];
  totalResultsCount?: string;
  nextPageToken?: string;
}

interface MutateOperation {
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  remove?: string;
  updateMask?: string;
}

interface MutateResponse {
  results: Array<{ resourceName: string; [key: string]: unknown }>;
  partialFailureError?: Record<string, unknown>;
}

interface CommonOptions {
  loginCustomerId?: string;
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

/**
 * Build an updateMask string from the non-undefined fields of an object.
 */
function buildUpdateMask(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k)
    .join(",");
}

// ── Core: GAQL Search ───────────────────────────────────────────────────────

export async function searchGoogleAds(
  accessToken: string,
  developerToken: string,
  customerId: string,
  query: string,
  options: { loginCustomerId?: string; pageSize?: number; pageToken?: string } = {}
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
    }
  );
}

// ── Core: Mutate ────────────────────────────────────────────────────────────

export async function mutateGoogleAds(
  accessToken: string,
  developerToken: string,
  customerId: string,
  resourceType: string,
  operations: MutateOperation[],
  options: CommonOptions & { validateOnly?: boolean; partialFailure?: boolean } = {}
): Promise<MutateResponse> {
  return apiRequest(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/${resourceType}:mutate`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, developerToken),
        ...loginCustomerHeader(options.loginCustomerId),
      },
      body: {
        operations,
        ...(options.validateOnly && { validateOnly: true }),
        ...(options.partialFailure && { partialFailure: true }),
      },
      retries: 0,
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

// ── Mutate: Campaign Budgets ────────────────────────────────────────────────

export async function createCampaignBudget(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    name: string;
    amountMicros: string;
    deliveryMethod?: string;
    explicitlyShared?: boolean;
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "campaignBudgets",
    [
      {
        create: {
          name: params.name,
          amountMicros: params.amountMicros,
          ...(params.deliveryMethod && {
            deliveryMethod: params.deliveryMethod,
          }),
          ...(params.explicitlyShared !== undefined && {
            explicitlyShared: params.explicitlyShared,
          }),
        },
      },
    ],
    options
  );
}

export async function updateCampaignBudget(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: { resourceName: string; amountMicros?: string; name?: string },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const updateFields: Record<string, unknown> = {};
  if (params.amountMicros !== undefined)
    updateFields.amountMicros = params.amountMicros;
  if (params.name !== undefined) updateFields.name = params.name;

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "campaignBudgets",
    [
      {
        update: { resourceName: params.resourceName, ...updateFields },
        updateMask: buildUpdateMask(updateFields),
      },
    ],
    options
  );
}

// ── Mutate: Campaigns ───────────────────────────────────────────────────────

export async function createCampaign(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    name: string;
    budgetResourceName: string;
    advertisingChannelType: string;
    status?: string;
    biddingStrategyType?: string;
    targetCpaMicros?: string;
    targetRoas?: number;
    networkSettings?: {
      targetGoogleSearch?: boolean;
      targetSearchNetwork?: boolean;
      targetContentNetwork?: boolean;
    };
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const campaign: Record<string, unknown> = {
    name: params.name,
    campaignBudget: params.budgetResourceName,
    advertisingChannelType: params.advertisingChannelType,
    status: params.status ?? "PAUSED",
  };

  if (params.biddingStrategyType) {
    switch (params.biddingStrategyType) {
      case "MANUAL_CPC":
        campaign.manualCpc = {};
        break;
      case "MAXIMIZE_CONVERSIONS":
        campaign.maximizeConversions = params.targetCpaMicros
          ? { targetCpaMicros: params.targetCpaMicros }
          : {};
        break;
      case "MAXIMIZE_CONVERSION_VALUE":
        campaign.maximizeConversionValue = params.targetRoas
          ? { targetRoas: params.targetRoas }
          : {};
        break;
      case "TARGET_SPEND":
        campaign.targetSpend = {};
        break;
    }
  }

  if (params.networkSettings) {
    campaign.networkSettings = params.networkSettings;
  }

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "campaigns",
    [{ create: campaign }],
    options
  );
}

export async function updateCampaign(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    resourceName: string;
    name?: string;
    status?: string;
    biddingStrategyType?: string;
    targetCpaMicros?: string;
    targetRoas?: number;
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const updateFields: Record<string, unknown> = {};
  if (params.name !== undefined) updateFields.name = params.name;
  if (params.status !== undefined) updateFields.status = params.status;

  if (params.biddingStrategyType) {
    switch (params.biddingStrategyType) {
      case "MANUAL_CPC":
        updateFields.manualCpc = {};
        break;
      case "MAXIMIZE_CONVERSIONS":
        updateFields.maximizeConversions = params.targetCpaMicros
          ? { targetCpaMicros: params.targetCpaMicros }
          : {};
        break;
      case "MAXIMIZE_CONVERSION_VALUE":
        updateFields.maximizeConversionValue = params.targetRoas
          ? { targetRoas: params.targetRoas }
          : {};
        break;
      case "TARGET_SPEND":
        updateFields.targetSpend = {};
        break;
    }
  }

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "campaigns",
    [
      {
        update: { resourceName: params.resourceName, ...updateFields },
        updateMask: buildUpdateMask(updateFields),
      },
    ],
    options
  );
}

export async function removeCampaign(
  accessToken: string,
  developerToken: string,
  customerId: string,
  resourceName: string,
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "campaigns",
    [{ remove: resourceName }],
    options
  );
}

// ── Mutate: Ad Groups ───────────────────────────────────────────────────────

export async function createAdGroup(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    campaignResourceName: string;
    name: string;
    status?: string;
    cpcBidMicros?: string;
    type?: string;
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const adGroup: Record<string, unknown> = {
    campaign: params.campaignResourceName,
    name: params.name,
    status: params.status ?? "ENABLED",
    type: params.type ?? "SEARCH_STANDARD",
  };

  if (params.cpcBidMicros) {
    adGroup.cpcBidMicros = params.cpcBidMicros;
  }

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroups",
    [{ create: adGroup }],
    options
  );
}

export async function updateAdGroup(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    resourceName: string;
    name?: string;
    status?: string;
    cpcBidMicros?: string;
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const updateFields: Record<string, unknown> = {};
  if (params.name !== undefined) updateFields.name = params.name;
  if (params.status !== undefined) updateFields.status = params.status;
  if (params.cpcBidMicros !== undefined)
    updateFields.cpcBidMicros = params.cpcBidMicros;

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroups",
    [
      {
        update: { resourceName: params.resourceName, ...updateFields },
        updateMask: buildUpdateMask(updateFields),
      },
    ],
    options
  );
}

export async function removeAdGroup(
  accessToken: string,
  developerToken: string,
  customerId: string,
  resourceName: string,
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroups",
    [{ remove: resourceName }],
    options
  );
}

// ── Mutate: Ads (Responsive Search Ads) ─────────────────────────────────────

export async function createResponsiveSearchAd(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    adGroupResourceName: string;
    headlines: string[];
    descriptions: string[];
    finalUrls: string[];
    path1?: string;
    path2?: string;
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const ad: Record<string, unknown> = {
    responsiveSearchAd: {
      headlines: params.headlines.map((text) => ({ text })),
      descriptions: params.descriptions.map((text) => ({ text })),
      ...(params.path1 && { path1: params.path1 }),
      ...(params.path2 && { path2: params.path2 }),
    },
    finalUrls: params.finalUrls,
  };

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupAds",
    [{ create: { adGroup: params.adGroupResourceName, status: "ENABLED", ad } }],
    options
  );
}

export async function updateAdGroupAdStatus(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: { resourceName: string; status: string },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupAds",
    [
      {
        update: {
          resourceName: params.resourceName,
          status: params.status,
        },
        updateMask: "status",
      },
    ],
    options
  );
}

export async function removeAdGroupAd(
  accessToken: string,
  developerToken: string,
  customerId: string,
  resourceName: string,
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupAds",
    [{ remove: resourceName }],
    options
  );
}

// ── Mutate: Keywords (Ad Group Criteria) ────────────────────────────────────

export async function addKeywords(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    adGroupResourceName: string;
    keywords: Array<{
      text: string;
      matchType: string;
      cpcBidMicros?: string;
    }>;
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const operations: MutateOperation[] = params.keywords.map((kw) => ({
    create: {
      adGroup: params.adGroupResourceName,
      keyword: { text: kw.text, matchType: kw.matchType },
      type: "KEYWORD",
      status: "ENABLED",
      ...(kw.cpcBidMicros && { cpcBidMicros: kw.cpcBidMicros }),
    },
  }));

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupCriteria",
    operations,
    options
  );
}

export async function updateKeyword(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: { resourceName: string; status?: string; cpcBidMicros?: string },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const updateFields: Record<string, unknown> = {};
  if (params.status !== undefined) updateFields.status = params.status;
  if (params.cpcBidMicros !== undefined)
    updateFields.cpcBidMicros = params.cpcBidMicros;

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupCriteria",
    [
      {
        update: { resourceName: params.resourceName, ...updateFields },
        updateMask: buildUpdateMask(updateFields),
      },
    ],
    options
  );
}

export async function removeKeyword(
  accessToken: string,
  developerToken: string,
  customerId: string,
  resourceName: string,
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupCriteria",
    [{ remove: resourceName }],
    options
  );
}

export async function addNegativeKeywords(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: {
    level: "campaign" | "ad_group";
    parentResourceName: string;
    keywords: Array<{ text: string; matchType: string }>;
  },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  const resourceType =
    params.level === "campaign" ? "campaignCriteria" : "adGroupCriteria";
  const parentField = params.level === "campaign" ? "campaign" : "adGroup";

  const operations: MutateOperation[] = params.keywords.map((kw) => ({
    create: {
      [parentField]: params.parentResourceName,
      keyword: { text: kw.text, matchType: kw.matchType },
      type: "KEYWORD",
      negative: true,
    },
  }));

  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    resourceType,
    operations,
    options
  );
}

// ── Mutate: Labels ──────────────────────────────────────────────────────────

export async function createLabel(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: { name: string; textColor?: string; backgroundColor?: string },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "labels",
    [
      {
        create: {
          name: params.name,
          ...(params.textColor || params.backgroundColor
            ? {
                textLabel: {
                  ...(params.textColor && { textColor: params.textColor }),
                  ...(params.backgroundColor && {
                    backgroundColor: params.backgroundColor,
                  }),
                },
              }
            : {}),
        },
      },
    ],
    options
  );
}

export async function applyCampaignLabel(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: { campaignResourceName: string; labelResourceName: string },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "campaignLabels",
    [
      {
        create: {
          campaign: params.campaignResourceName,
          label: params.labelResourceName,
        },
      },
    ],
    options
  );
}

export async function applyAdGroupLabel(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: { adGroupResourceName: string; labelResourceName: string },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupLabels",
    [
      {
        create: {
          adGroup: params.adGroupResourceName,
          label: params.labelResourceName,
        },
      },
    ],
    options
  );
}

export async function applyAdGroupAdLabel(
  accessToken: string,
  developerToken: string,
  customerId: string,
  params: { adGroupAdResourceName: string; labelResourceName: string },
  options: CommonOptions = {}
): Promise<MutateResponse> {
  return mutateGoogleAds(
    accessToken,
    developerToken,
    customerId,
    "adGroupAdLabels",
    [
      {
        create: {
          adGroupAd: params.adGroupAdResourceName,
          label: params.labelResourceName,
        },
      },
    ],
    options
  );
}
