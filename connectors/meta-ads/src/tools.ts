import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  getAdAccounts,
  getCampaigns,
  getCampaign,
  getAdSets,
  getAdSet,
  getAds,
  getAd,
  getAdCreative,
  getInsights,
  getAudiences,
  getPagePostDestination,
  getLeadForms,
  getFormLeads,
  updateCampaign,
  updateAdSet,
  updateAd,
  type MetaObject,
} from "./api.js";
import { collectAccountCreativeFreedom } from "./creative-freedom.js";
import { createGraphWalkDeps, getAccountRateLimiter } from "./graph-scheduler.js";

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
    content: [{ type: "text" as const, text: `Error: ${error}` }],
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

// ===== Advantage+ derived helpers =====

function isTruthyFlag(value: unknown): boolean {
  if (value === 1 || value === true) return true;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    return v === "1" || v === "true" || v === "expansion_all";
  }
  return false;
}

function advantageCampaignBudgetEnabled(campaign: MetaObject | undefined): boolean {
  if (!campaign) return false;
  return Boolean(campaign.daily_budget) || Boolean(campaign.lifetime_budget);
}

function advantagePlusPlacementsOn(targeting: MetaObject | undefined): boolean {
  if (!targeting) return false;
  const placementKeys = [
    "publisher_platforms",
    "facebook_positions",
    "instagram_positions",
    "audience_network_positions",
    "messenger_positions",
    "device_platforms",
  ];
  return placementKeys.every((k) => {
    const v = targeting[k];
    return v === undefined || v === null || (Array.isArray(v) && v.length === 0);
  });
}

function advantageDetailedTargetingOn(targeting: MetaObject | undefined): boolean {
  if (!targeting) return false;
  return isTruthyFlag(targeting.targeting_optimization);
}

function advantageLookalikeOn(targeting: MetaObject | undefined): boolean {
  const relax = targeting?.targeting_relaxation_types as MetaObject | undefined;
  return relax ? isTruthyFlag(relax.lookalike) : false;
}

function advantageCustomAudienceOn(targeting: MetaObject | undefined): boolean {
  const relax = targeting?.targeting_relaxation_types as MetaObject | undefined;
  return relax ? isTruthyFlag(relax.custom_audience) : false;
}

function advantagePlusAudienceOn(targeting: MetaObject | undefined): boolean {
  const automation = targeting?.targeting_automation as MetaObject | undefined;
  return automation ? isTruthyFlag(automation.advantage_audience) : false;
}

interface CreativeFeaturesSplit {
  on: string[];
  off: string[];
}

function creativeFeaturesSplit(creative: MetaObject | undefined): CreativeFeaturesSplit {
  const on: string[] = [];
  const off: string[] = [];
  const dof = creative?.degrees_of_freedom_spec as MetaObject | undefined;
  const spec = dof?.creative_features_spec as MetaObject | undefined;
  if (!spec) return { on, off };
  for (const [key, value] of Object.entries(spec)) {
    const enroll = (value as MetaObject | undefined)?.enroll_status;
    if (enroll === "OPT_IN") on.push(key);
    else if (enroll === "OPT_OUT") off.push(key);
  }
  return { on, off };
}

function decorateCampaign(campaign: MetaObject): MetaObject {
  return {
    ...campaign,
    advantage_campaign_budget_enabled: advantageCampaignBudgetEnabled(campaign),
  };
}

function decorateAdSet(adSet: MetaObject): MetaObject {
  const targeting = adSet.targeting as MetaObject | undefined;
  return {
    ...adSet,
    advantage_plus_placements_on: advantagePlusPlacementsOn(targeting),
    advantage_detailed_targeting_on: advantageDetailedTargetingOn(targeting),
    advantage_detailed_targeting_raw: targeting?.targeting_optimization ?? null,
    advantage_lookalike_on: advantageLookalikeOn(targeting),
    advantage_custom_audience_on: advantageCustomAudienceOn(targeting),
    advantage_plus_audience_on: advantagePlusAudienceOn(targeting),
  };
}

function decorateAd(ad: MetaObject): MetaObject {
  const creative = ad.creative as MetaObject | undefined;
  const { on, off } = creativeFeaturesSplit(creative);
  return {
    ...ad,
    advantage_creative_features_on: on,
    advantage_creative_features_off: off,
  };
}

// ===== Lead-destination resolution =====
// Surfaces the destination link and any lead_gen_form_id on a creative,
// whether the spec is inline or the ad is built from an existing page post.

