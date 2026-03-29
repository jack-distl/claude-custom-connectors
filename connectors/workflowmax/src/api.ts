import { apiRequest } from "@custom-connectors/shared";

const BASE_URL = "https://api.workflowmax.com";

// ---------------------------------------------------------------------------
// Organisation ID from JWT
// ---------------------------------------------------------------------------

/**
 * Decode the JWT access token to extract the WorkflowMax organisation ID.
 * The access token is a JWT whose payload contains the org ID.
 * Every API request must include this as the `account_id` header.
 */
function getAccountId(accessToken: string): string {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Token is not a valid JWT (expected 3 parts, got " + parts.length + ")");
    }
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    // WorkflowMax JWT uses "aud" for the organisation/account ID
    const accountId = payload.aud;
    if (!accountId) {
      throw new Error(
        "No organisation ID (aud) found in token. JWT claims: " +
          Object.keys(payload).join(", ")
      );
    }
    console.log("[WFM] Using account_id:", accountId);
    return accountId;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error("Failed to decode access token JWT payload.");
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    account_id: getAccountId(accessToken),
  };
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface WfmClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  region?: string;
  postCode?: string;
  country?: string;
  website?: string;
  referralSource?: string;
  taxNumber?: string;
  isProspect?: boolean;
}

export interface WfmContact {
  id: string;
  clientId?: string;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  position?: string;
  isPrimary?: boolean;
}

export interface WfmJob {
  id: string;
  name: string;
  description?: string;
  clientId?: string;
  clientName?: string;
  state?: string;
  status?: string;
  startDate?: string;
  dueDate?: string;
  budget?: number;
  categoryId?: string;
  categoryName?: string;
  templateId?: string;
  assignedStaff?: string[];
}

export interface WfmTimesheet {
  id: string;
  jobId?: string;
  staffId?: string;
  taskId?: string;
  date?: string;
  minutes?: number;
  note?: string;
  billable?: boolean;
  start?: string;
  end?: string;
}

export interface WfmInvoice {
  id: string;
  jobId?: string;
  clientId?: string;
  status?: string;
  date?: string;
  dueDate?: string;
  amount?: number;
  amountPaid?: number;
  amountOutstanding?: number;
  description?: string;
}

export interface WfmQuote {
  id: string;
  clientId?: string;
  jobId?: string;
  state?: string;
  date?: string;
  validDate?: string;
  amount?: number;
  description?: string;
}

export interface WfmLead {
  id: string;
  name: string;
  description?: string;
  clientId?: string;
  categoryId?: string;
  ownerStaffId?: string;
  estimatedValue?: number;
  status?: string;
}

export interface WfmStaff {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  payrollCode?: string;
  isActive?: boolean;
}

export interface WfmCost {
  id: string;
  jobId?: string;
  description?: string;
  date?: string;
  amount?: number;
  billable?: boolean;
  note?: string;
  supplierId?: string;
  quantity?: number;
  unitCost?: number;
}

