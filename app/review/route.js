import { reviewer, sameSiteWrite } from "../../lib/access.js"
import { rewriteReport } from "../../lib/sheets.js"

export const dynamic = "force-dynamic"

const PRIVATE = { "cache-control": "private, no-store" }

export async function POST(request) {
  const crossSite = sameSiteWrite(request)
  if (crossSite) return crossSite
  const identity = await reviewer(request, { write: true })
  if (identity instanceof Response) return identity
  let fresh = true
  try {
    const raw = await request.text()
    if (raw) {
      const body = JSON.parse(raw)
      if (body && body.fresh === false) fresh = false
    }
  } catch {
    fresh = true
  }
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"))
      }
      try {
        const result = await rewriteReport((progress) => send(progress), { fresh })
        if (result.partial) send(result)
        else send({ ...result, finished: true, checked: result.general, total: result.general, percent: 100, stage: "complete" })
      } catch (error) {
        send({ ok: false, error: error.message || "ثبت گزارش در شیت انجام نشد." })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      ...PRIVATE,
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-accel-buffering": "no",
    },
  })
}
