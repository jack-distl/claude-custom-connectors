# SharePoint

## Overview
Connects Claude to Microsoft SharePoint via the Microsoft Graph API. Browse sites, manage files and folders in document libraries, work with SharePoint Lists, and search across your organization's SharePoint content.

## Authentication
- **Type:** OAuth2 Authorization Code (Azure AD / Microsoft Entra ID)
- **Scopes:** `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `offline_access`
- **Authorize URL:** `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize`
- **Token URL:** `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`

> **Note:** OAuth is handled by the MCP transport layer. Access tokens are NOT passed as tool parameters — they flow automatically via the MCP session. The connector reads the token from `extra.authInfo.token` in each tool handler.

## Tools

### `list_sites`
List or search SharePoint sites you have access to.

**Parameters:**
- `search` (string, optional) — Search query to filter sites by name

**Returns:** Array of sites with id, name, displayName, webUrl.

### `get_site`
Get detailed information about a specific SharePoint site.

**Parameters:**
- `site_id` (string, required) — The site ID or hostname path (e.g., `contoso.sharepoint.com:/sites/TeamSite`)

**Returns:** Site details including description, URL, and timestamps.

### `list_drives`
List all document libraries (drives) in a SharePoint site.

**Parameters:**
- `site_id` (string, required) — The SharePoint site ID

**Returns:** Array of drives with id, name, driveType, quota info.

### `list_drive_items`
List files and folders in a drive or specific folder.

**Parameters:**
- `drive_id` (string, required) — The drive ID
- `folder_id` (string, optional) — Folder ID to list contents of (omit for root)

**Returns:** Array of items with id, name, size, timestamps, file/folder info.

### `get_drive_item`
Get detailed metadata about a specific file or folder.

**Parameters:**
- `drive_id` (string, required) — The drive ID
- `item_id` (string, required) — The item ID

**Returns:** Full item metadata including size, author, timestamps, download URL.

### `get_file_content`
Download and read the text content of a file.

**Parameters:**
- `drive_id` (string, required) — The drive ID
- `item_id` (string, required) — The file item ID

**Returns:** Raw text content of the file.

### `upload_file`
Upload a text file to a SharePoint document library.

**Parameters:**
- `drive_id` (string, required) — The drive ID
- `parent_folder_id` (string, required) — Parent folder ID (use 'root' for drive root)
- `file_name` (string, required) — File name with extension
- `content` (string, required) — Text content to upload

**Returns:** Created/updated drive item metadata.

### `create_folder`
Create a new folder in a document library.

**Parameters:**
- `drive_id` (string, required) — The drive ID
- `parent_folder_id` (string, optional) — Parent folder ID (omit for root)
- `folder_name` (string, required) — Name for the new folder

**Returns:** Created folder metadata.

### `delete_drive_item`
Delete a file or folder (moves to site recycle bin).

**Parameters:**
- `drive_id` (string, required) — The drive ID
- `item_id` (string, required) — The item ID to delete

**Returns:** Success confirmation.

### `get_lists`
List all SharePoint lists in a site.

**Parameters:**
- `site_id` (string, required) — The SharePoint site ID

**Returns:** Array of lists with id, name, displayName, template info.

### `get_list_items`
Get items from a SharePoint list with field values.

**Parameters:**
- `site_id` (string, required) — The site ID
- `list_id` (string, required) — The list ID or display name
- `expand_fields` (boolean, optional) — Include all field values (defaults to true)

**Returns:** Array of list items with field values.

### `create_list_item`
Create a new item in a SharePoint list.

**Parameters:**
- `site_id` (string, required) — The site ID
- `list_id` (string, required) — The list ID or display name
- `fields` (object, required) — Field name-value pairs (e.g., `{ "Title": "My Item" }`)

**Returns:** Created list item with fields.

### `update_list_item`
Update an existing SharePoint list item.

**Parameters:**
- `site_id` (string, required) — The site ID
- `list_id` (string, required) — The list ID or display name
- `item_id` (string, required) — The list item ID
- `fields` (object, required) — Field name-value pairs to update

**Returns:** Updated field values.

### `delete_list_item`
Delete an item from a SharePoint list.

**Parameters:**
- `site_id` (string, required) — The site ID
- `list_id` (string, required) — The list ID or display name
- `item_id` (string, required) — The list item ID

**Returns:** Success confirmation.

### `search_files`
Search across all SharePoint sites for files and documents.

**Parameters:**
- `query` (string, required) — Search query (supports KQL syntax, e.g., `filetype:xlsx`)
- `entity_types` (array, optional) — Entity types to search: `driveItem`, `listItem`, `site` (defaults to `['driveItem']`)
- `size` (number, optional) — Max results 1-100 (defaults to 25)

**Returns:** Search results with name, URL, size, last modified, and summary.

## Environment Variables
| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `SERVER_URL` | Public URL of this Railway service (required for OAuth callbacks) | Railway → Settings → Networking → Generate Domain |
| `CLIENT_ID` | Azure AD application (client) ID | Azure Portal → App registrations → your app → Overview |
| `CLIENT_SECRET` | Azure AD client secret | Azure Portal → App registrations → your app → Certificates & secrets |
| `AZURE_TENANT_ID` | Your Azure AD tenant ID | Azure Portal → Azure Active Directory → Overview → Tenant ID |

## Setup Checklist

1. **Create an Azure AD app registration** in Azure Portal:
   - Go to Azure Portal → Azure Active Directory → App registrations → New registration
   - Set a name (e.g., "Claude SharePoint Connector")
   - Set redirect URI later (after deployment)
   - Under API permissions, add Microsoft Graph → Delegated: `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `offline_access`
   - Grant admin consent for your organization
   - Create a client secret under Certificates & secrets
2. Note the **Application (client) ID**, **Client secret**, and **Tenant ID**
3. **Deploy this connector to Railway** (see `docs/railway-deploy.md`)
4. Set all environment variables in Railway (`SERVER_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `AZURE_TENANT_ID`)
5. Generate a public domain in Railway and set `SERVER_URL` to it
6. **Update the app registration redirect URI** to `{SERVER_URL}/oauth/callback`
7. Add the connector URL to Claude's integrations settings
8. Test by asking Claude: "List my SharePoint sites"

## API Reference
- [Microsoft Graph SharePoint API](https://learn.microsoft.com/en-us/graph/api/resources/sharepoint?view=graph-rest-1.0)
- [Microsoft Graph Files API](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0)
- [Microsoft Search API](https://learn.microsoft.com/en-us/graph/api/resources/search-api-overview?view=graph-rest-1.0)
