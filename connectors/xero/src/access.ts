import crypto from "node:crypto";
import { ConnectorError, emailIsAllowed } from "@custom-connectors/shared";
import type { XeroApi } from "./api.js";

/**
 * Who can use what. Checked on EVERY tool call, on top of Xero's own
 * permissions (each person signs in with their own Xero login, so Xero still
 * only returns what their Xero role allows).
 *
 * A call goes through only if all of these pass:
 *  1. Xero vouches for the token: we ask Xero's userinfo endpoint who it
 *     belongs to (the token's own contents are never trusted for identity).
 *  2. Their email is on ALLOWED_EMAILS or at a domain in ALLOWED_EMAIL_DOMAINS.
 *  3. Their login has been connected to the organisation in XERO_TENANT_ID.
 *  4. The tool's access group lists them (ACCESS_<GROUP> env vars).
 *
 * Anything missing or unreadable fails closed.
 */

export const ACCESS_GROUPS = ["accounting", "reports", "leave", "payroll"] as const;
export type AccessGroup = (typeof ACCESS_GROUPS)[number];
/** "basic" tools (org name, my_access) need only checks 1 to 3. */
type ToolGroup = AccessGroup | "basic";

/** Every tool and the group it needs. A tool missing from here is refused. */
const TOOL_GROUPS: Record<string, ToolGroup | "by_path"> = {
  my_access: "basic",
  get_organisation: "basic",
  list_employees: "leave",
  list_leave_types: "leave",
  list_leave_applications: "leave",
  get_leave_by_day: "leave",
  get_employee: "payroll",
  list_payroll_timesheets: "payroll",
  list_pay_runs: "payroll",
  get_pay_run: "payroll",
  get_payslip: "payroll",
  list_accounts: "accounting",
  list_contacts: "accounting",
  list_invoices: "accounting",
  get_invoice: "accounting",
  list_bank_transactions: "accounting",
  list_repeating_invoices: "accounting",
  software_spend_summary: "accounting",
  get_report: "reports",
  xero_api_get: "by_path",
};

/** Group for a raw GET: any payroll endpoint is payroll, /Reports is reports, the rest accounting. */
export function groupForPath(api: XeroApi, path: string): AccessGroup {
  if (api === "payroll") return "payroll";
  // Any "reports" segment anywhere, so "//Reports" or "/./Reports" can't slip past.
  return /(^|\/)reports(\/|$)/i.test(path) ? "reports" : "accounting";
}

// ---------------------------------------------------------------------------
// Policy (read from env at startup; change it in Railway, which redeploys)
// ---------------------------------------------------------------------------

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

const policy = {
  allowedEmails: list(process.env.ALLOWED_EMAILS),
  allowedDomains: list(process.env.ALLOWED_EMAIL_DOMAINS),
  tenantId: process.env.XERO_TENANT_ID?.trim() ?? "",
  groups: Object.fromEntries(
    ACCESS_GROUPS.map((g) => [g, list(process.env[`ACCESS_${g.toUpperCase()}`])])
  ) as Record<AccessGroup, string[]>,
};

export const signInAllowlist = {
  allowedEmails: policy.allowedEmails,
  allowedEmailDomains: policy.allowedDomains,
};

/**
 * "*" means everyone who passes the sign-in and org checks. Payroll access
 * includes leave, since leave is the less sensitive part of payroll.
 */
function groupsFor(email: string): AccessGroup[] {
  const inGroup = (g: AccessGroup) => {
    const members = policy.groups[g];
    return members.includes("*") || members.includes(email);
  };
  return ACCESS_GROUPS.filter((g) => inGroup(g) || (g === "leave" && inGroup("payroll")));
}

export function logPolicy(): void {
  const problems: string[] = [];
  if (!policy.allowedEmails.length && !policy.allowedDomains.length) {
    problems.push("ALLOWED_EMAILS and ALLOWED_EMAIL_DOMAINS are both empty, so nobody can sign in");
  }
  if (!policy.tenantId) problems.push("XERO_TENANT_ID is not set, so every call is refused");
  for (const p of problems) console.warn(`[Xero] ${p}. Set it in Railway.`);
  console.log(
    `[Xero] Access policy: domains=[${policy.allowedDomains.join(", ")}] ` +
      `emails=${policy.allowedEmails.length} ` +
      ACCESS_GROUPS.map((g) => {
        const m = policy.groups[g];
        return `${g}=${m.includes("*") ? "everyone" : `${m.length} people`}`;
      }).join(" ")
  );
}

// ---------------------------------------------------------------------------
// Identity: who does this token belong to, according to Xero
// ---------------------------------------------------------------------------

interface Identity {
  email: string;
  tenants: Array<{ id: string; name: string }>;
  expiresAt: number;
}

