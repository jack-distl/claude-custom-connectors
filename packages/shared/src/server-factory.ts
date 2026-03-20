import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ConnectorConfig } from "./types.js";
import http from "node:http";

/**
 * Creates a configured MCP server instance for a connector.
 * Call `registerTools` on the returned server, then call `startServer` to listen.
 */
export function createConnectorServer(config: ConnectorConfig): McpServer {
  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  return server;
}

/**
 * Starts the HTTP server with MCP streamable HTTP transport.
 */
export async function startServer(
  server: McpServer,
  config: ConnectorConfig
): Promise<void> {
  const port = config.port ?? parseInt(process.env.PORT ?? "3000", 10);

  const httpServer = http.createServer(async (req, res) => {
    // Health check endpoint
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", connector: config.name }));
      return;
    }

    // MCP endpoint
    if (req.url === "/mcp" && (req.method === "POST" || req.method === "GET" || req.method === "DELETE")) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        transport.close().catch(() => {});
      });

      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, () => {
    console.log(`${config.name} connector listening on port ${port}`);
    console.log(`  Health: http://localhost:${port}/health`);
    console.log(`  MCP:    http://localhost:${port}/mcp`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down...");
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
