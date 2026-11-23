import { lookup } from "node:dns/promises"
import http from "node:http"
import https from "node:https"

const DINAMAD_RE = /دی[\s\u200c]*نماد|دینماد|dinamad|d-namad/i
const DIGI_RE = /https?:\/\/(?:www\.)?digikala\.com\/[^"'<>\s]{0,120}/i
const STOP = new Set("و یا از با برای این آن های ها را که یک انواع لوازم محصولات سایر فروشگاه خرید فروش آنلاین صفحه اصلی جدید محصول تومان تخفیف ارسال سبد افزودن علاقه مندی مقایسه بستن مشاهده مشتری امتیاز قیمت تماس ادامه مطلب ویژه عددی قسط سانت راهنما درباره پرداخت سفارش چگونه ورود خانه عضویت قوانین حریم سوالات جستجو حساب است بود".split(" "))
const MAX_REDIRECTS = 3
const MAX_BYTES = 1000000

export function extractEnamadPageUrl(raw) {
  const source = String(raw || "").replace(/\\u0026/gi, "&").replace(/\\\//g, "/").replace(/&amp;/gi, "&")
  const urls = source.match(/(?:https?:)?\/\/(?:www\.)?(?:trustseal\.enamad\.ir|enamad\.ir)\/\?[^"'<>\s]+/gi) || []
  for (const candidate of urls) {
    const clean = (candidate.startsWith("//") ? "https:" + candidate : candidate).replace(/[),;]+$/g, "")
    try {
      const parsed = new URL(clean)
      if (!/(^|\.)enamad\.ir$/i.test(parsed.hostname)) continue
      if (/\/logo\.aspx$/i.test(parsed.pathname)) continue
      if (!parsed.searchParams.has("id")) continue
      return parsed.href
    } catch {}
  }
  return ""
}

function htmlText(bytes, ctype) {
  const type = String(ctype || "")
  const text = new TextDecoder(type.includes("1256") ? "windows-1256" : "utf-8", { fatal: false }).decode(bytes)
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\b[^>]*>|<\/(?:p|div|tr|li|h[1-6]|td|th)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r\f]+/g, " ")
    .replace(/ *\n */g, "\n")
    .slice(0, 20000)
}

function soldWords(text) {
  const words = String(text || "").match(/[\u0600-\u06ff]{3,}/g) || []
  const counts = new Map()
  for (const word of words) {
    if (STOP.has(word)) continue
    counts.set(word, (counts.get(word) || 0) + 1)
  }
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || b.length - a.length).slice(0, 6).join("، ")
}

function holderFromText(text) {
  const lines = String(text || "").replace(/<[^>]+>/g, "\n").replace(/\r/g, "\n").split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean)
  const patterns = [
    /صاحب\s*امتیاز(?:\s*سایت)?\s*[:：]\s*([^\n|<]{2,80})/i,
    /نام\s*صاحب\s*امتیاز\s*[:：]?\s*([^\n|<]{2,80})/i,
    /certificate\s*holder\s*[:：]\s*([^\n|<]{2,80})/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text || "")
    if (!match) continue
    const name = match[1].replace(/\s+/g, " ").replace(/^[\s:|-]+|[\s:|-]+$/g, "")
    if (name && !name.includes("اینماد")) return name.slice(0, 80)
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (!/(?:صاحب\s*امتیاز|دارنده\s*نماد|certificate\s*holder)/i.test(lines[index])) continue
    const inline = lines[index].replace(/.*?(?:صاحب\s*امتیاز|دارنده\s*نماد|certificate\s*holder)\s*[:：-]?\s*/i, "").trim()
    const candidate = inline.length >= 3 ? inline : lines.slice(index + 1, index + 4).find((line) => line.length >= 3 && !/(?:نام|تلفن|نشانی|آدرس|شهر|استان|وضعیت|اعتبار|اینماد|نماد اعتماد)/i.test(line))
    if (candidate && !/(?:اینماد|نماد اعتماد|مشاهده|جزئیات)/i.test(candidate)) return candidate.slice(0, 80)
  }
  const jsonOwner = /["'](?:ownerName|ownerFullName|holderName|certificateHolder|businessOwnerName)["']\s*:\s*["']([^"']{3,80})["']/i.exec(String(text || ""))
  if (jsonOwner) return jsonOwner[1].replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).trim()
  return ""
}

