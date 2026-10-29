import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

function sendJson(
  response: ServerResponse,
  requestId: string,
  status: number,
  body: unknown
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "x-request-id": requestId
  });
  response.end(JSON.stringify(body));
}

function sendError(
  response: ServerResponse,
  requestId: string,
  status: number,
  code: string,
  message: string
): void {
  const body: ErrorEnvelope = {
    error: { code, message, requestId }
  };
  sendJson(response, requestId, status, body);
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  // Generate the correlation identifier on the server; do not trust a
  // caller-supplied identifier as the canonical request ID.
  const requestId = randomUUID();
  const method = request.method ?? "GET";

  let pathname: string;
  try {
    pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  } catch {
    sendError(response, requestId, 400, "BAD_REQUEST", "The request target is invalid.");
    return;
  }

  if (method === "GET" && pathname === "/health/live") {
    sendJson(response, requestId, 200, { status: "live", requestId });
    return;
  }

  if (method === "GET" && pathname === "/health/ready") {
    // Readiness remains closed until database, storage, and job dependencies
    // are configured and verified by a dedicated readiness implementation.
    sendError(
      response,
      requestId,
      503,
      "SERVICE_NOT_READY",
      "Required service dependencies are not configured."
    );
    return;
  }

  // No business routes are exposed until authentication, tenant resolution,
  // and authorization middleware are implemented and reviewed.
  sendError(response, requestId, 404, "NOT_FOUND", "The requested resource was not found.");
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
