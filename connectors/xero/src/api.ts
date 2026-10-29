import { ConnectorError } from "@custom-connectors/shared";

const API_ROOT = "https://api.xero.com";
const BASE_URLS = {
  accounting: `${API_ROOT}/api.xro/2.0`,
  payroll: `${API_ROOT}/payroll.xro/1.0`,
} as const;

export type XeroApi = keyof typeof BASE_URLS;

/** Xero list endpoints return up to 100 records per page. */
const PAGE_SIZE = 100;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Tenant (organisation) ID
// ---------------------------------------------------------------------------

interface XeroConnection {
  tenantId: string;
  tenantType: string;
  tenantName: string;
}

const tenantCache = new Map<string, string>();

/**
 * Every Xero API call needs a `Xero-Tenant-Id` header naming the organisation.
 * Uses XERO_TENANT_ID if set, otherwise looks up the organisations this token
 * can reach via GET /connections (cached per token).
 */
async function getTenantId(accessToken: string): Promise<string> {
  if (process.env.XERO_TENANT_ID) return process.env.XERO_TENANT_ID;
  const cached = tenantCache.get(accessToken);
  if (cached) return cached;

  const response = await fetch(`${API_ROOT}/connections`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`[Xero] GET /connections failed (${response.status}): ${body}`);
    throw new ConnectorError(
      `Couldn't look up the connected Xero organisation (${response.status}): ${body}`,
      response.status === 401 ? "AUTH_ERROR" : "API_ERROR",
      response.status
    );
  }

  const orgs = ((await response.json()) as XeroConnection[]).filter(
    (c) => c.tenantType === "ORGANISATION"
  );
  if (orgs.length !== 1) {
    const names = orgs.map((o) => `${o.tenantName} (${o.tenantId})`).join(", ");
    throw new ConnectorError(
      orgs.length === 0
        ? "No Xero organisation is connected. Reconnect the connector and pick an organisation."
        : `More than one Xero organisation is connected: ${names}. Set XERO_TENANT_ID in Railway to the one to use.`,
      "TENANT_REQUIRED",
      400
    );
  }

  // Access tokens rotate every 30 minutes, so keep the cache from growing.
  if (tenantCache.size > 100) tenantCache.clear();
  tenantCache.set(accessToken, orgs[0].tenantId);
  console.log(`[Xero] Using organisation ${orgs[0].tenantName} (${orgs[0].tenantId})`);
  return orgs[0].tenantId;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

type Query = Record<string, string | number | boolean | undefined>;

function qs(params: Query): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function errorMessage(status: number, body: string): string {
  if (status === 401) {
    return `Xero rejected the access token (401). Reconnect the Xero connector in Claude. ${body}`;
  }
  if (status === 403) {
    return (
      "Xero refused access (403). Usually the signed-in Xero user doesn't have access to this " +
      `area (payroll needs payroll access in Xero) or the scope wasn't granted. ${body}`
    );
  }
  return `Xero API error (${status}): ${body}`;
}

/**
 * GET a Xero endpoint, logging the full error body on failure. Retries once
 * or twice on the per-minute and concurrent rate limits; the daily limit
 * (1,000 calls on the free Starter tier) is reported straight away.
 */
