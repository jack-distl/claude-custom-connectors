import { apiRequest } from "@custom-connectors/shared";

const DATA_API_BASE = "https://api.seranking.com/v1";
const PROJECT_API_BASE = "https://api4.seranking.com";

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Token ${apiKey}` };
}

function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const parts: string[] = [];
  const push = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) push(k, item);
    } else if (typeof v === "object") {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (v2 === undefined || v2 === null) continue;
        if (typeof v2 === "object" && !Array.isArray(v2)) {
          for (const [k3, v3] of Object.entries(v2 as Record<string, unknown>)) {
            push(`${k}[${k2}][${k3}]`, v3);
          }
        } else if (Array.isArray(v2)) {
          for (const item of v2) push(`${k}[${k2}][]`, item);
        } else {
          push(`${k}[${k2}]`, v2);
        }
      }
    } else {
      push(k, v);
    }
  }
  return parts.length ? "?" + parts.join("&") : "";
}

type Json = Record<string, unknown>;

async function dataGet<T = unknown>(
  apiKey: string,
  path: string,
  query?: Json
): Promise<T> {
  return apiRequest<T>(`${DATA_API_BASE}${path}${buildQuery(query)}`, {
    headers: authHeaders(apiKey),
  });
}

async function dataPost<T = unknown>(
  apiKey: string,
  path: string,
  body: unknown,
  query?: Json
): Promise<T> {
  return apiRequest<T>(`${DATA_API_BASE}${path}${buildQuery(query)}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body,
  });
}

async function projectRequest<T = unknown>(
  apiKey: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  query?: Json
): Promise<T> {
  return apiRequest<T>(`${PROJECT_API_BASE}${path}${buildQuery(query)}`, {
    method,
    headers: authHeaders(apiKey),
    body,
  });
}

// ---------- Project API: Account & General ----------

export const getAccountBalance = (key: string) =>
  projectRequest(key, "GET", "/account/balance");

export const getAccountProfile = (key: string) =>
  projectRequest(key, "GET", "/account/profile");

export const getAccountSubscription = (key: string) =>
  projectRequest(key, "GET", "/account/subscription");

export const listSearchEngines = (key: string) =>
  projectRequest(key, "GET", "/search-engines");

export const listSearchEngineLanguages = (key: string, engineId: number) =>
  projectRequest(key, "GET", `/search-engines/${engineId}/languages`);

export const listRegions = (key: string, engineId?: number) =>
  projectRequest(key, "GET", "/regions", undefined, { engine_id: engineId });

export const getSearchVolume = (
  key: string,
  params: { keywords: string[]; region_id: number }
) =>
  projectRequest(key, "GET", "/keywords/search-volume", undefined, {
    keywords: params.keywords,
    region_id: params.region_id,
  });

// ---------- Project API: Project Management ----------

export const listProjects = (key: string) =>
  projectRequest(key, "GET", "/projects");

export const createProject = (
  key: string,
  body: {
    url: string;
    name?: string;
    keywords?: string[];
    search_engine_ids?: number[];
    group_id?: number;
  }
) => projectRequest(key, "POST", "/projects", body);

export const updateProject = (
  key: string,
  projectId: number,
  body: { name?: string; url?: string; group_id?: number }
) => projectRequest(key, "PUT", `/projects/${projectId}`, body);

export const deleteProject = (key: string, projectId: number) =>
  projectRequest(key, "DELETE", `/projects/${projectId}`);

export const getProjectSummary = (key: string, projectId: number) =>
  projectRequest(key, "GET", `/projects/${projectId}/summary`);

export const listProjectSearchEngines = (key: string, projectId: number) =>
  projectRequest(key, "GET", `/projects/${projectId}/search-engines`);

export const addProjectSearchEngine = (
  key: string,
  projectId: number,
  body: { search_engine_id: number; region_id?: number; language_id?: number }
) =>
  projectRequest(key, "POST", `/projects/${projectId}/search-engines`, body);

