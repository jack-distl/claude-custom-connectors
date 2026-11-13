import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";
import { logPolicy, signInAllowlist } from "./access.js";

/**
 * Read-only access to accounting and AU payroll. Apps created after
 * 2 March 2026 must use Xero's granular accounting scopes; the old broad ones
 * (accounting.transactions, accounting.reports.read) are rejected.
 * XERO_SCOPES (space-separated) overrides the list if Xero renames any.
 */
const DEFAULT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.invoices.read",
  "accounting.payments.read",
  "accounting.banktransactions.read",
  "accounting.manualjournals.read",
  "accounting.contacts.read",
  "accounting.settings.read",
  "accounting.attachments.read",
  "accounting.budgets.read",
  "accounting.reports.aged.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.banksummary.read",
  "accounting.reports.executivesummary.read",
  "accounting.reports.profitandloss.read",
  "accounting.reports.trialbalance.read",
  "accounting.reports.taxreports.read",
  "payroll.employees.read",
  "payroll.settings.read",
  "payroll.timesheets.read",
  "payroll.payruns.read",
  "payroll.payslip.read",
];

const config = {
  name: "Xero",
  version: "1.0.0",
  oauth: {
    serverUrl: process.env.SERVER_URL || "http://localhost:3000",
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    scopes: process.env.XERO_SCOPES?.trim()
      ? process.env.XERO_SCOPES.trim().split(/\s+/)
      : DEFAULT_SCOPES,
    // Send Xero back through our /oauth/callback so the `iss` Claude sees is
    // always ours. Register <SERVER_URL>/oauth/callback in the Xero app.
    proxyCallback: true,
    // Sign-in lock: emails on ALLOWED_EMAILS or at a domain in
    // ALLOWED_EMAIL_DOMAINS. Both empty locks everyone out. The same check
    // runs again on every tool call in access.ts, with the per-area lists.
    ...signInAllowlist,
    userinfoUrl: "https://identity.xero.com/connect/userinfo",
  },
};

logPolicy();

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
