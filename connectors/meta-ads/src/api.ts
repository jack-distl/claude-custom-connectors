import { apiRequest, ConnectorError } from "@custom-connectors/shared";

const GRAPH_API_BASE = "https://graph.facebook.com/v23.0";

export type MetaObject = Record<string, unknown>;

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
}

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  impressions: string;
  clicks: string;
  spend: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  reach?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  action_values?: MetaAction[];
  conversions?: MetaAction[];
  conversion_values?: MetaAction[];
  purchase_roas?: MetaAction[];
  website_purchase_roas?: MetaAction[];
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

/**
 * Wrap apiRequest so Meta's structured error envelope
 * ({error:{message,code,error_subcode,fbtrace_id}}) is surfaced.
 * Shared apiRequest discards response bodies on 401 — this preserves them.
 */
async function metaRequest<T = unknown>(
  url: string,
  init: { method?: "GET" | "POST"; headers?: Record<string, string> } = {}
): Promise<T> {
  try {
    return await apiRequest<T>(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const match = message.match(/\{.*\}/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const metaErr = parsed?.error;
        if (metaErr) {
          const detail = [
            metaErr.message,
            metaErr.code !== undefined ? `code=${metaErr.code}` : null,
            metaErr.error_subcode !== undefined
              ? `subcode=${metaErr.error_subcode}`
              : null,
            metaErr.fbtrace_id ? `fbtrace_id=${metaErr.fbtrace_id}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          throw new ConnectorError(
            `Meta Graph API error: ${detail}`,
            "META_API_ERROR",
            500
          );
        }
      } catch {
        // fall through to rethrow
      }
    }
    throw err;
  }
}

// ---- Campaign fields ----
// Includes Advantage+ signals (smart_promotion_type, advantage_state_info) and
// budget/schedule info needed to derive CBO state.
const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "objective",
  "buying_type",
  "special_ad_categories",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "is_budget_schedule_enabled",
  "smart_promotion_type",
  "advantage_state_info",
  "created_time",
  "updated_time",
  "start_time",
  "stop_time",
].join(",");

// ---- Ad set fields ----
// targeting is expanded with the Advantage+ sub-objects the default view omits.
const TARGETING_SUBFIELDS = [
  "age_min",
  "age_max",
  "genders",
  "geo_locations",
  "flexible_spec",
  "exclusions",
  "custom_audiences",
  "excluded_custom_audiences",
  "publisher_platforms",
  "facebook_positions",
  "instagram_positions",
  "audience_network_positions",
  "messenger_positions",
  "device_platforms",
  "targeting_optimization",
  "targeting_relaxation_types",
  "targeting_automation",
].join(",");

const ADSET_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "bid_strategy",
  "bid_amount",
  "optimization_goal",
  "billing_event",
  `targeting{${TARGETING_SUBFIELDS}}`,
  "promoted_object",
  "is_dynamic_creative",
  "created_time",
  "updated_time",
  "start_time",
  "end_time",
].join(",");

// ---- Ad / Creative fields ----
const CREATIVE_SUBFIELDS = [
  "id",
  "name",
  "status",
  "object_story_spec",
  "asset_feed_spec",
  "object_type",
  "call_to_action_type",
  "image_url",
  "thumbnail_url",
  "effective_object_story_id",
  "degrees_of_freedom_spec{creative_features_spec}",
].join(",");

const AD_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "adset_id",
  "campaign_id",
  "account_id",
  `creative{${CREATIVE_SUBFIELDS}}`,
  "created_time",
  "updated_time",
].join(",");

export async function getAdAccounts(
  accessToken: string,
  limit = 25
): Promise<PaginatedResponse<MetaAdAccount>> {
  const fields = "id,name,account_id,account_status,currency";
  return metaRequest(
    `${GRAPH_API_BASE}/me/adaccounts?fields=${fields}&limit=${limit}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getCampaigns(
  accessToken: string,
  adAccountId: string,
  options: { status?: string; limit?: number } = {}
): Promise<PaginatedResponse<MetaObject>> {
  const params = new URLSearchParams({
    fields: CAMPAIGN_FIELDS,
    limit: String(options.limit ?? 25),
  });
  if (options.status) {
    params.set("effective_status", JSON.stringify([options.status]));
  }
  return metaRequest(
    `${GRAPH_API_BASE}/act_${adAccountId}/campaigns?${params}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getCampaign(
  accessToken: string,
  campaignId: string
): Promise<MetaObject> {
  const params = new URLSearchParams({ fields: CAMPAIGN_FIELDS });
  return metaRequest(`${GRAPH_API_BASE}/${campaignId}?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export async function getAdSets(
  accessToken: string,
  campaignId: string,
  limit = 25
): Promise<PaginatedResponse<MetaObject>> {
  const params = new URLSearchParams({
    fields: ADSET_FIELDS,
    limit: String(limit),
  });
  return metaRequest(
    `${GRAPH_API_BASE}/${campaignId}/adsets?${params}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getAdSet(
  accessToken: string,
  adSetId: string
): Promise<MetaObject> {
  const params = new URLSearchParams({ fields: ADSET_FIELDS });
  return metaRequest(`${GRAPH_API_BASE}/${adSetId}?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export async function getAds(
  accessToken: string,
  adSetId: string,
  limit = 25
): Promise<PaginatedResponse<MetaObject>> {
  const params = new URLSearchParams({
    fields: AD_FIELDS,
    limit: String(limit),
  });
  return metaRequest(
    `${GRAPH_API_BASE}/${adSetId}/ads?${params}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getAd(
  accessToken: string,
  adId: string
): Promise<MetaObject> {
  const params = new URLSearchParams({ fields: AD_FIELDS });
  return metaRequest(`${GRAPH_API_BASE}/${adId}?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export async function getAdCreative(
  accessToken: string,
  creativeId: string
): Promise<MetaObject> {
  const params = new URLSearchParams({ fields: CREATIVE_SUBFIELDS });
  return metaRequest(`${GRAPH_API_BASE}/${creativeId}?${params}`, {
    headers: authHeaders(accessToken),
  });
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
  const fields =
    "impressions,clicks,spend,cpc,cpm,ctr,reach,actions,cost_per_action_type,action_values,conversions,conversion_values,purchase_roas,website_purchase_roas";
  const params = new URLSearchParams({ fields });

  if (options.datePreset) {
    params.set("date_preset", options.datePreset);
  } else if (options.timeRange) {
    params.set("time_range", JSON.stringify(options.timeRange));
  }

  if (options.breakdowns?.length) {
    params.set("breakdowns", options.breakdowns.join(","));
  }
  if (options.level) {
    params.set("level", options.level);
  }

  return metaRequest(
    `${GRAPH_API_BASE}/${objectId}/insights?${params}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getAudiences(
  accessToken: string,
  adAccountId: string,
  limit = 25
): Promise<PaginatedResponse<MetaObject>> {
  const fields = "id,name,subtype,approximate_count,delivery_status";
  return metaRequest(
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
  return metaRequest<MetaUpdateResponse>(
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
  return metaRequest<MetaUpdateResponse>(
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
  return metaRequest<MetaUpdateResponse>(
    `${GRAPH_API_BASE}/${adId}?${params}`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    }
  );
}
