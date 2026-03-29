import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = {
  name: "LinkedIn",
  version: "1.0.0",
  oauth: {
    serverUrl:
      process.env.SERVER_URL || "http://localhost:3000",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientId: process.env.LINKEDIN_CLIENT_ID!,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    scopes: ["openid", "profile", "email", "w_member_social", "r_organization_social"],
  },
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
