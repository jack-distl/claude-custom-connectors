import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = {
  name: "WorkflowMax",
  version: "1.0.0",
  oauth: {
    serverUrl: process.env.SERVER_URL || "http://localhost:3000",
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    scopes: ["openid", "profile", "email", "workflowmax", "offline_access"],
  },
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
