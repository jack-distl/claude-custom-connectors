# Google Ads API — Design Document

## Application Overview

**Product Name:** Google Ads MCP Connector
**Version:** 1.0.0
**Google Ads API Version:** v18 (REST)
**Developer:** [Your Company Name]

### What It Does

The Google Ads MCP Connector is a server-side application that connects Anthropic's Claude AI assistant to the Google Ads API via the Model Context Protocol (MCP). It enables authorised users to read, analyse, create, update, and remove Google Ads resources directly through natural language conversation with Claude — without leaving their AI assistant interface.

The connector acts as a stateless bridge: Claude sends structured tool calls, the connector translates them into Google Ads API requests, and returns the results to Claude for interpretation and presentation to the user.

### Who Uses It

Marketing teams and agency account managers who manage Google Ads campaigns. Users authenticate via OAuth 2.0 and interact exclusively through Claude's interface. Only users with valid Google Ads account access and appropriate permissions can perform operations.

---

## Architecture

```
┌──────────────────┐      ┌──────────────────────┐      ┌─────────────────────┐
│                  │      │                      │      │                     │
│  Claude Desktop  │─MCP──│  Google Ads MCP       │─REST─│  Google Ads API v18  │
│  (User Interface)│      │  Connector (Node.js)  │      │  googleapis.com      │
│                  │      │                      │      │                     │
└──────────────────┘      └──────────────────────┘      └─────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| MCP Server | Node.js 22, TypeScript, Express | Hosts MCP endpoint, handles tool routing |
| API Client | `fetch` with retry/timeout wrapper | Makes authenticated requests to Google Ads REST API |
| OAuth Layer | OAuth 2.0 Authorization Code | Authenticates users via Google, passes access tokens per-request |
| Deployment | Docker (Alpine), Railway | Containerised deployment with health checks |

### Key Design Decisions

- **Stateless architecture** — No session state, tokens, or user data stored server-side. Each request carries its own OAuth access token. Claude's integration layer manages the OAuth lifecycle (token storage, refresh).
- **No auto-retry on mutations** — Read operations retry up to 2 times with exponential backoff. Write operations (create/update/remove) use `retries: 0` to prevent duplicate resource creation.
- **Single mutate helper** — All write operations route through one `mutateGoogleAds()` function that handles the Google Ads mutate pattern uniformly.

---

## Authentication & Authorisation

### OAuth 2.0 Flow

| Parameter | Value |
|-----------|-------|
| Grant Type | Authorization Code |
| Authorize URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Scope | `https://www.googleapis.com/auth/adwords` |
| Access Type | `offline` (for refresh tokens) |

### Token Handling

- The OAuth flow is managed by Claude's custom integration layer, not by the connector itself.
- Access tokens are passed to the connector on every request — the connector never stores tokens.
- The connector includes the `developer-token` header on all Google Ads API calls.
- For MCC (Manager Account) access, the optional `login-customer-id` header is supported.

### Security Measures

- No credentials stored in application memory or on disk beyond the duration of a single request.
- All communication uses HTTPS.
- The connector validates that an access token is present before making any API call.
- OAuth client credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DEVELOPER_TOKEN`) are stored as environment variables, never hardcoded.

---

## API Usage

### Endpoints Used

All requests go to `https://googleads.googleapis.com/v18/`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `customers:listAccessibleCustomers` | GET | List accounts the user can access |
| `customers/{id}/googleAds:searchStream` | POST | Execute GAQL queries (all read operations) |
| `customers/{id}/campaigns:mutate` | POST | Create, update, remove campaigns |
| `customers/{id}/campaignBudgets:mutate` | POST | Create, update campaign budgets |
| `customers/{id}/adGroups:mutate` | POST | Create, update, remove ad groups |
| `customers/{id}/adGroupAds:mutate` | POST | Create, update, remove ads |
| `customers/{id}/adGroupCriteria:mutate` | POST | Add, update, remove keywords |
| `customers/{id}/campaignCriteria:mutate` | POST | Add campaign-level negative keywords |
| `customers/{id}/labels:mutate` | POST | Create labels |
| `customers/{id}/campaignLabels:mutate` | POST | Apply labels to campaigns |
| `customers/{id}/adGroupLabels:mutate` | POST | Apply labels to ad groups |
| `customers/{id}/adGroupAdLabels:mutate` | POST | Apply labels to ads |
| `geoTargetConstants:suggest` | POST | Search geographic targeting locations |

