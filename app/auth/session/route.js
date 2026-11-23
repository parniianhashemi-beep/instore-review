import { reviewerSession } from "../../../lib/session.js"

export const dynamic = "force-dynamic"

export async function GET(request) {
  const identity = await reviewerSession(request)
  if (!identity) return Response.json({ ok: false, error: "ورود لازم است." }, { status: 401, headers: { "cache-control": "private, no-store" } })
  return Response.json({ ok: true, email: identity.email }, { headers: { "cache-control": "private, no-store" } })
}
