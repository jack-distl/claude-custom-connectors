import { graphRequest, CAMPAIGN_FIELDS, ADSET_FIELDS, AD_FIELDS } from "./api.js";
import type { CreativeFreedomDeps, GraphPage } from "./creative-freedom.js";

// ===== Retryable Graph error classification =====
//
// Meta reports code 17 ("User request limit reached" / "Ad account has too many
// API calls") with is_transient:false, but it is a SOFT throttle that clears on
// its own. So we deliberately ignore is_transient and treat the throttle codes
// as retryable. Errors reach us as text (from graphRequest we get
// "... | code=17 | subcode=2446079"; from the shared client we might instead see
// the raw '"code":17' JSON body), so match both spellings.

const RETRYABLE_CODES = new Set([4, 17, 613, 80000, 80001, 80002, 80003, 80004]);
const RETRYABLE_SUBCODES = new Set([2446079]);

function numbersAfter(pattern: RegExp, msg: string): number[] {
  return [...msg.matchAll(pattern)].map((m) => Number(m[1]));
}

export function isRetryableGraphError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);

  // Network / timeout / abort — always transient.
  if (/NETWORK_ERROR|network\/timeout|aborted|abort|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(msg)) {
    return true;
  }
  // Explicit throttle codes, either "code=17" or '"code":17'.
  const codes = numbersAfter(/(?:"code"\s*:\s*|code=)(\d+)/g, msg);
  if (codes.some((c) => RETRYABLE_CODES.has(c))) return true;
  const subcodes = numbersAfter(/(?:"error_subcode"\s*:\s*|subcode=)(\d+)/g, msg);
  if (subcodes.some((s) => RETRYABLE_SUBCODES.has(s))) return true;
  // HTTP 429.
  if (/status=429|API returned 429|too many requests/i.test(msg)) return true;
  // Textual throttle signals as a last resort.
  if (/request limit reached|too many api calls|rate limit|reduce the amount of data|user request limit/i.test(msg)) {
    return true;
  }
  return false;
}

// ===== X-Business-Use-Case-Usage parsing =====

export interface UsageSample {
  /** Highest of call_count / total_cputime / total_time across all buckets (0-100+). */
  maxPct: number;
  /** estimated_time_to_regain_access converted to ms (Meta reports minutes). */
  estimatedRegainMs: number;
}

export function parseBusinessUseCaseUsage(header: string | null | undefined): UsageSample | null {
  if (!header) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    return null;
  }

  let maxPct = 0;
  let estimatedRegainMs = 0;
  const consider = (entry: unknown): void => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const rec = entry as Record<string, unknown>;
    for (const key of ["call_count", "total_cputime", "total_time"]) {
      const v = rec[key];
      if (typeof v === "number" && v > maxPct) maxPct = v;
    }
    const est = rec.estimated_time_to_regain_access;
    if (typeof est === "number" && est > 0) {
      const ms = est * 60_000; // Meta reports this in minutes.
      if (ms > estimatedRegainMs) estimatedRegainMs = ms;
    }
  };

  const entries: unknown[] = [];
  if (Array.isArray(parsed)) {
    entries.push(...parsed);
  } else if (parsed && typeof parsed === "object") {
    // Flat X-App-Usage shape ({call_count,...}).
    entries.push(parsed);
    // Keyed X-Business-Use-Case-Usage shape ({<id>:[{...}]}).
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) entries.push(...value);
      else if (value && typeof value === "object") entries.push(value);
    }
  }
  entries.forEach(consider);
  return { maxPct, estimatedRegainMs };
}

const PREEMPTIVE_THROTTLE_PCT = 75;
const MAX_COOLDOWN_MS = 60_000;

// ===== Per-account rate limiter =====
//
// One limiter per ad account (module singleton), so two concurrent walks on the
// same account share the same slots and queue instead of competing and blowing
// the per-account budget. Caps concurrency globally (default 4) and pre-emptively
// slows down once usage crosses ~75% rather than waiting for the 429 to land.

