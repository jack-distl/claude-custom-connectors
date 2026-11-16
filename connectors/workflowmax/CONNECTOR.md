# WorkflowMax Connector

## Overview
Connects Claude to [WorkflowMax by BlueRock](https://www.workflowmax.com/) — a practice management platform for professional services. Provides read & write access to clients, jobs, timesheets, invoices, quotes, leads, contacts, staff, costs, and tasks.

## Authentication
- **Type:** OAuth2 Authorization Code
- **Scopes:** `openid profile email workflowmax offline_access`
- **Authorize URL:** `https://oauth.workflowmax.com/oauth/authorize`
- **Token URL:** `https://oauth.workflowmax.com/oauth/token`
- **API Base URL:** `https://api.workflowmax.com`
- **Token lifetime:** Access tokens expire after 30 minutes; refresh tokens after 60 days.
- **Account ID:** Every API request requires an `account_id` header containing the organisation ID. The connector automatically decodes this from the JWT access token.

> **Note:** OAuth is handled by the MCP transport layer. Access tokens are NOT passed as tool parameters — they flow automatically via the MCP session. The connector reads the token from `extra.authInfo.token` in each tool handler.
>
> **Important:** Staff members must have "Authorise 3rd Party Full Access" enabled in their WorkflowMax profile settings for OAuth to work.

## Tools

### Clients
| Tool | Description |
|------|-------------|
| `list_clients` | List clients with optional search query and pagination |
| `get_client` | Get client details by ID |
| `create_client` | Create a new client (name required) |
| `update_client` | Update client fields |
| `delete_client` | Delete a client |

### Contacts
| Tool | Description |
|------|-------------|
| `list_contacts` | List contacts, optionally filtered by client |
| `get_contact` | Get contact details by ID |
| `create_contact` | Create a contact and link it to a client (first_name required, last_name separate; position/primary set on the client link) |
| `update_contact` | Update contact fields. Position, primary and include-in-emails need client_id |

### Jobs
| Tool | Description |
|------|-------------|
| `list_jobs` | List jobs with optional status/client filter |
| `get_job` | Get job details including tasks, costs, timesheets |
| `create_job` | Create a new job (name + client_id required) |
| `update_job` | Update job fields |
| `list_job_categories` | List active job categories (gives the UUID for category_id) |
| `delete_job` | Delete a job |

### Timesheets
| Tool | Description |
|------|-------------|
| `list_timesheets` | List time entries by job, staff, or date range |
| `get_timesheet` | Get a timesheet entry by ID |
| `create_timesheet` | Log time (job_id, staff_id, date, minutes required) |
| `update_timesheet` | Update a timesheet entry |
| `delete_timesheet` | Delete a timesheet entry |

### Invoices (read-only)
The WorkflowMax v2 API has no endpoint to create invoices, so invoicing still happens in WorkflowMax itself.

| Tool | Description |
|------|-------------|
| `list_invoices` | List invoices by status, client, or date range |
| `get_invoice` | Get invoice details by ID |

### Quotes
| Tool | Description |
|------|-------------|
| `list_quotes` | List quotes by client or state |
| `get_quote` | Get quote details by ID |
| `create_quote` | Create a blank quote or estimate for a client |
| `add_quote_task` | Add a task line to a draft quote, with an optional billable_rate |
| `add_quote_cost` | Add a cost line to a draft quote |

### Leads
| Tool | Description |
|------|-------------|
| `list_leads` | List leads by status or category |
| `create_lead` | Create a new lead (name required) |

### Staff (read-only)
| Tool | Description |
|------|-------------|
| `list_staff` | List all staff members |
| `get_staff_member` | Get staff member details by ID |

### Costs
| Tool | Description |
|------|-------------|
| `list_costs` | List costs for a job |
| `create_cost` | Add a cost to a job |
| `update_cost` | Update a cost entry |
| `delete_cost` | Delete a cost entry |

### Tasks
| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks, optionally filtered by job |
| `get_task` | Get task details by ID |
| `create_task` | Create a task (name required) |
| `update_task` | Update task fields |
| `delete_task` | Delete a task |

### Job Tasks
| Tool | Description |
|------|-------------|
| `list_job_tasks` | List the tasks on a job (gives the job-task UUID for timesheets) |
| `create_job_task` | Add a task to a job. `custom_billable_rate` sets a one-off hourly rate for that task on that job |
| `update_job_task` | Update a job task, including setting or removing the custom billable rate |
| `delete_job_task` | Remove a task from a job |

`custom_billable_rate` only takes effect when the org's task invoice rate is set to Task (not Staff) in WorkflowMax settings.

## Environment Variables
| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `SERVER_URL` | Public URL of this Railway service (required for OAuth callbacks) | Railway → Settings → Networking → Generate Domain |
| `CLIENT_ID` | OAuth client ID | WorkflowMax developer application |
| `CLIENT_SECRET` | OAuth client secret | Same as above |

## Setup Checklist

1. **Create a developer application** at the [WorkflowMax developer portal](https://oauth.workflowmax.com/) — note the client ID and secret
2. **Deploy to Railway** — create a new service pointing to this repo, set the Dockerfile path to `connectors/workflowmax/Dockerfile`
3. **Set environment variables** in Railway:
   - `CLIENT_ID` — from your OAuth app
   - `CLIENT_SECRET` — from your OAuth app
   - `SERVER_URL` — leave blank for now
4. **Generate a domain** — Deploy → Settings → Networking → Generate Domain
5. **Set `SERVER_URL`** — paste the generated domain URL (e.g., `https://workflowmax-production-xxxx.up.railway.app`). This triggers a redeploy.
6. **Add to Claude** — Go to Claude → Settings → Integrations → Add the connector URL
7. **Test** — Ask Claude to list your WorkflowMax clients

## API Reference
- [WorkflowMax API V2 Documentation](https://api-docs.workflowmax.com/overview)
- [WorkflowMax API Authentication Guide](https://support.workflowmax.com/hc/en-us/articles/28754786654233-API-authentication)
