import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const method = request.method ?? "GET";
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  if (method === "GET" && pathname === "/health/live") {
    sendJson(response, 200, { status: "live" });
    return;
  }

  if (method === "GET" && pathname === "/health/ready") {
    // Readiness remains closed until database, storage, and job dependencies
    // are configured and verified by a dedicated readiness implementation.
    sendJson(response, 503, {
      status: "not_ready",
      reason: "dependencies_not_configured"
    });
    return;
  }

  // No business routes are exposed until authentication, tenant resolution,
  // and authorization middleware are implemented and reviewed.
  sendJson(response, 404, {
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found."
    }
  });
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = createServer(handleRequest);

server.listen(port, host, () => {
  console.log(`AbayFlow API scaffold listening on ${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("Server shutdown failed.", error);
        process.exitCode = 1;
      }
    });
  });
}
