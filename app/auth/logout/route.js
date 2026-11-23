import { clearSessionCookie } from "../../../lib/session.js"
import { sameSiteWrite } from "../../../lib/access.js"

export const dynamic = "force-dynamic"

export async function POST(request) {
  const crossSite = sameSiteWrite(request)
  if (crossSite) return crossSite
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store", "set-cookie": clearSessionCookie() } })
}
