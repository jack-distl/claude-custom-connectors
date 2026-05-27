# Meta Social Connector

## Overview
Connects to Meta's Graph API to read organic (non-paid) performance data for Facebook Pages and Instagram Business accounts. Covers Page-level analytics, post-level insights, Instagram account analytics, and Instagram media insights.

This connector is read-only — it reports on existing content. For paid advertising data, use the Meta Ads connector.

## Authentication
- **Type:** OAuth2 Authorization Code (Facebook Login)
- **Scopes:** `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights`
- **Graph API version:** `v23.0`
- **Authorize URL:** `https://www.facebook.com/v23.0/dialog/oauth`
- **Token URL:** `https://graph.facebook.com/v23.0/oauth/access_token`

**Requirements:**
- The authenticating user must be an admin of the Facebook Pages they want to report on.
- Instagram accounts must be Instagram Business or Creator accounts connected to a Facebook Page (not personal accounts).

## Tools

### `get_pages`
List all Facebook Pages the authenticated user manages.

Returns: `id`, `name`, `category`, `fan_count`, `followers_count`, `about`, `website`, `link`.

Use the `id` from this response with all other Page tools.

---

### `get_page_insights`
Get organic Page-level metrics for a date range.

Input: `page_id`, `period` (day/week/days_28/month), `since`/`until` (YYYY-MM-DD), optional `metrics` list.

Default metrics:
- `page_impressions` — total times any Page content was seen
- `page_impressions_unique` — unique people who saw any Page content (reach)
- `page_engaged_users` — unique people who engaged with the Page
- `page_post_engagements` — total engagements on Page posts
- `page_fans` — total Page fans at end of period
- `page_fan_adds` — new Page likes in period
- `page_fan_removes` — unlikes in period
- `page_views_total` — total Page profile views

Note: Not all metrics are available for all periods. `day` period returns daily timeseries; `week`/`days_28`/`month` return aggregated values.

---

### `get_page_posts`
List recent organic posts on a Facebook Page.

Input: `page_id`, `limit` (default 25), `since`/`until` (UNIX timestamp or YYYY-MM-DD).

Returns: `id`, `message`, `story`, `created_time`, `full_picture`, `permalink_url`, `attachments`.

Use the `id` from this response with `get_post_insights`.

---

### `get_post_insights`
Get detailed lifetime metrics for a specific Facebook post.

Input: `post_id` (format: `{pageId}_{postId}`, from `get_page_posts`).

Returns lifetime values for:
- `post_impressions` — total times post was seen
- `post_impressions_unique` — unique reach
- `post_engaged_users` — unique people who engaged
- `post_clicks` — total post clicks
- Reaction breakdowns: `post_reactions_like_total`, `post_reactions_love_total`, `post_reactions_wow_total`, `post_reactions_haha_total`, `post_reactions_sorry_total`, `post_reactions_anger_total`

---

### `get_instagram_accounts`
List all Instagram Business accounts connected to managed Facebook Pages.

Returns: Instagram `id`, `username`, `name`, `biography`, `followers_count`, `follows_count`, `media_count`, `profile_picture_url`, `website`, plus `connected_page_id` and `connected_page_name`.

Use the `id` from this response with all other Instagram tools.

---

### `get_instagram_insights`
Get account-level Instagram analytics for a date range.

Input: `ig_user_id`, `period` (day/week/days_28/month), `since`/`until` (YYYY-MM-DD), optional `metrics` list.

Default metrics: `impressions`, `reach`, `profile_views`, `follower_count`.

Other available metrics: `email_contacts`, `phone_call_clicks`, `website_clicks`, `get_directions_clicks`, `text_message_clicks`.

Note: Metric availability varies by period. `follower_count` is only available for `day` period.

---

### `get_instagram_media`
List recent Instagram media for an account.

Input: `ig_user_id`, `limit` (default 25), `since`/`until`.

Returns: `id`, `caption`, `media_type` (IMAGE/VIDEO/REEL/STORY/CAROUSEL_ALBUM), `media_url`, `thumbnail_url`, `permalink`, `timestamp`, `like_count`, `comments_count`.

Use `id` and `media_type` with `get_instagram_media_insights`.

---

### `get_instagram_media_insights`
Get performance metrics for a specific Instagram post, reel, or story.

Input: `ig_media_id`, `media_type` (IMAGE/VIDEO/REEL/STORY/CAROUSEL_ALBUM).

Metrics returned vary by type:
- **IMAGE / CAROUSEL_ALBUM:** `impressions`, `reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions`
- **VIDEO / REEL:** same as above plus `plays`
- **STORY:** `impressions`, `reach`, `exits`, `replies`, `taps_forward`, `taps_back`

Note: Story insights are only available for 24 hours after posting (stories expire).

## Environment Variables
| Variable | Description |
|----------|-------------|
| `SERVER_URL` | Full URL of this deployed service (e.g. `https://my-connector.up.railway.app`). Set after generating a Railway domain. |
| `META_APP_ID` | Facebook App ID from developers.facebook.com. Can be the same app used for the Meta Ads connector. |
| `META_APP_SECRET` | Facebook App Secret. |

## App Setup (Meta Developer Console)
1. Go to [developers.facebook.com](https://developers.facebook.com) and open your app (or create a new one).
2. Add the **Facebook Login** product to the app.
3. Add the **Instagram** product to the app.
4. Under Facebook Login → Settings, add your Railway callback URL to "Valid OAuth Redirect URIs": `https://your-connector.up.railway.app/oauth/callback`
5. Request the following permissions in App Review (or test with your own accounts under Standard Access):
   - `pages_show_list`
   - `pages_read_engagement`
   - `read_insights`
   - `instagram_basic`
   - `instagram_manage_insights`

## API References
- [Pages API](https://developers.facebook.com/docs/graph-api/reference/page/)
- [Page Insights](https://developers.facebook.com/docs/graph-api/reference/insights)
- [Instagram Platform API](https://developers.facebook.com/docs/instagram-platform)
- [Instagram Insights](https://developers.facebook.com/docs/instagram-platform/reference/ig-user/insights)
- [Instagram Media Insights](https://developers.facebook.com/docs/instagram-platform/reference/ig-media/insights)
