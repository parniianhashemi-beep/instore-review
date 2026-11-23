import { lookup } from "node:dns/promises"
import http from "node:http"
import https from "node:https"

const DINAMAD_RE = /دی[\s\u200c]*نماد|دینماد|dinamad|d-namad/i
const DIGI_RE = /https?:\/\/(?:www\.)?digikala\.com\/[^"'<>\s]{0,120}/i
const STOP = new Set("و یا از با برای این آن های ها را که یک انواع لوازم محصولات سایر فروشگاه خرید فروش آنلاین صفحه اصلی جدید محصول تومان تخفیف ارسال سبد افزودن علاقه مندی مقایسه بستن مشاهده مشتری امتیاز قیمت تماس ادامه مطلب ویژه عددی قسط سانت راهنما درباره پرداخت سفارش چگونه ورود خانه عضویت قوانین حریم سوالات جستجو حساب است بود".split(" "))
const MAX_REDIRECTS = 3
const MAX_BYTES = 1000000
const ENAMAD_CACHE_MS = 60000
const enamadCache = new Map()

function decodeEmbedded(value) {
  return String(value || "")
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
}

function normalizedDomain(value) {
  const text = decodeEmbedded(value).trim()
  if (!text) return ""
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : "https://" + text)
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "")
  } catch {
    return ""
  }
}

export function extractEnamadPageUrl(raw) {
  const source = decodeEmbedded(raw)
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

function structuredPageText(raw) {
  const source = decodeEmbedded(raw)
  const parts = []
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(source)
  if (title) parts.push(title[1].replace(/<[^>]+>/g, " ").trim())
  const metaPattern = /<meta\b[^>]*>/gi
  for (const match of source.matchAll(metaPattern)) {
    const tag = match[0]
    const name = /\b(?:name|property)\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] || ""
    if (!/(?:description|keywords|og:title|og:description|product:category)/i.test(name)) continue
    const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]
    if (content) parts.push(content)
  }
  function collect(value, key, depth) {
    if (parts.length >= 120 || depth > 10 || value == null) return
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, key, depth + 1)
      return
    }
    if (typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) collect(child, childKey, depth + 1)
      return
    }
    if (typeof value !== "string" || !/(?:name|description|category|title|product|brand|text|headline|itemlist|offers)/i.test(key)) return
    const text = value.replace(/\s+/g, " ").trim()
    if (text.length >= 2 && text.length <= 500) parts.push(text)
  }
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  for (const match of source.matchAll(scriptPattern)) {
    const attrs = match[1] || ""
    if (!/(?:application\/ld\+json|__NEXT_DATA__|__NUXT__|application\/json)/i.test(attrs)) continue
    try {
      collect(JSON.parse(match[2]), "", 0)
    } catch {}
    if (parts.length >= 120) break
  }
  return parts.map(decodeEmbedded).join(" ").slice(0, 10000)
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