export async function xeroGet<T = Record<string, unknown>>(
  accessToken: string,
  api: XeroApi,
  path: string,
  query: Query = {}
): Promise<T> {
  const tenantId = await getTenantId(accessToken);
  const url = `${BASE_URLS[api]}${path}${qs(query)}`;

  for (let attempt = 0; ; attempt++) {
    console.log(`[Xero] GET ${url}`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    });
    if (response.ok) return (await response.json()) as T;

    const body = await response.text();
    console.error(`[Xero] API error ${response.status} on GET ${url}: ${body}`);

    if (response.status === 429) {
      const problem = response.headers.get("x-rate-limit-problem") ?? "unknown";
      const retryAfter = Number(response.headers.get("retry-after") ?? "5");
      if (problem !== "day" && attempt < 2 && retryAfter <= 60) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      throw new ConnectorError(
        problem === "day"
          ? `Xero's daily API limit is used up. It resets in about ${Math.ceil(retryAfter / 3600)} hours.`
          : `Xero rate limit hit (${problem}). Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT",
        429
      );
    }

    throw new ConnectorError(
      errorMessage(response.status, body),
      response.status === 401 ? "AUTH_ERROR" : "API_ERROR",
      response.status
    );
  }
}

/**
 * Fetch every page of a list endpoint. Stops on a short page, or if a page
 * repeats the previous one (an endpoint that ignores `page`).
 */
async function getAllPages<T>(
  accessToken: string,
  api: XeroApi,
  path: string,
  key: string,
  query: Query = {},
  maxPages = 50
): Promise<T[]> {
  const all: T[] = [];
  let previousFirst: string | undefined;
  for (let page = 1; page <= maxPages; page++) {
    const data = await xeroGet(accessToken, api, path, { ...query, page });
    const items = (data[key] as T[] | undefined) ?? [];
    const first = JSON.stringify(items[0]);
    if (items.length === 0 || first === previousFirst) break;
    previousFirst = first;
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Dates and response clean-up
// ---------------------------------------------------------------------------

const MS_DATE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/;

/**
 * Convert Xero's "/Date(1573516800000+0000)/" to "YYYY-MM-DD". With an offset,
 * take the local date. Without one, round to the nearest UTC day: payroll
 * dates arrive as UTC midnight, or as Australian local midnight expressed in
 * UTC (13:00–16:00 the day before), and rounding lands both on the right day.
 */
export function xeroDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const m = MS_DATE.exec(value);
  if (!m) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
  const ms = Number(m[1]);
  const offset = m[2] ?? "+0000";
  const offsetMs =
    (offset[0] === "-" ? -1 : 1) *
    (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5))) *
    60_000;
  const day = offsetMs ? Math.floor((ms + offsetMs) / DAY_MS) : Math.round(ms / DAY_MS);
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Payroll fields that never need to reach a chat. */
const REDACTED_PAYROLL_FIELDS = new Set(["TaxFileNumber", "AccountNumber", "BSB"]);

/**
 * Make a Xero response readable: MS-JSON dates become "YYYY-MM-DD" (or an ISO
 * timestamp for *UTC fields), the duplicate "*String" date fields are
 * dropped, and with `redact` the payroll TFN and bank details are masked.
 */
export function tidy<T = unknown>(value: unknown, redact = false): T {
  if (Array.isArray(value)) return value.map((v) => tidy(v, redact)) as T;
  if (!value || typeof value !== "object") return value as T;

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(obj)) {
    if (key.endsWith("String") && key.length > 6 && key.slice(0, -6) in obj) continue;
    if (redact && REDACTED_PAYROLL_FIELDS.has(key)) {
      out[key] = "[redacted]";
    } else if (typeof v === "string" && MS_DATE.test(v)) {
      const asString = obj[`${key}String`];
      if (typeof asString === "string") out[key] = asString.slice(0, 10);
      else if (key.endsWith("UTC")) out[key] = new Date(Number(MS_DATE.exec(v)![1])).toISOString();
      else out[key] = xeroDate(v);
    } else {
      out[key] = tidy(v, redact);
    }
  }
  return out as T;
}

function parseDay(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Xero `where` filter literal for a YYYY-MM-DD date. */
function dateTimeExpr(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `DateTime(${y},${m},${d})`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export async function getOrganisation(accessToken: string) {
  const data = await xeroGet(accessToken, "accounting", "/Organisation");
  return tidy((data.Organisations as unknown[] | undefined)?.[0]);
}

// ---------------------------------------------------------------------------
// Payroll AU: employees and leave
// ---------------------------------------------------------------------------

interface Employee {
  EmployeeID: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Status?: string;
  JobTitle?: string;
  StartDate?: string;
  TerminationDate?: string;
  EmploymentType?: string;
  IsAuthorisedToApproveLeave?: boolean;
}

interface LeaveType {
  LeaveTypeID: string;
  Name: string;
  TypeOfUnits?: string;
  IsPaidLeave?: boolean;
  CurrentRecord?: boolean;
}

interface LeavePeriod {
  NumberOfUnits?: number;
  PayPeriodStartDate?: string;
  PayPeriodEndDate?: string;
  LeavePeriodStatus?: string;
}

interface LeaveApplication {
  LeaveApplicationID: string;
  EmployeeID: string;
  LeaveTypeID: string;
  Title?: string;
  Description?: string;
  StartDate?: string;
  EndDate?: string;
  PayOutType?: string;
  LeavePeriods?: LeavePeriod[];
  UpdatedDateUTC?: string;
}

function fullName(e?: Employee): string | undefined {
  if (!e) return undefined;
  return [e.FirstName, e.LastName].filter(Boolean).join(" ") || undefined;
}

export async function listEmployees(
  accessToken: string,
  status: "ACTIVE" | "TERMINATED" | "ALL" = "ACTIVE"
) {
  const employees = tidy<Employee[]>(
    await getAllPages<Employee>(accessToken, "payroll", "/Employees", "Employees")
  );
  return employees
    .filter((e) => status === "ALL" || e.Status === status)
    .map((e) => ({
      EmployeeID: e.EmployeeID,
      Name: fullName(e),
      Email: e.Email,
      Status: e.Status,
      JobTitle: e.JobTitle,
      EmploymentType: e.EmploymentType,
      StartDate: e.StartDate,
      TerminationDate: e.TerminationDate,
      IsAuthorisedToApproveLeave: e.IsAuthorisedToApproveLeave,
    }));
}

export async function getEmployee(accessToken: string, employeeId: string) {
  const data = await xeroGet(accessToken, "payroll", `/Employees/${employeeId}`);
  return tidy((data.Employees as unknown[] | undefined)?.[0], true);
}

export async function listLeaveTypes(accessToken: string): Promise<LeaveType[]> {
  const data = await xeroGet(accessToken, "payroll", "/PayItems");
  const payItems = data.PayItems as { LeaveTypes?: LeaveType[] } | undefined;
  return tidy(payItems?.LeaveTypes ?? []);
}

/** Employees and leave types by ID, for putting names on leave records. */
async function leaveLookups(accessToken: string) {
  const [employees, leaveTypes] = await Promise.all([
    getAllPages<Employee>(accessToken, "payroll", "/Employees", "Employees"),
    listLeaveTypes(accessToken),
  ]);
  return {
    employees: new Map(employees.map((e) => [e.EmployeeID, e])),
    leaveTypes: new Map(leaveTypes.map((t) => [t.LeaveTypeID, t])),
  };
}

/** Leave applications (including requests) as tidy records. */
async function fetchLeaveApplications(accessToken: string): Promise<LeaveApplication[]> {
  return tidy(
    await getAllPages<LeaveApplication>(
      accessToken,
      "payroll",
      "/LeaveApplications/v2",
      "LeaveApplications"
    )
  );
}

function overlaps(app: LeaveApplication, from?: string, to?: string): boolean {
  if (from && app.EndDate && app.EndDate < from) return false;
  if (to && app.StartDate && app.StartDate > to) return false;
  return true;
}

/**
 * Overall state of an application from its leave periods: REJECTED if every
 * period is rejected, REQUESTED if any period is still awaiting approval,
 * otherwise APPROVED (periods are SCHEDULED or already PROCESSED in a pay run).
 */
function applicationState(app: LeaveApplication): string {
  const statuses = (app.LeavePeriods ?? []).map((p) => p.LeavePeriodStatus);
  if (statuses.length && statuses.every((s) => s === "REJECTED")) return "REJECTED";
  if (statuses.includes("REQUESTED")) return "REQUESTED";
  return "APPROVED";
}

export async function listLeaveApplications(
  accessToken: string,
  params: { from?: string; to?: string; employeeId?: string; states?: string[] }
) {
  const [apps, lookups] = await Promise.all([
    fetchLeaveApplications(accessToken),
    leaveLookups(accessToken),
  ]);
  return apps
    .filter((a) => overlaps(a, params.from, params.to))
    .filter((a) => !params.employeeId || a.EmployeeID === params.employeeId)
    .map((a) => {
      const employee = lookups.employees.get(a.EmployeeID);
      const leaveType = lookups.leaveTypes.get(a.LeaveTypeID);
      return {
        LeaveApplicationID: a.LeaveApplicationID,
        State: applicationState(a),
        EmployeeID: a.EmployeeID,
        EmployeeName: fullName(employee),
        EmployeeEmail: employee?.Email,
        LeaveType: leaveType?.Name,
        UnitType: leaveType?.TypeOfUnits ?? "Hours",
        Title: a.Title,
        Description: a.Description,
        StartDate: a.StartDate,
        EndDate: a.EndDate,
        PayOutType: a.PayOutType,
        LeavePeriods: a.LeavePeriods,
        UpdatedDateUTC: a.UpdatedDateUTC,
      };
    })
    .filter((a) => !params.states?.length || params.states.includes(a.State))
    .sort((x, y) => (x.StartDate ?? "").localeCompare(y.StartDate ?? ""));
}

export interface LeaveDay {
  date: string;
  employee_id: string;
  employee_name?: string;
  employee_email?: string;
  leave_type?: string;
  units: number;
  unit_type: string;
  period_status?: string;
  leave_application_id: string;
  title?: string;
  description?: string;
  /** Set when a pay period's units were spread evenly over several days. */
  split_note?: string;
}

/**
 * Break leave into one entry per person per day within [from, to].
 *
 * Xero only stores leave as a number of units per pay period, not per day.
 * For each pay period the units are spread evenly over the leave's days that
 * fall inside it, using weekdays only (unless that leaves none) and skipping
 * `excludeDates` (e.g. public holidays). Cashed-out leave is ignored.
 */
export async function getLeaveByDay(
  accessToken: string,
  params: {
    from: string;
    to: string;
    includeRequested?: boolean;
    employeeId?: string;
    excludeDates?: string[];
  }
) {
  const [apps, lookups] = await Promise.all([
    fetchLeaveApplications(accessToken),
    leaveLookups(accessToken),
  ]);
  const wanted = new Set(["SCHEDULED", "PROCESSED"]);
  if (params.includeRequested) wanted.add("REQUESTED");
  const excluded = new Set(params.excludeDates ?? []);
  const fromDay = parseDay(params.from);
  const toDay = parseDay(params.to);

  const entries: LeaveDay[] = [];
  const skipped: { leave_application_id: string; employee_name?: string; reason: string }[] = [];

  for (const app of apps) {
    if (!overlaps(app, params.from, params.to)) continue;
    if (params.employeeId && app.EmployeeID !== params.employeeId) continue;
    if (app.PayOutType === "CASHED_OUT") continue;

    const employee = lookups.employees.get(app.EmployeeID);
    const leaveType = lookups.leaveTypes.get(app.LeaveTypeID);
    if (!app.StartDate || !app.EndDate) {
      skipped.push({
        leave_application_id: app.LeaveApplicationID,
        employee_name: fullName(employee),
        reason: "Leave has no start or end date",
      });
      continue;
    }
    const leaveStart = parseDay(app.StartDate);
    const leaveEnd = parseDay(app.EndDate);

    for (const period of app.LeavePeriods ?? []) {
      if (!period.LeavePeriodStatus || !wanted.has(period.LeavePeriodStatus)) continue;
      const units = period.NumberOfUnits ?? 0;
      if (units <= 0) continue;

      const start = Math.max(leaveStart, period.PayPeriodStartDate ? parseDay(period.PayPeriodStartDate) : leaveStart);
      const end = Math.min(leaveEnd, period.PayPeriodEndDate ? parseDay(period.PayPeriodEndDate) : leaveEnd);
      const allDays: number[] = [];
      for (let day = start; day <= end; day++) {
        if (!excluded.has(formatDay(day))) allDays.push(day);
      }
      const weekdays = allDays.filter((day) => {
        const dow = new Date(day * DAY_MS).getUTCDay();
        return dow >= 1 && dow <= 5;
      });
      const days = weekdays.length ? weekdays : allDays;
      if (!days.length) {
        skipped.push({
          leave_application_id: app.LeaveApplicationID,
          employee_name: fullName(employee),
          reason: `${units} units in pay period ${period.PayPeriodStartDate} to ${period.PayPeriodEndDate} don't fall on any day of the leave`,
        });
        continue;
      }

      const perDay = round2(units / days.length);
      for (const day of days) {
        if (day < fromDay || day > toDay) continue;
        entries.push({
          date: formatDay(day),
          employee_id: app.EmployeeID,
          employee_name: fullName(employee),
          employee_email: employee?.Email,
          leave_type: leaveType?.Name,
          units: perDay,
          unit_type: leaveType?.TypeOfUnits ?? "Hours",
          period_status: period.LeavePeriodStatus,
          leave_application_id: app.LeaveApplicationID,
          title: app.Title,
          description: app.Description,
          ...(days.length > 1 && {
            split_note: `${units} units spread evenly over ${days.length} days (${formatDay(days[0])} to ${formatDay(days[days.length - 1])})`,
          }),
        });
      }
    }
  }

  entries.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.employee_name ?? "").localeCompare(b.employee_name ?? "")
  );

  const byPerson = new Map<string, { employee_name?: string; employee_email?: string; total_units: number; days: number }>();
  for (const e of entries) {
    const p = byPerson.get(e.employee_id) ?? {
      employee_name: e.employee_name,
      employee_email: e.employee_email,
      total_units: 0,
      days: 0,
    };
    p.total_units = round2(p.total_units + e.units);
    p.days += 1;
    byPerson.set(e.employee_id, p);
  }

  return {
    from: params.from,
    to: params.to,
    statuses_included: [...wanted],
    entries,
    by_person: [...byPerson.values()],
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Payroll AU: timesheets, pay runs, payslips
// ---------------------------------------------------------------------------

interface PayrollTimesheet {
  TimesheetID: string;
  EmployeeID: string;
  StartDate?: string;
  EndDate?: string;
  Status?: string;
  Hours?: number;
}

export async function listPayrollTimesheets(
  accessToken: string,
  params: { from?: string; to?: string; employeeId?: string }
) {
  const timesheets = tidy<PayrollTimesheet[]>(
    await getAllPages<PayrollTimesheet>(accessToken, "payroll", "/Timesheets", "Timesheets", {}, 20)
  );
  return timesheets
    .filter((t) => !params.employeeId || t.EmployeeID === params.employeeId)
    .filter((t) => !params.from || !t.EndDate || t.EndDate >= params.from)
    .filter((t) => !params.to || !t.StartDate || t.StartDate <= params.to)
    .sort((a, b) => (b.StartDate ?? "").localeCompare(a.StartDate ?? ""));
}

interface PayRun {
  PayRunID: string;
  PaymentDate?: string;
}

export async function listPayRuns(accessToken: string, limit = 12) {
  const payRuns = tidy<PayRun[]>(
    await getAllPages<PayRun>(accessToken, "payroll", "/PayRuns", "PayRuns", {}, 20)
  );
  return payRuns
    .sort((a, b) => (b.PaymentDate ?? "").localeCompare(a.PaymentDate ?? ""))
    .slice(0, limit);
}

export async function getPayRun(accessToken: string, payRunId: string) {
  const data = await xeroGet(accessToken, "payroll", `/PayRuns/${payRunId}`);
  return tidy((data.PayRuns as unknown[] | undefined)?.[0], true);
}

export async function getPayslip(accessToken: string, payslipId: string) {
  const data = await xeroGet(accessToken, "payroll", `/Payslip/${payslipId}`);
  return tidy(data.Payslip, true);
}

// ---------------------------------------------------------------------------
// Accounting: accounts and contacts
// ---------------------------------------------------------------------------

interface Account {
  AccountID: string;
  Code?: string;
  Name?: string;
  Type?: string;
  Class?: string;
  Status?: string;
  Description?: string;
  TaxType?: string;
}

export async function listAccounts(
  accessToken: string,
  params: { accountClass?: string; type?: string; search?: string; includeArchived?: boolean }
) {
  const data = await xeroGet(accessToken, "accounting", "/Accounts", {
    where: params.includeArchived ? undefined : 'Status=="ACTIVE"',
  });
  const search = params.search?.toLowerCase();
  return tidy<Account[]>(data.Accounts ?? [])
    .filter((a) => !params.accountClass || a.Class === params.accountClass)
    .filter((a) => !params.type || a.Type === params.type)
    .filter(
      (a) =>
        !search ||
        a.Name?.toLowerCase().includes(search) ||
        a.Code?.toLowerCase().includes(search) ||
        a.Description?.toLowerCase().includes(search)
    )
    .map((a) => ({
      Code: a.Code,
      Name: a.Name,
      Type: a.Type,
      Class: a.Class,
      Status: a.Status,
      Description: a.Description,
      TaxType: a.TaxType,
      AccountID: a.AccountID,
    }));
}

interface Contact {
  ContactID: string;
  Name?: string;
  EmailAddress?: string;
  ContactStatus?: string;
  IsSupplier?: boolean;
  IsCustomer?: boolean;
}

export async function listContacts(
  accessToken: string,
  params: { search?: string; suppliersOnly?: boolean; page?: number }
) {
  const data = await xeroGet(accessToken, "accounting", "/Contacts", {
    searchTerm: params.search,
    where: params.suppliersOnly ? "IsSupplier==true" : undefined,
    page: params.page ?? 1,
  });
  const contacts = tidy<Contact[]>(data.Contacts ?? []);
  return {
    page: params.page ?? 1,
    has_more: contacts.length === PAGE_SIZE,
    contacts: contacts.map((c) => ({
      ContactID: c.ContactID,
      Name: c.Name,
      EmailAddress: c.EmailAddress,
      ContactStatus: c.ContactStatus,
      IsSupplier: c.IsSupplier,
      IsCustomer: c.IsCustomer,
    })),
  };
}

// ---------------------------------------------------------------------------
// Accounting: invoices, bills, bank transactions
// ---------------------------------------------------------------------------

interface LineItem {
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  AccountCode?: string;
  LineAmount?: number;
  TaxAmount?: number;
}

interface Invoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Type?: string;
  Contact?: { ContactID?: string; Name?: string };
  Date?: string;
  DueDate?: string;
  Status?: string;
  Reference?: string;
  LineAmountTypes?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  CurrencyCode?: string;
  CurrencyRate?: number;
  LineItems?: LineItem[];
}

