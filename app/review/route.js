import { reviewer, sameSiteWrite } from "../../lib/access.js"
import { rewriteReport } from "../../lib/sheets.js"

export const dynamic = "force-dynamic"

const PRIVATE = { "cache-control": "private, no-store" }

export async function POST(request) {
  const crossSite = sameSiteWrite(request)
  if (crossSite) return crossSite
  const identity = await reviewer(request, { write: true })
  if (identity instanceof Response) return identity
  try {
    return Response.json(await rewriteReport(), { headers: PRIVATE })
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "ثبت گزارش در شیت انجام نشد." },
      { status: error.status || 500, headers: PRIVATE },
    )
  }
}
