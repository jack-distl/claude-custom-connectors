import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { ConnectorConfig } from "./types.js";
import { ConnectorOAuthProvider } from "./oauth-provider.js";
import express from "express";

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
 * Starts the HTTP server with MCP streamable HTTP transport and optional OAuth proxy.
 */
export async function startServer(
  server: McpServer,
  config: ConnectorConfig
): Promise<void> {
  const port = config.port ?? parseInt(process.env.PORT ?? "3000", 10);

  const app = express();

  // Trust reverse proxy (Railway, etc.) so X-Forwarded-For works with rate limiting
  app.set("trust proxy", 1);

  // Request/response logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", connector: config.name });
  });

  // Mount OAuth proxy if configured
  if (config.oauth) {
    const provider = new ConnectorOAuthProvider(config.oauth);
    const issuerUrl = new URL(config.oauth.serverUrl);

    app.use(
      mcpAuthRouter({
        provider,
        issuerUrl,
        scopesSupported: config.oauth.scopes,
        // Disable SDK's built-in rate limiting — behind Railway's reverse proxy,
        // express-rate-limit throws on X-Forwarded-For even with trust proxy set.
        authorizationOptions: { rateLimit: false },
        tokenOptions: { rateLimit: false },
        revocationOptions: { rateLimit: false },
        clientRegistrationOptions: { rateLimit: false },
      } as any)
    );
  }

  // MCP transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  // MCP endpoint — handle POST, GET, DELETE
  app.all("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
  });

  const httpServer = app.listen(port, () => {
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