interface BankTransaction {
  BankTransactionID: string;
  Type?: string;
  Contact?: { ContactID?: string; Name?: string };
  BankAccount?: { Code?: string; Name?: string };
  Date?: string;
  Status?: string;
  Reference?: string;
  IsReconciled?: boolean;
  LineAmountTypes?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  CurrencyCode?: string;
  CurrencyRate?: number;
  LineItems?: LineItem[];
}

function compactLines(lines: LineItem[] = []) {
  return lines.map((l) => ({
    Description: l.Description,
    Quantity: l.Quantity,
    UnitAmount: l.UnitAmount,
    AccountCode: l.AccountCode,
    LineAmount: l.LineAmount,
    TaxAmount: l.TaxAmount,
  }));
}

function hasAccountCode(lines: LineItem[] | undefined, codes?: string[]): boolean {
  if (!codes?.length) return true;
  return (lines ?? []).some((l) => l.AccountCode && codes.includes(l.AccountCode));
}

function dateWhere(field: string, from?: string, to?: string): string[] {
  const parts: string[] = [];
  if (from) parts.push(`${field}>=${dateTimeExpr(from)}`);
  if (to) parts.push(`${field}<=${dateTimeExpr(to)}`);
  return parts;
}

export async function listInvoices(
  accessToken: string,
  params: {
    type?: "ACCPAY" | "ACCREC";
    from?: string;
    to?: string;
    statuses?: string[];
    contactId?: string;
    accountCodes?: string[];
    page?: number;
  }
) {
  const where = [
    ...(params.type ? [`Type=="${params.type}"`] : []),
    ...dateWhere("Date", params.from, params.to),
  ];
  const page = params.page ?? 1;
  const data = await xeroGet(accessToken, "accounting", "/Invoices", {
    where: where.join(" AND ") || undefined,
    Statuses: params.statuses?.join(","),
    ContactIDs: params.contactId,
    order: "Date DESC",
    page,
  });
  const invoices = tidy<Invoice[]>(data.Invoices ?? []);
  return {
    page,
    has_more: invoices.length === PAGE_SIZE,
    invoices: invoices
      .filter((i) => hasAccountCode(i.LineItems, params.accountCodes))
      .map((i) => ({
        InvoiceID: i.InvoiceID,
        InvoiceNumber: i.InvoiceNumber,
        Type: i.Type,
        Contact: i.Contact?.Name,
        ContactID: i.Contact?.ContactID,
        Date: i.Date,
        DueDate: i.DueDate,
        Status: i.Status,
        Reference: i.Reference,
        LineAmountTypes: i.LineAmountTypes,
        SubTotal: i.SubTotal,
        TotalTax: i.TotalTax,
        Total: i.Total,
        AmountDue: i.AmountDue,
        AmountPaid: i.AmountPaid,
        CurrencyCode: i.CurrencyCode,
        LineItems: compactLines(i.LineItems),
      })),
  };
}