interface LeadDestination {
  lead_gen_form_id: string | null;
  link: string | null;
  call_to_action_type: string | null;
  source: "inline_object_story_spec" | "asset_feed_spec" | "page_post" | "none";
  resolution_error?: string;
}

function extractInlineDestination(
  creative: MetaObject | undefined
): LeadDestination | null {
  const spec = creative?.object_story_spec as MetaObject | undefined;
  if (spec) {
    const data =
      (spec.link_data as MetaObject | undefined) ??
      (spec.video_data as MetaObject | undefined) ??
      (spec.photo_data as MetaObject | undefined);
    const cta = data?.call_to_action as MetaObject | undefined;
    const value = cta?.value as MetaObject | undefined;

    // Carousels carry the CTA/link per card under child_attachments.
    let childForm: string | undefined;
    let childLink: string | undefined;
    const children = (data?.child_attachments as MetaObject[] | undefined) ?? [];
    for (const child of children) {
      const childValue = (child.call_to_action as MetaObject | undefined)
        ?.value as MetaObject | undefined;
      childForm = childForm ?? (childValue?.lead_gen_form_id as string | undefined);
      childLink =
        childLink ??
        (childValue?.link as string | undefined) ??
        (child.link as string | undefined);
    }

    const formId =
      (value?.lead_gen_form_id as string | undefined) ?? childForm;
    const link =
      (value?.link as string | undefined) ??
      (data?.link as string | undefined) ??
      childLink;

    if (formId || link || cta) {
      return {
        lead_gen_form_id: formId ?? null,
        link: link ?? null,
        call_to_action_type: (cta?.type as string | undefined) ?? null,
        source: "inline_object_story_spec",
      };
    }
  }

  // Advantage+ / dynamic creatives keep their links in asset_feed_spec
  // (no lead_gen_form_id available there).
  const feed = creative?.asset_feed_spec as MetaObject | undefined;
  if (feed) {
    const linkUrls = (feed.link_urls as MetaObject[] | undefined) ?? [];
    const link = linkUrls[0]?.website_url as string | undefined;
    const ctas = (feed.call_to_action_types as string[] | undefined) ?? [];
    if (link || ctas.length) {
      return {
        lead_gen_form_id: null,
        link: link ?? null,
        call_to_action_type: ctas[0] ?? null,
        source: "asset_feed_spec",
      };
    }
  }

  return null;
}

async function resolveLeadDestination(
  token: string,
  creative: MetaObject | undefined
): Promise<LeadDestination> {
  const inline = extractInlineDestination(creative);
  if (inline && (inline.lead_gen_form_id || inline.link)) {
    return inline;
  }

  const storyId =
    (creative?.effective_object_story_id as string | undefined) ??
    (creative?.object_story_id as string | undefined);
  if (storyId) {
    const post = await getPagePostDestination(token, storyId);
    if (post.resolution_error) {
      return {
        lead_gen_form_id: null,
        link: null,
        call_to_action_type: null,
        source: "page_post",
        resolution_error: post.resolution_error as string,
      };
    }
    const cta = post.call_to_action as MetaObject | undefined;
    const value = cta?.value as MetaObject | undefined;
    const attachment = (
      (post.attachments as MetaObject | undefined)?.data as
        | MetaObject[]
        | undefined
    )?.[0];
    const link =
      (value?.link as string | undefined) ??
      (attachment?.unshimmed_url as string | undefined) ??
      ((attachment?.target as MetaObject | undefined)?.url as string | undefined);
    return {
      lead_gen_form_id: (value?.lead_gen_form_id as string | undefined) ?? null,
      link: link ?? null,
      call_to_action_type:
        (cta?.type as string | undefined) ??
        (attachment?.call_to_action_type as string | undefined) ??
        null,
      source: "page_post",
    };
  }

  return (
    inline ?? {
      lead_gen_form_id: null,
      link: null,
      call_to_action_type: null,
      source: "none",
    }
  );
}

// =====