### GAQL Resources Queried

| Resource | Fields Retrieved |
|----------|-----------------|
| `campaign` | id, name, status, advertising_channel_type, bidding_strategy_type, resource_name, budget |
| `ad_group` | id, name, status, type, resource_name, cpc_bid_micros |
| `ad_group_ad` | ad.id, ad.type, responsive_search_ad details, final_urls, status, resource_name |
| `keyword_view` | keyword.text, keyword.match_type, status, cpc_bid_micros |
| `search_term_view` | search_term, status, campaign/ad_group names |
| `campaign_budget` | id, name, amount_micros, delivery_method, explicitly_shared, status |
| `bidding_strategy` | id, name, type, campaign_count, status |
| `change_event` | change_date_time, change_resource_type, user_email, old/new_resource |
| `audience` | id, name, status, description |

### Metrics Accessed

`impressions`, `clicks`, `cost_micros`, `conversions`, `conversions_value`, `average_cpc`, `ctr`, `cpm`

---

## Tool Inventory (32 Total)

### Read Operations (14 tools)

| Tool | Description | Google Ads API Call |
|------|-------------|-------------------|
| `list_customers` | List accessible customer accounts | `customers:listAccessibleCustomers` |
| `get_campaigns` | List campaigns with metrics, filter by status | GAQL on `campaign` |
| `get_ad_groups` | List ad groups for a campaign | GAQL on `ad_group` |
| `get_ads` | List ads in an ad group | GAQL on `ad_group_ad` |
| `get_keywords` | List keywords with match types and bids | GAQL on `keyword_view` |
| `get_performance_report` | Flexible reporting with custom metrics/dates | GAQL on configurable resource |
| `get_search_terms` | Search terms that triggered ads | GAQL on `search_term_view` |
| `get_campaign_budgets` | List budgets with amounts | GAQL on `campaign_budget` |
| `get_bidding_strategies` | List portfolio bidding strategies | GAQL on `bidding_strategy` |
| `get_change_history` | Recent account changes | GAQL on `change_event` |
| `get_audience_segments` | Audience segments for targeting | GAQL on `audience` |
| `get_geo_targets` | Search geo targeting locations | `geoTargetConstants:suggest` |
| `run_gaql_query` | Execute arbitrary GAQL queries | `googleAds:searchStream` |

### Create Operations (8 tools)

| Tool | Description | Google Ads API Call |
|------|-------------|-------------------|
| `create_campaign_budget` | Create daily/shared budget | `campaignBudgets:mutate` (create) |
| `create_campaign` | Create campaign with channel type and bidding | `campaigns:mutate` (create) |
| `create_ad_group` | Create ad group with CPC bid | `adGroups:mutate` (create) |
| `create_responsive_search_ad` | Create RSA with headlines/descriptions | `adGroupAds:mutate` (create) |
| `add_keywords` | Batch-add keywords with match types | `adGroupCriteria:mutate` (create) |
| `add_negative_keywords` | Add negatives at campaign/ad group level | `campaignCriteria:mutate` or `adGroupCriteria:mutate` (create) |
| `create_label` | Create label with optional colours | `labels:mutate` (create) |
| `apply_label` | Apply label to campaign/ad group/ad | `{entity}Labels:mutate` (create) |

### Update Operations (5 tools)

| Tool | Description | Google Ads API Call |
|------|-------------|-------------------|
| `update_campaign_budget` | Update budget amount or name | `campaignBudgets:mutate` (update + updateMask) |
| `update_campaign` | Update name, status, bidding strategy | `campaigns:mutate` (update + updateMask) |
| `update_ad_group` | Update name, status, CPC bid | `adGroups:mutate` (update + updateMask) |
| `update_ad` | Pause or enable an ad | `adGroupAds:mutate` (update + updateMask) |
| `update_keyword` | Update status or CPC bid | `adGroupCriteria:mutate` (update + updateMask) |

