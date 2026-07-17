import test from "node:test";
import assert from "node:assert/strict";
import {
  collectAccountCreativeFreedom,
  flattenCreativeFeatures,
  type CreativeFreedomDeps,
} from "./creative-freedom.js";
import {
  isRetryableGraphError,
  parseBusinessUseCaseUsage,
  AccountRateLimiter,
} from "./graph-scheduler.js";

// ---- Test fixtures: a three-level tree with more than one page at EVERY level ----
//
// The whole point of the tool is that it never stops early, so the tree is
// deliberately deeper than one page at campaign, ad set, AND ad level. If any
// level's pagination is dropped, the ad count comes back short and these fail.

interface Node {
  id: string;
  name: string;
  [key: string]: unknown;
}

type AdRecord = Record<string, unknown> & { id: string };

// Slice `items` into pages of `pageSize`, returning the Graph shape: paging.next
// is present only while more pages remain; cursors.after is the last item's id.
function paginate<T extends { id: string }>(items: T[], pageSize: number, after?: string) {
  const start = after ? items.findIndex((i) => i.id === after) + 1 : 0;
  const slice = items.slice(start, start + pageSize);
  const hasMore = start + slice.length < items.length;
  const last = slice[slice.length - 1];
  return {
    data: slice,
    paging: {
      cursors: last ? { after: last.id } : {},
      ...(hasMore ? { next: "https://graph.facebook.com/next" } : {}),
    },
  };
}

const CAMPAIGNS: Node[] = [
  { id: "c1", name: "Camp 1" },
  { id: "c2", name: "Camp 2" },
  { id: "c3", name: "Camp 3" },
];

// 3 ad sets per campaign.
const ADSETS: Record<string, Node[]> = {};
for (const c of CAMPAIGNS) {
  ADSETS[c.id] = [1, 2, 3].map((n) => ({ id: `${c.id}-as${n}`, name: `AdSet ${n}` }));
}

// 3 ads per ad set, each carrying a creative_features_spec.
function makeAd(adSetId: string, n: number): AdRecord {
  const id = `${adSetId}-ad${n}`;
  // Give the first ad of every ad set the tricky nested shape; others vary.
  const spec =
    n === 1
      ? {
          enhance_cta: {
            enroll_status: "OPT_OUT",
            customizations: { text_extraction: { enroll_status: "OPT_IN" } },
          },
          image_uncrop: { enroll_status: "OPT_IN" },
        }
      : n === 2
        ? { standard_enhancements: { enroll_status: "OPT_IN" } }
        : { text_optimizations: { enroll_status: "OPT_OUT" } };
  return {
    id,
    name: `Ad ${n}`,
    effective_status: "ACTIVE",
    adset_id: adSetId,
    creative: {
      id: `${id}-cr`,
      degrees_of_freedom_spec: { creative_features_spec: spec },
    },
  };
}

const ADS: Record<string, AdRecord[]> = {};
for (const list of Object.values(ADSETS)) {
  for (const as of list) {
    ADS[as.id] = [1, 2, 3].map((n) => makeAd(as.id, n));
  }
}

function makeDeps(overrides: Partial<CreativeFreedomDeps> = {}): CreativeFreedomDeps {
  return {
    fetchCampaigns: async ({ after }) => paginate(CAMPAIGNS, 2, after),
    fetchAdSets: async (campaignId, { after }) =>
      paginate(ADSETS[campaignId] ?? [], 2, after),
    fetchAds: async (adSetId, { after }) => paginate(ADS[adSetId] ?? [], 2, after),
    ...overrides,
  };
}

const NOOP_SLEEP = async () => {};

