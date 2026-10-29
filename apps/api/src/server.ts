import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import { authorizeTenantRequest } from "../../../packages/identity/src/authorize-tenant-request.js";
import { PostgreSqlIdentityRepository } from "../../../packages/identity/src/postgresql-repository.js";
import { mvpSessionPolicy } from "../../../packages/identity/src/session-policy.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      application_name: "abayflow-api",
      connectionTimeoutMillis: 5_000,
      max: 10
    })
  : null;
const identityRepository = pool ? new PostgreSqlIdentityRepository(pool) : null;

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

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
    if (!pool) {
      sendError(response, requestId, 503, "SERVICE_NOT_READY", "Required service dependencies are not configured.");
      return;
    }
    try {
      const result = await pool.query(`
        SELECT
          to_regclass('public.schema_migrations') AS migration_ledger,
          to_regclass('public.accounts') AS accounts,
          to_regclass('public.tenants') AS tenants,
          to_regclass('public.sessions') AS sessions,
          to_regclass('public.tenant_memberships') AS tenant_memberships
      `);
      const schema = result.rows[0];
      if (
        !schema ||
        !schema.migration_ledger ||
        !schema.accounts ||
        !schema.tenants ||
        !schema.sessions ||
        !schema.tenant_memberships
      ) {
        sendError(response, requestId, 503, "SERVICE_NOT_READY", "Required database schema is not available.");
        return;
      }
      sendJson(response, requestId, 200, { status: "ready", requestId });
    } catch {
      sendError(response, requestId, 503, "SERVICE_NOT_READY", "Required service dependencies are unavailable.");
    }
    return;
  }

  // The authenticated boundary is active for the reserved API namespace, but
  // no business endpoints are registered. Even a valid request receives 404
  // after authentication until individual routes and action permissions are reviewed.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    if (!pool || !identityRepository) {
      sendError(response, requestId, 503, "IDENTITY_UNAVAILABLE", "Authentication services are unavailable.");
      return;
    }

    const authorizationHeader = typeof request.headers.authorization === "string"
      ? request.headers.authorization
      : undefined;
    const requestedTenantId = typeof request.headers["x-tenant-id"] === "string"
      ? request.headers["x-tenant-id"]
      : undefined;

    const decision = await authorizeTenantRequest(
      { authorizationHeader, requestedTenantId, now: new Date() },
      { repository: identityRepository, sessionPolicy: mvpSessionPolicy }
    );

    if (!decision.ok) {
      const message = decision.httpStatus === 503
        ? "Authentication services are unavailable."
        : decision.httpStatus === 400
          ? "A tenant context is required."
          : decision.httpStatus === 403
            ? "Access is not permitted."
            : "Authentication is required.";
      sendError(response, requestId, decision.httpStatus, decision.code, message);
      return;
    }

    try {
      const activityRecorded = await identityRepository.touchSession(
        decision.context.sessionId,
        new Date().toISOString()
      );
      if (!activityRecorded) {
        sendError(response, requestId, 401, "SESSION_EXPIRED", "Authentication is required.");
        return;
      }
    } catch {
      sendError(response, requestId, 503, "IDENTITY_UNAVAILABLE", "Authentication services are unavailable.");
      return;
    }

    sendError(response, requestId, 404, "NOT_FOUND", "The requested resource was not found.");
    return;
  }

  sendError(response, requestId, 404, "NOT_FOUND", "The requested resource was not found.");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      sendError(response, randomUUID(), 500, "INTERNAL_ERROR", "The request could not be completed.");
    } else {
      response.destroy();
    }
  });
});

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
      if (pool) {
        void pool.end().catch(() => {
          process.exitCode = 1;
        });
      }
    });
  });
}