const identityCache = new Map<string, Identity>();
const IDENTITY_TTL_MS = 10 * 60 * 1000;

function tokenKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function xeroJson(url: string, token: string, label: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`[Xero] ${label} failed (${response.status}): ${body}`);
    throw new ConnectorError(
      response.status === 401
        ? "Xero didn't accept your sign-in. Reconnect the Xero connector in Claude."
        : `Couldn't check your Xero access (${label} returned ${response.status}).`,
      response.status === 401 ? "AUTH_ERROR" : "ACCESS_CHECK_FAILED",
      response.status === 401 ? 401 : 502
    );
  }
  return response.json();
}

async function identify(token: string): Promise<Identity> {
  const key = tokenKey(token);
  const cached = identityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const [userinfo, connections] = await Promise.all([
    xeroJson("https://identity.xero.com/connect/userinfo", token, "Userinfo"),
    xeroJson("https://api.xero.com/connections", token, "Connections"),
  ]);
  const email = (userinfo as { email?: unknown }).email;
  if (typeof email !== "string" || !email.includes("@")) {
    throw new ConnectorError(
      "Couldn't read your email from Xero, so access is refused.",
      "ACCESS_DENIED",
      403
    );
  }
  const identity: Identity = {
    email: email.trim().toLowerCase(),
    tenants: (connections as Array<{ tenantId?: string; tenantType?: string; tenantName?: string }>)
      .filter((c) => c.tenantType === "ORGANISATION" && c.tenantId)
      .map((c) => ({ id: c.tenantId as string, name: c.tenantName ?? "" })),
    expiresAt: Date.now() + IDENTITY_TTL_MS,
  };
  if (identityCache.size > 500) identityCache.clear();
  identityCache.set(key, identity);
  return identity;
}

// ---------------------------------------------------------------------------
// The check every tool runs
// ---------------------------------------------------------------------------

function deny(email: string | undefined, tool: string, reason: string, message: string): never {
  console.warn(`[Xero][access] DENY ${email ?? "unknown"} ${tool}: ${reason}`);
  throw new ConnectorError(message, "ACCESS_DENIED", 403);
}

/**
 * Run the access checks for a tool call and return the caller's token.
 * `group` overrides the tool's group (used by xero_api_get, which depends on the path).
 */
export async function authorise(
  extra: { authInfo?: { token?: string } },
  tool: string,
  group?: AccessGroup
): Promise<string> {
  const token = extra.authInfo?.token;
  if (!token) {
    throw new ConnectorError("No access token found. Please reconnect.", "AUTH_REQUIRED", 401);
  }

  const mapped = TOOL_GROUPS[tool];
  const needed: ToolGroup | undefined = group ?? (mapped === "by_path" ? undefined : mapped);
  if (!needed) deny(undefined, tool, "tool has no access group", "This tool isn't available.");

  const { email, tenants } = await identify(token);

  if (!emailIsAllowed(email, policy.allowedEmails, policy.allowedDomains)) {
    deny(email, tool, "email not allowed", "Your account isn't allowed to use this connector.");
  }
  if (!policy.tenantId) {
    // Only reached by allowed people, and only shows their own connections.
    const orgs = tenants.map((t) => `${t.name} (${t.id})`).join(", ") || "none";
    deny(
      email,
      tool,
      "XERO_TENANT_ID not set",
      `The connector isn't set up yet: XERO_TENANT_ID is blank in Railway, so every call is refused. Your Xero login is connected to: ${orgs}. Set XERO_TENANT_ID to the right one.`
    );
  }
  if (!tenants.some((t) => t.id === policy.tenantId)) {
    deny(
      email,
      tool,
      "not connected to the configured organisation",
      "Your Xero login isn't connected to the right organisation. Reconnect the connector and tick that organisation, or ask whoever manages Xero for access."
    );
  }
  if (needed !== "basic" && !groupsFor(email).includes(needed)) {
    deny(
      email,
      tool,
      `not in ${needed}`,
      `You don't have ${needed} access in this connector. Ask Jack if you need it.`
    );
  }

  console.log(`[Xero][access] ALLOW ${email} ${tool} (${needed})`);
  return token;
}

/** What the caller can use, for the my_access tool. */
export async function describeAccess(extra: { authInfo?: { token?: string } }) {
  const token = await authorise(extra, "my_access");
  const { email } = await identify(token);
  const groups = groupsFor(email);
  return {
    email,
    connector_access: groups,
    tools_available: Object.entries(TOOL_GROUPS)
      .filter(([, g]) => g === "basic" || g === "by_path" || groups.includes(g as AccessGroup))
      .map(([t]) => t),
    note:
      "This is what the connector lets you call. Xero still only returns what your own Xero role allows, " +
      "so a tool listed here can still come back with a 403 from Xero (payroll needs payroll admin in Xero).",
  };
}