export const deleteProjectSearchEngine = (
  key: string,
  projectId: number,
  engineId: number
) =>
  projectRequest(
    key,
    "DELETE",
    `/projects/${projectId}/search-engines/${engineId}`
  );

// ---------- Project API: Keywords ----------

export const listProjectKeywords = (
  key: string,
  projectId: number,
  query?: { group_id?: number; with_serp?: boolean }
) =>
  projectRequest(key, "GET", `/projects/${projectId}/keywords`, undefined, query);

export const addProjectKeywords = (
  key: string,
  projectId: number,
  body: { keywords: string[]; group_id?: number }
) => projectRequest(key, "POST", `/projects/${projectId}/keywords`, body);

export const deleteProjectKeywords = (
  key: string,
  projectId: number,
  body: { keyword_ids: number[] }
) => projectRequest(key, "DELETE", `/projects/${projectId}/keywords`, body);

export const getKeywordStatistics = (
  key: string,
  projectId: number,
  keywordId: number,
  query?: { date_from?: string; date_to?: string }
) =>
  projectRequest(
    key,
    "GET",
    `/projects/${projectId}/keywords/${keywordId}/statistics`,
    undefined,
    query
  );

export const runPositionCheck = (key: string, projectId: number) =>
  projectRequest(key, "POST", `/projects/${projectId}/keywords/check`);

// ---------- Project API: Competitors ----------

export const listCompetitors = (key: string, projectId: number) =>
  projectRequest(key, "GET", `/projects/${projectId}/competitors`);

export const addCompetitor = (
  key: string,
  projectId: number,
  body: { url: string; name?: string }
) => projectRequest(key, "POST", `/projects/${projectId}/competitors`, body);

export const deleteCompetitor = (
  key: string,
  projectId: number,
  competitorId: number
) =>
  projectRequest(
    key,
    "DELETE",
    `/projects/${projectId}/competitors/${competitorId}`
  );

export const getCompetitorKeywords = (
  key: string,
  projectId: number,
  competitorId: number
) =>
  projectRequest(
    key,
    "GET",
    `/projects/${projectId}/competitors/${competitorId}/keywords`
  );

export const getProjectTop10 = (key: string, projectId: number) =>
  projectRequest(key, "GET", `/projects/${projectId}/competitors/top10`);

export const getProjectTop100 = (key: string, projectId: number) =>
  projectRequest(key, "GET", `/projects/${projectId}/competitors/top100`);

// ---------- Project API: Website Audit ----------

export const createAudit = (
  key: string,
  projectId: number,
  body?: { title?: string }
) => projectRequest(key, "POST", `/projects/${projectId}/audits`, body ?? {});

export const listAudits = (key: string, projectId: number) =>
  projectRequest(key, "GET", `/projects/${projectId}/audits`);

export const getAuditStatus = (
  key: string,
  projectId: number,
  auditId: number
) =>
  projectRequest(
    key,
    "GET",
    `/projects/${projectId}/audits/${auditId}/status`
  );

export const getAuditReport = (
  key: string,
  projectId: number,
  auditId: number
) =>
  projectRequest(
    key,
    "GET",
    `/projects/${projectId}/audits/${auditId}/report`
  );

export const getAuditPages = (
  key: string,
  projectId: number,
  auditId: number,
  query?: { limit?: number; offset?: number }
) =>
  projectRequest(
    key,
    "GET",
    `/projects/${projectId}/audits/${auditId}/pages`,
    undefined,
    query
  );

export const getAuditIssues = (
  key: string,
  projectId: number,
  auditId: number,
  query?: { issue_id?: number; severity?: string }
) =>
  projectRequest(
    key,
    "GET",
    `/projects/${projectId}/audits/${auditId}/issues`,
    undefined,
    query
  );

export const recheckAudit = (
  key: string,
  projectId: number,
  auditId: number
) =>
  projectRequest(
    key,
    "POST",
    `/projects/${projectId}/audits/${auditId}/recheck`
  );

