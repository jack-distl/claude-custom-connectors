import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const server = createConnectorServer({
  name: "Example Connector",
  version: "1.0.0",
});

registerTools(server);

startServer(server, {
  name: "Example Connector",
  version: "1.0.0",
});
