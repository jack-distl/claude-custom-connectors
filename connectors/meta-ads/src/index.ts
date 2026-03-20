import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = {
  name: "Meta Ads",
  version: "1.0.0",
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config);
