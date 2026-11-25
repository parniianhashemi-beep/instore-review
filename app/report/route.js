import { reviewer } from "../../lib/access.js"
import { reportView } from "../../lib/sheets.js"

export const dynamic = "force-dynamic"

const PRIVATE = { "cache-control": "private, no-store" }

export async function GET(request) {
  const identity = await reviewer(request)
  if (identity instanceof Response) return identity
  try {
    const pruneReviewed = new URL(request.url).searchParams.get("prune") === "1"
    return Response.json(await reportView({ pruneReviewed }), { headers: PRIVATE })
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "خواندن گزارش انجام نشد." },
      { status: error.status || 500, headers: PRIVATE },
    )
  }
}
