# LinkedIn Connector

Connect Claude to LinkedIn's Community Management API to read posts, profiles, comments, and reactions from people and organizations.

## Authentication

- **Type:** OAuth 2.0 (Authorization Code Flow)
- **Authorize URL:** `https://www.linkedin.com/oauth/v2/authorization`
- **Token URL:** `https://www.linkedin.com/oauth/v2/accessToken`
- **Scopes:** `openid`, `profile`, `email`, `w_member_social`, `r_organization_social`

## Tools

### `get_profile`
Get the authenticated LinkedIn member's profile (name, email, picture).
- **Parameters:** None

### `get_organization`
Get a LinkedIn organization/company page by ID.
- **Parameters:**
  - `organization_id` (string, required) — Numeric organization ID

### `get_posts`
Get posts by a person or organization using their full URN.
- **Parameters:**
  - `author_urn` (string, required) — e.g., `urn:li:person:{id}` or `urn:li:organization:{id}`
  - `start` (number, optional) — Pagination offset (default 0)
  - `count` (number, optional) — Results per page (default 10, max 100)

### `get_post`
Get a single post by its URN.
- **Parameters:**
  - `post_urn` (string, required) — e.g., `urn:li:share:{id}` or `urn:li:ugcPost:{id}`

### `get_comments`
Get comments on a LinkedIn post.
- **Parameters:**
  - `post_urn` (string, required) — Post URN
  - `start` (number, optional) — Pagination offset
  - `count` (number, optional) — Results per page

### `get_reactions`
Get reactions (LIKE, CELEBRATE, SUPPORT, LOVE, INSIGHTFUL, FUNNY) on a post.
- **Parameters:**
  - `post_urn` (string, required) — Post URN
  - `start` (number, optional) — Pagination offset
  - `count` (number, optional) — Results per page

### `get_organization_posts`
Get posts from an organization by its numeric ID (convenience wrapper).
- **Parameters:**
  - `organization_id` (string, required) — Numeric organization ID
  - `start` (number, optional) — Pagination offset
  - `count` (number, optional) — Results per page

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `SERVER_URL` | Public URL of this service (set after Railway generates a domain) | Yes |
| `LINKEDIN_CLIENT_ID` | OAuth Client ID from LinkedIn Developer Portal | Yes |
| `LINKEDIN_CLIENT_SECRET` | OAuth Client Secret from LinkedIn Developer Portal | Yes |

## LinkedIn Developer App Setup

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. Click **Create App**
3. Fill in app name, LinkedIn Page (required), and logo
4. Under **Products**, request access to **Community Management API**
5. Wait for LinkedIn to approve your app (may take a few days)
6. Once approved, go to **Auth** tab to find your Client ID and Client Secret
7. Add your redirect URL: `https://<your-railway-domain>/callback` (set after deployment)

## API Reference

- [LinkedIn Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview)
- [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api)
- [Reactions API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api)
