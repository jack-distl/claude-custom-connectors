import { ConnectorError } from "@custom-connectors/shared";
import type { MetaObject } from "./api.js";

// ===== Nested creative-features flattening =====
//
// creative_features_spec is NOT flat. A top-level feature can be OPT_OUT while a
// customization nested under it is OPT_IN, e.g.
//
//   enhance_cta: {
//     enroll_status: "OPT_OUT",
//     customizations: { text_extraction: { enroll_status: "OPT_IN" } }
//   }
//
// Anything that reads only the top-level enroll_status reports this ad as clean
// when it isn't. We flatten every enroll_status we find to a dotted key
// ("enhance_cta.text_extraction") and treat it as a first-class on/off entry.
// The `customizations` wrapper is transparent — it never appears in the key.

export type FeatureSpec = Record<string, unknown>;

export interface CreativeFeaturesSplit {
  on: string[];
  off: string[];
}

// Keys that group nested customizations but are not features themselves; they
// are elided from the dotted path so "enhance_cta.customizations.text_extraction"
// surfaces as "enhance_cta.text_extraction".
const TRANSPARENT_WRAPPER_KEYS = new Set(["customizations"]);

/**
 * Walk a creative_features_spec, emitting a dotted key for every nested
 * enroll_status. Unknown feature keys pass through unchanged rather than being
 * dropped — the production key list is not exhaustive.
 *
 * When `includeFeatures` is provided, the on/off arrays are restricted to those
 * feature keys (matching either the exact dotted key or a top-level prefix, so
 * "enhance_cta" also keeps "enhance_cta.text_extraction").
 */
export function flattenCreativeFeatures(
  spec: unknown,
  includeFeatures?: string[]
): CreativeFeaturesSplit {
  const on: string[] = [];
  const off: string[] = [];

  const visit = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;

    const enroll = obj.enroll_status;
    if (typeof enroll === "string" && path.length > 0) {
      const key = path.join(".");
      if (enroll === "OPT_IN") on.push(key);
      else if (enroll === "OPT_OUT") off.push(key);
    }

    for (const [childKey, childValue] of Object.entries(obj)) {
      if (childKey === "enroll_status") continue;
      if (!childValue || typeof childValue !== "object") continue;
      if (TRANSPARENT_WRAPPER_KEYS.has(childKey)) {
        visit(childValue, path);
      } else {
        visit(childValue, [...path, childKey]);
      }
    }
  };

  visit(spec, []);

  if (includeFeatures && includeFeatures.length > 0) {
    const keep = (key: string): boolean =>
      includeFeatures.some((f) => key === f || key.startsWith(`${f}.`));
    return { on: on.filter(keep), off: off.filter(keep) };
  }
  return { on, off };
}

// ===== Account-wide walk =====

export interface CreativeFreedomAd {
  ad_id: string;
  ad_name: string;
  ad_status: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  creative_id: string | null;
  features_on: string[];
  features_off: string[];
  features_raw: FeatureSpec;
}

export interface CreativeFreedomResult {
  ad_account_id: string;
  ads_scanned: number;
  ads: CreativeFreedomAd[];
  summary: Record<string, number>;
}