export interface WfmTask {
  id: string;
  name: string;
  description?: string;
  jobId?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  status?: string;
  assignedStaffId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page?: number;
  pageSize?: number;
  totalCount?: number;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(
  accessToken: string,
  params: { query?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmClient>> {
  return apiRequest<PaginatedResponse<WfmClient>>(
    `${BASE_URL}/clients${qs({ query: params.query, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getClient(
  accessToken: string,
  clientId: string
): Promise<WfmClient> {
  return apiRequest<WfmClient>(`${BASE_URL}/clients/${clientId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createClient(
  accessToken: string,
  data: Partial<WfmClient>
): Promise<WfmClient> {
  return apiRequest<WfmClient>(`${BASE_URL}/clients`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateClient(
  accessToken: string,
  clientId: string,
  data: Partial<WfmClient>
): Promise<WfmClient> {
  return apiRequest<WfmClient>(`${BASE_URL}/clients/${clientId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteClient(
  accessToken: string,
  clientId: string
): Promise<void> {
  await apiRequest(`${BASE_URL}/clients/${clientId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function listContacts(
  accessToken: string,
  params: { clientId?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmContact>> {
  return apiRequest<PaginatedResponse<WfmContact>>(
    `${BASE_URL}/contacts${qs({ clientId: params.clientId, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getContact(
  accessToken: string,
  contactId: string
): Promise<WfmContact> {
  return apiRequest<WfmContact>(`${BASE_URL}/contacts/${contactId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createContact(
  accessToken: string,
  data: Partial<WfmContact>
): Promise<WfmContact> {
  return apiRequest<WfmContact>(`${BASE_URL}/contacts`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateContact(
  accessToken: string,
  contactId: string,
  data: Partial<WfmContact>
): Promise<WfmContact> {
  return apiRequest<WfmContact>(`${BASE_URL}/contacts/${contactId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function listJobs(
  accessToken: string,
  params: { status?: string; clientId?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmJob>> {
  return apiRequest<PaginatedResponse<WfmJob>>(
    `${BASE_URL}/jobs${qs({ status: params.status, clientId: params.clientId, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getJob(
  accessToken: string,
  jobId: string
): Promise<WfmJob> {
  return apiRequest<WfmJob>(`${BASE_URL}/jobs/${jobId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createJob(
  accessToken: string,
  data: Partial<WfmJob>
): Promise<WfmJob> {
  return apiRequest<WfmJob>(`${BASE_URL}/jobs`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateJob(
  accessToken: string,
  jobId: string,
  data: Partial<WfmJob>
): Promise<WfmJob> {
  return apiRequest<WfmJob>(`${BASE_URL}/jobs/${jobId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteJob(
  accessToken: string,
  jobId: string
): Promise<void> {
  await apiRequest(`${BASE_URL}/jobs/${jobId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export async function listTimesheets(
  accessToken: string,
  params: { jobId?: string; staffId?: string; from?: string; to?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmTimesheet>> {
  return apiRequest<PaginatedResponse<WfmTimesheet>>(
    `${BASE_URL}/timesheets${qs({ jobId: params.jobId, staffId: params.staffId, from: params.from, to: params.to, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getTimesheet(
  accessToken: string,
  timesheetId: string
): Promise<WfmTimesheet> {
  return apiRequest<WfmTimesheet>(`${BASE_URL}/timesheets/${timesheetId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createTimesheet(
  accessToken: string,
  data: Partial<WfmTimesheet>
): Promise<WfmTimesheet> {
  return apiRequest<WfmTimesheet>(`${BASE_URL}/timesheets`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateTimesheet(
  accessToken: string,
  timesheetId: string,
  data: Partial<WfmTimesheet>
): Promise<WfmTimesheet> {
  return apiRequest<WfmTimesheet>(`${BASE_URL}/timesheets/${timesheetId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteTimesheet(
  accessToken: string,
  timesheetId: string
): Promise<void> {
  await apiRequest(`${BASE_URL}/timesheets/${timesheetId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Invoices (read-only)
// ---------------------------------------------------------------------------

export async function listInvoices(
  accessToken: string,
  params: { status?: string; clientId?: string; from?: string; to?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmInvoice>> {
  return apiRequest<PaginatedResponse<WfmInvoice>>(
    `${BASE_URL}/invoices${qs({ status: params.status, clientId: params.clientId, from: params.from, to: params.to, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getInvoice(
  accessToken: string,
  invoiceId: string
): Promise<WfmInvoice> {
  return apiRequest<WfmInvoice>(`${BASE_URL}/invoices/${invoiceId}`, {
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Quotes (read-only)
// ---------------------------------------------------------------------------

export async function listQuotes(
  accessToken: string,
  params: { clientId?: string; state?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmQuote>> {
  return apiRequest<PaginatedResponse<WfmQuote>>(
    `${BASE_URL}/quotes${qs({ clientId: params.clientId, state: params.state, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getQuote(
  accessToken: string,
  quoteId: string
): Promise<WfmQuote> {
  return apiRequest<WfmQuote>(`${BASE_URL}/quotes/${quoteId}`, {
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function listLeads(
  accessToken: string,
  params: { status?: string; categoryId?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmLead>> {
  return apiRequest<PaginatedResponse<WfmLead>>(
    `${BASE_URL}/leads${qs({ status: params.status, categoryId: params.categoryId, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function createLead(
  accessToken: string,
  data: Partial<WfmLead>
): Promise<WfmLead> {
  return apiRequest<WfmLead>(`${BASE_URL}/leads`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Staff (read-only)
// ---------------------------------------------------------------------------

export async function listStaff(
  accessToken: string,
  params: { page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmStaff>> {
  return apiRequest<PaginatedResponse<WfmStaff>>(
    `${BASE_URL}/staff${qs({ page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getStaffMember(
  accessToken: string,
  staffId: string
): Promise<WfmStaff> {
  return apiRequest<WfmStaff>(`${BASE_URL}/staff/${staffId}`, {
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export async function listCosts(
  accessToken: string,
  params: { jobId: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmCost>> {
  return apiRequest<PaginatedResponse<WfmCost>>(
    `${BASE_URL}/jobs/${params.jobId}/costs${qs({ page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function createCost(
  accessToken: string,
  jobId: string,
  data: Partial<WfmCost>
): Promise<WfmCost> {
  return apiRequest<WfmCost>(`${BASE_URL}/jobs/${jobId}/costs`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateCost(
  accessToken: string,
  costId: string,
  data: Partial<WfmCost>
): Promise<WfmCost> {
  return apiRequest<WfmCost>(`${BASE_URL}/costs/${costId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteCost(
  accessToken: string,
  costId: string
): Promise<void> {
  await apiRequest(`${BASE_URL}/costs/${costId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(
  accessToken: string,
  params: { jobId?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmTask>> {
  const base = params.jobId
    ? `${BASE_URL}/jobs/${params.jobId}/tasks`
    : `${BASE_URL}/tasks`;
  return apiRequest<PaginatedResponse<WfmTask>>(
    `${base}${qs({ page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getTask(
  accessToken: string,
  taskId: string
): Promise<WfmTask> {
  return apiRequest<WfmTask>(`${BASE_URL}/tasks/${taskId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createTask(
  accessToken: string,
  data: Partial<WfmTask>
): Promise<WfmTask> {
  return apiRequest<WfmTask>(`${BASE_URL}/tasks`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateTask(
  accessToken: string,
  taskId: string,
  data: Partial<WfmTask>
): Promise<WfmTask> {
  return apiRequest<WfmTask>(`${BASE_URL}/tasks/${taskId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteTask(
  accessToken: string,
  taskId: string
): Promise<void> {
  await apiRequest(`${BASE_URL}/tasks/${taskId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}
