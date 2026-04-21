import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = {
  name: "SE Ranking",
  version: "1.0.0",
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
