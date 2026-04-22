import { ConnectorError } from "@custom-connectors/shared";

const BASE_URL = "https://api.workflowmax.com/v2";

// ---------------------------------------------------------------------------
// Organisation ID from JWT
// ---------------------------------------------------------------------------

/**
 * Decode the JWT access token to extract the WorkflowMax organisation ID.
 * The access token is a JWT whose payload contains the org ID.
 * Every API request must include this as the `account_id` header.
 */
function getAccountId(accessToken: string): string {
  // Use the WFM_ACCOUNT_ID env var if set, otherwise try to decode from JWT
  if (process.env.WFM_ACCOUNT_ID) {
    console.log("[WFM] Using account-id from env:", process.env.WFM_ACCOUNT_ID);
    return process.env.WFM_ACCOUNT_ID;
  }

  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Token is not a valid JWT (expected 3 parts, got " + parts.length + ")");
    }
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    // Log full JWT payload for debugging
    console.log("[WFM] JWT payload:", JSON.stringify(payload, null, 2));

    // Try every plausible claim name
    const accountId =
      payload.org_id ||
      payload.organisation_id ||
      payload.organization_id ||
      payload.account_id ||
      payload.xero_tenant_id ||
      payload.tenant_id ||
      payload.wfm_org_id ||
      payload.oid ||
      payload.tid;

    if (accountId) {
      console.log("[WFM] Found account-id in JWT claim:", accountId);
      return accountId;
    }

    console.warn("[WFM] No org ID in JWT. aud:", payload.aud, "sub:", payload.sub);
    console.warn("[WFM] Set WFM_ACCOUNT_ID env var to your Organisation ID from WorkflowMax → Settings → Organisation Settings (visible in the URL).");
    throw new Error(
      "No organisation ID found in token and WFM_ACCOUNT_ID env var not set. " +
        "JWT claims present: " + Object.keys(payload).join(", ")
    );
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
  const accountId = getAccountId(accessToken);
  // Log token shape to verify it's a JWT (3 dot-separated parts) not an opaque MCP token
  const tokenParts = accessToken.split(".");
  const tokenPreview = accessToken.substring(0, 20) + "..." + accessToken.substring(accessToken.length - 10);
  console.log(`[WFM] Token: ${tokenPreview} (${tokenParts.length} parts, ${accessToken.length} chars)`);
  return {
    Authorization: `Bearer ${accessToken}`,
    "account-id": accountId,
  };
}

/**
 * Make an API request to WorkflowMax with full error logging.
 */
async function wfmRequest<T = unknown>(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<T> {
  const { method = "GET", headers = {}, body } = options;

  console.log(`[WFM] ${method} ${url} | account-id=${headers["account-id"] || "not set"}`);

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const respHeaders = Object.fromEntries(response.headers.entries());
    console.error(`[WFM] API error ${response.status}: ${errorBody}`);
    console.error(`[WFM] Response headers:`, JSON.stringify(respHeaders));
    throw new ConnectorError(
      `WorkflowMax API error (${response.status}): ${errorBody}`,
      response.status === 401 ? "AUTH_ERROR" : "API_ERROR",
      response.status
    );
  }

  return (await response.json()) as T;
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
  statusuuid?: string;
  priority?: string;
  startDate?: string;
  dueDate?: string;
  completedDate?: string;
  budget?: number;
  categoryId?: string;
  categoryName?: string;
  templateId?: string;
  type?: string;
  managerUUID?: string;
  managerName?: string;
  partnerUUID?: string;
  partnerName?: string;
  clientOrderNumber?: string;
  dateCreatedUtc?: string;
  dateModifiedUtc?: string;
  webUrl?: string;
  assignedStaff?: string[];
}

export interface WfmJobStatus {
  id: string;
  name: string;
}

