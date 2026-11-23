import { reviewer, sameSiteWrite } from "../../lib/access.js"
import { saveStore } from "../../lib/sheets.js"

export const dynamic = "force-dynamic"

const PRIVATE = { "cache-control": "private, no-store" }

export async function POST(request) {
  const crossSite = sameSiteWrite(request)
  if (crossSite) return crossSite
  const identity = await reviewer(request, { write: true })
  if (identity instanceof Response) return identity
  try {
    const payload = await request.json().catch(() => ({}))
    return Response.json(await saveStore(payload), { headers: PRIVATE })
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "ذخیره انجام نشد." },
      { status: error.status || 500, headers: PRIVATE },
    )
  }
}
