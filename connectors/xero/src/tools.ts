import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import * as api from "./api.js";

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

/**
 * Extract the OAuth access token from the MCP transport layer.
 * The token is provided automatically by Claude's integration — it is NOT
 * a tool parameter. It arrives via extra.authInfo.token on every request.
 */
function getAccessToken(extra: { authInfo?: { token?: string } }): string {
  const token = extra.authInfo?.token;
  if (!token) {
    throw new ConnectorError(
      "No access token found. Please reconnect to authenticate.",
      "AUTH_REQUIRED",
      401
    );
  }
  return token;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const xeroId = z.string().uuid();

/**
 * Every tool is read-only. Payroll tools hit Xero Payroll AU; the rest hit
 * the Xero Accounting API.
 */
export function registerTools(server: McpServer) {
  // =========================================================================
  // ORGANISATION
  // =========================================================================

  server.tool(
    "get_organisation",
    "Get the connected Xero organisation's details: name, legal name, base currency, financial year end, timezone and so on. Handy for checking which org the connector is pointed at.",
    {},
    async (_params, extra) => {
      try {
        return toolResult(await api.getOrganisation(getAccessToken(extra)));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // PAYROLL: EMPLOYEES AND LEAVE
  // =========================================================================

  server.tool(
    "list_employees",
    "List Xero Payroll (AU) employees with ID, name, email, status, job title and start/termination dates. Email is the best key for matching people to WorkflowMax staff.",
    {
      status: z
        .enum(["ACTIVE", "TERMINATED", "ALL"])
        .optional()
        .describe("Which employees to return (default ACTIVE)"),
    },
    async (params, extra) => {
      try {
        return toolResult(await api.listEmployees(getAccessToken(extra), params.status));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_employee",
    "Get one Xero Payroll employee in full, including leave balances, pay template and super memberships. Tax file number and bank account numbers are redacted.",
    {
      employee_id: xeroId.describe("Xero EmployeeID"),
    },
    async (params, extra) => {
      try {
        return toolResult(await api.getEmployee(getAccessToken(extra), params.employee_id));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "list_leave_types",
    "List the leave types set up in Xero Payroll (annual leave, personal/carer's leave, long service, etc.) with their IDs, units and whether they're paid.",
    {},
    async (_params, extra) => {
      try {
        return toolResult(await api.listLeaveTypes(getAccessToken(extra)));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "list_leave_applications",
    "List leave applications and leave requests from Xero Payroll with employee name, email and leave type. State is APPROVED (scheduled or already paid), REQUESTED (awaiting approval) or REJECTED. Each has its leave periods: units per pay period, not per day. To get leave per person per day, use get_leave_by_day instead.",
    {
      from: isoDate.optional().describe("Only leave ending on or after this date (YYYY-MM-DD)"),
      to: isoDate.optional().describe("Only leave starting on or before this date (YYYY-MM-DD)"),
      employee_id: xeroId.optional().describe("Only this employee's leave"),
      states: z
        .array(z.enum(["APPROVED", "REQUESTED", "REJECTED"]))
        .optional()
        .describe("Only these states (default all)"),
    },
    async (params, extra) => {
      try {
        const result = await api.listLeaveApplications(getAccessToken(extra), {
          from: params.from,
          to: params.to,
          employeeId: params.employee_id,
          states: params.states,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_leave_by_day",
    "Get approved leave broken down to one entry per person per day between two dates, with the employee's name and email, leave type, units (usually hours) and the Xero leave_application_id. Use this to log leave as WorkflowMax timesheets: match employee_email to WorkflowMax staff, convert units to minutes, and put the leave_application_id in the timesheet note so re-runs can spot entries already logged. Xero only stores leave per pay period, so multi-day leave is spread evenly across weekdays (see split_note); pass public holidays in exclude_dates. Cashed-out leave is left out.",
    {
      from: isoDate.describe("First day to include (YYYY-MM-DD)"),
      to: isoDate.describe("Last day to include (YYYY-MM-DD)"),
      include_requested: z
        .boolean()
        .optional()
        .describe("Also include leave still awaiting approval (default false)"),
      employee_id: xeroId.optional().describe("Only this employee's leave"),
      exclude_dates: z
        .array(isoDate)
        .optional()
        .describe("Dates to leave out of the split, e.g. public holidays (YYYY-MM-DD)"),
    },
    async (params, extra) => {
      try {
        if (params.from > params.to) {
          throw new ConnectorError("from must be on or before to.", "INVALID_DATES", 400);
        }
        const result = await api.getLeaveByDay(getAccessToken(extra), {
          from: params.from,
          to: params.to,
          includeRequested: params.include_requested,
          employeeId: params.employee_id,
          excludeDates: params.exclude_dates,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // PAYROLL: TIMESHEETS, PAY RUNS, PAYSLIPS
  // =========================================================================

  server.tool(
    "list_payroll_timesheets",
    "List Xero Payroll timesheets (hours submitted for pay, not WorkflowMax job time), newest first.",
    {
      from: isoDate.optional().describe("Only timesheets ending on or after this date (YYYY-MM-DD)"),
      to: isoDate.optional().describe("Only timesheets starting on or before this date (YYYY-MM-DD)"),
      employee_id: xeroId.optional().describe("Only this employee's timesheets"),
    },
    async (params, extra) => {
      try {
        const result = await api.listPayrollTimesheets(getAccessToken(extra), {
          from: params.from,
          to: params.to,
          employeeId: params.employee_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "list_pay_runs",
    "List the most recent Xero Payroll pay runs with period dates, status, payment date and totals (wages, tax, super, net pay).",
    {
      limit: z.number().int().min(1).max(100).optional().describe("How many recent pay runs (default 12)"),
    },
    async (params, extra) => {
      try {
        return toolResult(await api.listPayRuns(getAccessToken(extra), params.limit));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_pay_run",
    "Get one pay run with its payslip summaries (one per employee). Use get_payslip for a payslip's line detail.",
    {
      pay_run_id: xeroId.describe("Xero PayRunID"),
    },
    async (params, extra) => {
      try {
        return toolResult(await api.getPayRun(getAccessToken(extra), params.pay_run_id));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_payslip",
    "Get one payslip in full: earnings, leave taken and accrued, deductions, super, tax and reimbursements.",
    {
      payslip_id: xeroId.describe("Xero PayslipID (from get_pay_run)"),
    },
    async (params, extra) => {
      try {
        return toolResult(await api.getPayslip(getAccessToken(extra), params.payslip_id));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // ACCOUNTING: ACCOUNTS AND CONTACTS
  // =========================================================================

  server.tool(
    "list_accounts",
    "List the chart of accounts (code, name, type, class). Use it to find the account codes things are coded to, e.g. the software/subscriptions expense accounts.",
    {
      class: z
        .enum(["ASSET", "EQUITY", "EXPENSE", "LIABILITY", "REVENUE"])
        .optional()
        .describe("Only accounts of this class"),
      type: z.string().optional().describe("Only accounts of this type, e.g. EXPENSE, OVERHEADS, DIRECTCOSTS, BANK"),
      search: z.string().optional().describe("Match against account name, code or description"),
      include_archived: z.boolean().optional().describe("Include archived accounts (default false)"),
    },
    async (params, extra) => {
      try {
        const result = await api.listAccounts(getAccessToken(extra), {
          accountClass: params.class,
          type: params.type,
          search: params.search,
          includeArchived: params.include_archived,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "list_contacts",
    "List or search Xero contacts (suppliers and customers). Returns 100 per page.",
    {
      search: z.string().optional().describe("Search name, contact number or email"),
      suppliers_only: z.boolean().optional().describe("Only contacts that are suppliers"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
    },
    async (params, extra) => {
      try {
        const result = await api.listContacts(getAccessToken(extra), {
          search: params.search,
          suppliersOnly: params.suppliers_only,
          page: params.page,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // ACCOUNTING: BILLS, INVOICES, BANK TRANSACTIONS
  // =========================================================================

  server.tool(
    "list_invoices",
    "List Xero invoices with line items, newest first, 100 per page. Use type ACCPAY for bills from suppliers and ACCREC for sales invoices. Note that anything paid on a card or by direct debit without a bill shows up in list_bank_transactions instead.",
    {
      type: z.enum(["ACCPAY", "ACCREC"]).optional().describe("ACCPAY = bills, ACCREC = sales invoices"),
      from: isoDate.optional().describe("Invoice date on or after (YYYY-MM-DD)"),
      to: isoDate.optional().describe("Invoice date on or before (YYYY-MM-DD)"),
      statuses: z
        .array(z.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"]))
        .optional()
        .describe("Only these statuses"),
      contact_id: xeroId.optional().describe("Only this contact's invoices"),
      account_codes: z
        .array(z.string())
        .optional()
        .describe("Only invoices with a line coded to one of these account codes (filters within the page)"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
    },
    async (params, extra) => {
      try {
        const result = await api.listInvoices(getAccessToken(extra), {
          type: params.type,
          from: params.from,
          to: params.to,
          statuses: params.statuses,
          contactId: params.contact_id,
          accountCodes: params.account_codes,
          page: params.page,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_invoice",
    "Get one invoice or bill in full, including payments, credit notes and attachments info.",
    {
      invoice_id: xeroId.describe("Xero InvoiceID"),
    },
    async (params, extra) => {
      try {
        return toolResult(await api.getInvoice(getAccessToken(extra), params.invoice_id));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "list_bank_transactions",
    "List authorised Xero bank transactions with line items, newest first, 100 per page. Type SPEND is spend money: card payments, direct debits and anything paid without a bill (most software subscriptions land here).",
    {
      type: z
        .enum([
          "SPEND",
          "RECEIVE",
          "SPEND-TRANSFER",
          "RECEIVE-TRANSFER",
          "SPEND-OVERPAYMENT",
          "RECEIVE-OVERPAYMENT",
          "SPEND-PREPAYMENT",
          "RECEIVE-PREPAYMENT",
        ])
        .optional()
        .describe("Transaction type"),
      from: isoDate.optional().describe("Date on or after (YYYY-MM-DD)"),
      to: isoDate.optional().describe("Date on or before (YYYY-MM-DD)"),
      contact_id: xeroId.optional().describe("Only this contact's transactions"),
      account_codes: z
        .array(z.string())
        .optional()
        .describe("Only transactions with a line coded to one of these account codes (filters within the page)"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
    },
    async (params, extra) => {
      try {
        const result = await api.listBankTransactions(getAccessToken(extra), {
          type: params.type,
          from: params.from,
          to: params.to,
          contactId: params.contact_id,
          accountCodes: params.account_codes,
          page: params.page,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "list_repeating_invoices",
    "List repeating invoice and bill templates with their schedules (how often, next date). Repeating bills (ACCPAY) are a good source of recurring supplier costs.",
    {
      type: z.enum(["ACCPAY", "ACCREC"]).optional().describe("ACCPAY = repeating bills, ACCREC = repeating sales invoices"),
    },
    async (params, extra) => {
      try {
        return toolResult(await api.listRepeatingInvoices(getAccessToken(extra), params.type));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "software_spend_summary",
    "Summarise software and subscription spend by supplier over a date range (default the last 12 months), combining bills and spend-money transactions (card payments, direct debits) coded to the given expense accounts. For each supplier: total, number of charges, first and last charge, last and typical amount, a guessed frequency (monthly, yearly...), estimated annual cost, whether it still looks active, and sample line descriptions. Amounts are in base currency inc and ex GST. Good for building a software register, e.g. on a Monday board.",
    {
      account_codes: z
        .array(z.string())
        .optional()
        .describe("Expense account codes to include. If left out, uses active expense accounts whose name mentions software, subscriptions, SaaS, licences, cloud, hosting, computer or IT"),
      from: isoDate.optional().describe("Start date (YYYY-MM-DD, default 12 months before `to`)"),
      to: isoDate.optional().describe("End date (YYYY-MM-DD, default today)"),
    },
    async (params, extra) => {
      try {
        const result = await api.softwareSpendSummary(getAccessToken(extra), {
          accountCodes: params.account_codes,
          from: params.from,
          to: params.to,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // ACCOUNTING: REPORTS
  // =========================================================================

  server.tool(
    "get_report",
    "Run a Xero report and return it as a header row plus titled sections of rows. ProfitAndLoss and BankSummary take from/to; BalanceSheet, TrialBalance and ExecutiveSummary take date; ProfitAndLoss and BalanceSheet can compare periods with periods + timeframe. The aged reports need contact_id.",
    {
      report: z.enum(api.REPORTS).describe("Which report"),
      from: isoDate.optional().describe("Start date (YYYY-MM-DD)"),
      to: isoDate.optional().describe("End date (YYYY-MM-DD)"),
      date: isoDate.optional().describe("As-at date (YYYY-MM-DD)"),
      periods: z.number().int().min(1).max(11).optional().describe("Number of comparison periods"),
      timeframe: z.enum(["MONTH", "QUARTER", "YEAR"]).optional().describe("Length of each comparison period"),
      contact_id: xeroId.optional().describe("Contact for the aged payables/receivables reports"),
      payments_only: z.boolean().optional().describe("Cash basis (payments only)"),
    },
    async (params, extra) => {
      try {
        if (params.report.startsWith("Aged") && !params.contact_id) {
          throw new ConnectorError(
            `${params.report} needs a contact_id. Use list_contacts to find it.`,
            "CONTACT_REQUIRED",
            400
          );
        }
        const result = await api.getReport(getAccessToken(extra), params.report, {
          fromDate: params.from,
          toDate: params.to,
          date: params.date,
          periods: params.periods,
          timeframe: params.timeframe,
          contactId: params.contact_id,
          paymentsOnly: params.payments_only,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // ANY OTHER READ
  // =========================================================================

  server.tool(
    "xero_api_get",
    "Read any other Xero Accounting or Payroll AU endpoint when no other tool covers it (read-only GET). Accounting examples: /Payments, /CreditNotes, /PurchaseOrders, /Quotes, /ManualJournals, /Budgets, /TrackingCategories, /TaxRates, /Items, /BankTransfers, /Invoices/{id}/Attachments, /Reports (published reports such as BAS). Payroll examples: /PayrollCalendars, /Settings, /SuperFunds, /PayItems. Pass filters in query, e.g. {\"where\": \"Status==\\\"AUTHORISED\\\"\", \"page\": \"1\"}. Dates come back as YYYY-MM-DD.",
    {
      api: z.enum(["accounting", "payroll"]).describe("accounting = api.xro/2.0, payroll = payroll.xro/1.0 (AU)"),
      path: z.string().describe("Endpoint path starting with /, e.g. /Payments"),
      query: z.record(z.string()).optional().describe("Query parameters"),
    },
    async (params, extra) => {
      try {
        const result = await api.rawGet(getAccessToken(extra), params.api, params.path, params.query);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
