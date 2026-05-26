import { apiRequest, ConnectorError } from "@custom-connectors/shared";

const GRAPH_API_BASE = "https://graph.facebook.com/v23.0";

export type MetaObject = Record<string, unknown>;

interface PaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

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
        // fall through to rethrow original
      }
    }
    throw err;
  }
}

// Exchange user token for page-specific access token.
// Page tokens are required for page insights and posts endpoints.
async function getPageToken(userToken: string, pageId: string): Promise<string> {
  const params = new URLSearchParams({ limit: "100" });
  const response = await metaRequest<
    PaginatedResponse<{ id: string; access_token: string }>
  >(`${GRAPH_API_BASE}/me/accounts?${params}`, {
    headers: authHeaders(userToken),
  });
  const page = response.data.find((p) => p.id === pageId);
  if (!page) {
    throw new ConnectorError(
      `Page ${pageId} not found or you don't have access. Use get_pages to list available pages.`,
      "NOT_FOUND",
      404
    );
  }
  return page.access_token;
}

// Try to extract page ID from a post ID (format: {pageId}_{postId}).
function pageIdFromPostId(postId: string): string | null {
  const parts = postId.split("_");
  return parts.length >= 2 ? parts[0] : null;
}

// ---- Pages ----

export async function getPages(
  accessToken: string
): Promise<PaginatedResponse<MetaObject>> {
  const fields =
    "id,name,category,fan_count,followers_count,about,website,link";
  const params = new URLSearchParams({ fields, limit: "100" });
  return metaRequest(`${GRAPH_API_BASE}/me/accounts?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export async function getPageInsights(
  accessToken: string,
  pageId: string,
  options: {
    metrics?: string[];
    period?: string;
    since?: string;
    until?: string;
  } = {}
): Promise<MetaObject> {
  const pageToken = await getPageToken(accessToken, pageId);
  const defaultMetrics = [
    "page_impressions",
    "page_impressions_unique",
    "page_engaged_users",
    "page_post_engagements",
    "page_fans",
    "page_fan_adds",
    "page_fan_removes",
    "page_views_total",
  ];
  const params = new URLSearchParams({
    metric: (options.metrics ?? defaultMetrics).join(","),
    period: options.period ?? "day",
  });
  if (options.since) params.set("since", options.since);
  if (options.until) params.set("until", options.until);
  return metaRequest(`${GRAPH_API_BASE}/${pageId}/insights?${params}`, {
    headers: authHeaders(pageToken),
  });
}

export async function getPagePosts(
  accessToken: string,
  pageId: string,
  options: { limit?: number; since?: string; until?: string } = {}
): Promise<PaginatedResponse<MetaObject>> {
  const pageToken = await getPageToken(accessToken, pageId);
  const fields = [
    "id",
    "message",
    "story",
    "created_time",
    "full_picture",
    "permalink_url",
    "attachments{media_type,type,title,description}",
  ].join(",");
  const params = new URLSearchParams({
    fields,
    limit: String(options.limit ?? 25),
  });
  if (options.since) params.set("since", options.since);
  if (options.until) params.set("until", options.until);
  return metaRequest(`${GRAPH_API_BASE}/${pageId}/posts?${params}`, {
    headers: authHeaders(pageToken),
  });
}

export async function getPostInsights(
  accessToken: string,
  postId: string
): Promise<MetaObject> {
  // Try to derive page ID from post ID to get page token
  const pageId = pageIdFromPostId(postId);
  let token: string;
  if (pageId) {
    try {
      token = await getPageToken(accessToken, pageId);
    } catch {
      token = accessToken;
    }
  } else {
    token = accessToken;
  }

  const metrics = [
    "post_impressions",
    "post_impressions_unique",
    "post_engaged_users",
    "post_clicks",
    "post_reactions_like_total",
    "post_reactions_love_total",
    "post_reactions_wow_total",
    "post_reactions_haha_total",
    "post_reactions_sorry_total",
    "post_reactions_anger_total",
  ].join(",");
  const params = new URLSearchParams({ metric: metrics, period: "lifetime" });
  return metaRequest(`${GRAPH_API_BASE}/${postId}/insights?${params}`, {
    headers: authHeaders(token),
  });
}

// ---- Instagram ----

export async function getInstagramAccounts(
  accessToken: string
): Promise<MetaObject[]> {
  const params = new URLSearchParams({
    fields: "id,name,instagram_business_account",
    limit: "100",
  });
  const pagesResp = await metaRequest<
    PaginatedResponse<{
      id: string;
      name: string;
      instagram_business_account?: { id: string };
    }>
  >(`${GRAPH_API_BASE}/me/accounts?${params}`, {
    headers: authHeaders(accessToken),
  });

  const results: MetaObject[] = [];
  const igFields =
    "id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url,website";

  for (const page of pagesResp.data) {
    if (!page.instagram_business_account?.id) continue;
    const igId = page.instagram_business_account.id;
    const igProfile = await metaRequest<MetaObject>(
      `${GRAPH_API_BASE}/${igId}?fields=${igFields}`,
      { headers: authHeaders(accessToken) }
    );
    results.push({
      ...igProfile,
      connected_page_id: page.id,
      connected_page_name: page.name,
    });
  }

  return results;
}

export async function getInstagramInsights(
  accessToken: string,
  igUserId: string,
  options: {
    metrics?: string[];
    period?: string;
    since?: string;
    until?: string;
  } = {}
): Promise<MetaObject> {
  const defaultMetrics = [
    "impressions",
    "reach",
    "profile_views",
    "follower_count",
  ];
  const params = new URLSearchParams({
    metric: (options.metrics ?? defaultMetrics).join(","),
    period: options.period ?? "day",
  });
  if (options.since) params.set("since", options.since);
  if (options.until) params.set("until", options.until);
  return metaRequest(`${GRAPH_API_BASE}/${igUserId}/insights?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export async function getInstagramMedia(
  accessToken: string,
  igUserId: string,
  options: { limit?: number; since?: string; until?: string } = {}
): Promise<PaginatedResponse<MetaObject>> {
  const fields =
    "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  const params = new URLSearchParams({
    fields,
    limit: String(options.limit ?? 25),
  });
  if (options.since) params.set("since", options.since);
  if (options.until) params.set("until", options.until);
  return metaRequest(`${GRAPH_API_BASE}/${igUserId}/media?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export async function getInstagramMediaInsights(
  accessToken: string,
  igMediaId: string,
  mediaType?: string
): Promise<MetaObject> {
  const type = (mediaType ?? "").toUpperCase();

  let metrics: string[];
  if (type === "VIDEO" || type === "REEL") {
    metrics = [
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
      "saved",
      "plays",
      "total_interactions",
    ];
  } else if (type === "STORY") {
    metrics = [
      "impressions",
      "reach",
      "exits",
      "replies",
      "taps_forward",
      "taps_back",
    ];
  } else {
    // IMAGE, CAROUSEL_ALBUM, default
    metrics = [
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
      "saved",
      "total_interactions",
    ];
  }

  const params = new URLSearchParams({ metric: metrics.join(",") });
  return metaRequest(`${GRAPH_API_BASE}/${igMediaId}/insights?${params}`, {
    headers: authHeaders(accessToken),
  });
}
