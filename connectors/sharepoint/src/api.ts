import { apiRequest } from "@custom-connectors/shared";

const BASE_URL = "https://graph.microsoft.com/v1.0";

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

export interface SharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
  description?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  siteCollection?: { hostname: string };
}

export interface Drive {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
  description?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  quota?: {
    total: number;
    used: number;
    remaining: number;
    state: string;
  };
}

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName: string; email?: string } };
  lastModifiedBy?: { user?: { displayName: string; email?: string } };
  folder?: { childCount: number };
  file?: { mimeType: string; hashes?: Record<string, string> };
  parentReference?: {
    driveId: string;
    id: string;
    path?: string;
  };
  "@microsoft.graph.downloadUrl"?: string;
}

export interface SharePointList {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  webUrl: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  list?: {
    template: string;
    contentTypesEnabled: boolean;
    hidden: boolean;
  };
}

export interface ListItem {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  webUrl?: string;
  createdBy?: { user?: { displayName: string; email?: string } };
  lastModifiedBy?: { user?: { displayName: string; email?: string } };
  fields?: Record<string, unknown>;
  contentType?: { id: string; name: string };
}

export interface SearchHit {
  hitId: string;
  rank: number;
  summary?: string;
  resource: {
    id: string;
    name: string;
    webUrl: string;
    size?: number;
    lastModifiedDateTime?: string;
    createdBy?: { user?: { displayName: string } };
    lastModifiedBy?: { user?: { displayName: string } };
    parentReference?: { siteId?: string; driveId?: string };
    "@odata.type"?: string;
  };
}

export interface SearchResponse {
  value: Array<{
    searchTerms: string[];
    hitsContainers: Array<{
      total: number;
      moreResultsAvailable: boolean;
      hits: SearchHit[];
    }>;
  }>;
}

// ─── Sites ───────────────────────────────────────────────────────────────────

export async function listSites(
  accessToken: string,
  search?: string
): Promise<GraphCollection<SharePointSite>> {
  const url = search
    ? `${BASE_URL}/sites?search=${encodeURIComponent(search)}`
    : `${BASE_URL}/sites?search=*`;
  return apiRequest<GraphCollection<SharePointSite>>(url, {
    headers: authHeaders(accessToken),
  });
}

export async function getSite(
  accessToken: string,
  siteId: string
): Promise<SharePointSite> {
  return apiRequest<SharePointSite>(`${BASE_URL}/sites/${siteId}`, {
    headers: authHeaders(accessToken),
  });
}

// ─── Drives ──────────────────────────────────────────────────────────────────

export async function listDrives(
  accessToken: string,
  siteId: string
): Promise<GraphCollection<Drive>> {
  return apiRequest<GraphCollection<Drive>>(
    `${BASE_URL}/sites/${siteId}/drives`,
    { headers: authHeaders(accessToken) }
  );
}

// ─── Drive Items (Files & Folders) ──────────────────────────────────────────

export async function listDriveItems(
  accessToken: string,
  driveId: string,
  folderId?: string
): Promise<GraphCollection<DriveItem>> {
  const path = folderId
    ? `${BASE_URL}/drives/${driveId}/items/${folderId}/children`
    : `${BASE_URL}/drives/${driveId}/root/children`;
  return apiRequest<GraphCollection<DriveItem>>(path, {
    headers: authHeaders(accessToken),
  });
}

export async function getDriveItem(
  accessToken: string,
  driveId: string,
  itemId: string
): Promise<DriveItem> {
  return apiRequest<DriveItem>(
    `${BASE_URL}/drives/${driveId}/items/${itemId}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getFileContent(
  accessToken: string,
  driveId: string,
  itemId: string
): Promise<string> {
  const url = `${BASE_URL}/drives/${driveId}/items/${itemId}/content`;
  const response = await fetch(url, {
    headers: authHeaders(accessToken),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export async function uploadFile(
  accessToken: string,
  driveId: string,
  parentFolderId: string,
  fileName: string,
  body: string | Blob
): Promise<DriveItem> {
  const url = `${BASE_URL}/drives/${driveId}/items/${parentFolderId}:/${encodeURIComponent(fileName)}:/content`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/octet-stream",
    },
    body,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }
  return response.json() as Promise<DriveItem>;
}

export async function createFolder(
  accessToken: string,
  driveId: string,
  parentFolderId: string,
  folderName: string
): Promise<DriveItem> {
  const url = parentFolderId
    ? `${BASE_URL}/drives/${driveId}/items/${parentFolderId}/children`
    : `${BASE_URL}/drives/${driveId}/root/children`;
  return apiRequest<DriveItem>(url, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
}

export async function deleteDriveItem(
  accessToken: string,
  driveId: string,
  itemId: string
): Promise<void> {
  const url = `${BASE_URL}/drives/${driveId}/items/${itemId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok && response.status !== 204) {
    const errorBody = await response.text();
    throw new Error(`Delete failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }
}

// ─── Lists ───────────────────────────────────────────────────────────────────

export async function getLists(
  accessToken: string,
  siteId: string
): Promise<GraphCollection<SharePointList>> {
  return apiRequest<GraphCollection<SharePointList>>(
    `${BASE_URL}/sites/${siteId}/lists`,
    { headers: authHeaders(accessToken) }
  );
}

export async function getListItems(
  accessToken: string,
  siteId: string,
  listId: string,
  expand?: boolean
): Promise<GraphCollection<ListItem>> {
  const expandParam = expand ? "?expand=fields" : "";
  return apiRequest<GraphCollection<ListItem>>(
    `${BASE_URL}/sites/${siteId}/lists/${listId}/items${expandParam}`,
    { headers: authHeaders(accessToken) }
  );
}

export async function createListItem(
  accessToken: string,
  siteId: string,
  listId: string,
  fields: Record<string, unknown>
): Promise<ListItem> {
  return apiRequest<ListItem>(
    `${BASE_URL}/sites/${siteId}/lists/${listId}/items`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
}

export async function updateListItem(
  accessToken: string,
  siteId: string,
  listId: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(
    `${BASE_URL}/sites/${siteId}/lists/${listId}/items/${itemId}/fields`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fields),
    }
  );
}

export async function deleteListItem(
  accessToken: string,
  siteId: string,
  listId: string,
  itemId: string
): Promise<void> {
  const url = `${BASE_URL}/sites/${siteId}/lists/${listId}/items/${itemId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok && response.status !== 204) {
    const errorBody = await response.text();
    throw new Error(`Delete failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function searchFiles(
  accessToken: string,
  query: string,
  entityTypes: string[] = ["driveItem"],
  size: number = 25
): Promise<SearchResponse> {
  return apiRequest<SearchResponse>(`${BASE_URL}/search/query`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          entityTypes,
          query: { queryString: query },
          size,
        },
      ],
    }),
  });
}