interface Page {
  data?: MetaObject[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export interface CreativeFreedomDeps {
  fetchCampaigns(opts: { after?: string }): Promise<Page>;
  fetchAdSets(campaignId: string, opts: { after?: string }): Promise<Page>;
  fetchAds(adSetId: string, opts: { after?: string }): Promise<Page>;
}

export interface CreativeFreedomOptions {
  adAccountId: string;
  includeFeatures?: string[];
  /** Max concurrent ad set / ad walks. Default 5. */
  concurrency?: number;
  /** Retries per page fetch on a Graph rate-limit error. Default 4. */
  maxRetries?: number;
  /** Base backoff delay in ms (doubled each retry). Default 500. */
  baseDelayMs?: number;
  /** Injectable sleep, primarily for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Graph rate-limit / throttling error codes. metaRequest formats these into the
// error message as "code=<n>", so detect them there.
function isGraphRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /(?:^|[^0-9])code=(?:4|17|613)(?![0-9])/.test(msg) || /rate limit/i.test(msg);
}

interface RetryOpts {
  maxRetries: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

async function fetchWithRetry(
  fn: () => Promise<Page>,
  describe: string,
  { maxRetries, baseDelayMs, sleep }: RetryOpts
): Promise<Page> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (isGraphRateLimitError(err) && attempt < maxRetries) {
        await sleep(baseDelayMs * 2 ** attempt);
        attempt += 1;
        continue;
      }
      // Never degrade to partial results silently: name the entity that failed
      // so the caller sees a loud, actionable error instead of a short list.
      const detail = err instanceof Error ? err.message : String(err);
      throw new ConnectorError(
        `Failed to fetch ${describe} after ${attempt + 1} attempt(s): ${detail}. ` +
          `Aborting rather than returning partial results.`,
        "INCOMPLETE_WALK",
        502
      );
    }
  }
}

/**
 * Follow paging.cursors.after until exhausted. Continues while paging.next is
 * present (the reliable "more pages" signal — cursors.after is returned even on
 * the last page), guarding against a repeated cursor to avoid infinite loops.
 */
async function walkPages(
  fetchPage: (after?: string) => Promise<Page>,
  describe: string,
  retry: RetryOpts
): Promise<MetaObject[]> {
  const out: MetaObject[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;
  for (;;) {
    const page = await fetchWithRetry(() => fetchPage(after), describe, retry);
    if (Array.isArray(page.data)) out.push(...page.data);
    if (!page.paging?.next) break;
    const nextAfter = page.paging.cursors?.after;
    if (!nextAfter || seenCursors.has(nextAfter)) break;
    seenCursors.add(nextAfter);
    after = nextAfter;
  }
  return out;
}

/** Map with a fixed concurrency cap; rejects (loudly) if any task throws. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length || 1));
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildAdRow(
  ad: MetaObject,
  adSet: MetaObject,
  campaign: MetaObject,
  includeFeatures?: string[]
): CreativeFreedomAd {
  const creative = ad.creative as MetaObject | undefined;
  const dof = creative?.degrees_of_freedom_spec as MetaObject | undefined;
  const spec = (dof?.creative_features_spec as FeatureSpec | undefined) ?? {};
  const { on, off } = flattenCreativeFeatures(spec, includeFeatures);
  return {
    ad_id: String(ad.id ?? ""),
    ad_name: (ad.name as string | undefined) ?? "",
    ad_status:
      (ad.effective_status as string | undefined) ??
      (ad.status as string | undefined) ??
      "",
    adset_id: String(adSet.id ?? ad.adset_id ?? ""),
    adset_name: (adSet.name as string | undefined) ?? "",
    campaign_id: String(campaign.id ?? ad.campaign_id ?? ""),
    campaign_name: (campaign.name as string | undefined) ?? "",
    creative_id: creative?.id != null ? String(creative.id) : null,
    features_on: on,
    features_off: off,
    features_raw: spec,
  };
}

/**
 * Walk campaigns -> ad sets -> ads for an account entirely server-side and
 * return one flat row per ad with its creative-freedom features. Steps 2 and 3
 * run with a concurrency cap; every page fetch retries on Graph rate limits and
 * fails loudly (naming the campaign/ad set) rather than under-reporting.
 */
export async function collectAccountCreativeFreedom(
  deps: CreativeFreedomDeps,
  options: CreativeFreedomOptions
): Promise<CreativeFreedomResult> {
  const {
    adAccountId,
    includeFeatures,
    concurrency = 5,
    maxRetries = 4,
    baseDelayMs = 500,
    sleep = defaultSleep,
  } = options;
  const retry: RetryOpts = { maxRetries, baseDelayMs, sleep };

  // Step 1: campaigns for the account.
  const campaigns = await walkPages(
    (after) => deps.fetchCampaigns({ after }),
    `campaigns for account ${adAccountId}`,
    retry
  );

  // Step 2: ad sets per campaign (parallel, capped).
  interface AdSetCtx {
    adSet: MetaObject;
    campaign: MetaObject;
  }
  const adSetGroups = await mapPool(campaigns, concurrency, async (campaign) => {
    const campaignId = String(campaign.id ?? "");
    const campaignName = (campaign.name as string | undefined) ?? "";
    const label = campaignName ? `${campaignId} (${campaignName})` : campaignId;
    const adSets = await walkPages(
      (after) => deps.fetchAdSets(campaignId, { after }),
      `ad sets for campaign ${label}`,
      retry
    );
    return adSets.map<AdSetCtx>((adSet) => ({ adSet, campaign }));
  });
  const adSetCtxs: AdSetCtx[] = adSetGroups.flat();

  // Step 3: ads per ad set (parallel, capped).
  const adGroups = await mapPool(adSetCtxs, concurrency, async ({ adSet, campaign }) => {
    const adSetId = String(adSet.id ?? "");
    const adSetName = (adSet.name as string | undefined) ?? "";
    const label = adSetName ? `${adSetId} (${adSetName})` : adSetId;
    const ads = await walkPages(
      (after) => deps.fetchAds(adSetId, { after }),
      `ads for ad set ${label}`,
      retry
    );
    return ads.map((ad) => buildAdRow(ad, adSet, campaign, includeFeatures));
  });
  const ads: CreativeFreedomAd[] = adGroups.flat();

  // Summary: count of ads with each feature ON. "how many" always follows "which".
  const summary: Record<string, number> = {};
  for (const ad of ads) {
    for (const feature of ad.features_on) {
      summary[feature] = (summary[feature] ?? 0) + 1;
    }
  }

  return {
    ad_account_id: adAccountId,
    ads_scanned: ads.length,
    ads,
    summary,
  };
}
