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
  // Entity identifiers — returned per row based on the requested `level`,
  // so a result can be attributed to a specific campaign / ad set / ad.
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
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
 * Append caller-supplied fields to a curated default field string,
 * de-duplicating by top-level field name (ignores nested {...} expansions).
 */
function mergeFields(defaults: string, extra?: string[]): string {
  if (!extra?.length) return defaults;
  const seen = new Set(defaults.split(",").map((f) => f.split("{")[0].trim()));
  const merged = [defaults];
  for (const field of extra) {
    const key = field.split("{")[0].trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(field);
    }
  }
  return merged.join(",");
}

/**
 * Exchange the user token for a Page access token. Leadgen edges
 * (leadgen_forms, leads) and a page post's call_to_action require a
 * Page token, not the user token. Mirrors meta-social's helper.
 */
async function getPageToken(userToken: string, pageId: string): Promise<string> {
  const params = new URLSearchParams({ fields: "id,access_token", limit: "100" });
  const response = await metaRequest<
    PaginatedResponse<{ id: string; access_token: string }>
  >(`${GRAPH_API_BASE}/me/accounts?${params}`, {
    headers: authHeaders(userToken),
  });
  const page = response.data.find((p) => p.id === pageId);
  if (!page) {
    throw new ConnectorError(
      `No access to page ${pageId}. The authenticated user must have a role on this Page (check pages_show_list / pages_read_engagement scopes).`,
      "NOT_FOUND",
      404
    );
  }
  return page.access_token;
}