function cityFromText(text) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const direct = /(?:شهرستان|شهر|city|town)\s*(?:[:：-]\s*|\s+)([^,،|;؛\n-]{2,50})/i.exec(line)
    if (direct) {
      const value = direct[1].split(/\s+(?:استان|شهرستان|شهر)\s*/i)[0].trim()
      if (value) return value
    }
  }
  for (const line of lines) {
    const province = /(?:استان|province)\s*(?:[:：-]\s*|\s+)([^,،|;؛\n-]{2,50})/i.exec(line)
    if (province) return province[1].split(/\s+(?:شهرستان|شهر)\s*/i)[0].trim()
  }
  for (const line of lines) {
    if (!/(?:نشانی|آدرس|address|محل فعالیت)/i.test(line)) continue
    const parts = line.split(/\s*[-–—]\s*/).filter(Boolean)
    if (parts.length > 1) return parts[parts.length - 1].trim().replace(/[،,;؛|].*$/, "")
  }
  return ""
}

function informationLinks(raw, baseUrl) {
  const found = []
  const html = String(raw || "")
  const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi
  for (const match of html.matchAll(pattern)) {
    const label = (match[3] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const href = (match[2] || "").replace(/&amp;/gi, "&").trim()
    if (!/(درباره|تماس|قوانین|شرایط|مجوز|نماد|about|contact|terms|policy|license|certificate)/i.test(label + " " + href)) continue
    try {
      const url = allowedPageUrl(new URL(href, baseUrl).href)
      if (!url || new URL(url).hostname !== new URL(baseUrl).hostname) continue
      if (!found.includes(url)) found.push(url)
      if (found.length >= 4) break
    } catch {}
  }
  return found
}

function ipv4Private(a, b, c) {
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true
  return false
}

function privateHost(hostname) {
  let host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "")
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1)
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal" || host === "metadata.goog" || host.endsWith(".internal")) return true
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4) return ipv4Private(Number(v4[1]), Number(v4[2]), Number(v4[3]))
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true
    const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host)
    if (dotted) {
      const parts = dotted[1].split(".").map(Number)
      return ipv4Private(parts[0], parts[1], parts[2])
    }
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host)
    if (mapped) {
      const hi = parseInt(mapped[1], 16)
      const lo = parseInt(mapped[2], 16)
      return ipv4Private((hi >> 8) & 255, hi & 255, (lo >> 8) & 255)
    }
    const head = parseInt(host.split(":")[0] || "0", 16)
    if ((head & 0xfe00) === 0xfc00) return true
    if ((head & 0xffc0) === 0xfe80) return true
    return false
  }
  return false
}

export function allowedPageUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return ""
  }
  if (parsed.username || parsed.password) return ""
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
  if (parsed.port && parsed.port !== (parsed.protocol === "https:" ? "443" : "80")) return ""
  if (privateHost(parsed.hostname)) return ""
  return parsed.href
}