export async function getInvoice(accessToken: string, invoiceId: string) {
  const data = await xeroGet(accessToken, "accounting", `/Invoices/${invoiceId}`);
  return tidy((data.Invoices as unknown[] | undefined)?.[0]);
}

export async function listBankTransactions(
  accessToken: string,
  params: {
    type?: string;
    from?: string;
    to?: string;
    contactId?: string;
    accountCodes?: string[];
    page?: number;
  }
) {
  const where = [
    'Status=="AUTHORISED"',
    ...(params.type ? [`Type=="${params.type}"`] : []),
    ...(params.contactId ? [`Contact.ContactID==Guid("${params.contactId}")`] : []),
    ...dateWhere("Date", params.from, params.to),
  ];
  const page = params.page ?? 1;
  const data = await xeroGet(accessToken, "accounting", "/BankTransactions", {
    where: where.join(" AND "),
    order: "Date DESC",
    page,
  });
  const transactions = tidy<BankTransaction[]>(data.BankTransactions ?? []);
  return {
    page,
    has_more: transactions.length === PAGE_SIZE,
    bank_transactions: transactions
      .filter((t) => hasAccountCode(t.LineItems, params.accountCodes))
      .map((t) => ({
        BankTransactionID: t.BankTransactionID,
        Type: t.Type,
        Contact: t.Contact?.Name,
        ContactID: t.Contact?.ContactID,
        BankAccount: t.BankAccount?.Name,
        Date: t.Date,
        Reference: t.Reference,
        IsReconciled: t.IsReconciled,
        LineAmountTypes: t.LineAmountTypes,
        SubTotal: t.SubTotal,
        TotalTax: t.TotalTax,
        Total: t.Total,
        CurrencyCode: t.CurrencyCode,
        LineItems: compactLines(t.LineItems),
      })),
  };
}

