import { apiRequest } from "@custom-connectors/shared";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  daily_budget?: string;
  targeting?: Record<string, unknown>;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  creative?: Record<string, unknown>;
}

export interface MetaInsight {
  impressions: string;
  clicks: string;
  spend: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  reach?: string;
  date_start: string;
  date_stop: string;
}

interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}

interface MetaUpdateResponse {
  success: boolean;
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getAdAccounts(
  accessToken: string,
  limit = 25
): Promise<PaginatedResponse<MetaAdAccount>> {
  const fields = "id,name,account_id,account_status,currency";
  return apiRequest(
    `${GRAPH_API_BASE}/me/adaccounts?fields=${fields}&limit=${limit}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getCampaigns(
  accessToken: string,
  adAccountId: string,
  options: { status?: string; limit?: number } = {}
): Promise<PaginatedResponse<MetaCampaign>> {
  const fields = "id,name,status,objective,daily_budget,lifetime_budget,created_time";
  const params = new URLSearchParams({
    fields,
    limit: String(options.limit ?? 25),
  });
  if (options.status) {
    params.set("effective_status", JSON.stringify([options.status]));
  }
  return apiRequest(
    `${GRAPH_API_BASE}/act_${adAccountId}/campaigns?${params}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getAdSets(
  accessToken: string,
  campaignId: string,
  limit = 25
): Promise<PaginatedResponse<MetaAdSet>> {
  const fields = "id,name,status,campaign_id,daily_budget,targeting";
  return apiRequest(
    `${GRAPH_API_BASE}/${campaignId}/adsets?fields=${fields}&limit=${limit}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getAds(
  accessToken: string,
  adSetId: string,
  limit = 25
): Promise<PaginatedResponse<MetaAd>> {
  const fields = "id,name,status,adset_id,creative";
  return apiRequest(
    `${GRAPH_API_BASE}/${adSetId}/ads?fields=${fields}&limit=${limit}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getInsights(
  accessToken: string,
  objectId: string,
  options: {
    datePreset?: string;
    timeRange?: { since: string; until: string };
    breakdowns?: string[];
    level?: string;
  } = {}
): Promise<PaginatedResponse<MetaInsight>> {
  const fields = "impressions,clicks,spend,cpc,cpm,ctr,reach";
  const params = new URLSearchParams({ fields });

  if (options.datePreset) {
    params.set("date_preset", options.datePreset);
  } else if (options.timeRange) {
    params.set(
      "time_range",
      JSON.stringify(options.timeRange)
    );
  }

  if (options.breakdowns?.length) {
    params.set("breakdowns", options.breakdowns.join(","));
  }
  if (options.level) {
    params.set("level", options.level);
  }

  return apiRequest(
    `${GRAPH_API_BASE}/${objectId}/insights?${params}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getAudiences(
  accessToken: string,
  adAccountId: string,
  limit = 25
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const fields = "id,name,subtype,approximate_count,delivery_status";
  return apiRequest(
    `${GRAPH_API_BASE}/act_${adAccountId}/customaudiences?fields=${fields}&limit=${limit}`,
    { headers: authHeaders(accessToken) }
  );
}

function buildUpdateParams(fields: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      params.set(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value)
      );
    }
  }
  return params;
}

export async function updateCampaign(
  accessToken: string,
  campaignId: string,
  fields: Record<string, unknown>
): Promise<MetaUpdateResponse> {
  const params = buildUpdateParams(fields);
  return apiRequest<MetaUpdateResponse>(
    `${GRAPH_API_BASE}/${campaignId}?${params}`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    }
  );
}

export async function updateAdSet(
  accessToken: string,
  adSetId: string,
  fields: Record<string, unknown>
): Promise<MetaUpdateResponse> {
  const params = buildUpdateParams(fields);
  return apiRequest<MetaUpdateResponse>(
    `${GRAPH_API_BASE}/${adSetId}?${params}`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    }
  );
}

export async function updateAd(
  accessToken: string,
  adId: string,
  fields: Record<string, unknown>
): Promise<MetaUpdateResponse> {
  const params = buildUpdateParams(fields);
  return apiRequest<MetaUpdateResponse>(
    `${GRAPH_API_BASE}/${adId}?${params}`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    }
  );
}
