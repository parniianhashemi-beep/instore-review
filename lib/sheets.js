import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { HEADERS, classifyUrl, countsOf, decideRow, outputTables, prepareTables, safeUrl, sheetRow, shouldOpen } from "./classify.js"
import { openShop } from "./site.js"

const ACCOUNT = "general-service-account@turing-clock-510312-s9.iam.gserviceaccount.com"
const REPORT_ID = "1YF81MqW8l3GKwwQCj74c8HfaBDEaN6hpOgGXgmtqA6I"
const SOURCE_ID = "19dQcEMVJUEtD9PJD7l84l4JsZH2hxNoK9ejCWN3nH1M"
const OUTPUT = ["general", "آماده فعال\u200cسازی", "نیاز به تغییر نام", "نیازمند بررسی دستی", "تغییر نام انجام شد"]
const STATUS = {
  "آماده فعال\u200cسازی": ["آماده فعال\u200cسازی", "آماده فعال\u200cسازی"],
  "نیاز به تغییر نام": ["فعال\u200cسازی با اسم جدید", "نیاز به تغییر نام"],
  "نیازمند بررسی دستی": ["بررسی دستی", "نیازمند بررسی دستی"],
}
let tokenCache = { value: "", exp: 0 }
let sourceCache = { at: 0, ctx: null }

function fail(message) {
  const error = new Error(message)
  error.status = 503
  throw error
}

function loadKey() {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim()
  let key
  if (raw) {
    try {
      key = JSON.parse(raw)
    } catch {
      fail("کلید سرویس خوانده نشد.")
    }
  } else {
    const file = path.join(process.cwd(), "service-account.json")
    if (!fs.existsSync(file)) fail("کلید سرویس روی سرور نیست.")
    try {
      key = JSON.parse(fs.readFileSync(file, "utf8"))
    } catch {
      fail("کلید سرویس خوانده نشد.")
    }
  }
  const expectedAccount = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ACCOUNT).trim()
  if (key.client_email !== expectedAccount || !String(key.private_key || "").includes("BEGIN PRIVATE KEY")) {
    fail("کلید سرویس برای این حساب نیست.")
  }
  return key
}

function b64url(value) {
  return Buffer.from(value).toString("base64url")
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache.value && tokenCache.exp > now + 60) return tokenCache.value
  const key = loadKey()
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))
  const signing = `${header}.${claim}`
  const signature = crypto.createSign("RSA-SHA256").update(signing).sign(key.private_key)
  const assertion = `${signing}.${b64url(signature)}`
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) fail("ورود سرویس به شیت ناموفق بود.")
  tokenCache = { value: payload.access_token, exp: now + Number(payload.expires_in || 3600) }
  return tokenCache.value
}

function quote(name) {
  return `'${String(name).replace(/'/g, "''")}'`
}

async function sheets(token, method, suffix, body) {
  if (suffix.includes(SOURCE_ID)) fail("شیت مبدأ نوشته نمی‌شود.")
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${REPORT_ID}${suffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "شیت نوشته نشد."
    fail(String(message).slice(0, 300))
  }
  return payload
}

