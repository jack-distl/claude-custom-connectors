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
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientId: process.env.META_APP_ID!,
    clientSecret: process.env.META_APP_SECRET!,
    scopes: ["ads_read", "ads_management"],
  },
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
