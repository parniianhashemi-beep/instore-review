import { createHmac, timingSafeEqual } from "node:crypto"

const COOKIE = "instore-review-session"
const SESSION_MS = 12 * 60 * 60 * 1000

export function allowedEmails() {
  return new Set(
    String(process.env.ALLOWED_REVIEWER_EMAILS || "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

function secret() {
  const value = String(process.env.APP_SESSION_SECRET || "")
  if (value.length < 32) return ""
  return value
}

function signature(value, key) {
  return createHmac("sha256", key).update(value).digest("base64url")
}

function cookieValue(request) {
  const raw = request.headers.get("cookie") || ""
  for (const part of raw.split(";")) {
    const index = part.indexOf("=")
    if (index < 0 || part.slice(0, index).trim() !== COOKIE) continue
    try { return decodeURIComponent(part.slice(index + 1).trim()) }
    catch { return "" }
  }
  return ""
}

export function createSessionCookie(email) {
  const key = secret()
  if (!key) throw new Error("کلید نشست روی میزبان تنظیم نشده است.")
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_MS })).toString("base64url")
  const token = `${payload}.${signature(payload, key)}`
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}`
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export function readSession(request) {
  const key = secret()
  const token = cookieValue(request)
  const allowed = allowedEmails()
  if (!key || !token || !allowed.size) return null
  const separator = token.lastIndexOf(".")
  if (separator < 1) return null
  const payload = token.slice(0, separator)
  const supplied = Buffer.from(token.slice(separator + 1))
  const expected = Buffer.from(signature(payload, key))
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    const email = String(data.email || "").toLowerCase()
    if (!email || !allowed.has(email) || !Number.isFinite(data.exp) || data.exp <= Date.now()) return null
    return { email, sub: email, kind: "person" }
  } catch {
    return null
  }
}

function loopbackRequest(request) {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase()
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  } catch {
    return false
  }
}

export async function reviewerSession(request) {
  const session = readSession(request)
  if (session) return session
  if (process.env.NODE_ENV !== "development" || !loopbackRequest(request)) return null
  try {
    const { getIdentity } = await import("../cursor/identity.js")
    const identity = await getIdentity(request)
    if (identity.verified && identity.simulated && identity.kind === "person") {
      return { email: identity.email || "local", sub: identity.sub || "local", kind: "person" }
    }
  } catch {
    return null
  }
  return null
}