### Remove Operations (5 tools)

| Tool | Description | Google Ads API Call |
|------|-------------|-------------------|
| `remove_campaign` | Remove a campaign | `campaigns:mutate` (remove) |
| `remove_ad_group` | Remove an ad group | `adGroups:mutate` (remove) |
| `remove_ad` | Remove an ad | `adGroupAds:mutate` (remove) |
| `remove_keyword` | Remove a keyword | `adGroupCriteria:mutate` (remove) |

---

## Rate Limiting & Error Handling

### Rate Limits

The connector respects Google Ads API rate limits:

- **Read operations** — Automatic retry up to 2 times with exponential backoff (1s base, doubling per attempt) on transient failures (5xx, network errors).
- **429 (Rate Limit)** — Detected and retried automatically for reads. Thrown as `RateLimitError` for mutations.
- **Write operations** — No automatic retry (`retries: 0`). Failures are returned to Claude, which presents the error to the user.

### Error Classification

| HTTP Status | Error Type | Behaviour |
|-------------|-----------|-----------|
| 401 | `AuthError` | Returned immediately — token expired or invalid |
| 429 | `RateLimitError` | Retried for reads, returned for writes |
| 4xx/5xx | `ApiError` | Retried for reads (if retries remain), returned for writes |

All errors are returned to Claude in a structured format with `isError: true`, allowing Claude to explain the issue to the user in natural language.

### Request Limits

- Default timeout: 30 seconds per request.
- GAQL queries include `LIMIT` clauses (default 50-100 depending on resource) to prevent oversized responses.
- No bulk operations beyond batch keyword adding (which uses multiple operations in a single mutate call).

---

## Data Handling

### What Data Is Accessed

- Account structure: customer IDs, campaign/ad group/ad/keyword hierarchies
- Performance metrics: impressions, clicks, cost, conversions
- Configuration: budgets, bidding strategies, targeting, labels
- Change history: account modification logs

### What Data Is Stored

**None.** The connector is fully stateless:

- No database or persistent storage
- No caching of API responses
- No logging of user data or API responses
- Access tokens exist only in memory for the duration of a single request

### Data Flow

1. User asks Claude a question about their Google Ads
2. Claude determines which tool(s) to call and sends a structured request to the connector
3. The connector makes the corresponding Google Ads API call with the user's access token
4. The API response is returned to Claude as JSON
5. Claude interprets the data and responds to the user in natural language

At no point does the connector store, log, or forward data to any third party.

---

## Deployment

### Infrastructure

| Parameter | Value |
|-----------|-------|
| Runtime | Node.js 22 (Alpine Linux) |
| Container | Docker multi-stage build |
| Hosting | Railway (or any Docker-compatible PaaS) |
| Port | Configured via `PORT` environment variable |
| Health Check | `GET /health` returns 200 |
| MCP Endpoint | `POST /mcp` |

### Environment Variables

| Variable | Purpose | Stored In |
|----------|---------|-----------|
| `GOOGLE_CLIENT_ID` | OAuth client ID | Railway encrypted env vars |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Railway encrypted env vars |
| `GOOGLE_DEVELOPER_TOKEN` | Google Ads API developer token | Railway encrypted env vars |
| `PORT` | Server port | Set by Railway automatically |
| `SERVER_URL` | Public URL of the deployed service | Railway env var |

---

## Compliance

- **Terms of Service** — The application complies with Google Ads API Terms of Service. It does not automate actions without user intent — every operation is initiated by the user through Claude's conversational interface.
- **Required Minimum Functionality** — The application provides value beyond what the Google Ads UI offers by enabling natural language interaction, cross-account analysis, and AI-powered recommendations.
- **No Data Selling** — No Google Ads data is stored, shared, or sold.
- **User Consent** — Users explicitly authenticate via OAuth and approve the `adwords` scope before any data access.
- **Rate Limit Compliance** — Built-in retry logic respects 429 responses and does not aggressively retry.