export function registerTools(server: McpServer) {
  server.tool(
    "get_ad_accounts",
    "List all Meta/Facebook ad accounts accessible by the authenticated user. Returns account ID, name, status, and currency.",
    {
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getAdAccounts(access_token, limit);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_campaigns",
    "List campaigns for a Meta ad account. Returns raw campaign fields including Advantage+ signals (smart_promotion_type, advantage_state_info) plus a derived advantage_campaign_budget_enabled flag (CBO on when campaign-level daily/lifetime_budget is set). Filterable by status.",
    {
      ad_account_id: z
        .string()
        .describe("Ad account ID (numeric, without 'act_' prefix)"),
      status: z
        .string()
        .optional()
        .describe("Filter by status: ACTIVE, PAUSED, DELETED, ARCHIVED"),
      limit: z.number().optional().describe("Max results (default 25)"),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous response's paging.cursors.after"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Extra Graph API fields to request, appended to the defaults"),
    },
    async ({ ad_account_id, status, limit, after, fields }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getCampaigns(access_token, ad_account_id, {
          status,
          limit,
          after,
          fields,
        });
        return toolResult({
          data: result.data.map(decorateCampaign),
          paging: result.paging,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ad_sets",
    "List ad sets within a Meta campaign. Returns raw ad set fields including destination_type (the conversion location: WEBSITE / ON_AD / an instant-form value — the deciding flag between 'Website', 'Instant forms', and 'Website and instant forms'), the full promoted_object, the full targeting tree (placements, targeting_optimization, targeting_relaxation_types, targeting_automation), plus derived Advantage+ booleans: advantage_plus_placements_on, advantage_detailed_targeting_on, advantage_lookalike_on, advantage_custom_audience_on, advantage_plus_audience_on.",
    {
      campaign_id: z.string().describe("Campaign ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous response's paging.cursors.after"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Extra Graph API fields to request, appended to the defaults"),
    },
    async ({ campaign_id, limit, after, fields }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getAdSets(access_token, campaign_id, {
          limit,
          after,
          fields,
        });
        return toolResult({
          data: result.data.map(decorateAdSet),
          paging: result.paging,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ads",
    "List ads within a Meta ad set. Returns the full creative (object_story_spec, asset_feed_spec, degrees_of_freedom_spec.creative_features_spec) plus derived Advantage+ Creative helpers: advantage_creative_features_on (OPT_IN keys) and advantage_creative_features_off (OPT_OUT keys). Set resolve_destination=true to also attach a lead_destination block (link + lead_gen_form_id) per ad, resolving page-post-backed creatives via the underlying post (adds extra Graph calls per ad).",
    {
      ad_set_id: z.string().describe("Ad set ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous response's paging.cursors.after"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Extra Graph API fields to request, appended to the defaults"),
      resolve_destination: z
        .boolean()
        .optional()
        .describe(
          "When true, attach a lead_destination block (link + lead_gen_form_id) to each ad, resolving page-post-backed creatives. Adds latency proportional to the number of ads."
        ),
    },
    async ({ ad_set_id, limit, after, fields, resolve_destination }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getAds(access_token, ad_set_id, {
          limit,
          after,
          fields,
        });
        let data = result.data.map(decorateAd);
        if (resolve_destination) {
          data = await Promise.all(
            data.map(async (ad) => ({
              ...ad,
              lead_destination: await resolveLeadDestination(
                access_token,
                ad.creative as MetaObject | undefined
              ),
            }))
          );
        }
        return toolResult({
          data,
          paging: result.paging,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_account_creative_freedom",
    "Answer 'which ads in this Meta account have Advantage+ Creative / AI enhancements enabled' in ONE call. Walks every campaign -> ad set -> ad server-side (following all pagination, so nothing is silently under-reported) and returns one flat row per ad with the creative features that are ON vs OFF, plus a summary count per feature. Nested customizations are flattened to dotted keys (e.g. 'enhance_cta.text_extraction'), so a feature that is OPT_OUT at the top level but OPT_IN on a nested customization is still surfaced. Fails loudly if any page cannot be fetched rather than returning a partial list. Use this instead of manually walking get_campaigns -> get_ad_sets -> get_ads.",
    {
      ad_account_id: z
        .string()
        .describe("Ad account ID (numeric, without 'act_' prefix)"),
      status: z
        .string()
        .optional()
        .describe(
          "Filter ads by effective status (default 'ACTIVE'). E.g. ACTIVE, PAUSED, ARCHIVED. Campaigns and ad sets are always fully traversed regardless."
        ),
      include_features: z
        .array(z.string())
        .optional()
        .describe(
          "Optional: restrict features_on/features_off and the summary to these feature keys (e.g. ['enhance_cta','image_uncrop']). A top-level key also keeps its nested customizations. features_raw is always returned verbatim."
        ),
    },
    async ({ ad_account_id, status, include_features }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const effectiveStatus = status ?? "ACTIVE";
        // Per-account limiter (module singleton) caps concurrency across the
        // whole walk and serialises concurrent walks on the same account.
        const limiter = getAccountRateLimiter(ad_account_id);
        const deps = createGraphWalkDeps({
          accessToken: access_token,
          adAccountId: ad_account_id,
          statusFilter: effectiveStatus,
          limiter,
        });
        const result = await collectAccountCreativeFreedom(deps, {
          adAccountId: ad_account_id,
          includeFeatures: include_features,
          statusFilter: effectiveStatus,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ad_creative",
    "Fetch a single Meta ad creative by ID. Returns the full creative object including object_story_spec, asset_feed_spec, and degrees_of_freedom_spec.creative_features_spec (Advantage+ Creative opt-in/opt-out per feature), plus a lead_destination block (link + lead_gen_form_id) resolved from the inline spec or, for page-post-backed creatives, the underlying post.",
    {
      creative_id: z.string().describe("Ad creative ID"),
    },
    async ({ creative_id }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const creative = await getAdCreative(access_token, creative_id);
        const { on, off } = creativeFeaturesSplit(creative);
        const lead_destination = await resolveLeadDestination(
          access_token,
          creative
        );
        return toolResult({
          ...creative,
          advantage_creative_features_on: on,
          advantage_creative_features_off: off,
          lead_destination,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_ad_full_context",
    "One-shot lookup for a Meta ad: returns the ad, its ad set (including destination_type — the conversion location), its parent campaign, and the full creative — plus a lead_destination block (link + lead_gen_form_id, resolved even for page-post-backed creatives) and a unified advantage_summary block covering campaign budget optimization, Advantage+ placements/targeting, Advantage+ audience, and Advantage+ Creative feature opt-ins. Use this to answer 'what's actually configured on this live ad' without multiple round trips.",
    {
      ad_id: z.string().describe("Ad ID"),
    },
    async ({ ad_id }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const ad = await getAd(access_token, ad_id);
        const adSetId = ad.adset_id as string | undefined;
        const campaignId = ad.campaign_id as string | undefined;
        const creative = ad.creative as MetaObject | undefined;

        const [adSet, campaign] = await Promise.all([
          adSetId ? getAdSet(access_token, adSetId) : Promise.resolve<MetaObject>({}),
          campaignId ? getCampaign(access_token, campaignId) : Promise.resolve<MetaObject>({}),
        ]);

        const targeting = adSet.targeting as MetaObject | undefined;
        const { on, off } = creativeFeaturesSplit(creative);
        const lead_destination = await resolveLeadDestination(
          access_token,
          creative
        );

        const advantage_summary = {
          advantage_campaign_budget_enabled: advantageCampaignBudgetEnabled(campaign),
          advantage_plus_placements_on: advantagePlusPlacementsOn(targeting),
          advantage_detailed_targeting_on: advantageDetailedTargetingOn(targeting),
          advantage_detailed_targeting_raw: targeting?.targeting_optimization ?? null,
          advantage_lookalike_on: advantageLookalikeOn(targeting),
          advantage_custom_audience_on: advantageCustomAudienceOn(targeting),
          advantage_plus_audience_on: advantagePlusAudienceOn(targeting),
          advantage_creative_features_on: on,
          advantage_creative_features_off: off,
        };

        return toolResult({
          ad: decorateAd(ad),
          ad_set: decorateAdSet(adSet),
          campaign: decorateCampaign(campaign),
          creative: creative ?? null,
          lead_destination,
          advantage_summary,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_insights",
    "Pull performance metrics (impressions, clicks, spend, CPC, CPM, CTR, reach) and conversion data (actions, cost per action, conversion values, ROAS) for a Meta ad account, campaign, ad set, or ad. Each row also carries entity identifiers (campaign_id/campaign_name, adset_id/adset_name, ad_id/ad_name) based on the requested level, so a result can be attributed to a specific entity. Supports date ranges, breakdowns, and attribution windows.",
    {
      object_id: z
        .string()
        .describe(
          "ID of the object to get insights for (ad account as act_XXXX, campaign ID, ad set ID, or ad ID)"
        ),
      date_preset: z
        .string()
        .optional()
        .describe(
          "Predefined date range: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month"
        ),
      since: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Use with 'until'."),
      until: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Use with 'since'."),
      breakdowns: z
        .array(z.string())
        .optional()
        .describe(
          "Breakdowns: age, gender, country, placement, device_platform, action_type"
        ),
      level: z
        .string()
        .optional()
        .describe("Aggregation level: account, campaign, adset, ad"),
      action_attribution_windows: z
        .array(z.string())
        .optional()
        .describe(
          "Attribution windows, e.g. 1d_view, 7d_click, 1d_click. Controls how actions are attributed."
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe("Extra Graph API insight fields to request, appended to the defaults"),
    },
    async ({
      object_id,
      date_preset,
      since,
      until,
      breakdowns,
      level,
      action_attribution_windows,
      fields,
    }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const timeRange =
          since && until ? { since, until } : undefined;
        const result = await getInsights(access_token, object_id, {
          datePreset: date_preset,
          timeRange,
          breakdowns,
          level,
          actionAttributionWindows: action_attribution_windows,
          fields,
        });
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_audiences",
    "List custom and lookalike audiences for a Meta ad account. Returns audience name, type, approximate size, and delivery status.",
    {
      ad_account_id: z
        .string()
        .describe("Ad account ID (numeric, without 'act_' prefix)"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ ad_account_id, limit }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getAudiences(access_token, ad_account_id, limit);
        return toolResult(result.data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_lead_forms",
    "List the instant / lead-gen forms on a Facebook Page, including any auto-created by Meta, with their status and lead counts. Returns id, name, status, created_time, leads_count, expired_leads_count, locale, and questions. Requires the user to have a role on the Page (uses a derived Page access token).",
    {
      page_id: z.string().describe("Facebook Page ID that owns the forms"),
      limit: z.number().optional().describe("Max results (default 25)"),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous response's paging.cursors.after"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Extra Graph API fields to request, appended to the defaults"),
    },
    async ({ page_id, limit, after, fields }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getLeadForms(access_token, page_id, {
          limit,
          after,
          fields,
        });
        return toolResult({
          data: result.data,
          paging: result.paging,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_form_leads",
    "Retrieve the leads collected by a lead-gen / instant form. On-Meta form leads never hit the website or pixel, so they may sit uncollected in Meta — this pulls them so they can be pushed to a CRM. Returns field_data, created_time, ad_id, form_id, and campaign_id per lead, paginated. Requires the user to have a role on the owning Page (uses a derived Page access token).",
    {
      leadgen_form_id: z.string().describe("Lead-gen form ID"),
      page_id: z
        .string()
        .optional()
        .describe(
          "Owning Page ID. Optional — if omitted it is resolved from the form. Pass it to skip a lookup or when form metadata is restricted."
        ),
      limit: z.number().optional().describe("Max results (default 25)"),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous response's paging.cursors.after"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Extra Graph API fields to request, appended to the defaults"),
    },
    async ({ leadgen_form_id, page_id, limit, after, fields }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const result = await getFormLeads(access_token, leadgen_form_id, {
          pageId: page_id,
          limit,
          after,
          fields,
        });
        return toolResult({
          data: result.data,
          paging: result.paging,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // --- Write/Edit Tools ---

  server.tool(
    "update_campaign",
    "Update a Meta/Facebook campaign. Can change status (pause/activate), name, or budget. Budget values are in cents (e.g., 5000 = $50.00). Provide at least one field to update.",
    {
      campaign_id: z.string().describe("The campaign ID to update"),
      name: z.string().optional().describe("New campaign name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New campaign status"),
      daily_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New daily budget in cents (e.g., 5000 = $50.00). Cannot be used with lifetime_budget."
        ),
      lifetime_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New lifetime budget in cents (e.g., 100000 = $1,000.00). Cannot be used with daily_budget."
        ),
      special_ad_categories: z
        .array(z.string())
        .optional()
        .describe(
          "Special ad categories: NONE, EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS"
        ),
    },
    async (
      { campaign_id, name, status, daily_budget, lifetime_budget, special_ad_categories },
      extra
    ) => {
      try {
        const access_token = getAccessToken(extra);
        const fields: Record<string, unknown> = {};
        if (name !== undefined) fields.name = name;
        if (status !== undefined) fields.status = status;
        if (daily_budget !== undefined) fields.daily_budget = daily_budget;
        if (lifetime_budget !== undefined) fields.lifetime_budget = lifetime_budget;
        if (special_ad_categories !== undefined)
          fields.special_ad_categories = special_ad_categories;

        if (Object.keys(fields).length === 0) {
          return errorResult(
            new ConnectorError(
              "At least one field must be provided to update",
              "VALIDATION_ERROR",
              400
            )
          );
        }

        const result = await updateCampaign(access_token, campaign_id, fields);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_ad_set",
    "Update a Meta/Facebook ad set. Can change status, name, budget, targeting, bid amount, and schedule. Budget and bid values are in cents (e.g., 5000 = $50.00). Provide at least one field to update.",
    {
      ad_set_id: z.string().describe("The ad set ID to update"),
      name: z.string().optional().describe("New ad set name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New ad set status"),
      daily_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New daily budget in cents (e.g., 5000 = $50.00). Cannot be used with lifetime_budget."
        ),
      lifetime_budget: z
        .number()
        .int()
        .optional()
        .describe(
          "New lifetime budget in cents. Cannot be used with daily_budget."
        ),
      bid_amount: z
        .number()
        .int()
        .optional()
        .describe("Bid amount in cents for the ad set"),
      billing_event: z
        .enum([
          "IMPRESSIONS",
          "LINK_CLICKS",
          "APP_INSTALLS",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "VIDEO_VIEWS",
        ])
        .optional()
        .describe("What the ad set is billed on"),
      optimization_goal: z
        .enum([
          "NONE",
          "APP_INSTALLS",
          "BRAND_AWARENESS",
          "CLICKS",
          "ENGAGED_USERS",
          "EVENT_RESPONSES",
          "IMPRESSIONS",
          "LEAD_GENERATION",
          "LINK_CLICKS",
          "OFFSITE_CONVERSIONS",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "REACH",
          "SOCIAL_IMPRESSIONS",
          "VALUE",
          "LANDING_PAGE_VIEWS",
          "CONVERSATIONS",
        ])
        .optional()
        .describe("Optimization goal for the ad set"),
      targeting: z
        .record(z.unknown())
        .optional()
        .describe(
          "Targeting spec object (JSON). See Meta Marketing API docs for structure."
        ),
      start_time: z
        .string()
        .optional()
        .describe(
          "Start time in ISO 8601 format (e.g., 2024-01-15T00:00:00-0800)"
        ),
      end_time: z
        .string()
        .optional()
        .describe(
          "End time in ISO 8601 format. Required if using lifetime_budget."
        ),
    },
    async (
      {
        ad_set_id,
        name,
        status,
        daily_budget,
        lifetime_budget,
        bid_amount,
        billing_event,
        optimization_goal,
        targeting,
        start_time,
        end_time,
      },
      extra
    ) => {
      try {
        const access_token = getAccessToken(extra);
        const fields: Record<string, unknown> = {};
        if (name !== undefined) fields.name = name;
        if (status !== undefined) fields.status = status;
        if (daily_budget !== undefined) fields.daily_budget = daily_budget;
        if (lifetime_budget !== undefined) fields.lifetime_budget = lifetime_budget;
        if (bid_amount !== undefined) fields.bid_amount = bid_amount;
        if (billing_event !== undefined) fields.billing_event = billing_event;
        if (optimization_goal !== undefined)
          fields.optimization_goal = optimization_goal;
        if (targeting !== undefined) fields.targeting = targeting;
        if (start_time !== undefined) fields.start_time = start_time;
        if (end_time !== undefined) fields.end_time = end_time;

        if (Object.keys(fields).length === 0) {
          return errorResult(
            new ConnectorError(
              "At least one field must be provided to update",
              "VALIDATION_ERROR",
              400
            )
          );
        }

        const result = await updateAdSet(access_token, ad_set_id, fields);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_ad",
    "Update a Meta/Facebook ad. Can change status (pause/activate), name, or creative. Provide at least one field to update.",
    {
      ad_id: z.string().describe("The ad ID to update"),
      name: z.string().optional().describe("New ad name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New ad status"),
      creative: z
        .record(z.unknown())
        .optional()
        .describe(
          "Creative spec object (JSON) with creative_id or inline creative fields"
        ),
    },
    async ({ ad_id, name, status, creative }, extra) => {
      try {
        const access_token = getAccessToken(extra);
        const fields: Record<string, unknown> = {};
        if (name !== undefined) fields.name = name;
        if (status !== undefined) fields.status = status;
        if (creative !== undefined) fields.creative = creative;

        if (Object.keys(fields).length === 0) {
          return errorResult(
            new ConnectorError(
              "At least one field must be provided to update",
              "VALIDATION_ERROR",
              400
            )
          );
        }

        const result = await updateAd(access_token, ad_id, fields);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
