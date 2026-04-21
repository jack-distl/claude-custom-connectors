import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import * as api from "./api.js";

function toolResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

function errorResult(error: unknown) {
  if (error instanceof ConnectorError) return error.toToolResult();
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function getProjectApiKey(): string {
  const key = process.env.SE_RANKING_PROJECT_API_KEY;
  if (!key) {
    throw new ConnectorError(
      "SE_RANKING_PROJECT_API_KEY environment variable is not set. " +
        "Get this key from SE Ranking → Profile → API → Project/System Key.",
      "CONFIG_ERROR",
      500
    );
  }
  return key;
}

function getDataApiKey(): string {
  const key = process.env.SE_RANKING_DATA_API_KEY;
  if (!key) {
    throw new ConnectorError(
      "SE_RANKING_DATA_API_KEY environment variable is not set. " +
        "Get this key from SE Ranking → Profile → API → Data API Key.",
      "CONFIG_ERROR",
      500
    );
  }
  return key;
}

async function run<T>(fn: () => Promise<T>) {
  try {
    return toolResult(await fn());
  } catch (error) {
    return errorResult(error);
  }
}

export function registerTools(server: McpServer) {
  // ========== Account & General (Project API) ==========

  server.tool(
    "se_get_account_balance",
    "Get the current SE Ranking account balance (credits and currency). Use this to check how much credit is left for API operations.",
    {},
    async () => run(() => api.getAccountBalance(getProjectApiKey()))
  );

  server.tool(
    "se_get_account_profile",
    "Get the SE Ranking account profile details (email, name, account settings).",
    {},
    async () => run(() => api.getAccountProfile(getProjectApiKey()))
  );

  server.tool(
    "se_get_account_subscription",
    "Get the current SE Ranking subscription plan details (plan name, features, limits, renewal date).",
    {},
    async () => run(() => api.getAccountSubscription(getProjectApiKey()))
  );

  server.tool(
    "se_list_search_engines",
    "List all search engines supported by SE Ranking (Google, Bing, Yahoo, Yandex, etc.) with their IDs. Use the IDs when adding search engines to projects.",
    {},
    async () => run(() => api.listSearchEngines(getProjectApiKey()))
  );

  server.tool(
    "se_list_search_engine_languages",
    "List the available languages for a given search engine (used mainly for Google). Returns language IDs to be used when adding a search engine to a project.",
    {
      engine_id: z.number().describe("Search engine ID (from se_list_search_engines)"),
    },
    async ({ engine_id }) =>
      run(() => api.listSearchEngineLanguages(getProjectApiKey(), engine_id))
    );

  server.tool(
    "se_list_regions",
    "List geographic regions (countries/cities) that can be used for search volume lookups and ranking tracking.",
    {
      engine_id: z
        .number()
        .optional()
        .describe("Filter regions by search engine ID"),
    },
    async ({ engine_id }) =>
      run(() => api.listRegions(getProjectApiKey(), engine_id))
  );

  server.tool(
    "se_get_search_volume",
    "Get monthly search volume for a list of keywords in a specific region. Uses SE Ranking's search volume database.",
    {
      keywords: z.array(z.string()).describe("Keywords to look up"),
      region_id: z
        .number()
        .describe("Region ID (from se_list_regions)"),
    },
    async ({ keywords, region_id }) =>
      run(() =>
        api.getSearchVolume(getProjectApiKey(), { keywords, region_id })
      )
  );

  // ========== Project Management (Project API) ==========

  server.tool(
    "se_list_projects",
    "List all projects (tracked websites) in the SE Ranking account. Returns project IDs, URLs, names, and group assignments.",
    {},
    async () => run(() => api.listProjects(getProjectApiKey()))
  );

  server.tool(
    "se_create_project",
    "Create a new project (tracked website) in SE Ranking. At minimum provide the URL; optionally supply a name, initial keywords, search engine IDs, and a project group.",
    {
      url: z.string().describe("Website URL to track (e.g., https://example.com)"),
      name: z.string().optional().describe("Display name for the project"),
      keywords: z
        .array(z.string())
        .optional()
        .describe("Initial keywords to track"),
      search_engine_ids: z
        .array(z.number())
        .optional()
        .describe("Search engines to track on (from se_list_search_engines)"),
      group_id: z
        .number()
        .optional()
        .describe("Project group ID to assign to"),
    },
    async (body) => run(() => api.createProject(getProjectApiKey(), body))
  );

  server.tool(
    "se_update_project",
    "Update a project's settings (name, URL, or group assignment).",
    {
      project_id: z.number().describe("Project ID"),
      name: z.string().optional().describe("New display name"),
      url: z.string().optional().describe("New URL"),
      group_id: z
        .number()
        .optional()
        .describe("New group ID"),
    },
    async ({ project_id, ...body }) =>
      run(() => api.updateProject(getProjectApiKey(), project_id, body))
  );

  server.tool(
    "se_delete_project",
    "Delete a project permanently from SE Ranking. This removes all keywords, rankings history, and audits for the project.",
    {
      project_id: z.number().describe("Project ID to delete"),
    },
    async ({ project_id }) =>
      run(() => api.deleteProject(getProjectApiKey(), project_id))
  );

  server.tool(
    "se_get_project_summary",
    "Get summary statistics for a project: total keywords, average position, visibility, traffic estimates, etc.",
    {
      project_id: z.number().describe("Project ID"),
    },
    async ({ project_id }) =>
      run(() => api.getProjectSummary(getProjectApiKey(), project_id))
  );

  server.tool(
    "se_list_project_search_engines",
    "List search engines configured for a project (e.g., Google US, Google UK, Bing US).",
    {
      project_id: z.number().describe("Project ID"),
    },
    async ({ project_id }) =>
      run(() =>
        api.listProjectSearchEngines(getProjectApiKey(), project_id)
      )
  );

  server.tool(
    "se_add_project_search_engine",
    "Add a search engine configuration to a project (e.g., track Google UK in addition to Google US).",
    {
      project_id: z.number().describe("Project ID"),
      search_engine_id: z
        .number()
        .describe("Search engine ID (from se_list_search_engines)"),
      region_id: z
        .number()
        .optional()
        .describe("Region ID for geo-targeted tracking"),
      language_id: z
        .number()
        .optional()
        .describe("Language ID (Google only)"),
    },
    async ({ project_id, ...body }) =>
      run(() =>
        api.addProjectSearchEngine(getProjectApiKey(), project_id, body)
      )
  );

  server.tool(
    "se_delete_project_search_engine",
    "Remove a search engine configuration from a project.",
    {
      project_id: z.number().describe("Project ID"),
      engine_id: z
        .number()
        .describe("Search engine configuration ID to remove"),
    },
    async ({ project_id, engine_id }) =>
      run(() =>
        api.deleteProjectSearchEngine(
          getProjectApiKey(),
          project_id,
          engine_id
        )
      )
  );

  // ========== Keywords (Project API) ==========

  server.tool(
    "se_list_project_keywords",
    "List all keywords tracked in a project with their latest ranking data. Optionally filter by group or include SERP data.",
    {
      project_id: z.number().describe("Project ID"),
      group_id: z
        .number()
        .optional()
        .describe("Filter to a specific keyword group"),
      with_serp: z
        .boolean()
        .optional()
        .describe("Include SERP snapshot data"),
    },
    async ({ project_id, group_id, with_serp }) =>
      run(() =>
        api.listProjectKeywords(getProjectApiKey(), project_id, {
          group_id,
          with_serp,
        })
      )
  );

  server.tool(
    "se_add_project_keywords",
    "Add new keywords to a project for rank tracking.",
    {
      project_id: z.number().describe("Project ID"),
      keywords: z.array(z.string()).describe("Keywords to add"),
      group_id: z
        .number()
        .optional()
        .describe("Keyword group to add to"),
    },
    async ({ project_id, keywords, group_id }) =>
      run(() =>
        api.addProjectKeywords(getProjectApiKey(), project_id, {
          keywords,
          group_id,
        })
      )
  );

  server.tool(
    "se_delete_project_keywords",
    "Remove keywords from a project (by keyword ID). This stops tracking them.",
    {
      project_id: z.number().describe("Project ID"),
      keyword_ids: z
        .array(z.number())
        .describe("Keyword IDs to delete"),
    },
    async ({ project_id, keyword_ids }) =>
      run(() =>
        api.deleteProjectKeywords(getProjectApiKey(), project_id, {
          keyword_ids,
        })
      )
  );

  server.tool(
    "se_get_keyword_statistics",
    "Get historical ranking statistics for a single keyword in a project over a date range.",
    {
      project_id: z.number().describe("Project ID"),
      keyword_id: z.number().describe("Keyword ID"),
      date_from: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD)"),
      date_to: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD)"),
    },
    async ({ project_id, keyword_id, date_from, date_to }) =>
      run(() =>
        api.getKeywordStatistics(
          getProjectApiKey(),
          project_id,
          keyword_id,
          { date_from, date_to }
        )
      )
  );

  server.tool(
    "se_run_position_check",
    "Trigger an on-demand ranking position check for all keywords in a project. This consumes account credits.",
    {
      project_id: z.number().describe("Project ID"),
    },
    async ({ project_id }) =>
      run(() => api.runPositionCheck(getProjectApiKey(), project_id))
  );

  // ========== Competitors (Project API) ==========

  server.tool(
    "se_list_competitors",
    "List competitor domains configured for a project.",
    { project_id: z.number().describe("Project ID") },
    async ({ project_id }) =>
      run(() => api.listCompetitors(getProjectApiKey(), project_id))
  );

  server.tool(
    "se_add_competitor",
    "Add a competitor domain to a project for competitive rank tracking.",
    {
      project_id: z.number().describe("Project ID"),
      url: z.string().describe("Competitor URL/domain"),
      name: z.string().optional().describe("Display name"),
    },
    async ({ project_id, url, name }) =>
      run(() =>
        api.addCompetitor(getProjectApiKey(), project_id, { url, name })
      )
  );

  server.tool(
    "se_delete_competitor",
    "Remove a competitor from a project.",
    {
      project_id: z.number().describe("Project ID"),
      competitor_id: z.number().describe("Competitor ID"),
    },
    async ({ project_id, competitor_id }) =>
      run(() =>
        api.deleteCompetitor(
          getProjectApiKey(),
          project_id,
          competitor_id
        )
      )
  );

  server.tool(
    "se_get_competitor_keywords",
    "Get keyword positions for a specific competitor in a project.",
    {
      project_id: z.number().describe("Project ID"),
      competitor_id: z.number().describe("Competitor ID"),
    },
    async ({ project_id, competitor_id }) =>
      run(() =>
        api.getCompetitorKeywords(
          getProjectApiKey(),
          project_id,
          competitor_id
        )
      )
  );

  server.tool(
    "se_get_project_top10",
    "Get the top 10 competitors in the SERP across all project keywords (who's ranking in positions 1-10).",
    { project_id: z.number().describe("Project ID") },
    async ({ project_id }) =>
      run(() => api.getProjectTop10(getProjectApiKey(), project_id))
  );

  server.tool(
    "se_get_project_top100",
    "Get the top 100 competitors in the SERP across all project keywords.",
    { project_id: z.number().describe("Project ID") },
    async ({ project_id }) =>
      run(() => api.getProjectTop100(getProjectApiKey(), project_id))
  );

  // ========== Website Audit (Project API) ==========

  server.tool(
    "se_create_audit",
    "Start a new website audit for a project. Returns an audit ID that can be polled with se_get_audit_status.",
    {
      project_id: z.number().describe("Project ID"),
      title: z.string().optional().describe("Audit title"),
    },
    async ({ project_id, title }) =>
      run(() =>
        api.createAudit(getProjectApiKey(), project_id, { title })
      )
  );

  server.tool(
    "se_list_audits",
    "List all website audits for a project (completed and in-progress).",
    { project_id: z.number().describe("Project ID") },
    async ({ project_id }) =>
      run(() => api.listAudits(getProjectApiKey(), project_id))
  );

  server.tool(
    "se_get_audit_status",
    "Check the status of a website audit (in-progress, completed, failed). Poll this after creating an audit.",
    {
      project_id: z.number().describe("Project ID"),
      audit_id: z.number().describe("Audit ID"),
    },
    async ({ project_id, audit_id }) =>
      run(() =>
        api.getAuditStatus(getProjectApiKey(), project_id, audit_id)
      )
  );

  server.tool(
    "se_get_audit_report",
    "Get the full report of a completed website audit (all issues found, health score, recommendations).",
    {
      project_id: z.number().describe("Project ID"),
      audit_id: z.number().describe("Audit ID"),
    },
    async ({ project_id, audit_id }) =>
      run(() =>
        api.getAuditReport(getProjectApiKey(), project_id, audit_id)
      )
  );

  server.tool(
    "se_get_audit_pages",
    "List pages crawled during a website audit, with their individual issues.",
    {
      project_id: z.number().describe("Project ID"),
      audit_id: z.number().describe("Audit ID"),
      limit: z.number().optional().describe("Max results"),
      offset: z.number().optional().describe("Pagination offset"),
    },
    async ({ project_id, audit_id, limit, offset }) =>
      run(() =>
        api.getAuditPages(getProjectApiKey(), project_id, audit_id, {
          limit,
          offset,
        })
      )
  );

  server.tool(
    "se_get_audit_issues",
    "Get the list of all issues found in a website audit, optionally filtered by issue type or severity.",
    {
      project_id: z.number().describe("Project ID"),
      audit_id: z.number().describe("Audit ID"),
      issue_id: z
        .number()
        .optional()
        .describe("Filter to a specific issue type"),
      severity: z
        .string()
        .optional()
        .describe("Filter by severity (error, warning, notice)"),
    },
    async ({ project_id, audit_id, issue_id, severity }) =>
      run(() =>
        api.getAuditIssues(getProjectApiKey(), project_id, audit_id, {
          issue_id,
          severity,
        })
      )
  );

  server.tool(
    "se_recheck_audit",
    "Re-run a website audit with the same settings. Useful for checking if issues have been fixed.",
    {
      project_id: z.number().describe("Project ID"),
      audit_id: z.number().describe("Audit ID"),
    },
    async ({ project_id, audit_id }) =>
      run(() =>
        api.recheckAudit(getProjectApiKey(), project_id, audit_id)
      )
  );

  server.tool(
    "se_delete_audit",
    "Permanently delete a website audit and all its report data.",
    {
      project_id: z.number().describe("Project ID"),
      audit_id: z.number().describe("Audit ID"),
    },
    async ({ project_id, audit_id }) =>
      run(() =>
        api.deleteAudit(getProjectApiKey(), project_id, audit_id)
      )
  );

  // ========== Backlink Tracking (Project API) ==========

  server.tool(
    "se_list_project_backlinks",
    "List backlinks tracked in a project's Backlink Checker.",
    {
      project_id: z.number().describe("Project ID"),
      limit: z.number().optional().describe("Max results"),
      offset: z.number().optional().describe("Pagination offset"),
      group_id: z.number().optional().describe("Filter by backlink group"),
    },
    async ({ project_id, limit, offset, group_id }) =>
      run(() =>
        api.listProjectBacklinks(getProjectApiKey(), project_id, {
          limit,
          offset,
          group_id,
        })
      )
  );

  server.tool(
    "se_get_project_backlink_statistics",
    "Get aggregate backlink statistics for a project (total links, referring domains, new/lost over time).",
    { project_id: z.number().describe("Project ID") },
    async ({ project_id }) =>
      run(() =>
        api.getProjectBacklinkStatistics(getProjectApiKey(), project_id)
      )
  );

  // ========== Keyword Research (Data API) ==========

  const filterSchema = z
    .record(z.record(z.union([z.string(), z.number()])))
    .optional()
    .describe(
      'Filter object, e.g. {"volume":{"from":50,"to":5000}} or {"difficulty":{"from":0,"to":30}}'
    );

  server.tool(
    "se_keywords_similar",
    "Find semantically similar keywords to a seed keyword using the SE Ranking keyword database. Returns volume, CPC, competition, and difficulty.",
    {
      source: z
        .string()
        .describe(
          "Country/region database code (e.g., 'us', 'uk', 'au', 'ca')"
        ),
      keyword: z.string().describe("Seed keyword"),
      limit: z.number().optional().describe("Max results (default 10)"),
      offset: z.number().optional().describe("Pagination offset"),
      sort: z
        .string()
        .optional()
        .describe("Sort field (e.g., volume, cpc, difficulty)"),
      sort_order: z.enum(["asc", "desc"]).optional(),
      history_trend: z
        .boolean()
        .optional()
        .describe("Include historical trend data"),
      filter: filterSchema,
    },
    async (opts) =>
      run(() => api.getSimilarKeywords(getDataApiKey(), opts))
  );

  server.tool(
    "se_keywords_related",
    "Get related keywords (semantically connected queries, useful for topic clustering).",
    {
      source: z.string().describe("Country database (e.g., 'us', 'uk')"),
      keyword: z.string().describe("Seed keyword"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sort: z.string().optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
      history_trend: z.boolean().optional(),
      filter: filterSchema,
    },
    async (opts) =>
      run(() => api.getRelatedKeywords(getDataApiKey(), opts))
  );

  server.tool(
    "se_keywords_questions",
    "Get question-form keywords (e.g., 'how to', 'what is') related to a seed keyword. Great for FAQ and informational content ideation.",
    {
      source: z.string().describe("Country database"),
      keyword: z.string().describe("Seed keyword"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sort: z.string().optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
      history_trend: z.boolean().optional(),
      filter: filterSchema,
    },
    async (opts) =>
      run(() => api.getQuestionKeywords(getDataApiKey(), opts))
  );

  server.tool(
    "se_keywords_longtail",
    "Get long-tail keyword variations around a seed keyword (multi-word, less competitive).",
    {
      source: z.string().describe("Country database"),
      keyword: z.string().describe("Seed keyword"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sort: z.string().optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
      history_trend: z.boolean().optional(),
      filter: filterSchema,
    },
    async (opts) =>
      run(() => api.getLongtailKeywords(getDataApiKey(), opts))
  );

  server.tool(
    "se_keywords_export",
    "Bulk-export metrics (volume, CPC, competition, difficulty, intent) for a list of keywords from the SE Ranking database.",
    {
      source: z.string().describe("Country database (e.g., 'us', 'uk')"),
      keywords: z
        .array(z.string())
        .describe("Keywords to look up (batch mode)"),
    },
    async ({ source, keywords }) =>
      run(() => api.exportKeywords(getDataApiKey(), source, keywords))
  );

  // ========== Domain Analysis (Data API) ==========

  server.tool(
    "se_domain_overview",
    "Get SEO overview for a domain in a specific region/database: organic keywords, traffic estimate, visibility, paid keywords.",
    {
      source: z.string().describe("Country database (e.g., 'us', 'uk')"),
      domain: z.string().describe("Target domain (e.g., 'example.com')"),
      with_subdomains: z
        .union([z.literal(0), z.literal(1)])
        .optional()
        .describe("Include subdomains (1) or root only (0)"),
    },
    async (opts) =>
      run(() => api.getDomainOverview(getDataApiKey(), opts))
  );

  server.tool(
    "se_domain_overview_worldwide",
    "Get a worldwide overview of a domain's SEO performance across all regions.",
    {
      domain: z.string().describe("Target domain"),
      currency: z
        .string()
        .optional()
        .describe("Currency code for traffic value (e.g., USD, EUR)"),
    },
    async (opts) =>
      run(() => api.getDomainOverviewWorldwide(getDataApiKey(), opts))
  );

  server.tool(
    "se_domain_keywords",
    "Get the list of keywords a domain ranks for in a specific database, with position, volume, traffic share, and URL.",
    {
      source: z.string().describe("Country database"),
      domain: z.string().describe("Target domain"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sort: z
        .string()
        .optional()
        .describe("Sort field (e.g., position, volume, traffic)"),
      sort_order: z.enum(["asc", "desc"]).optional(),
      with_subdomains: z.union([z.literal(0), z.literal(1)]).optional(),
      filter: filterSchema,
    },
    async (opts) =>
      run(() => api.getDomainKeywords(getDataApiKey(), opts))
  );

  server.tool(
    "se_domain_competitors",
    "Find organic or paid competitors of a domain (domains that rank for overlapping keywords).",
    {
      source: z.string().describe("Country database"),
      domain: z.string().describe("Target domain"),
      type: z
        .enum(["organic", "paid"])
        .optional()
        .describe("Competitor type (default organic)"),
      limit: z.number().optional(),
    },
    async (opts) =>
      run(() => api.getDomainCompetitors(getDataApiKey(), opts))
  );

  server.tool(
    "se_domain_keyword_gaps",
    "Find keyword gaps between two domains — keywords a competitor ranks for but the target domain doesn't. Useful for content opportunity analysis.",
    {
      source: z.string().describe("Country database"),
      domain: z.string().describe("Your domain"),
      competitor: z.string().describe("Competitor domain"),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (opts) =>
      run(() => api.getDomainKeywordGaps(getDataApiKey(), opts))
  );

  // ========== Backlinks Research (Data API) ==========

  server.tool(
    "se_backlinks_summary",
    "Get a backlink profile summary for a target (total links, referring domains, domain authority, new/lost trends).",
    {
      target: z.string().describe("Target URL, host, or domain"),
      mode: z
        .enum(["host", "domain", "url"])
        .describe("Match mode: 'host' (example.com), 'domain' (*.example.com), or 'url' (exact page)"),
    },
    async (opts) =>
      run(() => api.getBacklinksSummary(getDataApiKey(), opts))
  );

  server.tool(
    "se_backlinks_metrics",
    "Get key backlink metrics for a target (counts, quality scores). Lighter-weight than summary.",
    {
      target: z.string().describe("Target URL, host, or domain"),
      mode: z.enum(["host", "domain", "url"]).describe("Match mode"),
    },
    async ({ target, mode }) =>
      run(() => api.getBacklinksMetrics(getDataApiKey(), { target, mode }))
  );

  server.tool(
    "se_backlinks_referring_domains",
    "List domains linking to a target, with their domain authority and link counts.",
    {
      target: z.string().describe("Target URL, host, or domain"),
      mode: z.enum(["host", "domain", "url"]).describe("Match mode"),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sort: z.string().optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
    },
    async (opts) =>
      run(() => api.getReferringDomains(getDataApiKey(), opts))
  );

  server.tool(
    "se_get_data_api_subscription",
    "Get Data API subscription details and remaining credit balance (separate from the Project API balance).",
    {},
    async () => run(() => api.getDataAccountSubscription(getDataApiKey()))
  );
}