async function requestPublicPage(url, timeoutMs) {
  const parsed = new URL(url)
  const lookupHost = parsed.hostname.replace(/^\[|\]$/g, "")
  const addresses = await lookup(lookupHost, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => privateHost(address))) {
    throw new Error("لینک سایت قابل باز شدن نیست.")
  }
  const transport = parsed.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    let settled = false
    let size = 0
    const chunks = []
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback(value)
    }
    const pinnedLookup = (hostname, options, callback) => {
      if (hostname.toLowerCase() !== lookupHost.toLowerCase()) {
        callback(new Error("مقصد لینک تغییر کرد."))
        return
      }
      const matching = addresses.filter((entry) => !options.family || entry.family === options.family)
      if (!matching.length) {
        callback(new Error("لینک سایت قابل باز شدن نیست."))
        return
      }
      if (options.all) callback(null, matching)
      else callback(null, matching[0].address, matching[0].family)
    }
    const request = transport.request(parsed, {
      method: "GET",
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html,application/xhtml+xml" },
      lookup: pinnedLookup,
    }, (response) => {
      const status = response.statusCode || 0
      const headers = response.headers
      if ((status >= 300 && status < 400) || !status || status >= 400) {
        response.on("error", () => {})
        response.destroy()
        finish(resolve, { status, ok: false, headers, bytes: new Uint8Array() })
        return
      }
      response.on("data", (chunk) => {
        const take = Math.min(chunk.length, MAX_BYTES - size)
        if (take > 0) {
          chunks.push(chunk.subarray(0, take))
          size += take
        }
        if (size >= MAX_BYTES) {
          response.on("error", () => {})
          response.destroy()
          finish(resolve, { status, ok: status >= 200 && status < 300, headers, bytes: Buffer.concat(chunks, size) })
        }
      })
      response.on("end", () => finish(resolve, { status, ok: status >= 200 && status < 300, headers, bytes: Buffer.concat(chunks, size) }))
      response.on("error", (error) => finish(reject, error))
    })
    const timer = setTimeout(() => {
      const error = new Error("request timeout")
      error.name = "AbortError"
      request.destroy(error)
      finish(reject, error)
    }, timeoutMs)
    request.on("error", (error) => finish(reject, error))
    request.end()
  })
}

async function fetchPage(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let current = allowedPageUrl(url)
  try {
    if (!current) return { ok: false, url, ctype: "", raw: "", text: "", error: "لینک سایت قابل باز شدن نیست." }
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw Object.assign(new Error("request timeout"), { name: "AbortError" })
      const response = await requestPublicPage(current, remaining)
      const landed = allowedPageUrl(current)
      if (!landed) {
        return { ok: false, url: current, ctype: "", raw: "", text: "", error: "لینک سایت قابل باز شدن نیست." }
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location
        if (!location || hop === MAX_REDIRECTS) return { ok: false, url: landed, ctype: "", raw: "", text: "", error: "باز نشد" }
        let next = ""
        try {
          next = allowedPageUrl(new URL(location, landed).href)
        } catch {
          next = ""
        }
        if (!next) return { ok: false, url: location, ctype: "", raw: "", text: "", error: "لینک سایت قابل باز شدن نیست." }
        current = next
        continue
      }
      if (!response.ok) {
        return { ok: false, url: landed, ctype: "", raw: "", text: "", error: "پاسخ " + response.status }
      }
      const bytes = response.bytes
      const ctype = response.headers["content-type"] || ""
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
      return { ok: true, url: landed, ctype, raw, text: htmlText(bytes, ctype), error: "" }
    }
    return { ok: false, url: current, ctype: "", raw: "", text: "", error: "باز نشد" }
  } catch (error) {
    let message = "خطای اتصال"
    if (error && error.name === "AbortError") message = "زمان اتصال تمام شد"
    else if (error && error.code === "ENOTFOUND") message = "نام دامنه پیدا نشد (DNS)"
    else if (error && error.code === "EAI_AGAIN") message = "پاسخ DNS موقتاً در دسترس نبود"
    else if (error && error.code === "ECONNREFUSED") message = "اتصال از طرف سایت رد شد"
    else if (error && error.code === "CERT_HAS_EXPIRED") message = "گواهی امنیتی سایت منقضی شده"
    else if (error && (error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || error.code === "ERR_TLS_CERT_ALTNAME_INVALID")) message = "گواهی امنیتی سایت قابل تأیید نبود"
    else if (error && error.code === "ECONNRESET") message = "ارتباط هنگام باز کردن قطع شد"
    else if (error && (error.code === "ETIMEDOUT" || error.code === "EHOSTUNREACH")) message = "سایت در زمان مجاز پاسخ نداد"
    return { ok: false, url: current || url, ctype: "", raw: "", text: "", error: message }
  } finally {
    // Each request shares the same overall deadline across redirects.
  }
}

