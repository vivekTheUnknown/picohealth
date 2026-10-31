import type { NextRequest } from "next/server";

/**
 * Same-origin API proxy.
 *
 * The browser and the phone always call the portal origin (`/api/v1/...`).
 * This route forwards to the FastAPI service, so session cookies stay
 * first-party and the backend can live on Render without CORS or
 * `SameSite=None` cookies.
 *
 * `API_PROXY_TARGET` is a runtime environment variable:
 *   - local:  http://localhost:8000
 *   - deployed: the Render HTTPS origin
 */
export const dynamic = "force-dynamic";

const TARGET = (process.env.API_PROXY_TARGET || "http://localhost:8000").replace(
  /\/+$/,
  "",
);

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const target = new URL(
    `${TARGET}/api/${path.map((segment) => encodeURIComponent(segment)).join("/")}`,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.set("accept-encoding", "identity");

  const clientIp =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  const host = request.headers.get("host");
  if (host) headers.set("x-forwarded-host", host);
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json(
      {
        error: {
          code: "upstream_unreachable",
          message: "The portal API could not be reached.",
          retryable: true,
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (HOP_BY_HOP.has(name) || name === "set-cookie" || name === "content-encoding") {
      return;
    }
    responseHeaders.set(name, value);
  });

  // A rewrite-style proxy must preserve every Set-Cookie separately.
  const cookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
  if (cookies.length > 0) {
    for (const cookie of cookies) responseHeaders.append("set-cookie", cookie);
  } else {
    const single = upstream.headers.get("set-cookie");
    if (single) responseHeaders.append("set-cookie", single);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export {
  proxy as DELETE,
  proxy as GET,
  proxy as HEAD,
  proxy as OPTIONS,
  proxy as PATCH,
  proxy as POST,
  proxy as PUT,
};
