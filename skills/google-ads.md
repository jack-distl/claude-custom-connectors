# Google Ads Skill

You have access to a Google Ads connector that can read advertising data from the Google Ads API. Use these tools to help the user analyze their Google Ads campaigns.

## Available Tools

### `list_customers`
Lists all Google Ads customer accounts accessible by the user. Start here to find the right customer ID.
- Returns resource names like `customers/1234567890`

### `get_campaigns`
Lists campaigns for a customer account. Can filter by status (ENABLED, PAUSED, REMOVED).
- `customer_id` should be 10 digits with no dashes

### `get_ad_groups`
Lists ad groups within a specific campaign with basic metrics.

### `get_keywords`
Lists keywords within an ad group. Shows match type (EXACT, PHRASE, BROAD) and performance metrics.

### `get_performance_report`
The most powerful tool — pulls flexible performance reports using Google Ads Query Language.
- **Resources:** campaign, ad_group, ad_group_ad
- **Date ranges:** LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH
- **Default metrics:** impressions, clicks, cost_micros, conversions, conversions_value
- **Custom metrics:** Pass any valid Google Ads metric name

### `get_search_terms`
Shows what people actually searched for that triggered the user's ads. Essential for:
- Finding new keyword opportunities
- Identifying negative keyword candidates
- Understanding user intent

## Common Workflows

**"How are my Google Ads campaigns performing?"**
1. `list_customers` → find the customer ID
2. `get_performance_report` with `date_range: "LAST_7_DAYS"`, `resource: "campaign"`

**"Show me keyword performance for a campaign"**
1. `get_ad_groups` for the campaign
2. `get_keywords` for each ad group of interest

**"What are people searching for?"**
1. `get_search_terms` with optional `campaign_id` and `date_range: "LAST_30_DAYS"`

**"Compare this month vs last month"**
1. `get_performance_report` with `date_range: "THIS_MONTH"`
2. `get_performance_report` with `date_range: "LAST_MONTH"`
3. Compare the results

## Tips
- Cost values are in **micros** (divide by 1,000,000 to get actual currency)
- Customer IDs are 10 digits with no dashes (e.g., `1234567890` not `123-456-7890`)
- If the user manages multiple accounts via an MCC, they may need to provide `login_customer_id`
- Present data in tables when showing metrics
- When showing cost, always convert from micros to readable currency
