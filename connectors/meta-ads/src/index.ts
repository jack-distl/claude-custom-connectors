import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = {
  name: "Meta Ads",
  version: "1.0.0",
  oauth: {
    serverUrl:
      process.env.SERVER_URL || "http://localhost:3000",
    authorizeUrl: "https://www.facebook.com/v23.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v23.0/oauth/access_token",
    clientId: process.env.META_APP_ID!,
    clientSecret: process.env.META_APP_SECRET!,
    scopes: [
      "ads_read",
      "ads_management",
      // Page + leadgen scopes: required to derive a Page access token and to
      // read leadgen forms/leads and resolve page-post creative destinations.
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_ads",
      "pages_manage_leads",
      "leads_retrieval",
    ],
    // Upgrade Meta's short-lived (~1-2h) user token to a long-lived (~60 day)
    // token so the connection survives without frequent re-auth.
    longLivedTokenExchange: true,
  },
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