export class AccountRateLimiter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  private cooldownUntil = 0;

  constructor(
    private readonly concurrency = 4,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = () => Date.now()
  ) {}

  private async acquire(): Promise<void> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  /** Update the cooldown window from a usage sample. Exposed for testing. */
  observe(usageHeader: string | null | undefined): void {
    const usage = parseBusinessUseCaseUsage(usageHeader);
    if (!usage || usage.maxPct < PREEMPTIVE_THROTTLE_PCT) return;
    const over = usage.maxPct - PREEMPTIVE_THROTTLE_PCT;
    // 1s at 75%, scaling up; near/over 100% or when Meta gives a regain estimate,
    // back off harder — always capped at ~60s.
    let delay = Math.min(MAX_COOLDOWN_MS, 1_000 + over * 2_000);
    if (usage.maxPct >= 95 && usage.estimatedRegainMs > 0) {
      delay = Math.min(MAX_COOLDOWN_MS, Math.max(delay, usage.estimatedRegainMs));
    }
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + delay);
  }

  async schedule<T>(
    task: () => Promise<{ result: T; usageHeader: string | null }>
  ): Promise<T> {
    await this.acquire();
    try {
      const wait = this.cooldownUntil - this.now();
      if (wait > 0) await this.sleep(wait);
      const { result, usageHeader } = await task();
      this.observe(usageHeader);
      return result;
    } finally {
      this.release();
    }
  }
}

const limiterRegistry = new Map<string, AccountRateLimiter>();

/** Module-singleton limiter for an ad account so walks serialise per account. */
export function getAccountRateLimiter(
  adAccountId: string,
  concurrency = 4
): AccountRateLimiter {
  let limiter = limiterRegistry.get(adAccountId);
  if (!limiter) {
    limiter = new AccountRateLimiter(concurrency);
    limiterRegistry.set(adAccountId, limiter);
  }
  return limiter;
}

// ===== Real deps for collectAccountCreativeFreedom =====

/**
 * Build the campaign/ad-set/ad fetchers used by the walk. Every page request is
 * scheduled through the per-account limiter (bounded concurrency + pre-emptive
 * throttling); retry/backoff on rate-limit errors is handled one level up, in
 * the collector, so it composes with the limiter naturally.
 */
export function createGraphWalkDeps(opts: {
  accessToken: string;
  adAccountId: string;
  statusFilter: string;
  limiter: AccountRateLimiter;
  pageLimit?: number;
}): CreativeFreedomDeps {
  const { accessToken, adAccountId, statusFilter, limiter, pageLimit = 500 } = opts;

  const run = (path: string, params: URLSearchParams): Promise<GraphPage> =>
    limiter.schedule(async () => {
      const { body, usageHeader } = await graphRequest<GraphPage>(
        accessToken,
        path,
        params
      );
      return { result: body, usageHeader };
    });

  return {
    fetchCampaigns: ({ after }) => {
      const params = new URLSearchParams({
        fields: CAMPAIGN_FIELDS,
        limit: String(pageLimit),
      });
      if (after) params.set("after", after);
      return run(`act_${adAccountId}/campaigns`, params);
    },
    fetchAdSets: (campaignId, { after }) => {
      const params = new URLSearchParams({
        fields: ADSET_FIELDS,
        limit: String(pageLimit),
      });
      if (after) params.set("after", after);
      return run(`${campaignId}/adsets`, params);
    },
    fetchAds: (adSetId, { after }) => {
      const params = new URLSearchParams({
        fields: AD_FIELDS,
        limit: String(pageLimit),
      });
      // Filter ads by effective status server-side (default handled by caller).
      params.set("effective_status", JSON.stringify([statusFilter]));
      if (after) params.set("after", after);
      return run(`${adSetId}/ads`, params);
    },
  };
}