function columnLetter(count) {
  let n = Math.max(1, Number(count) || 1)
  let letters = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

async function spreadsheetGrids(token, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(title,gridProperties(rowCount,columnCount))`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "اندازهٔ تب خوانده نشد."
    fail(String(message).slice(0, 300))
  }
  const grids = []
  for (const sheet of payload.sheets || []) {
    const props = sheet.properties || {}
    const grid = props.gridProperties || {}
    if (props.title) grids.push({ title: props.title, rows: Number(grid.rowCount) || 1, columns: Number(grid.columnCount) || 1 })
  }
  return grids
}

async function locateSourceGrid(token, name) {
  const wanted = String(name).trim().toLowerCase()
  for (const spreadsheetId of [SOURCE_ID, REPORT_ID]) {
    const grids = await spreadsheetGrids(token, spreadsheetId)
    const found = grids.find((grid) => grid.title.trim().toLowerCase() === wanted)
    if (found) return { spreadsheetId, ...found }
  }
  fail(`تب «${name}» پیدا نشد.`)
}

function boundedRange(title, rows, columns) {
  return `${quote(title)}!A1:${columnLetter(columns)}${Math.max(1, rows)}`
}

async function readSource(token, name) {
  const allowed = new Set(["New Flow", "online", "social"])
  if (!allowed.has(name)) fail("فقط سه تب منبع خوانده می‌شود.")
  let spreadsheetId = SOURCE_ID
  let rangeSpec = `${quote(name)}!A:ZZ`
  if (name === "online" || name === "social") {
    const grid = await locateSourceGrid(token, name)
    spreadsheetId = grid.spreadsheetId
    rangeSpec = boundedRange(grid.title, grid.rows, grid.columns)
  }
  const range = encodeURIComponent(rangeSpec)
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "تب منبع خوانده نشد."
    fail(String(message).slice(0, 300))
  }
  const values = payload.values || []
  if (!values.length) fail(`تب «${name}» خالی است یا پیدا نشد.`)
  return values
}

function isRedCell(format) {
  const rgb = format && format.backgroundColorStyle && format.backgroundColorStyle.rgbColor
    ? format.backgroundColorStyle.rgbColor
    : (format && format.backgroundColor)
  if (!rgb) return false
  const red = Number(rgb.red || 0)
  const green = Number(rgb.green || 0)
  const blue = Number(rgb.blue || 0)
  return red >= 0.88 && green <= 0.82 && blue <= 0.82 && red - green >= 0.15 && red - blue >= 0.15
}

async function readNewFlowDuplicateFlags(token, rowCount) {
  const range = encodeURIComponent(`'New Flow'!J1:M${Math.max(1, rowCount)}`)
  const fields = encodeURIComponent("sheets(data(startRow,startColumn,rowData(values(effectiveFormat(backgroundColor,backgroundColorStyle)))))")
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SOURCE_ID}?includeGridData=true&ranges=${range}&fields=${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "رنگ نام‌های تکراری از New Flow خوانده نشد."
    fail(String(message).slice(0, 300))
  }
  const flags = Array.from({ length: rowCount }, () => ({ fa: false, en: false }))
  for (const sheet of payload.sheets || []) {
    for (const data of sheet.data || []) {
      const firstRow = Number(data.startRow) || 0
      for (const [offset, row] of (data.rowData || []).entries()) {
        const rowIndex = firstRow + offset
        if (rowIndex < 0 || rowIndex >= flags.length) continue
        const cells = row.values || []
        const faCell = cells[0]
        const enCell = cells[3]
        flags[rowIndex] = {
          fa: isRedCell(faCell && faCell.effectiveFormat),
          en: isRedCell(enCell && enCell.effectiveFormat),
        }
      }
    }
  }
  return flags
}

async function readTab(token, name) {
  if (!OUTPUT.includes(name)) fail("فقط پنج تب خروجی خوانده می‌شود.")
  const range = encodeURIComponent(`${quote(name)}!A:ZZ`)
  const data = await sheets(token, "GET", `/values/${range}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`)
  const values = data.values || []
  if (!values.length) fail(`تب «${name}» خالی است یا پیدا نشد.`)
  return values
}

async function sheetMap(token) {
  const data = await sheets(token, "GET", "?fields=sheets.properties(sheetId,title)")
  const out = {}
  for (const sheet of data.sheets || []) {
    const props = sheet.properties || {}
    if (props.title) out[props.title] = props.sheetId
  }
  return out
}

async function putRow(token, name, sheetRow, values) {
  if (!OUTPUT.includes(name)) fail("تب منبع پاک نمی‌شود.")
  const cell = `A${sheetRow}`
  const range = encodeURIComponent(`${quote(name)}!${cell}`)
  await sheets(token, "PUT", `/values/${range}?valueInputOption=RAW`, {
    range: `${quote(name)}!${cell}`,
    majorDimension: "ROWS",
    values: [values],
  })
}

async function appendRow(token, name, values) {
  if (!OUTPUT.includes(name)) fail("تب منبع پاک نمی‌شود.")
  const range = encodeURIComponent(`${quote(name)}!A1`)
  await sheets(token, "POST", `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    range: `${quote(name)}!A1`,
    majorDimension: "ROWS",
    values: [values],
  })
}

async function deleteRows(token, sheetId, indexes) {
  if (!indexes.length) return
  const requests = indexes.slice().sort((a, b) => b - a).map((index) => ({
    deleteDimension: {
      range: { sheetId, dimension: "ROWS", startIndex: index, endIndex: index + 1 },
    },
  }))
  await sheets(token, "POST", ":batchUpdate", { requests })
}

async function clearTab(token, name) {
  if (!OUTPUT.includes(name)) fail("تب منبع پاک نمی‌شود.")
  const range = encodeURIComponent(quote(name))
  await sheets(token, "POST", `/values/${range}:clear`, {})
}