export async function openShop(url) {
  if (!url) {
    return { opened: false, error: "لینک سایت قابل باز شدن نیست.", certificateError: "", holder: "", city: "", certificate: "", text: "", sold: "", enamadUnread: false }
  }
  const page = await fetchPage(url, 8000)
  const result = {
    opened: false,
    error: page.ok ? "" : "سایت باز نشد: " + (page.error || "خطای اتصال"),
    certificateError: "",
    holder: "",
    city: "",
    certificate: "",
    text: "",
    sold: "",
    enamadUnread: false,
  }
  if (!page.ok) return result
  result.opened = true
  result.error = ""
  let siteRaw = page.raw || ""
  let siteText = page.text || ""
  let enamadUrl = extractEnamadPageUrl(siteRaw) || extractEnamadPageUrl(siteText)
  if (!enamadUrl) {
    const pages = await Promise.all(informationLinks(page.raw, page.url).map((link) => fetchPage(link, 5000)))
    for (const info of pages) {
      if (!info.ok) continue
      siteRaw += "\n" + info.raw
      siteText += "\n" + info.text
      enamadUrl = extractEnamadPageUrl(info.raw) || extractEnamadPageUrl(info.text)
      if (enamadUrl) break
    }
  }
  result.text = siteText.slice(0, 20000)
  result.sold = soldWords(result.text)
  const enamad = enamadUrl ? [enamadUrl] : null
  const dinamad = DINAMAD_RE.exec(siteRaw) || DINAMAD_RE.exec(result.text)
  if (enamad) {
    result.certificate = "enamad"
    const seal = await fetchPage(enamad[0].replace(/&amp;/g, "&"), 8000)
    if (seal.ok) {
      const sealText = seal.text || htmlText(new TextEncoder().encode(seal.raw || ""), seal.ctype)
      result.holder = holderFromText(sealText) || holderFromText(seal.raw || "")
      result.city = cityFromText(sealText) || cityFromText(seal.raw || "")
      if (!result.holder) result.certificateError = "صفحهٔ اینماد باز شد، اما نام صاحب امتیاز از آن خوانده نشد."
    } else {
      result.certificateError = "اینماد باز نشد: " + (seal.error || "خطای اتصال") + (seal.url ? " (" + seal.url + ")" : "")
    }
    if (!result.holder) result.enamadUnread = true
    return result
  }
  if (dinamad) {
    result.certificate = "dinamad"
    const digi = DIGI_RE.exec(siteRaw)
    if (digi) {
      const extra = await fetchPage(digi[0].replace(/&amp;/g, "&"), 8000)
      if (extra.ok) {
        const extraText = extra.text || ""
        result.holder = holderFromText(extraText)
        result.city = cityFromText(extraText)
        result.text = (result.text + " " + extraText).slice(0, 20000)
        result.sold = soldWords(result.text) || result.sold
        if (!result.holder) result.certificateError = "صفحهٔ دی‌نماد باز شد، اما نام صاحب امتیاز از آن خوانده نشد."
      } else result.certificateError = "دی‌نماد باز نشد: " + (extra.error || "خطای اتصال")
    } else {
      result.holder = holderFromText(result.text)
      result.city = cityFromText(result.text)
      if (!result.holder) result.certificateError = "صفحهٔ دی‌نماد در سایت پیدا شد، اما اطلاعات صاحب امتیاز خوانده نشد."
    }
    if (!result.holder) result.enamadUnread = true
    return result
  }
  result.certificateError = "سایت باز شد، اما لینک اینماد در آن پیدا نشد."
  result.enamadUnread = true
  return result
}

