import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

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
    // Only these people can sign in. Unset or empty locks everyone out.
    allowedEmails: (process.env.ALLOWED_EMAILS ?? "").split(",").filter((e) => e.trim()),
    userinfoUrl: "https://identity.xero.com/connect/userinfo",
  },
};

if (!config.oauth.allowedEmails.length) {
  console.warn("[Xero] ALLOWED_EMAILS is not set, so nobody can sign in. Set it in Railway.");
}

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
