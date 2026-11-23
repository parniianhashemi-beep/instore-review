import { allowedEmails, createSessionCookie } from "../../../lib/session.js"
import { sameSiteWrite } from "../../../lib/access.js"

export const dynamic = "force-dynamic"

export async function POST(request) {
  const crossSite = sameSiteWrite(request)
  if (crossSite) return crossSite

  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim()
  const allowed = allowedEmails()
  if (!clientId || !allowed.size || String(process.env.APP_SESSION_SECRET || "").length < 32) {
    return Response.json({ ok: false, error: "ورود روی میزبان تنظیم نشده است." }, { status: 503, headers: { "cache-control": "no-store" } })
  }

  let credential = ""
  try {
    const raw = await request.text()
    if (raw.length > 12000) return Response.json({ ok: false, error: "درخواست ورود بیش از حد بزرگ است." }, { status: 413 })
    credential = String(JSON.parse(raw).credential || "")
  } catch {
    return Response.json({ ok: false, error: "اطلاعات ورود خوانده نشد." }, { status: 400 })
  }
  if (!credential || credential.length > 10000) {
    return Response.json({ ok: false, error: "ورود Google انجام نشد." }, { status: 401 })
  }

  try {
    const url = new URL("https://oauth2.googleapis.com/tokeninfo")
    url.searchParams.set("id_token", credential)
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" })
    const claims = await response.json().catch(() => ({}))
    const email = String(claims.email || "").trim().toLowerCase()
    const issuer = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com"
    const verified = claims.email_verified === true || claims.email_verified === "true"
    if (!response.ok || claims.aud !== clientId || !issuer || !verified || !allowed.has(email)) {
      return Response.json({ ok: false, error: "این حساب Google اجازهٔ ورود به برنامه را ندارد." }, { status: 403, headers: { "cache-control": "no-store" } })
    }
    return Response.json(
      { ok: true, email },
      { headers: { "cache-control": "no-store", "set-cookie": createSessionCookie(email) } },
    )
  } catch {
    return Response.json({ ok: false, error: "تأیید حساب Google ناموفق بود. دوباره تلاش کنید." }, { status: 502, headers: { "cache-control": "no-store" } })
  }
}
