import { saveStore } from "../../lib/sheets.js"

export const dynamic = "force-dynamic"

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}))
    return Response.json(await saveStore(payload))
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "ذخیره انجام نشد." }, { status: error.status || 500 })
  }
}
