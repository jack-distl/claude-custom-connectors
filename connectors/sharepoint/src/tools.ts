import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnectorError } from "@custom-connectors/shared";
import {
  listSites,
  getSite,
  listDrives,
  listDriveItems,
  getDriveItem,
  getFileContent,
  uploadFile,
  createFolder,
  deleteDriveItem,
  getLists,
  getListItems,
  createListItem,
  updateListItem,
  deleteListItem,
  searchFiles,
} from "./api.js";

// ─── Distl SharePoint Defaults ────────────────────────────────────────────────
// These IDs set the default entry point for file browsing to the Working folder
// on the Team site. Update these if the folder structure changes.
const DISTL_TEAM_SITE_ID =
  "remba.sharepoint.com,71a0929e-83b9-4d4e-978c-bcef7187f459,d83790fe-adfa-434c-9140-845a8a9117d6";
const DISTL_SHARED_DOCUMENTS_DRIVE_ID =
  "b!npKgcbmDTk2XjLzvcYf0Wf6QN9j6rUxDkUCEWoqRF9bc9RMe9MpzRIgb-j6Z4ZJq";
const DISTL_WORKING_FOLDER_ID = "01BAPXPPAZ2UDWMBL7TBC3C3E4G7JNQ6EW";

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
  // ─── Sites ─────────────────────────────────────────────────────────────────

  server.tool(
    "list_sites",
    "List or search SharePoint sites you have access to. Use this to find a site before working with its drives, files, or lists. Returns site IDs needed by other tools.",
    {
      search: z
        .string()
        .optional()
        .describe(
          "Search query to filter sites by name. Omit to list all accessible sites."
        ),
    },
    async ({ search }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await listSites(accessToken, search);
        return toolResult(result.value);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_site",
    "Get detailed information about a specific SharePoint site including its description, URL, and timestamps.",
    {
      site_id: z
        .string()
        .describe(
          "The site ID. Can be the full ID (e.g., 'contoso.sharepoint.com,guid,guid') or a hostname path like 'contoso.sharepoint.com:/sites/TeamSite'."
        ),
    },
    async ({ site_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getSite(accessToken, site_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── Drives ────────────────────────────────────────────────────────────────

  server.tool(
    "list_drives",
    "List all document libraries (drives) in a SharePoint site. Each site has at least one drive ('Documents'). Returns drive IDs needed to browse and manage files.",
    {
      site_id: z
        .string()
        .describe("The SharePoint site ID. Use list_sites to find this."),
    },
    async ({ site_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await listDrives(accessToken, site_id);
        return toolResult(result.value);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── Files & Folders ───────────────────────────────────────────────────────

  server.tool(
    "list_drive_items",
    "List files and folders in a drive or specific folder. Defaults to the Distl Working folder on the Team site if no parameters are provided. Returns item IDs, names, sizes, and modification dates.",
    {
      drive_id: z
        .string()
        .optional()
        .describe("The drive ID. Defaults to the Distl Shared Documents drive if omitted."),
      folder_id: z
        .string()
        .optional()
        .describe(
          "The folder ID to list contents of. Defaults to the Distl Working folder if omitted."
        ),
    },
    async ({ drive_id, folder_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const effectiveDriveId = drive_id || DISTL_SHARED_DOCUMENTS_DRIVE_ID;
        const effectiveFolderId = folder_id || (drive_id ? undefined : DISTL_WORKING_FOLDER_ID);
        const result = await listDriveItems(accessToken, effectiveDriveId, effectiveFolderId);
        return toolResult(result.value);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "list_client_folders",
    "List the contents of the Distl Working folder — the main folder containing client folders and active work. This is the fastest way to see what's in the Working folder. Takes no parameters.",
    {},
    async (_params, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await listDriveItems(
          accessToken,
          DISTL_SHARED_DOCUMENTS_DRIVE_ID,
          DISTL_WORKING_FOLDER_ID
        );
        return toolResult(result.value);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_drive_item",
    "Get detailed metadata about a specific file or folder in a drive, including size, author, timestamps, and download URL.",
    {
      drive_id: z.string().describe("The drive ID."),
      item_id: z
        .string()
        .describe("The item ID of the file or folder."),
    },
    async ({ drive_id, item_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getDriveItem(accessToken, drive_id, item_id);
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_file_content",
    "Download and read the text content of a file from SharePoint. Works best with text-based files (txt, csv, json, xml, html, markdown). Binary files will return garbled output.",
    {
      drive_id: z.string().describe("The drive ID containing the file."),
      item_id: z
        .string()
        .describe("The item ID of the file to read."),
    },
    async ({ drive_id, item_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const content = await getFileContent(accessToken, drive_id, item_id);
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "upload_file",
    "Upload a file to a SharePoint document library. Creates a new file or overwrites an existing one with the same name. Supports any file type including Microsoft Office formats (.docx, .xlsx, .pptx), PDFs, CSVs, and plain text. For binary files (.docx, .xlsx, .pptx, .pdf, etc.), provide the file data as base64 in content_base64. For plain text files (.txt, .csv, .json, etc.), use content. Exactly one of content or content_base64 must be provided.",
    {
      drive_id: z.string().describe("The drive ID to upload to."),
      parent_folder_id: z
        .string()
        .describe(
          "The ID of the parent folder. Use 'root' for the drive's root folder, or a specific folder ID from list_drive_items."
        ),
      file_name: z
        .string()
        .describe(
          "The name for the file including extension (e.g., 'report.docx', 'data.xlsx', 'notes.txt')."
        ),
      content: z
        .string()
        .optional()
        .describe("Plain text content for text-based files (.txt, .csv, .json, .xml, .html, .md)."),
      content_base64: z
        .string()
        .optional()
        .describe("Base64-encoded binary content for Office files and other binary formats (.docx, .xlsx, .pptx, .pdf, .png, .zip, etc.)."),
    },
    async ({ drive_id, parent_folder_id, file_name, content, content_base64 }, extra) => {
      try {
        if (!content && !content_base64) {
          throw new ConnectorError(
            "Either content or content_base64 must be provided.",
            "VALIDATION_ERROR",
            400
          );
        }
        if (content && content_base64) {
          throw new ConnectorError(
            "Provide either content or content_base64, not both.",
            "VALIDATION_ERROR",
            400
          );
        }
        const accessToken = getAccessToken(extra);
        const body: string | Blob = content_base64
          ? new Blob([Buffer.from(content_base64, "base64")])
          : content!;
        const result = await uploadFile(
          accessToken,
          drive_id,
          parent_folder_id,
          file_name,
          body
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_folder",
    "Create a new folder in a SharePoint document library.",
    {
      drive_id: z.string().describe("The drive ID to create the folder in."),
      parent_folder_id: z
        .string()
        .optional()
        .describe(
          "The ID of the parent folder. Omit to create in the drive's root."
        ),
      folder_name: z.string().describe("The name for the new folder."),
    },
    async ({ drive_id, parent_folder_id, folder_name }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await createFolder(
          accessToken,
          drive_id,
          parent_folder_id || "",
          folder_name
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_drive_item",
    "Permanently delete a file or folder from a SharePoint document library. This action cannot be undone — deleted items go to the site recycle bin.",
    {
      drive_id: z
        .string()
        .describe("The drive ID containing the item to delete."),
      item_id: z
        .string()
        .describe("The item ID of the file or folder to delete."),
    },
    async ({ drive_id, item_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        await deleteDriveItem(accessToken, drive_id, item_id);
        return toolResult({ success: true, message: "Item deleted successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── Lists ─────────────────────────────────────────────────────────────────

  server.tool(
    "get_lists",
    "List all SharePoint lists in a site, including custom lists and document libraries. Returns list IDs needed to read or manage list items.",
    {
      site_id: z
        .string()
        .describe("The SharePoint site ID. Use list_sites to find this."),
    },
    async ({ site_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getLists(accessToken, site_id);
        return toolResult(result.value);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_list_items",
    "Get all items from a SharePoint list. Returns structured data with all field values for each item. Use expand_fields to include all column values.",
    {
      site_id: z
        .string()
        .describe("The SharePoint site ID containing the list."),
      list_id: z
        .string()
        .describe(
          "The list ID or display name. Use get_lists to find this."
        ),
      expand_fields: z
        .boolean()
        .optional()
        .describe(
          "Set to true to include all field/column values for each item. Defaults to false."
        ),
    },
    async ({ site_id, list_id, expand_fields }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await getListItems(
          accessToken,
          site_id,
          list_id,
          expand_fields ?? true
        );
        return toolResult(result.value);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_list_item",
    "Create a new item in a SharePoint list. Provide the field values as key-value pairs matching the list's column names.",
    {
      site_id: z
        .string()
        .describe("The SharePoint site ID containing the list."),
      list_id: z
        .string()
        .describe("The list ID or display name."),
      fields: z
        .record(z.unknown())
        .describe(
          "An object of field name to value pairs. Field names must match the list's internal column names (e.g., { \"Title\": \"My Item\", \"Status\": \"Active\" })."
        ),
    },
    async ({ site_id, list_id, fields }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await createListItem(
          accessToken,
          site_id,
          list_id,
          fields
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "update_list_item",
    "Update an existing item in a SharePoint list. Only the fields you provide will be changed — other fields remain untouched.",
    {
      site_id: z
        .string()
        .describe("The SharePoint site ID containing the list."),
      list_id: z
        .string()
        .describe("The list ID or display name."),
      item_id: z
        .string()
        .describe("The ID of the list item to update."),
      fields: z
        .record(z.unknown())
        .describe(
          "An object of field name to value pairs to update (e.g., { \"Status\": \"Complete\", \"Priority\": \"High\" })."
        ),
    },
    async ({ site_id, list_id, item_id, fields }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        if (Object.keys(fields).length === 0) {
          throw new ConnectorError(
            "At least one field must be provided to update.",
            "VALIDATION_ERROR",
            400
          );
        }
        const result = await updateListItem(
          accessToken,
          site_id,
          list_id,
          item_id,
          fields
        );
        return toolResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "delete_list_item",
    "Permanently delete an item from a SharePoint list. This action cannot be undone.",
    {
      site_id: z
        .string()
        .describe("The SharePoint site ID containing the list."),
      list_id: z
        .string()
        .describe("The list ID or display name."),
      item_id: z
        .string()
        .describe("The ID of the list item to delete."),
    },
    async ({ site_id, list_id, item_id }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        await deleteListItem(accessToken, site_id, list_id, item_id);
        return toolResult({ success: true, message: "List item deleted successfully." });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ─── Search ────────────────────────────────────────────────────────────────

  server.tool(
    "search_files",
    "Search across all SharePoint sites for files and documents matching a query. Uses Microsoft Search to find files by name, content, or metadata. Great for finding documents when you don't know which site or library they're in.",
    {
      query: z
        .string()
        .describe(
          "The search query. Supports keywords, phrases in quotes, and KQL syntax (e.g., 'budget 2024', '\"quarterly report\"', 'filetype:xlsx')."
        ),
      entity_types: z
        .array(z.enum(["driveItem", "listItem", "site"]))
        .optional()
        .describe(
          "Types of entities to search. Defaults to ['driveItem']. Use ['driveItem', 'listItem'] to include list items, or ['site'] to search sites."
        ),
      size: z
        .number()
        .optional()
        .describe(
          "Maximum number of results to return (1-100). Defaults to 25."
        ),
    },
    async ({ query, entity_types, size }, extra) => {
      try {
        const accessToken = getAccessToken(extra);
        const result = await searchFiles(
          accessToken,
          query,
          entity_types ?? ["driveItem"],
          size ?? 25
        );
        const hits =
          result.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
        const total =
          result.value?.[0]?.hitsContainers?.[0]?.total ?? 0;
        return toolResult({
          total,
          results: hits.map((h) => ({
            id: h.hitId,
            name: h.resource.name,
            webUrl: h.resource.webUrl,
            size: h.resource.size,
            lastModified: h.resource.lastModifiedDateTime,
            summary: h.summary,
            type: h.resource["@odata.type"],
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
