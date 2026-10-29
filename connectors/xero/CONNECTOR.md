# Xero Connector

## Overview
Read-only access to [Xero](https://www.xero.com/) for one Australian organisation: Payroll AU (employees, leave, payroll timesheets, pay runs, payslips) and Accounting (chart of accounts, contacts, bills and invoices, bank transactions, repeating bills, reports). Built for two jobs in particular:

- **Leave into WorkflowMax** — `get_leave_by_day` turns Xero leave into one entry per person per day, ready to log as WorkflowMax timesheets with the WorkflowMax connector.
- **Software register** — `software_spend_summary` lists every software/subscription supplier with spend, frequency and whether it still looks active, ready to push to a Monday board.

Nothing in this connector writes to Xero.

**Locked to named people.** Only the emails in `ALLOWED_EMAILS` can sign in, even if someone else on the team has a Xero login. If it's empty, nobody can.

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
- **Tenant ID:** every API call needs a `Xero-Tenant-Id` header. The connector looks it up from `GET https://api.xero.com/connections`. Set `XERO_TENANT_ID` only if the login authorises more than one organisation.
- **Email lock:** after Xero returns the tokens, the connector reads the signer's email from the OpenID `id_token` (falling back to Xero's userinfo endpoint) and refuses anyone not in `ALLOWED_EMAILS`.
- **Payroll access:** the Xero user who connects needs payroll access in Xero, or the payroll tools return 403.

> **Note:** OAuth is handled by the MCP transport layer. Access tokens are NOT passed as tool parameters — they flow automatically via the MCP session. The connector reads the token from `extra.authInfo.token` in each tool handler.

## Tools

### Organisation
| Tool | Description |
|------|-------------|
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
| `ALLOWED_EMAILS` | Comma-separated emails allowed to sign in. Required; empty locks everyone out | The email of your Xero login |
| `XERO_TENANT_ID` | Optional. Pin the organisation if the login has more than one | `GET /connections`, or the error message tells you |
| `XERO_SCOPES` | Optional. Space-separated scope override | Only if Xero rejects a default scope |

## Rate limits
Xero's free Starter tier allows 1,000 API calls a day, 60 a minute and 5 at once per organisation. The connector retries per-minute and concurrency limits, and reports the daily limit clearly. `get_leave_by_day` and `software_spend_summary` page through everything they need, so each run costs a handful of calls.

## Setup Checklist

1. **Create a Xero app** at [developer.xero.com](https://developer.xero.com/app/manage) → New app → **Web app**. Use any placeholder redirect URI for now (e.g. `https://example.com/oauth/callback`). Note the client ID and generate a client secret.
2. **Create a Railway service** pointing to this repo, Dockerfile path `connectors/xero/Dockerfile`.
3. **Set environment variables**: `CLIENT_ID`, `CLIENT_SECRET`, `ALLOWED_EMAILS`. Leave `SERVER_URL` blank for now.
4. **Deploy and generate a domain** (Settings → Networking → Generate Domain).
5. **Set `SERVER_URL`** to the domain with `https://`. This redeploys.
6. **Update the Xero app's redirect URI** to `<SERVER_URL>/oauth/callback` exactly.
7. **Add to Claude**: Settings → Connectors → add `<SERVER_URL>/mcp`. Sign in with the Xero login whose email is in `ALLOWED_EMAILS` and pick the organisation.
8. **Test**: ask Claude "who's on leave next week?" or "run get_organisation".

## API Reference
- [Xero Payroll AU API](https://developer.xero.com/documentation/api/payrollau/overview)
- [Xero Accounting API](https://developer.xero.com/documentation/api/accounting/overview)
- [Xero OAuth 2.0 scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/)
- [Xero OpenAPI specs](https://github.com/XeroAPI/Xero-OpenAPI)