function productLinks(raw, baseUrl) {
  const found = []
  const base = new URL(baseUrl)
  const html = String(raw || "")
  const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi
  for (const match of html.matchAll(pattern)) {
    const label = decodeEmbedded((match[3] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    const href = decodeEmbedded(match[2] || "").trim()
    if (!/(محصول|کالا|فروشگاه|دسته|shop|products?|catalog|categories?|collections?)/i.test(label + " " + href)) continue
    try {
      const url = allowedPageUrl(new URL(href, base).href)
      if (!url) continue
      const parsed = new URL(url)
      if (parsed.hostname.replace(/^www\./i, "") !== base.hostname.replace(/^www\./i, "")) continue
      if (parsed.pathname === "/" && !parsed.search) continue
      if (!found.includes(url)) found.push(url)
      if (found.length >= 3) break
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

function safeReferer(value) {
  const safe = allowedPageUrl(value)
  if (!safe) return ""
  try {
    return new URL(safe).origin + "/"
  } catch {
    return ""
  }
}

async function requestPublicPage(url, timeoutMs, options = {}) {
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
      method: options.method || "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "fa,en;q=0.8",
        ...(options.body ? { "content-length": Buffer.byteLength(options.body) } : {}),
        ...(options.headers || {}),
      },
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
    request.end(options.body || undefined)
  })
}

function responseText(response) {
  const charset = /1256/i.test(response.headers["content-type"] || "") ? "windows-1256" : "utf-8"
  return new TextDecoder(charset, { fatal: false }).decode(response.bytes || new Uint8Array())
}

function profileFacts(raw) {
  const source = decodeEmbedded(raw)
  const text = htmlText(new TextEncoder().encode(source), "utf-8")
  const lines = text.replace(/\u00a0/g, " ").split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const owner = holderFromText(text) || holderFromText(source)
  let domain = ""
  const ownerIndex = lines.findIndex((line) => /صاحب\s*امتیاز/i.test(line))
  if (ownerIndex >= 0) {
    for (let index = ownerIndex - 1; index >= Math.max(0, ownerIndex - 5); index -= 1) {
      const candidate = lines[index].replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").trim()
      if (/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}\.)+[\p{L}\p{N}-]{2,}$/u.test(candidate)) {
        domain = normalizedDomain(candidate)
        break
      }
    }
  }
  const labelledDomain = /(?:نشانی\s*(?:وب.?سایت|دامنه)|آدرس\s*(?:وب.?سایت|سایت|دامنه)|نام\s*دامنه|دامنه(?:\s*سایت)?|website|domain(?:\s*name)?)\s*[:：-]\s*((?:https?:\/\/)?(?:www\.)?[\p{L}\p{N}.-]+\.[\p{L}\p{N}-]+)/iu.exec(text)
  if (!domain && labelledDomain) domain = normalizedDomain(labelledDomain[1])
  const activities = []
  const rows = source.match(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi) || []
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((match) =>
      decodeEmbedded(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
    )
    if (cells.length >= 7 && /^تایید/.test(cells[cells.length - 1]) && cells[1]) activities.push(cells[1])
  }
  return { text, owner, domain, city: cityFromText(text), activities }
}

async function lookupEnamad(domain) {
  const target = normalizedDomain(domain)
  if (!target) return { found: null, error: "دامنه برای استعلام اینماد معتبر نیست." }
  try {
    let cookie = ""
    try {
      const home = await requestPublicPage("https://enamad.ir/", 5000)
      const setCookie = home.headers["set-cookie"] || []
      cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
        .map((value) => String(value).split(";")[0])
        .filter(Boolean)
        .join("; ")
    } catch {}
    const apiHeaders = {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://enamad.ir",
      referer: "https://enamad.ir/",
      "x-requested-with": "XMLHttpRequest",
      ...(cookie ? { cookie } : {}),
    }
    const response = await requestPublicPage("https://enamad.ir/Home/GetData", 7000, {
      method: "POST",
      headers: apiHeaders,
      body: new URLSearchParams({ domain: target }).toString(),
    })
    if (response.status !== 200 || !/json/i.test(response.headers["content-type"] || "")) {
      return { found: null, error: "پاسخ استعلام رسمی اینماد معتبر نبود." }
    }
    let data
    try {
      data = JSON.parse(responseText(response))
    } catch {
      return { found: null, error: "پاسخ استعلام رسمی اینماد قابل خواندن نبود." }
    }
    if (data === null) return { found: false, error: "در استعلام رسمی اینماد برای این دامنه رکوردی پیدا نشد." }
    if (!data || typeof data !== "object" || !data.id || !data.code || data.enamad_status == null || data.enamad_status === "") {
      return { found: null, error: "پاسخ استعلام رسمی اینماد ناقص بود." }
    }
    const status = Number(data.enamad_status)
    if (!Number.isInteger(status)) return { found: null, error: "وضعیت برگشتی اینماد قابل تشخیص نبود." }
    const info = {
      found: true,
      status,
      owner: "",
      domain: "",
      city: "",
      activities: [],
      error: "",
    }
    const profileUrl = new URL("https://trustseal.enamad.ir/")
    profileUrl.searchParams.set("id", String(data.id))
    profileUrl.searchParams.set("code", String(data.code))
    try {
      const profile = await requestPublicPage(profileUrl.href, 7000, {
        headers: { referer: "https://enamad.ir/" },
      })
      if (profile.status !== 200) {
        info.error = "صفحهٔ رسمی مشخصات اینماد باز نشد."
        return info
      }
      const facts = profileFacts(responseText(profile))
      info.owner = facts.owner
      info.domain = facts.domain
      info.city = facts.city
      info.activities = facts.activities
      if (!info.owner) info.error = "صفحهٔ رسمی باز شد، اما نام صاحب امتیاز خوانده نشد."
      if (info.domain && info.domain !== target) info.error = "دامنهٔ درج‌شده در شناسنامهٔ اینماد با سایت یکی نیست."
      return info
    } catch {
      info.error = "صفحهٔ رسمی مشخصات اینماد در دسترس نبود."
      return info
    }
  } catch {
    return { found: null, error: "استعلام مستقیم از سامانهٔ اینماد در دسترس نبود." }
  }
}

