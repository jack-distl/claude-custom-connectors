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

export function registerTools(server: McpServer) {
  // =========================================================================
  // CLIENTS
  // =========================================================================

  server.tool(
    "list_clients",
    "List WorkflowMax clients. Optionally search by name or filter with pagination.",
    {
      query: z.string().optional().describe("Search query to filter clients by name"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listClients(token, {
          query: params.query,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_client",
    "Get detailed information about a specific WorkflowMax client by ID.",
    {
      client_id: z.string().describe("The ID of the client to retrieve"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getClient(token, params.client_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_client",
    "Create a new client in WorkflowMax. Name is required; other fields are optional.",
    {
      name: z.string().describe("Client name (required)"),
      email: z.string().optional().describe("Client email address"),
      phone: z.string().optional().describe("Client phone number"),
      address: z.string().optional().describe("Street address"),
      city: z.string().optional().describe("City"),
      region: z.string().optional().describe("Region or state"),
      post_code: z.string().optional().describe("Postal / ZIP code"),
      country: z.string().optional().describe("Country"),
      website: z.string().optional().describe("Website URL"),
      tax_number: z.string().optional().describe("Tax / GST number"),
      is_prospect: z.boolean().optional().describe("Whether this is a prospect rather than an active client"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.createClient(token, {
          name: params.name,
          email: params.email,
          phone: params.phone,
          address: params.address,
          city: params.city,
          region: params.region,
          postCode: params.post_code,
          country: params.country,
          website: params.website,
          taxNumber: params.tax_number,
          isProspect: params.is_prospect,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_client",
    "Update an existing WorkflowMax client. Provide only the fields you want to change.",
    {
      client_id: z.string().describe("The ID of the client to update"),
      name: z.string().optional().describe("Client name"),
      email: z.string().optional().describe("Client email address"),
      phone: z.string().optional().describe("Client phone number"),
      address: z.string().optional().describe("Street address"),
      city: z.string().optional().describe("City"),
      region: z.string().optional().describe("Region or state"),
      post_code: z.string().optional().describe("Postal / ZIP code"),
      country: z.string().optional().describe("Country"),
      website: z.string().optional().describe("Website URL"),
      tax_number: z.string().optional().describe("Tax / GST number"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmClient> = {};
        if (params.name !== undefined) data.name = params.name;
        if (params.email !== undefined) data.email = params.email;
        if (params.phone !== undefined) data.phone = params.phone;
        if (params.address !== undefined) data.address = params.address;
        if (params.city !== undefined) data.city = params.city;
        if (params.region !== undefined) data.region = params.region;
        if (params.post_code !== undefined) data.postCode = params.post_code;
        if (params.country !== undefined) data.country = params.country;
        if (params.website !== undefined) data.website = params.website;
        if (params.tax_number !== undefined) data.taxNumber = params.tax_number;
        const result = await api.updateClient(token, params.client_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_client",
    "Delete a client from WorkflowMax. This action cannot be undone.",
    {
      client_id: z.string().describe("The ID of the client to delete"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        await api.deleteClient(token, params.client_id);
        return toolResult({ success: true, message: "Client deleted successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // CONTACTS
  // =========================================================================

  server.tool(
    "list_contacts",
    "List contacts in WorkflowMax. Optionally filter by client ID.",
    {
      client_id: z.string().optional().describe("Filter contacts by client ID"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listContacts(token, {
          clientId: params.client_id,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_contact",
    "Get detailed information about a specific contact by ID.",
    {
      contact_id: z.string().describe("The ID of the contact to retrieve"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getContact(token, params.contact_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_contact",
    "Create a new contact in WorkflowMax, optionally linked to a client.",
    {
      name: z.string().describe("Contact name (required)"),
      client_id: z.string().optional().describe("Client ID to associate the contact with"),
      email: z.string().optional().describe("Contact email address"),
      phone: z.string().optional().describe("Contact phone number"),
      mobile: z.string().optional().describe("Contact mobile number"),
      position: z.string().optional().describe("Contact's position or job title"),
      is_primary: z.boolean().optional().describe("Whether this is the primary contact for the client"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.createContact(token, {
          name: params.name,
          clientId: params.client_id,
          email: params.email,
          phone: params.phone,
          mobile: params.mobile,
          position: params.position,
          isPrimary: params.is_primary,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_contact",
    "Update an existing contact. Provide only the fields you want to change.",
    {
      contact_id: z.string().describe("The ID of the contact to update"),
      name: z.string().optional().describe("Contact name"),
      email: z.string().optional().describe("Contact email address"),
      phone: z.string().optional().describe("Contact phone number"),
      mobile: z.string().optional().describe("Contact mobile number"),
      position: z.string().optional().describe("Contact's position or job title"),
      is_primary: z.boolean().optional().describe("Whether this is the primary contact"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmContact> = {};
        if (params.name !== undefined) data.name = params.name;
        if (params.email !== undefined) data.email = params.email;
        if (params.phone !== undefined) data.phone = params.phone;
        if (params.mobile !== undefined) data.mobile = params.mobile;
        if (params.position !== undefined) data.position = params.position;
        if (params.is_primary !== undefined) data.isPrimary = params.is_primary;
        const result = await api.updateContact(token, params.contact_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // JOBS
  // =========================================================================

  server.tool(
    "list_jobs",
    "List jobs in WorkflowMax. Optionally filter by status or client.",
    {
      status: z.string().optional().describe("Filter by job status (e.g. 'Active', 'Completed', 'Planned')"),
      client_id: z.string().optional().describe("Filter jobs by client ID"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listJobs(token, {
          status: params.status,
          clientId: params.client_id,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_job",
    "Get detailed information about a specific job. Use the includes parameter to fetch related data like tasks, costs, notes, documents, staff, or phases.",
    {
      job_id: z.string().describe("The ID of the job to retrieve"),
      includes: z.string().optional().describe("Comma-separated list of related data to include: tasks,costs,notes,documents,staff,phases"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getJob(token, params.job_id, params.includes);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_job",
    "Create a new job in WorkflowMax. Name and client_id are required.",
    {
      name: z.string().describe("Job name (required)"),
      client_id: z.string().describe("Client ID the job belongs to (required)"),
      description: z.string().optional().describe("Job description"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      budget: z.number().optional().describe("Job budget amount"),
      category_id: z.string().optional().describe("Job category ID"),
      template_id: z.string().optional().describe("Job template ID to use"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.createJob(token, {
          name: params.name,
          clientId: params.client_id,
          description: params.description,
          startDate: params.start_date,
          dueDate: params.due_date,
          budget: params.budget,
          categoryId: params.category_id,
          templateId: params.template_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_job",
    "Update an existing job. Provide only the fields you want to change.",
    {
      job_id: z.string().describe("The ID of the job to update"),
      name: z.string().optional().describe("Job name"),
      description: z.string().optional().describe("Job description"),
      status: z.string().optional().describe("Job status (e.g. 'Active', 'Completed', 'Planned')"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      budget: z.number().optional().describe("Job budget amount"),
      category_id: z.string().optional().describe("Job category ID"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmJob> = {};
        if (params.name !== undefined) data.name = params.name;
        if (params.description !== undefined) data.description = params.description;
        if (params.status !== undefined) data.status = params.status;
        if (params.start_date !== undefined) data.startDate = params.start_date;
        if (params.due_date !== undefined) data.dueDate = params.due_date;
        if (params.budget !== undefined) data.budget = params.budget;
        if (params.category_id !== undefined) data.categoryId = params.category_id;
        const result = await api.updateJob(token, params.job_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_job",
    "Delete a job from WorkflowMax. This action cannot be undone.",
    {
      job_id: z.string().describe("The ID of the job to delete"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        await api.deleteJob(token, params.job_id);
        return toolResult({ success: true, message: "Job deleted successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // TIMESHEETS
  // =========================================================================

  server.tool(
    "list_timesheets",
    "List timesheet entries. Filter by job, staff member, or date range.",
    {
      job_id: z.string().optional().describe("Filter timesheets by job ID"),
      staff_id: z.string().optional().describe("Filter timesheets by staff member ID"),
      from: z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
      to: z.string().optional().describe("End of date range (YYYY-MM-DD)"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listTimesheets(token, {
          jobId: params.job_id,
          staffId: params.staff_id,
          from: params.from,
          to: params.to,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_timesheet",
    "Get a specific timesheet entry by ID.",
    {
      timesheet_id: z.string().describe("The ID of the timesheet entry to retrieve"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getTimesheet(token, params.timesheet_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_timesheet",
    "Log time in WorkflowMax. Creates a new timesheet entry for a job.",
    {
      job_id: z.string().describe("Job ID to log time against (required)"),
      staff_id: z.string().describe("Staff member ID (required)"),
      task_id: z.string().optional().describe("Task ID within the job"),
      date: z.string().describe("Date of the time entry (YYYY-MM-DD, required)"),
      minutes: z.number().describe("Duration in minutes (required)"),
      note: z.string().optional().describe("Description of work performed"),
      billable: z.boolean().optional().describe("Whether this time is billable (defaults to true)"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.createTimesheet(token, {
          jobId: params.job_id,
          staffId: params.staff_id,
          taskId: params.task_id,
          date: params.date,
          minutes: params.minutes,
          note: params.note,
          billable: params.billable,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_timesheet",
    "Update an existing timesheet entry. Provide only the fields you want to change.",
    {
      timesheet_id: z.string().describe("The ID of the timesheet entry to update"),
      date: z.string().optional().describe("Date of the time entry (YYYY-MM-DD)"),
      minutes: z.number().optional().describe("Duration in minutes"),
      note: z.string().optional().describe("Description of work performed"),
      billable: z.boolean().optional().describe("Whether this time is billable"),
      task_id: z.string().optional().describe("Task ID within the job"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmTimesheet> = {};
        if (params.date !== undefined) data.date = params.date;
        if (params.minutes !== undefined) data.minutes = params.minutes;
        if (params.note !== undefined) data.note = params.note;
        if (params.billable !== undefined) data.billable = params.billable;
        if (params.task_id !== undefined) data.taskId = params.task_id;
        const result = await api.updateTimesheet(token, params.timesheet_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_timesheet",
    "Delete a timesheet entry. This action cannot be undone.",
    {
      timesheet_id: z.string().describe("The ID of the timesheet entry to delete"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        await api.deleteTimesheet(token, params.timesheet_id);
        return toolResult({ success: true, message: "Timesheet entry deleted successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // INVOICES (read-only)
  // =========================================================================

  server.tool(
    "list_invoices",
    "List invoices in WorkflowMax. Filter by status, client, or date range.",
    {
      status: z.string().optional().describe("Filter by invoice status (e.g. 'Draft', 'Sent', 'Paid')"),
      client_id: z.string().optional().describe("Filter invoices by client ID"),
      from: z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
      to: z.string().optional().describe("End of date range (YYYY-MM-DD)"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listInvoices(token, {
          status: params.status,
          clientId: params.client_id,
          from: params.from,
          to: params.to,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_invoice",
    "Get detailed information about a specific invoice by ID.",
    {
      invoice_id: z.string().describe("The ID of the invoice to retrieve"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getInvoice(token, params.invoice_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // QUOTES (read-only)
  // =========================================================================

  server.tool(
    "list_quotes",
    "List quotes in WorkflowMax. Optionally filter by client or status.",
    {
      client_id: z.string().optional().describe("Filter quotes by client ID"),
      state: z.string().optional().describe("Filter by quote state (e.g. 'Draft', 'Sent', 'Accepted', 'Declined')"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listQuotes(token, {
          clientId: params.client_id,
          state: params.state,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_quote",
    "Get detailed information about a specific quote by ID.",
    {
      quote_id: z.string().describe("The ID of the quote to retrieve"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getQuote(token, params.quote_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // LEADS
  // =========================================================================

  server.tool(
    "list_leads",
    "List leads in WorkflowMax. Optionally filter by status or category.",
    {
      status: z.string().optional().describe("Filter by lead status"),
      category_id: z.string().optional().describe("Filter by lead category ID"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listLeads(token, {
          status: params.status,
          categoryId: params.category_id,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_lead",
    "Create a new lead in WorkflowMax.",
    {
      name: z.string().describe("Lead name (required)"),
      description: z.string().optional().describe("Lead description"),
      client_id: z.string().optional().describe("Associated client ID"),
      category_id: z.string().optional().describe("Lead category ID"),
      owner_staff_id: z.string().optional().describe("Staff member ID who owns this lead"),
      estimated_value: z.number().optional().describe("Estimated monetary value of the lead"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.createLead(token, {
          name: params.name,
          description: params.description,
          clientId: params.client_id,
          categoryId: params.category_id,
          ownerStaffId: params.owner_staff_id,
          estimatedValue: params.estimated_value,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // STAFF (read-only)
  // =========================================================================

  server.tool(
    "list_staff",
    "List all staff members in WorkflowMax.",
    {
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listStaff(token, {
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_staff_member",
    "Get detailed information about a specific staff member by ID.",
    {
      staff_id: z.string().describe("The ID of the staff member to retrieve"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getStaffMember(token, params.staff_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // COSTS
  // =========================================================================

  server.tool(
    "list_costs",
    "List costs for a specific job in WorkflowMax.",
    {
      job_id: z.string().describe("The job ID to list costs for (required)"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listCosts(token, {
          jobId: params.job_id,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_cost",
    "Add a cost entry to a job in WorkflowMax.",
    {
      job_id: z.string().describe("Job ID to add the cost to (required)"),
      description: z.string().describe("Cost description (required)"),
      date: z.string().describe("Date of the cost (YYYY-MM-DD, required)"),
      amount: z.number().optional().describe("Total cost amount"),
      quantity: z.number().optional().describe("Quantity of items"),
      unit_cost: z.number().optional().describe("Cost per unit"),
      billable: z.boolean().optional().describe("Whether this cost is billable"),
      note: z.string().optional().describe("Additional notes"),
      supplier_id: z.string().optional().describe("Supplier ID"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.createCost(token, params.job_id, {
          description: params.description,
          date: params.date,
          amount: params.amount,
          quantity: params.quantity,
          unitCost: params.unit_cost,
          billable: params.billable,
          note: params.note,
          supplierId: params.supplier_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_cost",
    "Update an existing cost entry. Provide only the fields you want to change.",
    {
      cost_id: z.string().describe("The ID of the cost entry to update"),
      description: z.string().optional().describe("Cost description"),
      date: z.string().optional().describe("Date of the cost (YYYY-MM-DD)"),
      amount: z.number().optional().describe("Total cost amount"),
      quantity: z.number().optional().describe("Quantity of items"),
      unit_cost: z.number().optional().describe("Cost per unit"),
      billable: z.boolean().optional().describe("Whether this cost is billable"),
      note: z.string().optional().describe("Additional notes"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmCost> = {};
        if (params.description !== undefined) data.description = params.description;
        if (params.date !== undefined) data.date = params.date;
        if (params.amount !== undefined) data.amount = params.amount;
        if (params.quantity !== undefined) data.quantity = params.quantity;
        if (params.unit_cost !== undefined) data.unitCost = params.unit_cost;
        if (params.billable !== undefined) data.billable = params.billable;
        if (params.note !== undefined) data.note = params.note;
        const result = await api.updateCost(token, params.cost_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_cost",
    "Delete a cost entry. This action cannot be undone.",
    {
      cost_id: z.string().describe("The ID of the cost entry to delete"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        await api.deleteCost(token, params.cost_id);
        return toolResult({ success: true, message: "Cost entry deleted successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // TASKS
  // =========================================================================

  server.tool(
    "list_tasks",
    "List tasks in WorkflowMax. Optionally filter by job ID.",
    {
      job_id: z.string().optional().describe("Filter tasks by job ID"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listTasks(token, {
          jobId: params.job_id,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_task",
    "Get detailed information about a specific task by ID.",
    {
      task_id: z.string().describe("The ID of the task to retrieve"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.getTask(token, params.task_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_task",
    "Create a new task in WorkflowMax, optionally linked to a job.",
    {
      name: z.string().describe("Task name (required)"),
      job_id: z.string().optional().describe("Job ID to associate the task with"),
      description: z.string().optional().describe("Task description"),
      estimated_minutes: z.number().optional().describe("Estimated time to complete in minutes"),
      assigned_staff_id: z.string().optional().describe("Staff member ID to assign the task to"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.createTask(token, {
          name: params.name,
          jobId: params.job_id,
          description: params.description,
          estimatedMinutes: params.estimated_minutes,
          assignedStaffId: params.assigned_staff_id,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_task",
    "Update an existing task. Provide only the fields you want to change.",
    {
      task_id: z.string().describe("The ID of the task to update"),
      name: z.string().optional().describe("Task name"),
      description: z.string().optional().describe("Task description"),
      estimated_minutes: z.number().optional().describe("Estimated time to complete in minutes"),
      status: z.string().optional().describe("Task status"),
      assigned_staff_id: z.string().optional().describe("Staff member ID to assign the task to"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmTask> = {};
        if (params.name !== undefined) data.name = params.name;
        if (params.description !== undefined) data.description = params.description;
        if (params.estimated_minutes !== undefined) data.estimatedMinutes = params.estimated_minutes;
        if (params.status !== undefined) data.status = params.status;
        if (params.assigned_staff_id !== undefined) data.assignedStaffId = params.assigned_staff_id;
        const result = await api.updateTask(token, params.task_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_task",
    "Delete a task. This action cannot be undone.",
    {
      task_id: z.string().describe("The ID of the task to delete"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        await api.deleteTask(token, params.task_id);
        return toolResult({ success: true, message: "Task deleted successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // JOB TASKS (tasks assigned to specific jobs)
  // =========================================================================

  server.tool(
    "list_job_tasks",
    "List tasks assigned to a specific job. These are job-level task assignments, not global task templates.",
    {
      job_id: z.string().describe("Job UUID to list tasks for (required)"),
      page: z.number().optional().describe("Page number for pagination"),
      page_size: z.number().optional().describe("Number of results per page"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const result = await api.listJobTasks(token, {
          jobId: params.job_id,
          page: params.page,
          pageSize: params.page_size,
        });
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_job_task",
    "Add a task to a job. Requires the global task template UUID and the job ID. Staff are assigned as an array with UUID and allocated time.",
    {
      job_id: z.string().describe("Job UUID or job number to add the task to (required)"),
      task_uuid: z.string().describe("Global task template UUID to add to the job (required)"),
      estimated_minutes: z.number().optional().describe("Estimated time in minutes"),
      staff: z.array(z.object({
        uuid: z.string().describe("Staff member UUID"),
        allocatedTime: z.number().optional().describe("Allocated time in minutes for this staff member"),
      })).optional().describe("Staff members to assign to this task"),
      label: z.string().optional().describe("Label for the task assignment (e.g. 'Account Manager', 'SEO Specialist')"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmJobTask> = {
          taskId: params.task_uuid,
        };
        if (params.estimated_minutes !== undefined) data.estimatedMinutes = params.estimated_minutes;
        if (params.staff !== undefined) data.staff = params.staff;
        if (params.label !== undefined) data.label = params.label;
        const result = await api.createJobTask(token, params.job_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_job_task",
    "Update a task assignment within a job. This updates the job-level task, not the global task template. Provide only the fields you want to change. Staff are assigned as an array with UUID and allocated time.",
    {
      task_id: z.string().describe("The job task UUID (from list_job_tasks)"),
      estimated_minutes: z.number().optional().describe("Estimated time in minutes"),
      staff: z.array(z.object({
        uuid: z.string().describe("Staff member UUID"),
        allocatedTime: z.number().optional().describe("Allocated time in minutes for this staff member"),
      })).optional().describe("Staff members to assign to this task"),
      label: z.string().optional().describe("Label for the task assignment"),
      status: z.string().optional().describe("Task status"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        const data: Partial<api.WfmJobTask> = {};
        if (params.estimated_minutes !== undefined) data.estimatedMinutes = params.estimated_minutes;
        if (params.staff !== undefined) data.staff = params.staff;
        if (params.label !== undefined) data.label = params.label;
        if (params.status !== undefined) data.status = params.status;
        const result = await api.updateJobTask(token, params.task_id, data);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_job_task",
    "Remove a task from a job. This removes the job-level assignment, not the global task template. This action cannot be undone.",
    {
      task_id: z.string().describe("The job task UUID to remove"),
    },
    async (params, extra) => {
      try {
        const token = getAccessToken(extra);
        await api.deleteJobTask(token, params.task_id);
        return toolResult({ success: true, message: "Job task removed successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
