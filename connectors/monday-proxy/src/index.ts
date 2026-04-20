import {
  createConnectorServer,
  startServer,
} from "@custom-connectors/shared";
import { registerTools } from "./tools.js";
import { refreshBoardCache, startCacheRefresh } from "./api.js";

const config = {
  name: "Monday.com Proxy",
  version: "1.0.0",
  // No OAuth — this connector uses a server-side MONDAY_API_TOKEN.
  // All auth is handled at the server level, not per-user.
};

const server = createConnectorServer(config);
registerTools(server);

// Pre-warm the public board cache before accepting connections
console.log("Pre-warming public board cache...");
refreshBoardCache()
  .then(() => {
    startCacheRefresh();
    startServer(server, config, registerTools);
  })
  .catch((error) => {
    console.error("Failed to pre-warm cache, starting anyway:", error);
    startCacheRefresh();
    startServer(server, config, registerTools);
  });
