const ENAMAD_RE = /https?:\/\/(?:www\.)?(?:trustseal\.enamad\.ir|enamad\.ir)\/\?(?:[^"'<>\s]+)/i
const DINAMAD_RE = /دی[\s\u200c]*نماد|دینماد|dinamad|d-namad/i
const DIGI_RE = /https?:\/\/(?:www\.)?digikala\.com\/[^"'<>\s]{0,120}/i
const STOP = new Set("و یا از با برای این آن های ها را که یک انواع لوازم محصولات سایر فروشگاه خرید فروش آنلاین صفحه اصلی جدید محصول تومان تخفیف ارسال سبد افزودن علاقه مندی مقایسه بستن مشاهده مشتری امتیاز قیمت تماس ادامه مطلب ویژه عددی قسط سانت راهنما درباره پرداخت سفارش چگونه ورود خانه عضویت قوانین حریم سوالات جستجو حساب است بود".split(" "))
const ENAMAD_UNREAD = "اینماد خوانده نشد."

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

async function fetchPage(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: "text/html,application/xhtml+xml",
      },
    })
    if (!response.ok) return { ok: false, url, ctype: "", raw: "", error: "پاسخ " + response.status }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const ctype = response.headers.get("content-type") || ""
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    return { ok: true, url: response.url || url, ctype, raw, text: htmlText(bytes, ctype), error: "" }
  } catch (error) {
    const message = error && error.name === "AbortError" ? "زمان اتصال تمام شد" : "باز نشد"
    return { ok: false, url, ctype: "", raw: "", text: "", error: message }
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