test("walks all levels to exhaustion and returns every ad", async () => {
  const result = await collectAccountCreativeFreedom(makeDeps(), {
    adAccountId: "act123",
    sleep: NOOP_SLEEP,
  });

  const expectedAdIds = new Set<string>();
  for (const list of Object.values(ADSETS)) {
    for (const as of list) {
      for (const n of [1, 2, 3]) expectedAdIds.add(`${as.id}-ad${n}`);
    }
  }

  // 3 campaigns * 3 ad sets * 3 ads = 27. A dropped cursor at any level shrinks this.
  assert.equal(expectedAdIds.size, 27);
  assert.equal(result.ads_scanned, 27, "every ad must be scanned");
  assert.equal(result.ads.length, 27);

  // Scan counters disambiguate genuine emptiness from a broken walk.
  assert.equal(result.campaigns_scanned, 3);
  assert.equal(result.ad_sets_scanned, 9);
  assert.equal(result.status_filter, "ACTIVE");

  const gotAdIds = new Set(result.ads.map((a) => a.ad_id));
  assert.deepEqual(gotAdIds, expectedAdIds, "no ad may be missing");

  // Context threaded down from each level.
  const sample = result.ads.find((a) => a.ad_id === "c2-as3-ad1");
  assert.ok(sample);
  assert.equal(sample.adset_id, "c2-as3");
  assert.equal(sample.adset_name, "AdSet 3");
  assert.equal(sample.campaign_id, "c2");
  assert.equal(sample.campaign_name, "Camp 2");
  assert.equal(sample.creative_id, "c2-as3-ad1-cr");
  assert.equal(sample.ad_status, "ACTIVE");
});

test("flattens nested customizations to dotted keys as first-class entries", async () => {
  const result = await collectAccountCreativeFreedom(makeDeps(), {
    adAccountId: "act123",
    sleep: NOOP_SLEEP,
  });
  const ad = result.ads.find((a) => a.ad_id === "c1-as1-ad1");
  assert.ok(ad);
  // Top-level OPT_OUT still recorded, and its nested OPT_IN surfaces separately.
  assert.ok(ad.features_off.includes("enhance_cta"), "top-level OPT_OUT recorded");
  assert.ok(
    ad.features_on.includes("enhance_cta.text_extraction"),
    "nested OPT_IN surfaced as dotted key"
  );
  assert.ok(ad.features_on.includes("image_uncrop"));
});

test("summary counts ads with each feature ON", async () => {
  const result = await collectAccountCreativeFreedom(makeDeps(), {
    adAccountId: "act123",
    sleep: NOOP_SLEEP,
  });
  // One ad #1 per ad set (9 ad sets) => 9 image_uncrop ON and 9 enhance_cta.text_extraction ON.
  assert.equal(result.summary.image_uncrop, 9);
  assert.equal(result.summary["enhance_cta.text_extraction"], 9);
  // One ad #2 per ad set => 9 standard_enhancements ON.
  assert.equal(result.summary.standard_enhancements, 9);
  // enhance_cta is OPT_OUT (off), never counted in the ON summary.
  assert.equal(result.summary.enhance_cta, undefined);
});

test("include_features restricts output but keeps nested under a top-level key", async () => {
  const result = await collectAccountCreativeFreedom(makeDeps(), {
    adAccountId: "act123",
    includeFeatures: ["enhance_cta"],
    sleep: NOOP_SLEEP,
  });
  const ad = result.ads.find((a) => a.ad_id === "c1-as1-ad1");
  assert.ok(ad);
  assert.deepEqual(ad.features_off, ["enhance_cta"]);
  assert.deepEqual(ad.features_on, ["enhance_cta.text_extraction"]);
  // image_uncrop filtered out of on/off, but features_raw stays verbatim.
  assert.ok(!ad.features_on.includes("image_uncrop"));
  assert.ok("image_uncrop" in (ad.features_raw as Record<string, unknown>));
  // Summary only reflects included features.
  assert.equal(result.summary.image_uncrop, undefined);
  assert.equal(result.summary["enhance_cta.text_extraction"], 9);
});

test("fails loudly naming the ad set when an ads page cannot be fetched", async () => {
  const deps = makeDeps({
    fetchAds: async (adSetId, { after }) => {
      if (adSetId === "c2-as2") throw new Error("boom: network down");
      return paginate(ADS[adSetId] ?? [], 2, after);
    },
  });
  await assert.rejects(
    () =>
      collectAccountCreativeFreedom(deps, {
        adAccountId: "act123",
        sleep: NOOP_SLEEP,
      }),
    (err: Error) => {
      assert.match(err.message, /ads for ad set c2-as2/);
      assert.match(err.message, /partial results/i);
      return true;
    }
  );
});

