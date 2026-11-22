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

function originAllowed(request) {
  const origin = request.headers.get("origin")
  if (!origin) return true
  let sent
  let page
  try {
    sent = new URL(origin)
    page = new URL(request.url)
  } catch {
    return false
  }
  if (sent.origin === page.origin) return true
  return loopback(sent.hostname) && loopback(page.hostname) && sent.protocol === page.protocol && sent.port === page.port
}

export function sameSiteWrite(request) {
  if (request.headers.get("x-instore-request") !== "1") {
    return denied(403, "درخواست پذیرفته نشد.")
  }
  if (!originAllowed(request)) return denied(403, "درخواست پذیرفته نشد.")
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") {
    return denied(403, "درخواست پذیرفته نشد.")
  }
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
