import { reportView } from "../../lib/sheets.js"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return Response.json(await reportView())
  } catch (error) {
    return Response.json({ ok: false, error: error.message || "خواندن گزارش انجام نشد." }, { status: error.status || 500 })
  }
}