// Extract the page ID from a post / story ID (format: {pageId}_{postId}).
function pageIdFromPostId(postId: string): string | null {
  const parts = postId.split("_");
  return parts.length >= 2 ? parts[0] : null;
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
export const CAMPAIGN_FIELDS = [
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

export const ADSET_FIELDS = [
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
  "destination_type",
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
  "object_story_id",
  "degrees_of_freedom_spec{creative_features_spec}",
].join(",");

export const AD_FIELDS = [
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

// ---- Low-level Graph GET used by the account-wide creative-freedom walk ----
//
// The generic shared `apiRequest` / `metaRequest` path discards response
// headers and applies its own (non-jittered, uncapped) retry, and — because of
// the swallowed-rethrow in metaRequest — surfaces throttle errors only as the
// raw `API returned <status>: {"...","code":17,...}` body. The walk needs the
// X-Business-Use-Case-Usage header for pre-emptive throttling and needs errors
// whose code/subcode are parseable, so it uses this dedicated request instead.

const GRAPH_REQUEST_TIMEOUT = 30_000;

export interface GraphResponse<T = MetaObject> {
  body: T;
  /** Raw X-Business-Use-Case-Usage (or app/ad-account usage) header, if present. */
  usageHeader: string | null;
}

export async function graphRequest<T = MetaObject>(
  accessToken: string,
  path: string,
  params: URLSearchParams
): Promise<GraphResponse<T>> {
  const url = `${GRAPH_API_BASE}/${path}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_REQUEST_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // Network / abort / timeout — transient; classified retryable by the walk.
    const detail = err instanceof Error ? err.message : String(err);
    throw new ConnectorError(
      `Meta Graph request to ${path} failed (network/timeout): ${detail}`,
      "NETWORK_ERROR",
      503
    );
  }
  clearTimeout(timer);

  const usageHeader =
    response.headers.get("x-business-use-case-usage") ??
    response.headers.get("x-app-usage") ??
    response.headers.get("x-ad-account-usage");

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let code: number | undefined;
    let subcode: number | undefined;
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) {
        code = parsed.error.code;
        subcode = parsed.error.error_subcode;
        message = parsed.error.message ?? text;
      }
    } catch {
      // keep raw text
    }
    // Surface status + code + subcode in a parseable form ("code=17 | subcode=..")
    // so the retry classifier can recognise soft throttles regardless of
    // Meta's is_transient flag.
    const detail = [
      `status=${response.status}`,
      message,
      code !== undefined ? `code=${code}` : null,
      subcode !== undefined ? `subcode=${subcode}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    throw new ConnectorError(
      `Meta Graph API error: ${detail}`,
      "META_API_ERROR",
      response.status
    );
  }

  const body = (await response.json()) as T;
  return { body, usageHeader };
}

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
  options: { status?: string; limit?: number; after?: string; fields?: string[] } = {}
): Promise<PaginatedResponse<MetaObject>> {
  const params = new URLSearchParams({
    fields: mergeFields(CAMPAIGN_FIELDS, options.fields),
    limit: String(options.limit ?? 25),
  });
  if (options.status) {
    params.set("effective_status", JSON.stringify([options.status]));
  }
  if (options.after) {
    params.set("after", options.after);
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
  options: { limit?: number; after?: string; fields?: string[] } = {}
): Promise<PaginatedResponse<MetaObject>> {
  const params = new URLSearchParams({
    fields: mergeFields(ADSET_FIELDS, options.fields),
    limit: String(options.limit ?? 25),
  });
  if (options.after) {
    params.set("after", options.after);
  }
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
  options: { limit?: number; after?: string; fields?: string[] } = {}
): Promise<PaginatedResponse<MetaObject>> {
  const params = new URLSearchParams({
    fields: mergeFields(AD_FIELDS, options.fields),
    limit: String(options.limit ?? 25),
  });
  if (options.after) {
    params.set("after", options.after);
  }
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

// Includes entity identifiers (campaign/adset/ad id + name) so each row can be
// attributed to a specific object. The Graph API returns these per row based on
// the requested `level`.
const INSIGHTS_FIELDS =
  "impressions,clicks,spend,cpc,cpm,ctr,reach,actions,cost_per_action_type,action_values,conversions,conversion_values,purchase_roas,website_purchase_roas,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name";

export async function getInsights(
  accessToken: string,
  objectId: string,
  options: {
    datePreset?: string;
    timeRange?: { since: string; until: string };
    breakdowns?: string[];
    level?: string;
    actionAttributionWindows?: string[];
    fields?: string[];
  } = {}
): Promise<PaginatedResponse<MetaInsight>> {
  const params = new URLSearchParams({
    fields: mergeFields(INSIGHTS_FIELDS, options.fields),
  });

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
  if (options.actionAttributionWindows?.length) {
    params.set(
      "action_attribution_windows",
      JSON.stringify(options.actionAttributionWindows)
    );
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

/**
 * Resolve the destination of a page-post-backed creative.
 * When a creative has no inline object_story_spec, the CTA / link /
 * lead_gen_form_id live on the underlying post, which requires a Page token to
 * read. Derives the page token from the story id and fetches the post's
 * call_to_action and attachments. Best-effort: never throws — returns a
 * { resolution_error } marker on failure so the caller can degrade gracefully.
 */
export async function getPagePostDestination(
  userToken: string,
  storyId: string
): Promise<MetaObject> {
  const fields =
    "id,call_to_action{type,value{link,lead_gen_form_id,app_link,application}},permalink_url,attachments{title,unshimmed_url,target,call_to_action_type}";
  try {
    const pageId = pageIdFromPostId(storyId);
    let token = userToken;
    if (pageId) {
      try {
        token = await getPageToken(userToken, pageId);
      } catch {
        // Fall back to the user token; the post read may still succeed.
        token = userToken;
      }
    }
    const params = new URLSearchParams({ fields });
    return await metaRequest(`${GRAPH_API_BASE}/${storyId}?${params}`, {
      headers: authHeaders(token),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { resolution_error: message };
  }
}

const LEAD_FORM_FIELDS =
  "id,name,status,created_time,leads_count,expired_leads_count,locale,questions";

export async function getLeadForms(
  userToken: string,
  pageId: string,
  options: { limit?: number; after?: string; fields?: string[] } = {}
): Promise<PaginatedResponse<MetaObject>> {
  const pageToken = await getPageToken(userToken, pageId);
  const params = new URLSearchParams({
    fields: mergeFields(LEAD_FORM_FIELDS, options.fields),
    limit: String(options.limit ?? 25),
  });
  if (options.after) {
    params.set("after", options.after);
  }
  return metaRequest(`${GRAPH_API_BASE}/${pageId}/leadgen_forms?${params}`, {
    headers: authHeaders(pageToken),
  });
}

const LEAD_FIELDS = "id,created_time,field_data,ad_id,form_id,campaign_id";

export async function getFormLeads(
  userToken: string,
  formId: string,
  options: { pageId?: string; limit?: number; after?: string; fields?: string[] } = {}
): Promise<PaginatedResponse<MetaObject>> {
  // The /leads edge requires a Page token. The caller has only a form id, so
  // resolve the owning page (from the explicit param or the form metadata).
  let pageId = options.pageId;
  if (!pageId) {
    const formMeta = await metaRequest<{ page?: { id?: string } }>(
      `${GRAPH_API_BASE}/${formId}?fields=id,name,page{id,name}`,
      { headers: authHeaders(userToken) }
    );
    pageId = formMeta.page?.id;
  }
  if (!pageId) {
    throw new ConnectorError(
      `Could not determine the Page that owns form ${formId}. Pass page_id explicitly.`,
      "NOT_FOUND",
      404
    );
  }
  const pageToken = await getPageToken(userToken, pageId);
  const params = new URLSearchParams({
    fields: mergeFields(LEAD_FIELDS, options.fields),
    limit: String(options.limit ?? 25),
  });
  if (options.after) {
    params.set("after", options.after);
  }
  return metaRequest(`${GRAPH_API_BASE}/${formId}/leads?${params}`, {
    headers: authHeaders(pageToken),
  });
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