export const deleteAudit = (
  key: string,
  projectId: number,
  auditId: number
) => projectRequest(key, "DELETE", `/projects/${projectId}/audits/${auditId}`);

// ---------- Project API: Backlink Tracking ----------

export const listProjectBacklinks = (
  key: string,
  projectId: number,
  query?: { limit?: number; offset?: number; group_id?: number }
) =>
  projectRequest(
    key,
    "GET",
    `/projects/${projectId}/backlinks`,
    undefined,
    query
  );

export const getProjectBacklinkStatistics = (
  key: string,
  projectId: number
) =>
  projectRequest(key, "GET", `/projects/${projectId}/backlinks/statistics`);

// ---------- Data API: Keyword Research ----------

export interface DataKeywordOptions {
  source: string;
  keyword: string;
  limit?: number;
  offset?: number;
  sort?: string;
  sort_order?: "asc" | "desc";
  history_trend?: boolean;
  filter?: Record<string, Record<string, string | number>>;
}

export const getSimilarKeywords = (key: string, opts: DataKeywordOptions) =>
  dataGet(key, "/keywords/similar", opts as unknown as Json);

export const getRelatedKeywords = (key: string, opts: DataKeywordOptions) =>
  dataGet(key, "/keywords/related", opts as unknown as Json);

export const getQuestionKeywords = (key: string, opts: DataKeywordOptions) =>
  dataGet(key, "/keywords/questions", opts as unknown as Json);

export const getLongtailKeywords = (key: string, opts: DataKeywordOptions) =>
  dataGet(key, "/keywords/longtail", opts as unknown as Json);

export const exportKeywords = (
  key: string,
  source: string,
  keywords: string[]
) =>
  dataPost(key, "/keywords/export", { keywords }, { source });

// ---------- Data API: Domain Analysis ----------

export const getDomainOverview = (
  key: string,
  opts: { source: string; domain: string; with_subdomains?: 0 | 1 }
) => dataGet(key, "/domain/overview/db", opts as unknown as Json);

export const getDomainOverviewWorldwide = (
  key: string,
  opts: { domain: string; currency?: string }
) => dataGet(key, "/domain/overview/worldwide", opts as unknown as Json);

export const getDomainKeywords = (
  key: string,
  opts: {
    source: string;
    domain: string;
    limit?: number;
    offset?: number;
    sort?: string;
    sort_order?: "asc" | "desc";
    with_subdomains?: 0 | 1;
    filter?: Record<string, Record<string, string | number>>;
  }
) => dataGet(key, "/domain/keywords", opts as unknown as Json);

export const getDomainCompetitors = (
  key: string,
  opts: {
    source: string;
    domain: string;
    type?: "organic" | "paid";
    limit?: number;
  }
) => dataGet(key, "/domain/competitors", opts as unknown as Json);

export const getDomainKeywordGaps = (
  key: string,
  opts: {
    source: string;
    domain: string;
    competitor: string;
    limit?: number;
    offset?: number;
  }
) => dataGet(key, "/domain/keyword_gaps", opts as unknown as Json);

// ---------- Data API: Backlinks Research ----------

export const getBacklinksSummary = (
  key: string,
  body: { target: string; mode: "host" | "domain" | "url" }
) => dataPost(key, "/backlinks/summary", body);

export const getBacklinksMetrics = (
  key: string,
  opts: { target: string; mode: "host" | "domain" | "url"; output?: "json" }
) => dataGet(key, "/backlinks/metrics", opts as unknown as Json);

export const getReferringDomains = (
  key: string,
  opts: {
    target: string;
    mode: "host" | "domain" | "url";
    limit?: number;
    offset?: number;
    sort?: string;
    sort_order?: "asc" | "desc";
  }
) => dataGet(key, "/backlinks/referring_domains", opts as unknown as Json);

export const getDataAccountSubscription = (key: string) =>
  dataGet(key, "/account/subscription");
