import { apiRequest } from "@custom-connectors/shared";

const API_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202501";

function linkedinHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function encodeUrn(urn: string): string {
  return encodeURIComponent(urn);
}

// --- Response types ---

export interface LinkedInProfile {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: { language: string; country: string };
}

export interface LinkedInOrganization {
  id: number;
  localizedName: string;
  vanityName?: string;
  localizedDescription?: string;
  logoV2?: Record<string, unknown>;
  organizationType?: string;
  localizedWebsite?: string;
}

export interface LinkedInPost {
  id: string;
  author: string;
  commentary?: string;
  visibility: string;
  lifecycleState: string;
  publishedAt?: number;
  createdAt?: number;
  lastModifiedAt?: number;
  content?: Record<string, unknown>;
  distribution?: Record<string, unknown>;
}

export interface LinkedInComment {
  id: string;
  actor: string;
  message: { text: string };
  created: { time: number };
  parentComment?: string;
}

export interface LinkedInReaction {
  actor: string;
  reactionType: string;
  created: { time: number };
}

export interface LinkedInPaginatedResponse<T> {
  elements: T[];
  paging?: {
    start: number;
    count: number;
    total?: number;
    links?: Array<{ rel: string; href: string }>;
  };
}

// --- API functions ---

export async function getProfile(
  accessToken: string
): Promise<LinkedInProfile> {
  return apiRequest(`https://api.linkedin.com/v2/userinfo`, {
    headers: linkedinHeaders(accessToken),
  });
}

export async function getOrganization(
  accessToken: string,
  organizationId: string
): Promise<LinkedInOrganization> {
  return apiRequest(
    `${API_BASE}/organizations/${organizationId}`,
    { headers: linkedinHeaders(accessToken) }
  );
}

export async function getPosts(
  accessToken: string,
  authorUrn: string,
  options: { start?: number; count?: number } = {}
): Promise<LinkedInPaginatedResponse<LinkedInPost>> {
  const params = new URLSearchParams({
    q: "author",
    author: authorUrn,
    start: String(options.start ?? 0),
    count: String(options.count ?? 10),
  });
  return apiRequest(
    `${API_BASE}/posts?${params}`,
    { headers: linkedinHeaders(accessToken) }
  );
}

export async function getPost(
  accessToken: string,
  postUrn: string
): Promise<LinkedInPost> {
  return apiRequest(
    `${API_BASE}/posts/${encodeUrn(postUrn)}`,
    { headers: linkedinHeaders(accessToken) }
  );
}

export async function getComments(
  accessToken: string,
  postUrn: string,
  options: { start?: number; count?: number } = {}
): Promise<LinkedInPaginatedResponse<LinkedInComment>> {
  const params = new URLSearchParams({
    start: String(options.start ?? 0),
    count: String(options.count ?? 10),
  });
  return apiRequest(
    `${API_BASE}/socialActions/${encodeUrn(postUrn)}/comments?${params}`,
    { headers: linkedinHeaders(accessToken) }
  );
}

export async function getReactions(
  accessToken: string,
  postUrn: string,
  options: { start?: number; count?: number } = {}
): Promise<LinkedInPaginatedResponse<LinkedInReaction>> {
  const params = new URLSearchParams({
    start: String(options.start ?? 0),
    count: String(options.count ?? 10),
  });
  return apiRequest(
    `${API_BASE}/socialActions/${encodeUrn(postUrn)}/reactions?${params}`,
    { headers: linkedinHeaders(accessToken) }
  );
}