test("retries a soft throttle (code 17, is_transient:false) then succeeds", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const deps = makeDeps({
    fetchAds: async (adSetId, { after }) => {
      if (adSetId === "c1-as1" && !after) {
        calls += 1;
        if (calls < 3) {
          // Real payload: code 17 is reported is_transient:false but is retryable.
          throw new Error(
            "Meta Graph API error: status=400 | (#17) User request limit reached | code=17 | subcode=2446079"
          );
        }
      }
      return paginate(ADS[adSetId] ?? [], 2, after);
    },
  });
  const result = await collectAccountCreativeFreedom(deps, {
    adAccountId: "act123",
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    rand: () => 0.5, // deterministic jitter: half of the ceiling
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.equal(result.ads_scanned, 27, "all ads still returned after retries");
  assert.equal(calls, 3, "retried twice before succeeding");
  assert.equal(sleeps.length, 2, "backed off once per retry");
  // Full-jitter exponential: ceilings 2000, 4000 -> 0.5 * each.
  assert.deepEqual(sleeps, [1000, 2000]);
  assert.ok(sleeps.every((s) => s <= 60000), "each delay capped at 60s");
});

// ---- Fix 4: nested flattening, using a real spec from Triumph creative 2148983168850330 ----
// The trap: enhance_cta is OPT_OUT (features_off) while its own nested
// enhance_cta.text_extraction is OPT_IN (features_on) — same feature, opposite
// sides. text_optimizations is OPT_OUT with a nested OPT_OUT (both off).
const TRIUMPH_SPEC = {
  advantage_plus_creative: { enroll_status: "OPT_OUT" },
  enhance_cta: {
    enroll_status: "OPT_OUT",
    customizations: { text_extraction: { enroll_status: "OPT_IN" } },
  },
  image_uncrop: { enroll_status: "OPT_IN" },
  site_extensions: { enroll_status: "OPT_IN" },
  text_optimizations: {
    enroll_status: "OPT_OUT",
    customizations: { text_extraction: { enroll_status: "OPT_OUT" } },
  },
};

test("flattenCreativeFeatures splits the real Triumph spec onto the right sides", () => {
  const { on, off } = flattenCreativeFeatures(TRIUMPH_SPEC);

  for (const key of ["image_uncrop", "site_extensions", "enhance_cta.text_extraction"]) {
    assert.ok(on.includes(key), `${key} must be ON`);
  }
  for (const key of [
    "advantage_plus_creative",
    "enhance_cta",
    "text_optimizations",
    "text_optimizations.text_extraction",
  ]) {
    assert.ok(off.includes(key), `${key} must be OFF`);
  }
  // Same feature, opposite sides — the whole point.
  assert.ok(off.includes("enhance_cta") && on.includes("enhance_cta.text_extraction"));
  assert.ok(!on.includes("enhance_cta"), "enhance_cta itself must not be ON");
  assert.ok(
    !off.includes("enhance_cta.text_extraction"),
    "nested OPT_IN must not be OFF"
  );
});

test("summary counts dotted keys as first-class entries", async () => {
  // Every ad carries the Triumph spec; assert dotted keys are counted like the rest.
  const spec = TRIUMPH_SPEC;
  const oneAd = (adSetId: string, n: number): AdRecord => ({
    id: `${adSetId}-ad${n}`,
    name: `Ad ${n}`,
    effective_status: "ACTIVE",
    creative: {
      id: `${adSetId}-ad${n}-cr`,
      degrees_of_freedom_spec: { creative_features_spec: spec },
    },
  });
  const adsBySet: Record<string, AdRecord[]> = {};
  for (const list of Object.values(ADSETS)) {
    for (const as of list) adsBySet[as.id] = [1, 2, 3].map((n) => oneAd(as.id, n));
  }
  const deps = makeDeps({
    fetchAds: async (adSetId, { after }) => paginate(adsBySet[adSetId] ?? [], 2, after),
  });
  const result = await collectAccountCreativeFreedom(deps, {
    adAccountId: "act123",
    sleep: NOOP_SLEEP,
  });
  assert.equal(result.ads_scanned, 27);
  // All 27 ads have the dotted OPT_IN and the plain OPT_INs.
  assert.equal(result.summary["enhance_cta.text_extraction"], 27);
  assert.equal(result.summary.image_uncrop, 27);
  assert.equal(result.summary.site_extensions, 27);
  // OPT_OUT features never appear in the ON summary.
  assert.equal(result.summary.enhance_cta, undefined);
  assert.equal(result.summary["text_optimizations.text_extraction"], undefined);
});

// ---- REGRESSION: rate-limit on page 2 of one ad set must not lose any ad ----
test("recovers a mid-pagination throttle and still returns every ad", async () => {
  const thrown = new Set<string>();
  const deps = makeDeps({
    fetchAds: async (adSetId, { after }) => {
      // Fail once on page 2 (after is set) of exactly one ad set, then succeed.
      if (adSetId === "c2-as2" && after && !thrown.has(after)) {
        thrown.add(after);
        throw new Error(
          "Meta Graph API error: status=400 | Ad account has too many API calls | code=17 | subcode=2446079"
        );
      }
      return paginate(ADS[adSetId] ?? [], 2, after);
    },
  });
  const result = await collectAccountCreativeFreedom(deps, {
    adAccountId: "act123",
    rand: () => 0,
    sleep: NOOP_SLEEP,
  });
  // The whole point of the tool: a transient throttle mid-walk loses nothing.
  assert.equal(result.ads_scanned, 27, "every ad returns despite a page-2 throttle");
  assert.ok(thrown.size >= 1, "the throttle path actually executed");
  const ids = new Set(result.ads.map((a) => a.ad_id));
  for (const n of [1, 2, 3]) assert.ok(ids.has(`c2-as2-ad${n}`));
});

// Direct unit coverage of the flattener's edge cases.
test("flattenCreativeFeatures passes through unknown keys and empty spec", () => {
  assert.deepEqual(flattenCreativeFeatures({}), { on: [], off: [] });
  assert.deepEqual(flattenCreativeFeatures(undefined), { on: [], off: [] });
  const { on, off } = flattenCreativeFeatures({
    some_future_feature: { enroll_status: "OPT_IN" },
    another_one: { enroll_status: "OPT_OUT" },
  });
  assert.deepEqual(on, ["some_future_feature"]);
  assert.deepEqual(off, ["another_one"]);
});

// ---- Graph scheduler: retryable classification + usage parsing + limiter ----

test("isRetryableGraphError recognises throttles in both code spellings", () => {
  // graphRequest form.
  assert.ok(isRetryableGraphError(new Error("status=400 | ... | code=17 | subcode=2446079")));
  // raw shared-client body form ("code":17).
  assert.ok(
    isRetryableGraphError(new Error('API returned 400: {"error":{"message":"x","code":17}}'))
  );
  assert.ok(isRetryableGraphError(new Error("code=4")));
  assert.ok(isRetryableGraphError(new Error("code=613")));
  assert.ok(isRetryableGraphError(new Error("code=80004")));
  assert.ok(isRetryableGraphError(new Error("NETWORK_ERROR: fetch failed")));
  assert.ok(isRetryableGraphError(new Error("API returned 429: too many requests")));
  // Not retryable: auth / validation.
  assert.ok(!isRetryableGraphError(new Error("status=401 | invalid token | code=190")));
  assert.ok(!isRetryableGraphError(new Error("boom: network down")));
});

test("parseBusinessUseCaseUsage extracts the max utilisation bucket", () => {
  const header = JSON.stringify({
    "1234567890": [
      {
        type: "ads_management",
        call_count: 82,
        total_cputime: 25,
        total_time: 40,
        estimated_time_to_regain_access: 3,
      },
    ],
  });
  const usage = parseBusinessUseCaseUsage(header);
  assert.ok(usage);
  assert.equal(usage.maxPct, 82);
  assert.equal(usage.estimatedRegainMs, 3 * 60_000);
  assert.equal(parseBusinessUseCaseUsage(null), null);
  assert.equal(parseBusinessUseCaseUsage("not json"), null);
});

test("AccountRateLimiter caps concurrency and pre-emptively cools down at >75%", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let clock = 0;
  const sleeps: number[] = [];
  const limiter = new AccountRateLimiter(
    2, // cap 2 concurrent
    async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    () => clock
  );

  // First batch: no usage pressure, just prove the concurrency cap holds.
  const lowUsage = JSON.stringify({ x: [{ call_count: 10 }] });
  const tasks = Array.from({ length: 6 }, () =>
    limiter.schedule(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { result: true, usageHeader: lowUsage };
    })
  );
  await Promise.all(tasks);
  assert.ok(maxInFlight <= 2, `concurrency capped at 2 (saw ${maxInFlight})`);

  // A high-usage response should arm a cooldown that the next request waits on.
  await limiter.schedule(async () => ({
    result: true,
    usageHeader: JSON.stringify({ x: [{ call_count: 90 }] }),
  }));
  const before = sleeps.length;
  await limiter.schedule(async () => ({ result: true, usageHeader: lowUsage }));
  assert.ok(sleeps.length > before, "pre-emptive cooldown slept before the next call");
});
