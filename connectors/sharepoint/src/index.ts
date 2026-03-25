import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const tenantId = process.env.AZURE_TENANT_ID;
if (!tenantId) {
  console.error("AZURE_TENANT_ID environment variable is required");
  process.exit(1);
}

const config = {
  name: "SharePoint",
  version: "1.0.0",
  oauth: {
    serverUrl: process.env.SERVER_URL || "http://localhost:3000",
    authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    scopes: [
      "Sites.ReadWrite.All",
      "Files.ReadWrite.All",
      "offline_access",
    ],
  },
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