export async function listRepeatingInvoices(accessToken: string, type?: "ACCPAY" | "ACCREC") {
  const data = await xeroGet(accessToken, "accounting", "/RepeatingInvoices", {
    where: type ? `Type=="${type}"` : undefined,
  });
  const repeating = tidy<(Invoice & { RepeatingInvoiceID: string; Schedule?: unknown })[]>(
    data.RepeatingInvoices ?? []
  );
  return repeating.map((r) => ({
    RepeatingInvoiceID: r.RepeatingInvoiceID,
    Type: r.Type,
    Contact: r.Contact?.Name,
    ContactID: r.Contact?.ContactID,
    Status: r.Status,
    Schedule: r.Schedule,
    Reference: r.Reference,
    Total: r.Total,
    CurrencyCode: r.CurrencyCode,
    LineItems: compactLines(r.LineItems),
  }));
}

// ---------------------------------------------------------------------------
// Accounting: reports
// ---------------------------------------------------------------------------

export const REPORTS = [
  "ProfitAndLoss",
  "BalanceSheet",
  "TrialBalance",
  "BankSummary",
  "ExecutiveSummary",
  "AgedPayablesByContact",
  "AgedReceivablesByContact",
] as const;

interface ReportRow {
  RowType?: string;
  Title?: string;
  Cells?: { Value?: string }[];
  Rows?: ReportRow[];
}

