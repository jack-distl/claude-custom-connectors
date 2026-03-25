import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = {
  name: "Example Connector", // TODO: Change to your connector name
  version: "1.0.0",
  oauth: {
    serverUrl: process.env.SERVER_URL || "http://localhost:3000",
    authorizeUrl: "https://example.com/oauth/authorize", // TODO: Change to provider's authorize URL
    tokenUrl: "https://example.com/oauth/token", // TODO: Change to provider's token URL
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    scopes: ["read"], // TODO: Change to required scopes for this API
  },
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
