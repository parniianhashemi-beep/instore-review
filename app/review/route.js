import { rewriteReport } from "../../lib/sheets.js"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    return Response.json(await rewriteReport())
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "ثبت گزارش در شیت انجام نشد." }, { status: error.status || 500 })
  }
}