export interface CreateJobRequest {
  jobname: string;
  clientuuid: string;
  description?: string;
  startDate?: string;
  dueDate?: string;
  budget?: number;
  categoryId?: string;
  templateId?: string;
  priority?: string;
  statusuuid?: string;
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

export interface WfmJobTaskStaff {
  uuid: string;
  allocatedTime?: number;
}

export interface WfmJobTask {
  id: string;
  taskId?: string;
  jobId?: string;
  name?: string;
  label?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  status?: string;
  staff?: WfmJobTaskStaff[];
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
  return wfmRequest<PaginatedResponse<WfmClient>>(
    `${BASE_URL}/clients${qs({ name: params.query, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getClient(
  accessToken: string,
  clientId: string
): Promise<WfmClient> {
  return wfmRequest<WfmClient>(`${BASE_URL}/clients/${clientId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createClient(
  accessToken: string,
  data: Partial<WfmClient>
): Promise<WfmClient> {
  return wfmRequest<WfmClient>(`${BASE_URL}/clients`, {
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
  return wfmRequest<WfmClient>(`${BASE_URL}/clients/${clientId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteClient(
  accessToken: string,
  clientId: string
): Promise<void> {
  await wfmRequest(`${BASE_URL}/clients/${clientId}`, {
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
  return wfmRequest<PaginatedResponse<WfmContact>>(
    `${BASE_URL}/clients/contacts${qs({ clientId: params.clientId, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getContact(
  accessToken: string,
  contactId: string
): Promise<WfmContact> {
  return wfmRequest<WfmContact>(`${BASE_URL}/clients/contacts/${contactId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createContact(
  accessToken: string,
  data: Partial<WfmContact>
): Promise<WfmContact> {
  return wfmRequest<WfmContact>(`${BASE_URL}/clients/contacts`, {
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
  return wfmRequest<WfmContact>(`${BASE_URL}/clients/contacts/${contactId}`, {
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
  params: { status?: string; clientId?: string; from?: string; to?: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmJob>> {
  return wfmRequest<PaginatedResponse<WfmJob>>(
    `${BASE_URL}/jobs${qs({ status: params.status, client: params.clientId, from: params.from, to: params.to, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getJob(
  accessToken: string,
  jobId: string,
  includes?: string
): Promise<WfmJob> {
  return wfmRequest<WfmJob>(
    `${BASE_URL}/jobs/${jobId}${qs({ includes })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function listJobStatuses(
  accessToken: string
): Promise<WfmJobStatus[]> {
  return wfmRequest<WfmJobStatus[]>(`${BASE_URL}/job-statuses`, {
    headers: authHeaders(accessToken),
  });
}

export async function createJob(
  accessToken: string,
  data: CreateJobRequest
): Promise<WfmJob> {
  return wfmRequest<WfmJob>(`${BASE_URL}/jobs`, {
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
  return wfmRequest<WfmJob>(`${BASE_URL}/jobs/${jobId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteJob(
  accessToken: string,
  jobId: string
): Promise<void> {
  await wfmRequest(`${BASE_URL}/jobs/${jobId}`, {
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
  return wfmRequest<PaginatedResponse<WfmTimesheet>>(
    `${BASE_URL}/timesheets${qs({ job: params.jobId, staff: params.staffId, from: params.from, to: params.to, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getTimesheet(
  accessToken: string,
  timesheetId: string
): Promise<WfmTimesheet> {
  return wfmRequest<WfmTimesheet>(`${BASE_URL}/timesheets/${timesheetId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createTimesheet(
  accessToken: string,
  data: Partial<WfmTimesheet>
): Promise<WfmTimesheet> {
  return wfmRequest<WfmTimesheet>(`${BASE_URL}/timesheets`, {
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
  return wfmRequest<WfmTimesheet>(`${BASE_URL}/timesheets/${timesheetId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteTimesheet(
  accessToken: string,
  timesheetId: string
): Promise<void> {
  await wfmRequest(`${BASE_URL}/timesheets/${timesheetId}`, {
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
  return wfmRequest<PaginatedResponse<WfmInvoice>>(
    `${BASE_URL}/invoices${qs({ status: params.status, client: params.clientId, from: params.from, to: params.to, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getInvoice(
  accessToken: string,
  invoiceId: string
): Promise<WfmInvoice> {
  return wfmRequest<WfmInvoice>(`${BASE_URL}/invoices/${invoiceId}`, {
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
  return wfmRequest<PaginatedResponse<WfmQuote>>(
    `${BASE_URL}/quotes${qs({ client: params.clientId, state: params.state, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getQuote(
  accessToken: string,
  quoteId: string
): Promise<WfmQuote> {
  return wfmRequest<WfmQuote>(`${BASE_URL}/quotes/${quoteId}`, {
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
  return wfmRequest<PaginatedResponse<WfmLead>>(
    `${BASE_URL}/leads${qs({ status: params.status, categoryId: params.categoryId, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function createLead(
  accessToken: string,
  data: Partial<WfmLead>
): Promise<WfmLead> {
  return wfmRequest<WfmLead>(`${BASE_URL}/leads`, {
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
  return wfmRequest<PaginatedResponse<WfmStaff>>(
    `${BASE_URL}/staff${qs({ page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getStaffMember(
  accessToken: string,
  staffId: string
): Promise<WfmStaff> {
  return wfmRequest<WfmStaff>(`${BASE_URL}/staff/${staffId}`, {
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
  return wfmRequest<PaginatedResponse<WfmCost>>(
    `${BASE_URL}/jobs/${params.jobId}/costs${qs({ page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function createCost(
  accessToken: string,
  jobId: string,
  data: Partial<WfmCost>
): Promise<WfmCost> {
  return wfmRequest<WfmCost>(`${BASE_URL}/jobs/${jobId}/costs`, {
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
  return wfmRequest<WfmCost>(`${BASE_URL}/costs/${costId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteCost(
  accessToken: string,
  costId: string
): Promise<void> {
  await wfmRequest(`${BASE_URL}/costs/${costId}`, {
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
  return wfmRequest<PaginatedResponse<WfmTask>>(
    `${base}${qs({ page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getTask(
  accessToken: string,
  taskId: string
): Promise<WfmTask> {
  return wfmRequest<WfmTask>(`${BASE_URL}/tasks/${taskId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createTask(
  accessToken: string,
  data: Partial<WfmTask>
): Promise<WfmTask> {
  return wfmRequest<WfmTask>(`${BASE_URL}/tasks`, {
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
  return wfmRequest<WfmTask>(`${BASE_URL}/tasks/${taskId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteTask(
  accessToken: string,
  taskId: string
): Promise<void> {
  await wfmRequest(`${BASE_URL}/tasks/${taskId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Job Tasks (tasks assigned to specific jobs)
// ---------------------------------------------------------------------------

export async function listJobTasks(
  accessToken: string,
  params: { jobId: string; page?: number; pageSize?: number }
): Promise<PaginatedResponse<WfmJobTask>> {
  return wfmRequest<PaginatedResponse<WfmJobTask>>(
    `${BASE_URL}/jobs/tasks${qs({ job: params.jobId, page: params.page, pageSize: params.pageSize })}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function createJobTask(
  accessToken: string,
  jobId: string,
  data: Partial<WfmJobTask>
): Promise<WfmJobTask> {
  return wfmRequest<WfmJobTask>(`${BASE_URL}/jobs/${jobId}/tasks`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateJobTask(
  accessToken: string,
  taskId: string,
  data: Partial<WfmJobTask>
): Promise<WfmJobTask> {
  return wfmRequest<WfmJobTask>(`${BASE_URL}/jobs/tasks/${taskId}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteJobTask(
  accessToken: string,
  taskId: string
): Promise<void> {
  await wfmRequest(`${BASE_URL}/jobs/tasks/${taskId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}
