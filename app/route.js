import { readFile } from "node:fs/promises"
import path from "node:path"

export const dynamic = "force-dynamic"

export async function GET() {
  const source = await readFile(path.join(process.cwd(), "index.html"), "utf8")
  const clientId = JSON.stringify(String(process.env.GOOGLE_CLIENT_ID || ""))
  const html = source.replace('const GOOGLE_CLIENT_ID = "";', `const GOOGLE_CLIENT_ID = ${clientId};`)
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
