import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { FILTER_N, HEADERS, OUTPUT_SCHEMAS, classifyUrl, countsOf, decideRow, outputTables, prepareTables, safeUrl, sheetRow, shouldOpen } from "./classify.js"
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
let outputSchemaReady = false

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

function canonicalOutputRow(header, row) {
  const positions = new Map()
  for (let index = 0; index < header.length; index += 1) {
    const name = String(header[index] || "").trim()
    if (name && !positions.has(name)) positions.set(name, index)
  }
  const canonical = HEADERS.map((name) => {
    const index = positions.get(name)
    return index == null ? "" : String(row[index] ?? "")
  })
  if (!canonical[7] && canonical[9]) canonical[7] = canonical[9]
  if (!canonical[10] && canonical[1]) canonical[10] = canonical[1]
  return canonical
}

function projectOutputRow(row, name) {
  return OUTPUT_SCHEMAS[name].map((header) => {
    const index = HEADERS.indexOf(header)
    return index < 0 ? "" : String(row[index] ?? "")
  })
}

function sourceIsReviewed(row) {
  return String(row && row[13] || "").trim() === FILTER_N && String(row && row[15] || "").trim() !== ""
}

async function purgeContractsFromOutputs(token, contracts) {
  if (!contracts.size) return
  const [titles, tabs] = await Promise.all([
    sheetMap(token),
    Promise.all(OUTPUT.map(async (name) => [name, await readTab(token, name)])),
  ])
  const requests = []
  for (const [name, values] of tabs) {
    const idIndex = (values[0] || []).indexOf("شناسه درخواست")
    if (idIndex < 0) continue
    const rows = values.map((row, index) => index > 0 && contracts.has(String(row[idIndex] || "").trim()) ? index : -1).filter((index) => index >= 0).sort((a, b) => b - a)
    for (const index of rows) requests.push({ deleteDimension: { range: { sheetId: titles[name], dimension: "ROWS", startIndex: index, endIndex: index + 1 } } })
  }
  if (requests.length) await sheets(token, "POST", ":batchUpdate", { requests })
}

async function resetOutputTabs(token) {
  await Promise.all(OUTPUT.map((name) => clearTab(token, name)))
  await Promise.all(OUTPUT.map((name) => writeGrid(token, name, [OUTPUT_SCHEMAS[name]])))
}

function outputColor(name) {
  if (name === OUTPUT[1]) return { red: 0.09, green: 0.48, blue: 0.25 }
  if (name === OUTPUT[2]) return { red: 0.02, green: 0.39, blue: 0.73 }
  if (name === OUTPUT[3]) return { red: 0.94, green: 0.72, blue: 0.12 }
  if (name === OUTPUT[4]) return { red: 0.31, green: 0.40, blue: 0.54 }
  return { red: 0.02, green: 0.48, blue: 0.88 }
}

function columnWidth(header) {
  if (header === "شناسه درخواست") return 145
  if (["سایت", "لینک", "مرجع تطبیق"].includes(header)) return 230
  if (["دلیل پیشنهاد", "توضیح لینک", "توضیح کد ملی", "توضیح موبایل", "توضیح نام فارسی", "توضیح نام انگلیسی", "توضیح نام صاحب امتیاز", "توضیح نام خانوادگی", "توضیح گواهی", "توضیح دسته", "توضیح زیردسته", "توضیح شهر شعبه"].includes(header)) return 320
  if (header.includes("پیشنهاد نام") || header.includes("قابل فعال")) return 215
  if (["نام فارسی اصلی", "نام انگلیسی اصلی", "نام فارسی فروشگاه", "نام انگلیسی فروشگاه", "نام صاحب امتیاز", "نام خانوادگی صاحب امتیاز"].includes(header)) return 190
  return 150
}

