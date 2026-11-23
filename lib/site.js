const ENAMAD_RE = /https?:\/\/(?:www\.)?(?:trustseal\.enamad\.ir|enamad\.ir)\/\?(?:[^"'<>\s]+)/i
const DINAMAD_RE = /دی[\s\u200c]*نماد|دینماد|dinamad|d-namad/i
const DIGI_RE = /https?:\/\/(?:www\.)?digikala\.com\/[^"'<>\s]{0,120}/i
const STOP = new Set("و یا از با برای این آن های ها را که یک انواع لوازم محصولات سایر فروشگاه خرید فروش آنلاین صفحه اصلی جدید محصول تومان تخفیف ارسال سبد افزودن علاقه مندی مقایسه بستن مشاهده مشتری امتیاز قیمت تماس ادامه مطلب ویژه عددی قسط سانت راهنما درباره پرداخت سفارش چگونه ورود خانه عضویت قوانین حریم سوالات جستجو حساب است بود".split(" "))
const ENAMAD_UNREAD = "اینماد خوانده نشد."
const MAX_REDIRECTS = 3
const MAX_BYTES = 1000000

function htmlText(bytes, ctype) {
  const type = String(ctype || "")
  const text = new TextDecoder(type.includes("1256") ? "windows-1256" : "utf-8", { fatal: false }).decode(bytes)
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
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
  return ""
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
  if (privateHost(parsed.hostname)) return ""
  return parsed.href
}

async function readLimited(response) {
  const reader = response.body && response.body.getReader ? response.body.getReader() : null
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.length > MAX_BYTES ? bytes.slice(0, MAX_BYTES) : bytes
  }
  const chunks = []
  let size = 0
  while (size < MAX_BYTES) {
    const step = await reader.read()
    if (step.done) break
    chunks.push(step.value)
    size += step.value.length
  }
  await reader.cancel()
  const bytes = new Uint8Array(Math.min(size, MAX_BYTES))
  let offset = 0
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, bytes.length - offset)
    bytes.set(chunk.subarray(0, take), offset)
    offset += take
    if (offset >= bytes.length) break
  }
  return bytes
}

async function fetchPage(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let current = allowedPageUrl(url)
  try {
    if (!current) return { ok: false, url, ctype: "", raw: "", text: "", error: "لینک سایت قابل باز شدن نیست." }
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0",
          accept: "text/html,application/xhtml+xml",
        },
      })
      const landed = allowedPageUrl(response.url || current)
      if (!landed) {
        if (response.body) await response.body.cancel()
        return { ok: false, url: current, ctype: "", raw: "", text: "", error: "لینک سایت قابل باز شدن نیست." }
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (response.body) await response.body.cancel()
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
        if (response.body) await response.body.cancel()
        return { ok: false, url: landed, ctype: "", raw: "", text: "", error: "پاسخ " + response.status }
      }
      const bytes = await readLimited(response)
      const ctype = response.headers.get("content-type") || ""
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
      return { ok: true, url: landed, ctype, raw, text: htmlText(bytes, ctype), error: "" }
    }
    return { ok: false, url: current, ctype: "", raw: "", text: "", error: "باز نشد" }
  } catch (error) {
    const message = error && error.name === "AbortError" ? "زمان اتصال تمام شد" : "باز نشد"
    return { ok: false, url: current || url, ctype: "", raw: "", text: "", error: message }
  } finally {
    clearTimeout(timer)
  }
}

export async function openShop(url) {
  if (!url) {
    return { opened: false, error: "لینک سایت قابل باز شدن نیست.", holder: "", certificate: "", text: "", sold: "", enamadUnread: false }
  }
  const page = await fetchPage(url, 8000)
  const result = {
    opened: false,
    error: page.error || "باز نشد",
    holder: "",
    certificate: "",
    text: "",
    sold: "",
    enamadUnread: false,
  }
  if (!page.ok) return result
  result.opened = true
  result.error = ""
  result.text = page.text || ""
  result.sold = soldWords(result.text)
  const enamad = ENAMAD_RE.exec(page.raw) || ENAMAD_RE.exec(result.text)
  const dinamad = DINAMAD_RE.exec(page.raw) || DINAMAD_RE.exec(result.text)
  if (enamad) {
    result.certificate = "enamad"
    const seal = await fetchPage(enamad[0].replace(/&amp;/g, "&"), 8000)
    if (seal.ok) {
      const sealText = seal.text || htmlText(new TextEncoder().encode(seal.raw || ""), seal.ctype)
      result.holder = holderFromText(sealText) || holderFromText(seal.raw || "")
    }
    if (!result.holder) result.enamadUnread = true
    return result
  }
  if (dinamad) {
    result.certificate = "dinamad"
    const digi = DIGI_RE.exec(page.raw)
    if (digi) {
      const extra = await fetchPage(digi[0].replace(/&amp;/g, "&"), 8000)
      if (extra.ok) {
        const extraText = extra.text || ""
        result.holder = holderFromText(extraText)
        result.text = (result.text + " " + extraText).slice(0, 20000)
        result.sold = soldWords(result.text) || result.sold
      }
    } else {
      result.holder = holderFromText(result.text)
    }
    if (!result.holder) result.enamadUnread = true
    return result
  }
  result.enamadUnread = true
  return result
}

export { ENAMAD_UNREAD }
