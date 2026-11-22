import { requireIdentity } from "../cursor/identity.js"

const writes = new Map()
const reads = new Map()

function limited(map, key, limit, windowMs) {
  const now = Date.now()
  const bucket = map.get(key) || []
  while (bucket.length && now - bucket[0] > windowMs) bucket.shift()
  if (bucket.length >= limit) return true
  bucket.push(now)
  map.set(key, bucket)
  return false
}

function denied(status, error) {
  return Response.json(
    { ok: false, error },
    { status, headers: { "cache-control": "private, no-store" } },
  )
}

function loopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

function requestHosts(request) {
  const hosts = new Set()
  try {
    hosts.add(new URL(request.url).host)
  } catch {
    /* the public host may only be on a forwarded header */
  }
  for (const name of ["host", "x-forwarded-host"]) {
    const raw = request.headers.get(name) || ""
    for (const part of raw.split(",")) {
      const host = part.trim()
      if (host) hosts.add(host)
    }
  }
  return hosts
}

function originAllowed(request) {
  const origin = request.headers.get("origin")
  if (!origin) return true
  let sent
  try {
    sent = new URL(origin)
  } catch {
    return false
  }
  if (requestHosts(request).has(sent.host)) return true
  for (const host of requestHosts(request)) {
    const hostname = host.replace(/:\d+$/, "")
    if (loopback(sent.hostname) && loopback(hostname)) return true
  }
  return false
}

export function sameSiteWrite(request) {
  const site = (request.headers.get("sec-fetch-site") || "").toLowerCase()
  if (site === "cross-site") return denied(403, "درخواست پذیرفته نشد.")
  if (site === "same-origin" || site === "none") return null
  if (!originAllowed(request)) return denied(403, "درخواست پذیرفته نشد.")
  return null
}

export async function reviewer(request, { write = false } = {}) {
  const identity = await requireIdentity(request)
  if (identity instanceof Response) return identity
  if (identity.kind !== "person") return denied(401, "ورود لازم است.")
  if (identity.stage === "preview") return denied(403, "پیش‌نمایش به شیت وصل نیست.")
  const blocked = write
    ? limited(writes, identity.sub, 10, 60_000)
    : limited(reads, identity.sub, 60, 60_000)
  if (blocked) return denied(429, "چند لحظه بعد دوباره تلاش کنید.")
  return identity
}