async function formatOutputTabs(token, grids, titles) {
  const requests = []
  for (const name of OUTPUT) {
    const sheetId = titles[name]
    const schema = OUTPUT_SCHEMAS[name]
    const visibleCount = name === "general" ? 18 : (name === OUTPUT[1] ? 13 : name === OUTPUT[2] ? 13 : name === OUTPUT[3] ? 11 : 12)
    const grid = grids.find((item) => item.title === name)
    if (!grid || sheetId == null) continue
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 },
          tabColorStyle: { rgbColor: outputColor(name) },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount,tabColorStyle",
      },
    })
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: schema.length },
        cell: { userEnteredFormat: {
          backgroundColor: { red: 0.02, green: 0.43, blue: 0.79 },
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
        } },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)",
      },
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 42 },
        fields: "pixelSize",
      },
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: Math.min(visibleCount, schema.length) },
        properties: { hiddenByUser: false },
        fields: "hiddenByUser",
      },
    })
    if (visibleCount < grid.columns) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: visibleCount, endIndex: grid.columns },
          properties: { hiddenByUser: true },
          fields: "hiddenByUser",
        },
      })
    }
    for (let index = 0; index < Math.min(visibleCount, schema.length); index += 1) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
          properties: { pixelSize: columnWidth(schema[index]) },
          fields: "pixelSize",
        },
      })
    }
  }
  if (requests.length) await sheets(token, "POST", ":batchUpdate", { requests })
}

