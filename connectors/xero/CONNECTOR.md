# Xero Connector

## Overview
Read-only access to [Xero](https://www.xero.com/) for one Australian organisation: Payroll AU (employees, leave, payroll timesheets, pay runs, payslips) and Accounting (chart of accounts, contacts, bills and invoices, bank transactions, repeating bills, reports). Built for two jobs in particular:

- **Leave into WorkflowMax** — `get_leave_by_day` turns Xero leave into one entry per person per day, ready to log as WorkflowMax timesheets with the WorkflowMax connector.
- **Software register** — `software_spend_summary` lists every software/subscription supplier with spend, frequency and whether it still looks active, ready to push to a Monday board.

Nothing in this connector writes to Xero.

**Anyone at Distl can use it, but only within their own access.** Each person signs in with their own Xero login, and every call goes through four checks (see [Access control](#access-control)). Xero's own role decides what they can see, and the `ACCESS_*` lists in Railway can only narrow that further, never widen it.

## Authentication
- **Type:** OAuth2 Authorization Code (Xero "Web app")
- **Authorize URL:** `https://login.xero.com/identity/connect/authorize`
- **Token URL:** `https://identity.xero.com/connect/token`
- **Redirect URI to register in the Xero app:** `<SERVER_URL>/oauth/callback` (the connector proxies the callback)
- **Token lifetime:** access tokens 30 minutes, refresh tokens 60 days (rotating)
- **Scopes:** `openid profile email offline_access` plus read-only:
  - Accounting: `accounting.invoices.read accounting.payments.read accounting.banktransactions.read accounting.manualjournals.read accounting.contacts.read accounting.settings.read accounting.attachments.read accounting.budgets.read`
  - Reports: `accounting.reports.aged.read accounting.reports.balancesheet.read accounting.reports.banksummary.read accounting.reports.executivesummary.read accounting.reports.profitandloss.read accounting.reports.trialbalance.read accounting.reports.taxreports.read`
  - Payroll AU: `payroll.employees.read payroll.settings.read payroll.timesheets.read payroll.payruns.read payroll.payslip.read`

  Xero apps created after 2 March 2026 can't use the old broad scopes (`accounting.transactions`, `accounting.reports.read`). If Xero rejects a scope at sign-in (`invalid_scope`), set `XERO_SCOPES` to a corrected space-separated list rather than changing code.
- **Tenant ID:** every API call needs a `Xero-Tenant-Id` header. It's always `XERO_TENANT_ID` (required). There's no auto-detect, so nobody can point the connector at another organisation.
- **Sign-in lock:** after Xero returns the tokens, the connector reads the signer's email from the OpenID `id_token` (falling back to Xero's userinfo endpoint) and refuses anyone not at an `ALLOWED_EMAIL_DOMAINS` domain or on `ALLOWED_EMAILS`.
- **Payroll access:** the Xero user who connects needs payroll access in Xero, or the payroll tools return 403.

> **Note:** OAuth is handled by the MCP transport layer. Access tokens are NOT passed as tool parameters — they flow automatically via the MCP session. The connector reads the token from `extra.authInfo.token` in each tool handler.

## Access control

Every tool call runs these checks before anything goes to Xero (`src/access.ts`). Any failure refuses the call, and anything missing or unreadable fails closed.

1. **Who is this, according to Xero.** The connector asks Xero's userinfo endpoint who the token belongs to. It never trusts what the token itself says, so a made-up token gets nowhere. Cached for 10 minutes per token.
2. **Allowed person.** Email at an `ALLOWED_EMAIL_DOMAINS` domain (exact domain, so `notdistl.com.au` or `distl.com.au.evil.com` don't match) or on `ALLOWED_EMAILS`.
3. **Right organisation.** Their Xero login must be connected to the org in `XERO_TENANT_ID` (checked via Xero's `/connections` with their token). Every call goes to that org only.
4. **Allowed area.** The tool's group must list them:

| Group | Env var | Tools |
|-------|---------|-------|
| (everyone who passes 1 to 3) | | `my_access`, `get_organisation` |
| accounting | `ACCESS_ACCOUNTING` | `list_accounts`, `list_contacts`, `list_invoices`, `get_invoice`, `list_bank_transactions`, `list_repeating_invoices`, `software_spend_summary`, `xero_api_get` on accounting paths |
| reports | `ACCESS_REPORTS` | `get_report`, `xero_api_get` on any `/Reports` path |
| leave | `ACCESS_LEAVE` | `list_employees`, `list_leave_types`, `list_leave_applications`, `get_leave_by_day` |
| payroll | `ACCESS_PAYROLL` | `get_employee`, `list_payroll_timesheets`, `list_pay_runs`, `get_pay_run`, `get_payslip`, `xero_api_get` on any payroll path. Includes leave |

Each `ACCESS_*` is a comma-separated list of emails, or `*` for everyone who passes checks 1 to 3. Blank means nobody. A tool not in the table is refused.

Then **Xero applies the person's own role** on top, because the call uses their token. Someone in `ACCESS_PAYROLL` without payroll admin in Xero still gets a 403 from Xero. Someone with payroll admin in Xero but not in `ACCESS_PAYROLL` gets refused by the connector. Both have to say yes.

Every allow and deny is logged in Railway as `[Xero][access] ALLOW|DENY <email> <tool>`, with no Xero data in the log.

**Things the groups don't cover:**
- Individual pay amounts can show up in accounting data (wage payments in bank transactions, payroll journals in `/ManualJournals`) and in reports (wages lines on the P&L). Whether that's per person depends on how Distl's payroll posts to the ledger. Keep `ACCESS_ACCOUNTING` and `ACCESS_REPORTS` tight if that matters.
- The checks run on the token Claude sends. Anyone using someone else's signed-in Claude account gets that person's access.
- Changing an `ACCESS_*` list in Railway redeploys the service, and the change applies to the next call. Taking someone out of `ALLOWED_*` stops their next call as well, even if they're still connected in Claude.

**Claude-side controls (extra layer).** On Team and Enterprise plans only Owners can add custom connectors, and Owners can switch specific tools off for the whole org in Organization settings → Connectors. Enterprise can also limit a connector to certain groups of people. Those apply to everyone at once. The per-person split lives in the `ACCESS_*` lists above.

## Tools

### Organisation
| Tool | Description |
|------|-------------|
| `my_access` | Who you're signed in as and which groups you can use |
| `get_organisation` | Connected organisation's details (name, base currency, year end) |

### Payroll AU
| Tool | Description |
|------|-------------|
| `list_employees` | Employees with ID, name, email, status, job title |
| `get_employee` | One employee in full incl. leave balances (TFN and bank details redacted) |
| `list_leave_types` | Leave types with units and paid/unpaid |
| `list_leave_applications` | Leave applications and requests, with state APPROVED / REQUESTED / REJECTED |
| `get_leave_by_day` | Approved leave as one entry per person per day (see below) |
| `list_payroll_timesheets` | Payroll timesheets (hours for pay, not WorkflowMax job time) |
| `list_pay_runs` | Recent pay runs with totals |
| `get_pay_run` | One pay run with payslip summaries |
| `get_payslip` | One payslip in full |

### Accounting
| Tool | Description |
|------|-------------|
| `list_accounts` | Chart of accounts, filter by class/type/search |
| `list_contacts` | Search contacts, suppliers only option |
| `list_invoices` | Bills (`ACCPAY`) and sales invoices (`ACCREC`) with line items, filter by date/status/contact/account code |
| `get_invoice` | One invoice or bill in full |
| `list_bank_transactions` | Spend/receive money (card payments, direct debits) with line items |
| `list_repeating_invoices` | Repeating bill and invoice templates with schedules |
| `software_spend_summary` | Software/subscription spend grouped by supplier (see below) |
| `get_report` | P&L, balance sheet, trial balance, bank summary, executive summary, aged payables/receivables |
| `xero_api_get` | Any other Accounting or Payroll AU GET endpoint (read-only) |

### How `get_leave_by_day` works
Xero stores leave as units (hours) per **pay period**, not per day. For each pay period the units are spread evenly over that leave's weekdays inside the period, skipping any `exclude_dates` (pass public holidays). Single-day and part-day leave come through as-is. Entries spread over several days carry a `split_note`.

- Includes leave periods that are `SCHEDULED` (approved) or `PROCESSED` (paid in a pay run). `include_requested` adds ones still awaiting approval.
- Cashed-out leave is left out.
- Each entry has `employee_email` (for matching to WorkflowMax staff) and `leave_application_id` (put this in the WorkflowMax timesheet note so a re-run can tell what's already logged).
- Assumes a Monday–Friday week. Part-time staff on fewer days will have their hours spread over five days, so check the draft for them.

### How `software_spend_summary` works
Combines bills (`ACCPAY`, authorised or paid) and spend money transactions (authorised) over the date range (default last 12 months) and keeps only lines coded to the chosen expense accounts. Without `account_codes` it picks active expense accounts whose name mentions software, subscriptions, SaaS, licences, cloud, hosting, computer or IT, and says which it used. Amounts are converted to base currency. Frequency is guessed from the median gap between charges; `likely_active` is false when the last charge is well overdue for that frequency.

## Environment Variables
| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `SERVER_URL` | Public URL of this Railway service, with `https://` | Railway → Settings → Networking → Generate Domain |
| `CLIENT_ID` | OAuth client ID | developer.xero.com → My Apps → your app → Configuration |
| `CLIENT_SECRET` | OAuth client secret | Same place (generate a secret) |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated domains allowed to sign in, e.g. `distl.com.au` | Your email domain |
| `ALLOWED_EMAILS` | Extra individual emails allowed to sign in (e.g. an outside bookkeeper). Domains and emails both empty locks everyone out | Their Xero login email |
| `XERO_TENANT_ID` | Required. The organisation the connector is locked to | Deploy with it blank, connect in Claude and ask it to run `my_access`. The refusal lists the organisations your login is connected to with their IDs |
| `ACCESS_ACCOUNTING` | Who can use accounting tools. Emails or `*` | You decide |
| `ACCESS_REPORTS` | Who can run reports. Emails or `*` | You decide |
| `ACCESS_LEAVE` | Who can see employees and leave. Emails or `*` | You decide |
| `ACCESS_PAYROLL` | Who can see pay runs, payslips and full employee records. Emails only, keep it short | You decide |
| `XERO_SCOPES` | Optional. Space-separated scope override | Only if Xero rejects a default scope |

## Rate limits
Xero's free Starter tier allows 1,000 API calls a day, 60 a minute and 5 at once per organisation. The connector retries per-minute and concurrency limits, and reports the daily limit clearly. `get_leave_by_day` and `software_spend_summary` page through everything they need, so each run costs a handful of calls.

## Setup Checklist

1. **Create a Xero app** at [developer.xero.com](https://developer.xero.com/app/manage) → New app → **Web app**. Use any placeholder redirect URI for now (e.g. `https://example.com/oauth/callback`). Note the client ID and generate a client secret.
2. **Create a Railway service** pointing to this repo, Dockerfile path `connectors/xero/Dockerfile`.
3. **Set environment variables**: `CLIENT_ID`, `CLIENT_SECRET`, `ALLOWED_EMAIL_DOMAINS`, `XERO_TENANT_ID` and the `ACCESS_*` lists. Leave `SERVER_URL` blank for now.
4. **Deploy and generate a domain** (Settings → Networking → Generate Domain).
5. **Set `SERVER_URL`** to the domain with `https://`. This redeploys.
6. **Update the Xero app's redirect URI** to `<SERVER_URL>/oauth/callback` exactly.
7. **Add to Claude**: Settings → Connectors → add `<SERVER_URL>/mcp`. Each person signs in with their own Xero login and ticks the Distl organisation.
8. **Test**: ask Claude "run my_access". Then test with someone who should be refused payroll, and check the `DENY` line in the Railway logs.

## API Reference
- [Xero Payroll AU API](https://developer.xero.com/documentation/api/payrollau/overview)
- [Xero Accounting API](https://developer.xero.com/documentation/api/accounting/overview)
- [Xero OAuth 2.0 scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/)
- [Xero OpenAPI specs](https://github.com/XeroAPI/Xero-OpenAPI)