function cachedEnamadLookup(domain) {
  const key = normalizedDomain(domain)
  if (!key) return Promise.resolve({ found: null, error: "دامنه برای استعلام اینماد معتبر نیست." })
  const cached = enamadCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.promise
  const promise = lookupEnamad(key)
  enamadCache.set(key, { promise, expires: Date.now() + ENAMAD_CACHE_MS })
  if (enamadCache.size > 200) {
    const first = enamadCache.keys().next().value
    if (first) enamadCache.delete(first)
  }
  return promise
}

async function fetchPage(url, timeoutMs, referer = "") {
  const deadline = Date.now() + timeoutMs
  let current = allowedPageUrl(url)
  let currentReferer = safeReferer(referer)
  try {
    if (!current) return { ok: false, url, ctype: "", raw: "", text: "", error: "لینک سایت قابل باز شدن نیست." }
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw Object.assign(new Error("request timeout"), { name: "AbortError" })
      const response = await requestPublicPage(current, remaining, {
        headers: currentReferer ? { referer: currentReferer } : {},
      })
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
        currentReferer = safeReferer(current)
        current = next
        continue
      }
      if (!response.ok) {
        return { ok: false, url: landed, ctype: "", raw: "", text: "", error: "پاسخ " + response.status }
      }
      const bytes = response.bytes
      const ctype = response.headers["content-type"] || ""
      const raw = new TextDecoder(/1256/i.test(ctype) ? "windows-1256" : "utf-8", { fatal: false }).decode(bytes)
      return { ok: true, url: landed, ctype, raw, text: (htmlText(bytes, ctype) + " " + structuredPageText(raw)).slice(0, 30000), error: "" }
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
    return { opened: false, error: "لینک سایت قابل باز شدن نیست.", certificateError: "", holder: "", city: "", certificate: "", text: "", sold: "", enamadUnread: false, enamadFound: null, enamadStatus: null, certificateDomain: "", certificateDomainMismatch: false }
  }
  const safeSiteUrl = allowedPageUrl(url)
  const siteDomain = safeSiteUrl ? normalizedDomain(safeSiteUrl) : ""
  const [page, enamadInfo] = await Promise.all([
    fetchPage(url, 8000),
    cachedEnamadLookup(siteDomain),
  ])
  const result = {
    opened: false,
    error: page.ok ? "" : "سایت باز نشد: " + (page.error || "خطای اتصال"),
    certificateError: "",
    holder: "",
    city: "",
    certificate: "",
    text: "",
    sold: "",
    enamadUnread: !enamadInfo.owner,
    enamadFound: enamadInfo.found,
    enamadStatus: Number.isInteger(enamadInfo.status) ? enamadInfo.status : null,
    certificateDomain: enamadInfo.domain || "",
    certificateDomainMismatch: Boolean(enamadInfo.domain && enamadInfo.domain !== siteDomain),
    enamadActivities: enamadInfo.activities || [],
  }
  if (enamadInfo.found === true) {
    result.certificate = "enamad"
    result.holder = enamadInfo.owner || ""
    result.city = enamadInfo.city || ""
    result.certificateError = enamadInfo.error || ""
  } else if (enamadInfo.found === false) {
    result.certificateError = enamadInfo.error || "در استعلام رسمی اینماد برای این دامنه رکوردی پیدا نشد."
  } else {
    result.certificateError = enamadInfo.error || "استعلام رسمی اینماد نتیجهٔ قطعی نداد."
  }
  if (!page.ok) return result
  result.opened = true
  result.error = ""
  let siteRaw = page.raw || ""
  let siteText = page.text || ""
  const products = productLinks(page.raw, page.url)
  const secondaryLinks = [...new Set([...products, ...informationLinks(page.raw, page.url)])].slice(0, 6)
  const secondaryPages = await Promise.all(secondaryLinks.map((link) => fetchPage(link, 5000, page.url)))
  let enamadUrl = extractEnamadPageUrl(siteRaw) || extractEnamadPageUrl(siteText)
  for (const info of secondaryPages) {
    if (!info.ok) continue
    siteRaw += "\n" + info.raw
    siteText += "\n" + info.text
    if (!enamadUrl) enamadUrl = extractEnamadPageUrl(info.raw) || extractEnamadPageUrl(info.text)
  }
  result.text = siteText.slice(0, 20000)
  result.sold = soldWords(result.text)
  result.catalogOpened = secondaryPages.some((info, index) =>
    info.ok &&
    products.includes(secondaryLinks[index]) &&
    info.text.replace(/\s/g, "").length >= 120 &&
    !/(?:captcha|cloudflare|enable javascript|javascript is required|دسترسی ربات|تأیید کنید که ربات نیستید)/i.test(info.text),
  )
  const dinamad = DINAMAD_RE.exec(siteRaw) || DINAMAD_RE.exec(result.text)
  if (enamadInfo.found === true) {
    if (result.certificateDomainMismatch) result.certificateError = "دامنهٔ درج‌شده در شناسنامهٔ اینماد با سایت یکی نیست."
    else if (!result.holder) result.certificateError = enamadInfo.error || "نام صاحب امتیاز از شناسنامهٔ اینماد خوانده نشد."
    return result
  }
  if (enamadInfo.found === false && !dinamad) {
    if (enamadUrl) result.certificateError = "لینک اینماد در سایت دیده شد، اما استعلام رسمی برای این دامنه رکوردی پیدا نکرد."
    result.enamadUnread = true
    return result
  }
  if (enamadInfo.found == null && enamadUrl) {
    result.certificate = "enamad"
    const seal = await fetchPage(enamadUrl, 8000, page.url)
    if (seal.ok) {
      const sealText = seal.text || htmlText(new TextEncoder().encode(seal.raw || ""), seal.ctype)
      if (!result.holder) result.holder = holderFromText(sealText) || holderFromText(seal.raw || "")
      if (!result.city) result.city = cityFromText(sealText) || cityFromText(seal.raw || "")
      const profile = profileFacts(seal.raw || "")
      if (!result.certificateDomain) result.certificateDomain = profile.domain
      result.certificateDomainMismatch = Boolean(result.certificateDomain && result.certificateDomain !== siteDomain)
      if (!result.holder) result.certificateError = "صفحهٔ اینماد باز شد، اما نام صاحب امتیاز خوانده نشد؛ استعلام رسمی نیز در دسترس نبود."
      else result.certificateError = "نام صاحب امتیاز از لینک اینماد خوانده شد، اما وضعیت رسمی آن قابل تأیید نبود."
    } else if (!result.certificateError) {
      result.certificateError = "اینماد باز نشد: " + (seal.error || "خطای اتصال")
    }
    result.enamadUnread = !result.holder
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
  if (enamadInfo.found === false) result.certificateError = enamadInfo.error || "استعلام رسمی اینماد برای این دامنه رکوردی پیدا نکرد."
  else result.certificateError = enamadInfo.error || "اینماد روی سایت پیدا نشد و استعلام رسمی نتیجهٔ قطعی نداد."
  result.enamadUnread = true
  return result
}