async function ensureOutputColumns(token) {
  if (outputSchemaReady) return
  const [grids, titles] = await Promise.all([spreadsheetGrids(token, REPORT_ID), sheetMap(token)])
  const requiredWidth = Math.max(...Object.values(OUTPUT_SCHEMAS).map((headers) => headers.length))
  const requests = []
  for (const name of OUTPUT) {
    const grid = grids.find((item) => item.title === name)
    if (!grid || !(name in titles)) fail("تب خروجی پیدا نشد.")
    if (grid.columns < requiredWidth) {
      requests.push({
        appendDimension: {
          sheetId: titles[name],
          dimension: "COLUMNS",
          length: requiredWidth - grid.columns,
        },
      })
    }
  }
  if (requests.length) await sheets(token, "POST", ":batchUpdate", { requests })
  for (const grid of grids) grid.columns = Math.max(grid.columns, requiredWidth)

  const current = await Promise.all(OUTPUT.map(async (name) => [name, await readTab(token, name)]))
  const currentByName = new Map(current)
  for (const name of OUTPUT) {
    const values = currentByName.get(name) || []
    const schema = OUTPUT_SCHEMAS[name]
    const oldHeader = values[0] || []
    if (oldHeader.length === schema.length && schema.every((header, index) => String(oldHeader[index] || "").trim() === header)) continue
    const canonicalRows = values.slice(1).map((row) => canonicalOutputRow(oldHeader, row))
    const grid = [schema, ...canonicalRows.map((row) => projectOutputRow(row, name))]
    await clearTab(token, name)
    await writeGrid(token, name, grid)
  }
  await formatOutputTabs(token, grids, titles)
  outputSchemaReady = true
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

export async function reportView(options = {}) {
  const token = await accessToken()
  await ensureOutputColumns(token)
  const [values, newFlow] = await Promise.all([
    readTab(token, "general"),
    readSource(token, "New Flow"),
  ])
  if (!values[0] || !values[0].includes("شناسه درخواست")) fail("تب general سرستون مورد انتظار را ندارد.")
  const outputHeader = values[0]
  const sourceHeaders = newFlow[0] || []
  function sourceColumn(index) {
    let value = index + 1
    let label = ""
    while (value > 0) {
      const remainder = (value - 1) % 26
      label = String.fromCharCode(65 + remainder) + label
      value = Math.floor((value - 1) / 26)
    }
    return label
  }
  const newFlowByContract = new Map()
  const reviewedSourceRows = []
  const reviewedContracts = new Set()
  for (const sourceRow of newFlow.slice(1)) {
    const contract = String(sourceRow[0] || "").trim()
    if (sourceIsReviewed(sourceRow)) {
      reviewedSourceRows.push(sourceRow)
      if (contract) reviewedContracts.add(contract)
    }
    if (!contract) continue
    const matches = newFlowByContract.get(contract) || []
    matches.push({
      fa: String(sourceRow[1] || ""),
      en: String(sourceRow[2] || ""),
      sub: String(sourceRow[4] || ""),
      branch: String(sourceRow[6] || ""),
      ownerId: String(sourceRow[16] || ""),
      raw: sourceRow.map((value, index) => ({
        column: sourceColumn(index),
        label: String(sourceHeaders[index] || "").trim(),
        value: String(value || "").trim(),
      })).filter((field) => field.value),
    })
    newFlowByContract.set(contract, matches)
  }
  if (options.pruneReviewed) await purgeContractsFromOutputs(token, reviewedContracts)
  const occurrenceByContract = new Map()
  const newFlowDetails = []
  const storedRows = values.slice(1).map((outputRow) => canonicalOutputRow(outputHeader, outputRow)).filter((row) => !reviewedContracts.has(String(row[0] || "").trim()))
  const rows = storedRows.map((sourceRow) => {
    const contract = String(sourceRow[0] || "").trim()
    const matches = newFlowByContract.get(contract) || []
    const occurrence = occurrenceByContract.get(contract) || 0
    const details = matches[occurrence] || matches[0] || { fa: "", en: "", sub: "", branch: "", ownerId: "", raw: [] }
    occurrenceByContract.set(contract, occurrence + 1)
    newFlowDetails.push(details.raw || [])
    const row = sourceRow.slice()
    if (details.fa) row[1] = details.fa
    row[10] = details.fa || row[1] || ""
    row[11] = details.en || row[11] || ""
    row[42] = details.sub
    row[43] = details.branch
    row[44] = details.ownerId
    return row
  })
  const reportContracts = new Set(rows.map((row) => String(row[0] || "").trim()).filter(Boolean))
  for (const sourceRow of reviewedSourceRows) {
    const contract = String(sourceRow[0] || "").trim()
    if (!contract || reportContracts.has(contract)) continue
    const row = Array(45).fill("")
    row[0] = contract
    row[1] = String(sourceRow[1] || "")
    row[2] = String(sourceRow[3] || "")
    row[3] = String(sourceRow[14] || "")
    row[4] = [String(sourceRow[18] || ""), String(sourceRow[19] || "")].filter(Boolean).join(" ")
    row[5] = String(sourceRow[17] || "")
    row[10] = String(sourceRow[1] || "")
    row[11] = String(sourceRow[2] || "")
    row[42] = String(sourceRow[4] || "")
    row[43] = String(sourceRow[6] || "")
    row[44] = String(sourceRow[16] || "")
    rows.push(row)
    newFlowDetails.push(sourceRow.map((value, index) => ({
      column: sourceColumn(index), label: String(sourceHeaders[index] || "").trim(), value: String(value || "").trim(),
    })).filter((field) => field.value))
    reportContracts.add(contract)
  }
  let ready = 0
  let rename = 0
  let manual = 0
  let websiteRows = 0
  let websiteReady = 0
  let websiteRename = 0
  let websiteManual = 0
  let onlineMatches = 0
  for (const row of rows) {
    if (reviewedContracts.has(String(row[0] || "").trim())) continue
    const label = row[7] || ""
    const renameLabel = label === "فعال\u200cسازی با اسم جدید" || label === "نیاز به تغییر نام"
    const website = classifyUrl(row[3] || "") === "website"
    if (website) {
      websiteRows += 1
      if (["جور است", "OK"].includes(row[15]) || ["جور است", "OK"].includes(row[17]) || ["جور است", "OK"].includes(row[19])) onlineMatches += 1
    }
    if (label === "آماده فعال\u200cسازی") ready += 1
    else if (renameLabel) rename += 1
    else manual += 1
    if (website && label === "آماده فعال\u200cسازی") websiteReady += 1
    else if (website && renameLabel) websiteRename += 1
    else if (website) websiteManual += 1
  }
  return { ok: true, general: rows.length, ready, rename, manual, websiteRows, websiteReady, websiteRename, websiteManual, onlineMatches, reviewedCount: reviewedSourceRows.length, done: 0, rows, newFlowDetails }
}

export async function refreshSuggestedNames() {
  const token = await accessToken()
  await ensureOutputColumns(token)
  const ctx = await loadContext(token, true)
  const report = await readTab(token, "general")
  if (!report[0] || !report[0].includes("شناسه درخواست")) fail("تب general سرستون مورد انتظار را ندارد.")
  const faIndex = OUTPUT_SCHEMAS.general.indexOf("پیشنهاد نام فارسی")
  const enIndex = OUTPUT_SCHEMAS.general.indexOf("پیشنهاد نام انگلیسی")
  if (faIndex < 0 || enIndex < 0) fail("ستون‌های پیشنهاد نام در گزارش پیدا نشدند.")

  const candidatesByContract = new Map()
  for (const item of ctx.nameSuggestions || ctx.items) {
    const key = String(item.contract || "").trim()
    const candidates = candidatesByContract.get(key) || []
    candidates.push(item)
    candidatesByContract.set(key, candidates)
  }
  const usedByContract = new Map()
  const canonicalRows = report.slice(1).map((row) => canonicalOutputRow(report[0], row))
  const suggestions = canonicalRows.map((row) => {
    const key = String(row[0] || "").trim()
    const candidates = candidatesByContract.get(key) || []
    const occurrence = usedByContract.get(key) || 0
    usedByContract.set(key, occurrence + 1)
    const item = candidates[occurrence] || candidates[0]
    if (row[7] !== "فعال‌سازی با اسم جدید") return ["", ""]
    if (!item) return [row[HEADERS.indexOf("پیشنهاد نام فارسی")] || "", row[HEADERS.indexOf("پیشنهاد نام انگلیسی")] || ""]
    return [item.suggestionFa || "", item.suggestionEn || ""]
  })
  if (suggestions.length) {
    const startColumn = Math.min(faIndex, enIndex)
    const endColumn = Math.max(faIndex, enIndex)
    if (endColumn !== startColumn + 1) fail("ستون‌های پیشنهاد نام کنار هم نیستند.")
    const columnName = (number) => {
      let n = number + 1
      let label = ""
      while (n > 0) {
        const remainder = (n - 1) % 26
        label = String.fromCharCode(65 + remainder) + label
        n = Math.floor((n - 1) / 26)
      }
      return label
    }
    const range = `${quote("general")}!${columnName(startColumn)}2:${columnName(endColumn)}${suggestions.length + 1}`
    await sheets(token, "PUT", `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      range,
      majorDimension: "ROWS",
      values: suggestions.map((pair) => startColumn === faIndex ? pair : pair.slice().reverse()),
    })
  }
  const refreshed = await readTab(token, "general")
  const refreshedRows = refreshed.slice(1).map((row) => canonicalOutputRow(refreshed[0], row))
  const renameRows = refreshedRows.filter((row) => row[7] === "فعال‌سازی با اسم جدید")
  const renameGrid = [OUTPUT_SCHEMAS[OUTPUT[2]], ...renameRows.map((row) => projectOutputRow(row, OUTPUT[2]))]
  await clearTab(token, OUTPUT[2])
  await writeGrid(token, OUTPUT[2], renameGrid)
  return { ok: true, updated: suggestions.filter((pair) => pair.some(Boolean)).length, rename: renameRows.length }
}

export async function saveStore(payload) {
  const contract = String(payload.contract || "").trim()
  const status = String(payload.status || "").trim()
  const mapped = STATUS[status]
  if (!contract || !mapped) fail("تصمیم این فروشگاه ذخیره نشد.")
  const [label, target] = mapped
  const token = await accessToken()
  await ensureOutputColumns(token)
  if (payload.reviewed) {
    await purgeContractsFromOutputs(token, new Set([contract]))
    return { ok: true, contract, status, tab: "اپلیکیشن" }
  }
  const general = await readTab(token, "general")
  const generalIdIndex = general[0].indexOf("شناسه درخواست")
  const hits = general.map((row, index) => (index && row && String(row[generalIdIndex] || "").trim() === contract ? index : -1)).filter((index) => index >= 0)
  if (hits.length !== 1) fail("این شناسه در تب general یک ردیف مشخص نیست.")
  const index = hits[0]
  const row = canonicalOutputRow(general[0], general[index])
  row[7] = label
  row[8] = String(payload.reason || "")
  row[9] = label
  row[10] = String(payload.originalFa || row[1] || "")
  row[11] = String(payload.originalEn || row[11] || "")
  row[37] = status === "نیاز به تغییر نام" ? String(payload.fa || "") : ""
  row[38] = status === "نیاز به تغییر نام" ? String(payload.en || "") : ""
  row[39] = status === "آماده فعال‌سازی" ? String(payload.activationFa || row[39] || "") : ""
  row[40] = status === "آماده فعال‌سازی" ? String(payload.activationEn || row[40] || "") : ""
  row[12] = status === "نیازمند بررسی دستی" ? "نیازمند بررسی" : "تأیید اپراتور"
  const ref = String(payload.ref || "").trim()
  if (ref) row[14] = ref
  const generalTabRow = projectOutputRow(row, "general")
  const statusTabRow = projectOutputRow(row, target)
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
      rows: [{ values: generalTabRow.map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
      fields: "userEnteredValue",
    },
  }]
  for (const [name, values] of current) {
    const idIndex = values[0].indexOf("شناسه درخواست")
    const found = values.map((one, at) => (at && one && String(one[idIndex] || "").trim() === contract ? at : -1)).filter((at) => at >= 0)
    if (name === target) {
      if (found.length) {
        requests.push({
          updateCells: {
            start: { sheetId: titles[name], rowIndex: found[0], columnIndex: 0 },
            rows: [{ values: statusTabRow.map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
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
            rows: [{ values: statusTabRow.map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
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

export async function reviewOne(contractValue) {
  const contract = String(contractValue || "").trim()
  if (!contract) fail("ردیف مشخص نشد؛ کد قرارداد خالی است.")
  const token = await accessToken()
  await ensureOutputColumns(token)
  const ctx = await loadContext(token, true)
  const matches = ctx.items.filter((item) => String(item.contract || "").trim() === contract)
  if (matches.length !== 1) fail("این کد قرارداد در New Flow باید دقیقاً یک ردیف داشته باشد.")
  const item = matches[0]
  const page = shouldOpen(item) ? await openShop(safeUrl(item.url)) : null
  const decision = decideRow(item, ctx, page)
  const row = sheetRow(item, decision)
  const statusInfo = decision.status === "ready"
    ? ["آماده فعال‌سازی", OUTPUT[1]]
    : decision.status === "rename"
      ? ["نیاز به تغییر نام", OUTPUT[2]]
      : ["نیازمند بررسی دستی", OUTPUT[3]]

  const general = await readTab(token, "general")
  const generalIdIndex = general[0].indexOf("شناسه درخواست")
  const hits = general.map((one, index) => (index && one && String(one[generalIdIndex] || "").trim() === contract ? index : -1)).filter((index) => index >= 0)
  if (hits.length !== 1) fail("این شناسه در تب general یک ردیف مشخص نیست.")
  const index = hits[0]
  const titles = await sheetMap(token)
  const names = OUTPUT.slice(1, 4)
  if (!("general" in titles)) fail("تب خروجی پیدا نشد.")
  const current = await Promise.all(names.map(async (name) => {
    if (!(name in titles)) fail("تب خروجی پیدا نشد.")
    return [name, await readTab(token, name)]
  }))
  const requests = [{
    updateCells: {
      start: { sheetId: titles.general, rowIndex: index, columnIndex: 0 },
      rows: [{ values: projectOutputRow(row, "general").map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
      fields: "userEnteredValue",
    },
  }]
  for (const [name, values] of current) {
    const idIndex = values[0].indexOf("شناسه درخواست")
    const found = values.map((one, at) => (at && one && String(one[idIndex] || "").trim() === contract ? at : -1)).filter((at) => at >= 0)
    if (name === statusInfo[1]) {
      if (found.length) {
        requests.push({
          updateCells: {
            start: { sheetId: titles[name], rowIndex: found[0], columnIndex: 0 },
            rows: [{ values: projectOutputRow(row, statusInfo[1]).map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
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
            rows: [{ values: projectOutputRow(row, statusInfo[1]).map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) }],
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
  return { ok: true, contract, status: statusInfo[0], tab: statusInfo[1], reason: decision.reason || "", opened: Boolean(page && page.opened) }
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
  await ensureOutputColumns(token)
  const ctx = await loadContext(token, true)
  const total = ctx.items.length
  const steps = OUTPUT.length * 2
  let start = 0
  if (fresh) {
    await resetOutputTabs(token)
  } else {
    const existing = await readTab(token, "general").catch(() => [])
    if (existing[0] && existing[0].includes("شناسه درخواست")) start = Math.max(0, existing.length - 1)
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
      await appendGrid(token, "general", batch.map((row) => projectOutputRow(row, "general")))
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
  const body = saved.slice(1, total + 1).map((row) => canonicalOutputRow(saved[0], row))
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