async function appendGrid(token, name, grid) {
  if (!OUTPUT.includes(name) || !grid.length) fail("تب منبع پاک نمی‌شود.")
  const range = encodeURIComponent(`${quote(name)}!A1`)
  await sheets(token, "POST", `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    range: `${quote(name)}!A1`,
    majorDimension: "ROWS",
    values: grid,
  })
}

async function loadContext(token, force = false) {
  if (!force && sourceCache.ctx && Date.now() - sourceCache.at < 15 * 60 * 1000) return sourceCache.ctx
  const [flow, online, social] = await Promise.all([
    readSource(token, "New Flow"),
    readSource(token, "online"),
    readSource(token, "social"),
  ])
  const duplicateFlags = await readNewFlowDuplicateFlags(token, flow.length)
  const ctx = prepareTables(flow, online, social, duplicateFlags)
  sourceCache = { at: Date.now(), ctx }
  return ctx
}

async function writeGrid(token, name, grid) {
  if (!OUTPUT.includes(name) || !grid.length) fail("تب منبع پاک نمی‌شود.")
  const cell = "A1"
  const range = encodeURIComponent(`${quote(name)}!${cell}`)
  await sheets(token, "PUT", `/values/${range}?valueInputOption=RAW`, {
    range: `${quote(name)}!${cell}`,
    majorDimension: "ROWS",
    values: grid,
  })
}

export async function reportView() {
  const token = await accessToken()
  const values = await readTab(token, "general")
  if (!values[0] || values[0][0] !== "شناسه درخواست") fail("تب general سرستون مورد انتظار را ندارد.")
  const rows = values.slice(1)
  let ready = 0
  let rename = 0
  let manual = 0
  let websiteRows = 0
  let websiteReady = 0
  let websiteRename = 0
  let websiteManual = 0
  let onlineMatches = 0
  for (const row of rows) {
    const label = row[7] || ""
    const website = classifyUrl(row[3] || "") === "website"
    if (website) {
      websiteRows += 1
      if (["جور است", "OK"].includes(row[15]) || ["جور است", "OK"].includes(row[17]) || ["جور است", "OK"].includes(row[19])) onlineMatches += 1
    }
    if (label === "آماده فعال\u200cسازی") ready += 1
    else if (label === "فعال\u200cسازی با اسم جدید") rename += 1
    else manual += 1
    if (website && label === "آماده فعال\u200cسازی") websiteReady += 1
    else if (website && label === "فعال\u200cسازی با اسم جدید") websiteRename += 1
    else if (website) websiteManual += 1
  }
  return { ok: true, general: rows.length, ready, rename, manual, websiteRows, websiteReady, websiteRename, websiteManual, onlineMatches, done: 0, rows }
}

export async function saveStore(payload) {
  const contract = String(payload.contract || "").trim()
  const status = String(payload.status || "").trim()
  const mapped = STATUS[status]
  if (!contract || !mapped) fail("تصمیم این فروشگاه ذخیره نشد.")
  const [label, target] = mapped
  const token = await accessToken()
  const general = await readTab(token, "general")
  const hits = general.map((row, index) => (index && row && row[0] === contract ? index : -1)).filter((index) => index >= 0)
  if (hits.length !== 1) fail("این شناسه در تب general یک ردیف مشخص نیست.")
  const index = hits[0]
  const row = general[index].slice()
  while (row.length < 35) row.push("")
  row[7] = label
  row[8] = String(payload.reason || "")
  row[9] = label
  row[10] = String(payload.fa || "")
  row[11] = String(payload.en || "")
  row[12] = status === "نیازمند بررسی دستی" ? "نیازمند بررسی" : "تأیید اپراتور"
  const ref = String(payload.ref || "").trim()
  if (ref) row[14] = ref
  const titles = await sheetMap(token)
  if (!("general" in titles)) fail("تب خروجی پیدا نشد.")
  const names = OUTPUT.slice(1, 4)
  const current = await Promise.all(names.map(async (name) => {
    if (!(name in titles)) fail("تب خروجی پیدا نشد.")
    return [name, await readTab(token, name)]
  }))
  const requests = [{
    updateCells: {
      start: { sheetId: titles.general, rowIndex: index, columnIndex: 0 },
      rows: [{ values: row.map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
      fields: "userEnteredValue",
    },
  }]
  for (const [name, values] of current) {
    const found = values.map((one, at) => (at && one && one[0] === contract ? at : -1)).filter((at) => at >= 0)
    if (name === target) {
      if (found.length) {
        requests.push({
          updateCells: {
            start: { sheetId: titles[name], rowIndex: found[0], columnIndex: 0 },
            rows: [{ values: row.map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
            fields: "userEnteredValue",
          },
        })
        for (const at of found.slice(1).sort((a, b) => b - a)) {
          requests.push({ deleteDimension: { range: { sheetId: titles[name], dimension: "ROWS", startIndex: at, endIndex: at + 1 } } })
        }
      } else {
        requests.push({
          appendCells: {
            sheetId: titles[name],
            rows: [{ values: row.map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
            fields: "userEnteredValue",
          },
        })
      }
    } else {
      for (const at of found.sort((a, b) => b - a)) {
        requests.push({ deleteDimension: { range: { sheetId: titles[name], dimension: "ROWS", startIndex: at, endIndex: at + 1 } } })
      }
    }
  }
  await sheets(token, "POST", ":batchUpdate", { requests })
  return { ok: true, contract, status, tab: target }
}

function reviewProgress(checked, total, stepsDone, steps) {
  const units = total + steps
  const done = checked + stepsDone
  const percent = units === 0 ? 0 : Math.max(0, Math.min(100, Math.floor((done * 100) / units)))
  return {
    checked,
    total,
    percent,
    stage: percent >= 100 ? "complete" : (checked >= total ? "writing" : "checking"),
  }
}

export async function rewriteReport(onProgress, options = {}) {
  const report = typeof onProgress === "function" ? onProgress : () => {}
  const fresh = options.fresh !== false
  const token = await accessToken()
  const ctx = await loadContext(token, true)
  const total = ctx.items.length
  const steps = OUTPUT.length * 2
  let start = 0
  if (fresh) {
    await clearTab(token, "general")
    await writeGrid(token, "general", [HEADERS])
  } else {
    const existing = await readTab(token, "general").catch(() => [])
    if (existing[0] && existing[0][0] === "شناسه درخواست") start = Math.max(0, existing.length - 1)
  }
  if (start > total) start = total
  if (start >= total) {
    return finishReport(token, report, total, steps)
  }
  let checked = start
  let cursor = start
  let nextWrite = start
  const pending = new Map()
  let flushChain = Promise.resolve()
  const deadline = Date.now() + 42000
  report(reviewProgress(checked, total, 0, steps))
  function queueFlush(force) {
    flushChain = flushChain.then(async () => {
      let ready = 0
      while (pending.has(nextWrite + ready)) ready += 1
      if (!ready || (!force && ready < 40)) return
      const take = force ? ready : 40
      const batch = []
      for (let offset = 0; offset < take; offset += 1) batch.push(pending.get(nextWrite + offset))
      await appendGrid(token, "general", batch)
      for (let offset = 0; offset < take; offset += 1) pending.delete(nextWrite + offset)
      nextWrite += take
    })
  }
  async function worker() {
    while (cursor < total && Date.now() < deadline) {
      const index = cursor
      cursor += 1
      const item = ctx.items[index]
      const page = shouldOpen(item, ctx) ? await openShop(safeUrl(item.url)) : null
      pending.set(index, sheetRow(item, decideRow(item, ctx, page)))
      checked += 1
      report(reviewProgress(checked, total, 0, steps))
      queueFlush(false)
    }
  }
  const workers = Math.min(12, total - start)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  queueFlush(true)
  await flushChain
  if (nextWrite < total) {
    const progress = reviewProgress(nextWrite, total, 0, steps)
    return { ok: true, partial: true, general: nextWrite, ready: 0, rename: 0, manual: 0, done: 0, ...progress }
  }
  return finishReport(token, report, total, steps)
}

async function finishReport(token, report, total, steps) {
  const saved = await readTab(token, "general")
  const body = saved.slice(1, total + 1)
  if (body.length < total) {
    const progress = reviewProgress(body.length, total, 0, steps)
    return { ok: true, partial: true, general: body.length, ready: 0, rename: 0, manual: 0, done: 0, ...progress }
  }
  const tables = outputTables(body)
  let stepsDone = 0
  for (const [name, grid] of tables) {
    if (name === "general") {
      stepsDone += 2
      report(reviewProgress(total, total, stepsDone, steps))
      continue
    }
    await clearTab(token, name)
    stepsDone += 1
    report(reviewProgress(total, total, stepsDone, steps))
    await writeGrid(token, name, grid)
    stepsDone += 1
    report(reviewProgress(total, total, stepsDone, steps))
  }
  return { ok: true, done: 0, percent: 100, stage: "complete", ...countsOf(body) }
}