function cells(row: ReportRow): string[] {
  return (row.Cells ?? []).map((c) => c.Value ?? "");
}

/** Flatten Xero's nested report rows into a header plus titled sections of plain rows. */
export async function getReport(
  accessToken: string,
  report: (typeof REPORTS)[number],
  query: Query
) {
  const data = await xeroGet(accessToken, "accounting", `/Reports/${report}`, query);
  const raw = (data.Reports as Record<string, unknown>[] | undefined)?.[0] ?? {};
  let header: string[] = [];
  const sections: { title: string; rows: string[][] }[] = [];
  for (const row of (raw.Rows as ReportRow[] | undefined) ?? []) {
    if (row.RowType === "Header") header = cells(row);
    else if (row.RowType === "Section") sections.push({ title: row.Title ?? "", rows: (row.Rows ?? []).map(cells) });
    else sections.push({ title: "", rows: [cells(row)] });
  }
  return {
    name: raw.ReportName,
    titles: raw.ReportTitles,
    date: raw.ReportDate,
    header,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Software spend summary
// ---------------------------------------------------------------------------

const SOFTWARE_ACCOUNT_NAME =
  /software|subscription|saas|licen[cs]|cloud|hosting|computer|\bIT\b/i;

interface Charge {
  date: string;
  source: "bill" | "spend_money";
  amountIncGst: number;
  amountExGst: number;
  currency?: string;
  descriptions: string[];
  accountCodes: string[];
}

/**
 * Amounts on the lines coded to `codes`, converted to the organisation's base
 * currency (Xero's CurrencyRate is foreign units per one base unit).
 */
function chargeFrom(
  tx: Invoice | BankTransaction,
  codes: Set<string>,
  source: Charge["source"]
): Charge | undefined {
  const lines = (tx.LineItems ?? []).filter((l) => l.AccountCode && codes.has(l.AccountCode));
  if (!lines.length || !tx.Date) return undefined;
  const rate = tx.CurrencyRate && tx.CurrencyRate > 0 ? tx.CurrencyRate : 1;
  let ex = 0;
  let inc = 0;
  for (const l of lines) {
    const amount = l.LineAmount ?? 0;
    const tax = tx.LineAmountTypes === "NoTax" ? 0 : l.TaxAmount ?? 0;
    const lineEx = tx.LineAmountTypes === "Inclusive" ? amount - tax : amount;
    ex += lineEx;
    inc += lineEx + tax;
  }
  return {
    date: tx.Date,
    source,
    amountIncGst: round2(inc / rate),
    amountExGst: round2(ex / rate),
    currency: tx.CurrencyCode,
    descriptions: lines.map((l) => l.Description ?? "").filter(Boolean),
    accountCodes: [...new Set(lines.map((l) => l.AccountCode!))],
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const FREQUENCIES: { name: string; maxGap: number; perYear: number }[] = [
  { name: "weekly", maxGap: 10, perYear: 52 },
  { name: "fortnightly", maxGap: 20, perYear: 26 },
  { name: "monthly", maxGap: 45, perYear: 12 },
  { name: "quarterly", maxGap: 120, perYear: 4 },
  { name: "half-yearly", maxGap: 210, perYear: 2 },
  { name: "yearly", maxGap: 430, perYear: 1 },
];

/** Guess how often a supplier charges from the median gap between charge dates. */
function guessFrequency(dates: string[]) {
  const days = [...new Set(dates)].map(parseDay).sort((a, b) => a - b);
  if (days.length < 2) return { frequency: "once so far" };
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const gap = median(gaps);
  const match = FREQUENCIES.find((f) => gap <= f.maxGap);
  return match
    ? { frequency: match.name, perYear: match.perYear, medianGapDays: gap }
    : { frequency: "irregular", medianGapDays: gap };
}

export async function softwareSpendSummary(
  accessToken: string,
  params: { accountCodes?: string[]; from?: string; to?: string }
) {
  const to = params.to ?? todayIso();
  const from = params.from ?? formatDay(parseDay(to) - 365);

  let codes = params.accountCodes;
  let accountsUsed: { Code?: string; Name?: string }[] = [];
  const accounts = await listAccounts(accessToken, { includeArchived: true });
  if (codes?.length) {
    accountsUsed = accounts.filter((a) => a.Code && codes!.includes(a.Code));
  } else {
    accountsUsed = accounts.filter(
      (a) => a.Class === "EXPENSE" && a.Status === "ACTIVE" && SOFTWARE_ACCOUNT_NAME.test(a.Name ?? "")
    );
    codes = accountsUsed.map((a) => a.Code!).filter(Boolean);
    if (!codes.length) {
      throw new ConnectorError(
        "Couldn't find an expense account that looks like software or subscriptions. Use list_accounts to find the right codes and pass them as account_codes.",
        "ACCOUNT_CODES_REQUIRED",
        400
      );
    }
  }
  const codeSet = new Set(codes);

  const dateFilter = dateWhere("Date", from, to);
  const [bills, spend] = await Promise.all([
    getAllPages<Invoice>(accessToken, "accounting", "/Invoices", "Invoices", {
      where: ['Type=="ACCPAY"', ...dateFilter].join(" AND "),
      Statuses: "AUTHORISED,PAID",
      order: "Date DESC",
    }),
    getAllPages<BankTransaction>(accessToken, "accounting", "/BankTransactions", "BankTransactions", {
      where: ['Type=="SPEND"', 'Status=="AUTHORISED"', ...dateFilter].join(" AND "),
      order: "Date DESC",
    }),
  ]);

  const suppliers = new Map<string, { name: string; contactId?: string; charges: Charge[] }>();
  const add = (tx: Invoice | BankTransaction, source: Charge["source"]) => {
    const charge = chargeFrom(tx, codeSet, source);
    if (!charge) return;
    const name = tx.Contact?.Name ?? "(no supplier)";
    const key = tx.Contact?.ContactID ?? name;
    const entry = suppliers.get(key) ?? { name, contactId: tx.Contact?.ContactID, charges: [] };
    entry.charges.push(charge);
    suppliers.set(key, entry);
  };
  for (const bill of tidy<Invoice[]>(bills)) add(bill, "bill");
  for (const tx of tidy<BankTransaction[]>(spend)) add(tx, "spend_money");

  const toDay = parseDay(to);
  const rows = [...suppliers.values()].map(({ name, contactId, charges }) => {
    charges.sort((a, b) => a.date.localeCompare(b.date));
    const last = charges[charges.length - 1];
    const typical = round2(median(charges.map((c) => c.amountIncGst)));
    const freq = guessFrequency(charges.map((c) => c.date));
    const daysSinceLast = toDay - parseDay(last.date);
    const currencies = [...new Set(charges.map((c) => c.currency).filter(Boolean))];
    return {
      supplier: name,
      contact_id: contactId,
      charges: charges.length,
      total_inc_gst: round2(charges.reduce((s, c) => s + c.amountIncGst, 0)),
      total_ex_gst: round2(charges.reduce((s, c) => s + c.amountExGst, 0)),
      first_charge: charges[0].date,
      last_charge: last.date,
      last_amount_inc_gst: last.amountIncGst,
      typical_amount_inc_gst: typical,
      frequency: freq.frequency,
      estimated_annual_inc_gst: freq.perYear ? round2(typical * freq.perYear) : undefined,
      likely_active:
        freq.medianGapDays !== undefined ? daysSinceLast <= freq.medianGapDays * 1.5 + 7 : undefined,
      currencies,
      paid_via: [...new Set(charges.map((c) => c.source))],
      account_codes: [...new Set(charges.flatMap((c) => c.accountCodes))],
      sample_descriptions: [...new Set(charges.flatMap((c) => c.descriptions))].slice(0, 3),
    };
  });
  rows.sort((a, b) => b.total_inc_gst - a.total_inc_gst);

  return {
    from,
    to,
    accounts_used: accountsUsed.map((a) => ({ code: a.Code, name: a.Name })),
    supplier_count: rows.length,
    total_inc_gst: round2(rows.reduce((s, r) => s + r.total_inc_gst, 0)),
    note: "Amounts are in the organisation's base currency. Frequency and likely_active are guesses from charge dates.",
    suppliers: rows,
  };
}

// ---------------------------------------------------------------------------
// Raw read access
// ---------------------------------------------------------------------------

export async function rawGet(
  accessToken: string,
  api: XeroApi,
  path: string,
  query: Record<string, string> = {}
) {
  if (!/^\/[A-Za-z0-9/_.\-]*$/.test(path) || path.includes("..")) {
    throw new ConnectorError(
      `Invalid path "${path}". Use a plain endpoint path like /Payments or /Employees/{id}, with query parameters passed separately.`,
      "INVALID_PATH",
      400
    );
  }
  return tidy(await xeroGet(accessToken, api, path, query), api === "payroll");
}
