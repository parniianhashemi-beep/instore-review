import { allowedPageUrl } from "./site.js"

const FILTER_N = "ONLINE SITE EXISTS - DUPLICATE NAME KEPT"
const OUTPUT = ["general", "آماده فعال\u200cسازی", "نیاز به تغییر نام", "نیازمند بررسی دستی", "تغییر نام انجام شد"]
const SOCIAL_NAME = "از تب social اسم پیدا نشد"
const ONLINE_NAME = "از تب online اسم پیدا نشد"
const OK = "جور است"
const NO = "جور نیست"
const UNK = "نتوانستم بررسی کنم"
const SOCIAL_HOSTS = ["instagram.com", "instagr.am", "t.me", "telegram.me", "telegram.org", "rubika.ir", "web.rubika.ir", "whatsapp.com", "wa.me", "api.whatsapp.com", "twitter.com", "x.com", "linkedin.com", "aparat.com", "facebook.com", "fb.com", "fb.me", "fb.watch", "tiktok.com", "youtube.com", "youtu.be", "eitaa.com", "eitaa.ir", "bale.ai", "ble.ir", "splus.ir", "gap.im", "igap.net", "pin.it", "pinterest.com", "threads.net"]
const IG_SKIP = new Set(["p", "reel", "reels", "stories", "tv", "explore", "accounts", "direct", "about"])
const PATH_SKIP = new Set(["p", "reel", "reels", "stories", "tv", "page", "joinchat", "joinc"])
export const HEADERS = ["شناسه درخواست", "برند", "دسته", "سایت", "نام متقاضی", "موبایل", "وضعیت NBO", "پیشنهاد سامانه", "دلیل پیشنهاد", "تصمیم نهایی", "اسم فارسی قابل فعال\u200cسازی", "اسم انگلیسی قابل فعال\u200cسازی", "وضعیت بررسی", "انجام تغییر نام", "مرجع تطبیق", "لینک", "توضیح لینک", "کد ملی", "توضیح کد ملی", "موبایل نتیجه", "توضیح موبایل", "نام فارسی فروشگاه", "توضیح نام فارسی", "نام انگلیسی فروشگاه", "توضیح نام انگلیسی", "نام صاحب امتیاز", "توضیح نام صاحب امتیاز", "نام خانوادگی صاحب امتیاز", "توضیح نام خانوادگی", "گواهی", "توضیح گواهی", "دسته نتیجه", "توضیح دسته", "زیردسته نتیجه", "توضیح زیردسته"]
const FIELD_KEYS = ["link", "national_id", "mobile", "fa", "en", "owner_first", "owner_last", "certificate", "category", "subcategory"]

function norm(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}
function fold(value) {
  return String(value || "").replace(/\u200c/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim().toLowerCase()
}
function cellAt(row, index) {
  if (index == null || index < 0 || !row || index >= row.length) return ""
  return row[index] == null ? "" : String(row[index]).trim()
}
function hasScheme(url) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)
}
function ensureScheme(url) {
  const text = String(url || "").trim().replace(/^[<"']+|[>"',;،؛]+$/g, "")
  if (!text) return ""
  if (text.startsWith("//")) return "https:" + text
  return hasScheme(text) ? text : "https://" + text
}
function splitUrl(url) {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/.exec(url || "")
  if (!match) return null
  return { netloc: match[1], path: match[2] || "", query: match[3] || "" }
}
function cleanHost(netloc) {
  let host = String(netloc || "").trim().toLowerCase()
  if (host.includes("@")) host = host.slice(host.lastIndexOf("@") + 1)
  if (host.startsWith("www.")) host = host.slice(4)
  return host.replace(/^\[|\]$/g, "").replace(/\.+$/g, "")
}
function firstToken(raw) {
  const token = String(raw || "").trim()
  if (!token) return ""
  if (token.includes("|") || /\s/.test(token)) {
    for (const part of token.split(/[|\s]+/)) {
      if (part.includes(".") || part.includes("://")) return part.replace(/^[<"']+|[>"',;،؛.)\]}]+$/g, "")
    }
  }
  return token.replace(/^[<"']+|[>"',;،؛.)\]}]+$/g, "")
}
function urlHost(url) {
  const parsed = splitUrl(ensureScheme(firstToken(url)))
  return parsed ? cleanHost(parsed.netloc) : ""
}
function normalizeUrlKey(url) {
  const raw = firstToken(url)
  if (!raw) return ""
  const parsed = splitUrl(ensureScheme(raw))
  if (!parsed) return raw.toLowerCase().replace(/\/+$/g, "")
  const host = cleanHost(parsed.netloc)
  const path = (parsed.path || "").replace(/\/+$/g, "")
  const query = parsed.query ? "?" + parsed.query : ""
  if (!host && !path) return ""
  return (host + path + query).toLowerCase()
}
function hostIsSocial(host) {
  if (!host) return false
  const cleaned = String(host).split("|")[0].trim()
  return SOCIAL_HOSTS.some((domain) => cleaned === domain || cleaned.endsWith("." + domain))
}
function cleanUser(user) {
  return String(user || "").replace(/^@/, "").toLowerCase().replace(/[^0-9a-z\u0600-\u06ff._]+/g, "")
}
function instagramUsername(url) {
  const host = urlHost(url)
  const lowered = String(url || "").toLowerCase()
  if (host !== "instagram.com" && host !== "instagr.am" && !host.endsWith(".instagram.com") && !lowered.includes("instagram.com")) return ""
  const parsed = splitUrl(ensureScheme(firstToken(url)))
  if (!parsed) return ""
  const parts = parsed.path.split("/").filter(Boolean)
  if (!parts.length || IG_SKIP.has(parts[0].toLowerCase())) return ""
  return cleanUser(parts[0])
}
function socialPathUser(url) {
  const full = normalizeUrlKey(url)
  if (!full || !full.includes("/")) return ""
  const user = full.split("/").slice(1).join("/").split("/")[0].split("?")[0].trim()
  if (!user || PATH_SKIP.has(user)) return ""
  return user
}
export function classifyUrl(url) {
  const raw = String(url || "").trim()
  if (!raw) return "social"
  const host = urlHost(raw)
  if (hostIsSocial(host)) return "social"
  if (host && host.includes(".")) return "website"
  return "social"
}
export function safeUrl(url) {
  const token = firstToken(url)
  if (!token) return ""
  return allowedPageUrl(ensureScheme(token))
}
function padNationalId(value) {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return ""
  return digits.length < 10 ? digits.padStart(10, "0") : digits
}
function compareId(left, right) {
  const a = padNationalId(left)
  const b = padNationalId(right)
  if (!a || !b) return [UNK, "کد ملی " + (!a ? "درخواست" : "تب") + " خالی است."]
  if (a.length !== 10 || b.length !== 10) return [UNK, "کد ملی باید ۱۰ رقم باشد."]
  if (a === b) return [OK, "هر دو کد ملی " + a + " است."]
  return [NO, "کد ملی درخواست و تب یکی نیست."]
}
function compareMobile(left, right) {
  let a = String(left || "").replace(/\D/g, "")
  let b = String(right || "").replace(/\D/g, "")
  if (a.startsWith("98") && a.length > 10) a = a.slice(2)
  if (b.startsWith("98") && b.length > 10) b = b.slice(2)
  a = a.replace(/^0+/, "")
  b = b.replace(/^0+/, "")
  if (!a || !b) return [UNK, ""]
  if (a === b) return [OK, ""]
  return [NO, "شماره می‌تواند فرق داشته باشد و به‌خاطر آن رد نشد."]
}
function tokens(value) {
  const stop = new Set(["و", "یا", "از", "با", "برای", "انواع", "لوازم", "محصولات", "سایر", "فروشگاه"])
  return fold(value).split(/[\s،,()/+\-]+/).filter((part) => part.length >= 3 && !stop.has(part))
}
function objCell(row, key) {
  if (!row || !key || !Object.prototype.hasOwnProperty.call(row, key)) return ""
  return row[key] == null ? "" : String(row[key]).trim()
}
function rowsAsObjects(values) {
  const header = values[0] || []
  const names = []
  const seen = new Map()
  header.forEach((raw, index) => {
    let name = String(raw ?? "").trim()
    if (!name) name = "__col_" + index
    const count = (seen.get(name) || 0) + 1
    seen.set(name, count)
    names.push(count === 1 ? name : name + "_" + count)
  })
  const rows = []
  values.slice(1).forEach((src, rowIndex) => {
    if (!src || !src.some((value) => String(value || "").trim())) return
    const obj = { __id: rowIndex + 1 }
    names.forEach((name, index) => {
      obj[name] = index < src.length && src[index] != null ? String(src[index]).trim() : ""
    })
    rows.push(obj)
  })
  return { headers: names, rows }
}
function optionalCol(headers, aliases) {
  const byName = new Map()
  for (const name of headers) {
    const folded = norm(name)
    if (folded && !byName.has(folded) && !String(name).startsWith("__")) byName.set(folded, name)
  }
  for (const alias of aliases) {
    const folded = norm(alias)
    if (folded && byName.has(folded)) return byName.get(folded)
  }
  return ""
}
function requireCol(headers, aliases, label) {
  const found = optionalCol(headers, aliases)
  if (!found) throw new Error("ستون «" + label + "» پیدا نشد.")
  return found
}
function helperCols(headers, social) {
  const cols = {
    en: requireCol(headers, ["name", "english name"], "نام انگلیسی"),
    fa: requireCol(headers, ["local_name", "فارسی", "persian name"], "نام فارسی"),
    site: requireCol(headers, ["site_link", "site link", "website", "url"], "لینک سایت"),
    id: optionalCol(headers, ["national_id", "national id", "کد ملی"]),
    mobile: optionalCol(headers, ["mobile", "موبایل"]),
  }
  if (social) cols.callback = optionalCol(headers, ["call back", "callback", "callback url"])
  return cols
}
function indexAdd(index, key, row) {
  if (!key) return
  const bucket = index.get(key) || []
  if (!bucket.some((item) => item.__id === row.__id)) bucket.push(row)
  index.set(key, bucket)
}
function take(index, keys) {
  const seen = new Set()
  const out = []
  for (const key of keys) {
    for (const row of index.get(key) || []) {
      if (seen.has(row.__id)) continue
      seen.add(row.__id)
      out.push(row)
    }
  }
  return out
}
function buildOnlineIndex(rows, cols) {
  const index = new Map()
  for (const row of rows) {
    const site = objCell(row, cols.site)
    if (!site) continue
    indexAdd(index, normalizeUrlKey(site), row)
    indexAdd(index, urlHost(site), row)
  }
  return index
}
function buildSocialIndex(rows, cols) {
  const index = new Map()
  for (const row of rows) {
    const urls = [objCell(row, cols.site)]
    if (cols.callback) urls.push(objCell(row, cols.callback))
    for (const site of urls) {
      if (!site) continue
      const host = urlHost(site)
      const ig = instagramUsername(site)
      if (ig) {
        indexAdd(index, "ig:" + ig, row)
        indexAdd(index, "instagram.com/" + ig, row)
        continue
      }
      const user = socialPathUser(site)
      if (host && hostIsSocial(host)) {
        if (!user) continue
        indexAdd(index, normalizeUrlKey(site), row)
        indexAdd(index, host + "/" + user, row)
      } else if (host && !hostIsSocial(host)) {
        indexAdd(index, normalizeUrlKey(site), row)
        indexAdd(index, host, row)
      }
    }
  }
  return index
}
function lookupOnline(url, index) {
  const keys = []
  const full = normalizeUrlKey(url)
  const host = urlHost(url)
  if (full) keys.push(full)
  if (host && !hostIsSocial(host) && host !== full) keys.push(host)
  return take(index, keys)
}
function lookupSocial(url, index) {
  let ig = instagramUsername(url)
  if (!ig && String(url || "").toLowerCase().includes("instagram.com")) {
    const match = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(url || "")
    if (match && !IG_SKIP.has(match[1].toLowerCase())) ig = cleanUser(match[1])
  }
  if (ig) return take(index, ["ig:" + ig, "instagram.com/" + ig])
  const host = urlHost(url)
  const user = socialPathUser(url)
  if (host && hostIsSocial(host) && !user) return []
  const keys = []
  const full = normalizeUrlKey(url)
  if (full) keys.push(full)
  if (host && user) keys.push(host + "/" + user)
  if (host && !hostIsSocial(host)) keys.push(host)
  return take(index, keys)
}
function resolveNewFlow(header) {
  const fields = [
    ["contract", 0, ["request id", "request_id", "کد قرارداد", "contract code", "a"]],
    ["fa", 1, ["brand name (fa)", "اسم فارسی", "نام فارسی", "persian name", "local_name", "b"]],
    ["en", 2, ["brand name (en)", "اسم انگلیسی", "نام انگلیسی", "english name", "c"]],
    ["cat", 3, ["category", "کتگوری", "دسته", "d"]],
    ["sub", 4, ["sub category", "subcategory", "sub_category", "زیردسته", "ساب‌کتگوری", "e"]],
    ["city", 6, ["branch name", "city", "شهر", "g"]],
    ["duplicateFa", 9, ["final suggested fa name", "final suggested persian name", "j"]],
    ["duplicateEn", 12, ["final suggested en name", "final suggested english name", "m"]],
    ["filterN", 13, ["online site alert", "online site exists - duplicate name kept", "n"]],
    ["url", 14, ["duplicate callback url", "url", "site url", "o"]],
    ["filterP", 15, ["final step", "p"]],
    ["ownerId", 16, ["owner national code", "owner national id", "national code", "کد ملی", "national id", "q"]],
    ["mobile", 17, ["owner mobile", "موبایل", "mobile", "r"]],
    ["ownerFirst", 18, ["owner first name", "نام مالک", "first name", "s"]],
    ["ownerLast", 19, ["owner last name", "نام خانوادگی", "last name", "t"]],
    ["filterZ", 25, ["z"]],
  ]
  const byName = new Map()
  header.forEach((name, index) => {
    const key = norm(name)
    if (key && !byName.has(key)) byName.set(key, index)
  })
  const mapping = {}
  for (const [key, fallback, aliases] of fields) {
    let found = null
    for (const alias of aliases) {
      const folded = norm(alias)
      if (folded && byName.has(folded)) {
        found = byName.get(folded)
        break
      }
    }
    mapping[key] = found == null ? fallback : found
  }
  return mapping
}
function nboOf(header, row) {
  const wanted = norm("وضعیت NBO")
  for (let index = 0; index < header.length; index++) {
    const folded = norm(header[index])
    if (!folded) continue
    if (folded === "nbo" || folded === wanted || folded.endsWith("nbo")) return cellAt(row, index)
  }
  return ""
}
function shownNames(hit, cols, missing) {
  const fa = hit ? objCell(hit, cols.fa) : ""
  const en = hit ? objCell(hit, cols.en) : ""
  return [fa || missing, en || missing]
}
function slugPart(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}
const SUBCATEGORY_EN = [
  ["ساعت", "watch"], ["کفش", "shoes"], ["کیف", "bags"], ["پوشاک زنانه", "womens-clothing"],
  ["پوشاک مردانه", "mens-clothing"], ["پوشاک بچگانه", "kids-clothing"], ["لباس زنانه", "womens-clothing"],
  ["لباس مردانه", "mens-clothing"], ["لباس بچگانه", "kids-clothing"], ["لباس", "clothing"],
  ["آرایشی", "cosmetics"], ["بهداشتی", "personal-care"], ["پوست", "skincare"], ["مو", "haircare"],
  ["عطر", "perfume"], ["زیورآلات", "jewelry"], ["طلا", "gold"], ["عینک", "eyewear"],
  ["کتاب", "books"], ["موبایل", "mobile-phones"], ["لپ تاپ", "laptops"], ["لپ‌تاپ", "laptops"],
  ["کامپیوتر", "computers"], ["دیجیتال", "electronics"], ["اسباب بازی", "toys"], ["اسباب‌بازی", "toys"],
  ["مبلمان", "furniture"], ["دکور", "home-decor"], ["خانه و آشپزخانه", "home-kitchen"],
  ["مواد غذایی", "groceries"], ["خوراکی", "food"], ["ورزشی", "sports"], ["لوازم جانبی", "accessories"],
]
const PERSIAN_LATIN = { ا:"a", آ:"a", ب:"b", پ:"p", ت:"t", ث:"s", ج:"j", چ:"ch", ح:"h", خ:"kh", د:"d", ذ:"z", ر:"r", ز:"z", ژ:"zh", س:"s", ش:"sh", ص:"s", ض:"z", ط:"t", ظ:"z", ع:"a", غ:"gh", ف:"f", ق:"gh", ک:"k", ك:"k", گ:"g", ل:"l", م:"m", ن:"n", و:"v", ه:"h", ی:"y", ي:"y", ئ:"y", ؤ:"o" }
function latinSlug(value) {
  return slugPart([...String(value || "").toLowerCase()].map((char) => PERSIAN_LATIN[char] ?? char).join(""))
}
function subcategorySlug(value) {
  const normalized = fold(value)
  const known = SUBCATEGORY_EN.find(([fa]) => normalized.includes(fold(fa)))
  return known ? known[1] : (slugPart(value) || latinSlug(value))
}
function cityFromBranch(value) {
  const parts = String(value || "").split(/\s*[-–—]\s*/).filter(Boolean)
  return (parts.length > 1 ? parts[parts.length - 1] : (parts[0] || "")).trim()
}
function citySlug(value) {
  const key = fold(value)
  const known = new Map([
    ["تهران", "tehran"], ["مشهد", "mashhad"], ["اصفهان", "isfahan"],
    ["شیراز", "shiraz"], ["تبریز", "tabriz"], ["کرج", "karaj"],
    ["قم", "qom"], ["اهواز", "ahvaz"], ["رشت", "rasht"], ["یزد", "yazd"],
  ])
  return known.get(key) || latinSlug(value)
}
function alternativeName(base, city, contract, english) {
  const cityPart = english ? citySlug(city) : String(city || "").trim()
  const fallback = english ? slugPart(contract).slice(-5) || "2" : String(contract || "").replace(/\D/g, "").slice(-4) || "۲"
  const suffix = cityPart || fallback
  return english ? slugPart(base + "-" + suffix) : [base, suffix].filter(Boolean).join(" ")
}
function suggestedEnglish(item) {
  const text = [slugPart(item.en), subcategorySlug(item.sub)].filter(Boolean).join("-")
  const name = text.replace(/^[^a-z]+/, "").replace(/^-+|-+$/g, "")
  return item.duplicateEn ? alternativeName(name, item.city, item.contract, true) : name
}
function suggestedPersian(item) {
  const name = [String(item.sub || "").trim(), String(item.fa || "").trim()].filter(Boolean).join(" ")
  return item.duplicateFa ? alternativeName(name, item.city, item.contract, false) : name
}
function brandDiffers(item, tabFa, tabEn, page) {
  const faLeft = fold(item.fa)
  const enLeft = fold(item.en)
  const faRight = fold(tabFa)
  const enRight = fold(tabEn)
  if (faRight || enRight) {
    return (faLeft && faRight && faLeft !== faRight) || (enLeft && enRight && enLeft !== enRight)
  }
  const text = fold((page && page.text) || "")
  const parts = [faLeft, enLeft].filter((part) => part.length >= 3)
  if (!text || !parts.length) return false
  return !parts.some((part) => text.includes(part))
}
function sellsMatch(value, page) {
  if (!page || !page.opened) return UNK
  const blob = fold((page.text || "") + " " + (page.sold || ""))
  const wanted = tokens(value)
  if (!wanted.length || blob.replace(/\s/g, "").length < 40) return UNK
  if (/(?:captcha|cloudflare|enable javascript|javascript is required|دسترسی ربات|تأیید کنید که ربات نیستید)/i.test(blob)) return UNK
  if (wanted.some((token) => blob.includes(token))) return OK
  return page.catalogOpened ? NO : UNK
}
function ownerState(item, page) {
  if (!page || !page.opened) return "closed"
  if (!page.holder || page.enamadUnread || page.certificateDomainMismatch) return "unread"
  const holder = fold(page.holder)
  const first = fold(item.owner_first)
  const last = fold(item.owner_last)
  if (!first && !last) return "empty"
  if (first && !holder.includes(first)) return "no"
  if (last && !holder.includes(last)) return "no"
  return "yes"
}
function cityState(item, page) {
  const requested = fold(item.city)
  const certificate = fold(page && page.city)
  if (!requested) return [UNK, "شهر شعبه از ستون G خوانده نشد."]
  if (page && page.certificateDomainMismatch) return [UNK, "دامنهٔ شناسنامهٔ اینماد با سایت یکی نیست؛ شهر قابل تطبیق نیست."]
  if (!certificate) return [UNK, "شهر از اینماد یا دی‌نماد خوانده نشد."]
  if (requested === certificate || requested.includes(certificate) || certificate.includes(requested)) {
    return [OK, "شهر ستون G با شهر اینماد یا دی‌نماد جور است."]
  }
  return [NO, "شهر ستون G با شهر اینماد یا دی‌نماد یکی نیست."]
}
function certificateState(page) {
  if (!page) return [UNK, "اطلاعات اینماد در دسترس نیست."]
  if (page.certificateDomainMismatch) return [NO, "دامنهٔ شناسنامهٔ اینماد با سایت یکی نیست."]
  if (page.certificate === "dinamad") {
    return page.holder && !page.enamadUnread
      ? [OK, "اطلاعات صاحب امتیاز دی‌نماد خوانده شد."]
      : [UNK, page.certificateError || "اطلاعات دی‌نماد کامل خوانده نشد."]
  }
  if (page.enamadFound === false) return [NO, page.certificateError || "استعلام رسمی اینماد برای دامنه رکوردی پیدا نکرد."]
  if (page.enamadFound !== true || page.enamadStatus == null) return [UNK, page.certificateError || "استعلام رسمی اینماد نتیجهٔ قطعی نداد."]
  if (page.enamadStatus === 1 || page.enamadStatus === 3) return [OK, page.enamadStatus === 3 ? "استعلام رسمی، اینماد را معتبر با مجوز در انتظار تأیید نشان داد." : "استعلام رسمی، اینماد را معتبر نشان داد."]
  if (page.enamadStatus === 5) return [NO, "استعلام رسمی نشان داد اعتبار اینماد منقضی شده است."]
  if (page.enamadStatus === 6) return [NO, "استعلام رسمی نشان داد اینماد تعلیق شده است."]
  return [UNK, "وضعیت رسمی اینماد در برنامه قابل تفسیر نیست."]
}
function result(status, fa, en, reason, against) {
  return { status, fa, en, reason, against: against || "" }
}
function decideSocial(item, hits, cols) {
  if (hits.length !== 1) {
    const reason = hits.length
      ? "با این لینک چند صفحه در تب social پیدا شد."
      : "این لینک در تب social پیدا نشد."
    return result("manual", item.fa || "", item.en || "", reason, "")
  }
  const hit = hits[0]
  const id = compareId(item.owner_id, objCell(hit, cols.id))
  if (id[0] !== OK) return result("manual", item.fa || "", item.en || "", id[1], "")
  const [fa, en] = shownNames(hit, cols, SOCIAL_NAME)
  const phone = compareMobile(item.mobile, objCell(hit, cols.mobile))
  let reason = "آماده فعال‌سازی است چون لینک و کد ملی ۱۰ رقمی با تب social یکی است."
  if (phone[0] === NO && phone[1]) reason += " " + phone[1]
  return result("ready", fa, en, reason, "تب social")
}
function decideWebsite(item, hits, cols, page, ctx) {
  const rows = ctx.onlineRows || []
  const idMatches = rows.filter((row) => compareId(item.owner_id, objCell(row, cols.id))[0] === OK)
  const mobileMatches = rows.filter((row) => compareMobile(item.mobile, objCell(row, cols.mobile))[0] === OK)
  let hit = hits.length === 1 ? hits[0] : null
  if (hits.length > 1) {
    const byId = hits.filter((row) => compareId(item.owner_id, objCell(row, cols.id))[0] === OK)
    if (byId.length === 1) hit = byId[0]
  }
  if (!hit && hits.length === 0 && idMatches.length === 1) hit = idMatches[0]
  if (!hit && hits.length === 0 && idMatches.length === 0 && mobileMatches.length === 1) hit = mobileMatches[0]
  const urlId = hits.length === 1 ? compareId(item.owner_id, objCell(hits[0], cols.id)) : [UNK, ""]
  const onlineConflict = (hits.length > 1 && !hit) || (hits.length === 1 && urlId[0] === NO)
  const evidence = hits.length
    ? (hit ? "تب online با URL یا کد ملی تطبیق شد." : "چند رکورد تب online با این URL پیدا شد و تطبیقشان روشن نیست.")
    : (idMatches.length || mobileMatches.length
      ? "در تب online با کد ملی یا موبایل اطلاعات پیدا شد، ولی URL یکسان نبود."
      : "در تب online رکوردی با URL، کد ملی یا موبایل پیدا نشد؛ نبودن رکورد به‌تنهایی مانع تطبیق نیست.")
  const tabFa = hit ? objCell(hit, cols.fa) : ""
  const tabEn = hit ? objCell(hit, cols.en) : ""
  const fa = tabFa || item.fa || ""
  const en = tabEn || item.en || ""
  const fields = []
  const add = (key, name, verdict, note) => fields.push({ key, name, verdict: verdict || UNK, note: note || "" })
  const finish = (status, resultFa, resultEn, reason, against) => ({ ...result(status, resultFa, resultEn, reason, against), fields })
  add("link", "لینک در تب online", hits.length === 1 ? OK : (hits.length > 1 ? UNK : NO), hits.length ? evidence : "آدرس در تب online پیدا نشد؛ این مورد به‌تنهایی مانع تطبیق سایت نیست.")
  add("national_id", "کد ملی در تب online", hit ? compareId(item.owner_id, objCell(hit, cols.id))[0] : (idMatches.length === 1 ? OK : (idMatches.length > 1 ? UNK : compareId(item.owner_id, "")[0])), idMatches.length ? idMatches.length + " ردیف با کد ملی پیدا شد." : "با کد ملی ردیفی پیدا نشد.")
  add("mobile", "موبایل در تب online", hit && objCell(hit, cols.mobile) ? compareMobile(item.mobile, objCell(hit, cols.mobile))[0] : (mobileMatches.length === 1 ? OK : (mobileMatches.length > 1 ? UNK : UNK)), mobileMatches.length ? mobileMatches.length + " ردیف با موبایل پیدا شد." : "با موبایل ردیفی پیدا نشد؛ موبایل به‌تنهایی معیار رد نیست.")
  add("fa", "نام فارسی در تب online", tabFa ? (fold(tabFa) === fold(item.fa) ? OK : NO) : UNK, tabFa ? "نام فارسی ردیف آنلاین با نام درخواست مقایسه شد." : "نام فارسی آنلاین پیدا نشد یا ردیف آنلاین یکتا نبود.")
  add("en", "نام انگلیسی در تب online", tabEn ? (fold(tabEn) === fold(item.en) ? OK : NO) : UNK, tabEn ? "نام انگلیسی ردیف آنلاین با نام درخواست مقایسه شد." : "نام انگلیسی آنلاین پیدا نشد یا ردیف آنلاین یکتا نبود.")
  const cert = certificateState(page)
  if (!page || !page.opened) {
    const reason = page && page.error ? page.error : "سایت باز نشد."
    const certNote = cert[1] || "استعلام اینماد نتیجهٔ قطعی نداد."
    add("owner_first", "نام صاحب امتیاز", UNK, "چون سایت باز نشد، صاحب امتیاز از اینماد بررسی نشد.")
    add("owner_last", "نام خانوادگی صاحب امتیاز", UNK, "چون سایت باز نشد، صاحب امتیاز از اینماد بررسی نشد.")
    add("certificate", "اینماد", cert[0], certNote)
    add("category", "دسته", UNK, "سایت باز نشد و محتوای کالاها در دسترس نبود.")
    add("subcategory", "زیردسته", UNK, "سایت باز نشد و محتوای کالاها در دسترس نبود.")
    return finish("manual", fa, en, reason + " " + certNote + " " + evidence, "")
  }
  const owner = ownerState(item, page)
  const city = cityState(item, page)
  const category = sellsMatch(item.cat, page)
  const subcategory = sellsMatch(item.sub, page)
  const holder = fold(page.holder)
  const first = fold(item.owner_first)
  const last = fold(item.owner_last)
  add("owner_first", "نام صاحب امتیاز", owner === "yes" ? OK : (owner === "no" && first && !holder.includes(first) ? NO : UNK), page.holder ? "صاحب امتیاز خوانده شد: " + page.holder : "نام صاحب امتیاز اینماد خوانده نشد.")
  add("owner_last", "نام خانوادگی صاحب امتیاز", owner === "yes" ? OK : (owner === "no" && last && !holder.includes(last) ? NO : UNK), page.holder ? "صاحب امتیاز خوانده شد: " + page.holder : "نام صاحب امتیاز اینماد خوانده نشد.")
  add("certificate", "اینماد", cert[0], cert[1])
  add("category", "دسته", category, category === OK ? "دسته در محتوای صفحهٔ اصلی یا فروشگاه پیدا شد." : category === NO ? "صفحهٔ فروشگاه باز شد، اما دستهٔ درخواست در محصولات دیده نشد." : "برای رد یا تأیید دسته، محتوای قابل اتکای فروشگاه پیدا نشد.")
  add("subcategory", "زیردسته", subcategory, subcategory === OK ? "زیردسته در محتوای صفحهٔ اصلی یا فروشگاه پیدا شد." : subcategory === NO ? "صفحهٔ فروشگاه باز شد، اما زیردستهٔ درخواست در محصولات دیده نشد." : "برای رد یا تأیید زیردسته، محتوای قابل اتکای فروشگاه پیدا نشد.")
  if (owner === "yes" && city[0] === OK && cert[0] === OK && category === OK && subcategory === OK) {
    if (onlineConflict) return finish("manual", fa, en, "اطلاعات سایت، مالک، کالا و شهر جور است؛ اما تب online رکورد متعارض یا مبهم دارد. " + evidence, "تب online و اینماد")
    const certificate = page.certificate === "dinamad" ? "دی‌نماد" : "اینماد"
    if (brandDiffers(item, tabFa, tabEn, page)) {
      return finish(
        "rename",
        suggestedPersian(item),
        suggestedEnglish(item),
        "نام صاحب امتیاز، شهر و کالای فروشگاه جور است و نام برند نیاز به تغییر دارد. " + evidence,
        "تب online و " + certificate,
      )
    }
    let reason = "آماده فعال‌سازی است؛ دسته و زیردستهٔ D و E، صاحب امتیاز اینماد/دی‌نماد و شهر ستون G جور است. " + evidence
    const phone = hit ? compareMobile(item.mobile, objCell(hit, cols.mobile)) : [OK, ""]
    if (phone[0] === NO && phone[1]) reason += " " + phone[1]
    return finish("ready", fa, en, reason, "تب online و " + certificate)
  }
  if (owner === "no") return finish("manual", fa, en, "نام یا نام خانوادگی مالک با صاحب امتیاز اینماد یا دی‌نماد یکی نیست. " + evidence, "")
  if (owner === "empty") return finish("manual", fa, en, "نام مالک در درخواست خالی است. " + evidence, "")
  if (cert[0] !== OK) return finish("manual", fa, en, cert[1] + " " + evidence, "")
  if (city[0] !== OK) return finish("manual", fa, en, city[1] + " " + evidence, "")
  if (category === NO || subcategory === NO) return finish("manual", fa, en, "دسته یا زیردستهٔ درخواست با محتوای فروشگاه جور نیست. " + evidence, "")
  if (category !== OK || subcategory !== OK) return finish("manual", fa, en, "برای بررسی دسته و زیردسته، محتوای قابل اتکای فروشگاه در دسترس نبود. " + evidence, "")
  return finish("manual", fa, en, "اطلاعات تب online برای تطبیق سایت کافی نیست. " + evidence, "")
}
export function decideRow(item, ctx, page) {
  if (item.kind === "website") return decideWebsite(item, lookupOnline(item.url, ctx.onlineIndex), ctx.onlineCols, page, ctx)
  return decideSocial(item, lookupSocial(item.url, ctx.socialIndex), ctx.socialCols)
}
export function shouldOpen(item) {
  return Boolean(item && item.kind === "website" && safeUrl(item.url))
}function fieldPair(verdict, note) {
  return [verdict || "", note || ""]
}
export function sheetRow(item, decision) {
  const label = decision.status === "ready"
    ? "آماده فعال\u200cسازی"
    : decision.status === "rename"
      ? "فعال\u200cسازی با اسم جدید"
      : "بررسی دستی"
  const review = decision.status === "manual" ? "نیازمند بررسی" : "تأیید اپراتور"
  return [
    item.contract || "",
    item.fa || "",
    item.cat || "",
    item.url || "",
    item.owner || "",
    item.mobile || "",
    item.nbo || "",
    label,
    decision.reason || "",
    label,
    decision.fa || "",
    decision.en || "",
    review,
    "",
    decision.against || "",
    ...FIELD_KEYS.flatMap((key) => {
      const pair = (decision.fields || []).find((item) => item && item.key === key)
      return fieldPair(pair && pair.verdict, pair && pair.note)
    }),
  ]
}
export function prepareTables(nfValues, onlineValues, socialValues, duplicateFlags = []) {
  if (!nfValues || nfValues.length < 2) throw new Error("New Flow خالی است.")
  if (!onlineValues || onlineValues.length < 2) throw new Error("online خالی است.")
  if (!socialValues || socialValues.length < 2) throw new Error("social خالی است.")
  const mapping = resolveNewFlow(nfValues[0])
  const online = rowsAsObjects(onlineValues)
  const social = rowsAsObjects(socialValues)
  const onlineCols = helperCols(online.headers, false)
  const socialCols = helperCols(social.headers, true)
  const items = []
  for (let sourceRow = 1; sourceRow < nfValues.length; sourceRow += 1) {
    const src = nfValues[sourceRow]
    if (!src || !src.some((value) => String(value || "").trim())) continue
    if (cellAt(src, mapping.filterN) !== FILTER_N) continue
    if (cellAt(src, mapping.filterP) || cellAt(src, mapping.filterZ)) continue
    const fa = cellAt(src, mapping.fa)
    const en = cellAt(src, mapping.en)
    const first = cellAt(src, mapping.ownerFirst)
    const last = cellAt(src, mapping.ownerLast)
    const url = cellAt(src, mapping.url)
    items.push({
      contract: cellAt(src, mapping.contract),
      fa,
      en,
      cat: cellAt(src, mapping.cat),
      sub: cellAt(src, mapping.sub),
      city: cityFromBranch(cellAt(src, mapping.city)),
      duplicateFa: Boolean(duplicateFlags[sourceRow] && duplicateFlags[sourceRow].fa),
      duplicateEn: Boolean(duplicateFlags[sourceRow] && duplicateFlags[sourceRow].en),
      url,
      kind: classifyUrl(url),
      owner_id: cellAt(src, mapping.ownerId),
      owner_first: first,
      owner_last: last,
      owner: [first, last].filter(Boolean).join(" "),
      mobile: cellAt(src, mapping.mobile),
      nbo: nboOf(nfValues[0], src),
    })
  }
  if (!items.length) throw new Error("هیچ ردیفی پس از فیلتر New Flow باقی نماند.")
  return {
    items,
    onlineIndex: buildOnlineIndex(online.rows, onlineCols),
    onlineRows: online.rows,
    socialIndex: buildSocialIndex(social.rows, socialCols),
    onlineCols,
    socialCols,
  }
}
export function outputTables(rows) {
  const ready = []
  const rename = []
  const manual = []
  for (const row of rows) {
    const label = row[7] || ""
    if (label === "آماده فعال\u200cسازی") ready.push(row)
    else if (label === "فعال\u200cسازی با اسم جدید") rename.push(row)
    else manual.push(row)
  }
  return [
    ["general", [HEADERS, ...rows]],
    [OUTPUT[1], [HEADERS, ...ready]],
    [OUTPUT[2], [HEADERS, ...rename]],
    [OUTPUT[3], [HEADERS, ...manual]],
    [OUTPUT[4], [HEADERS]],
  ]
}
export function countsOf(rows) {
  const counts = { general: rows.length, ready: 0, rename: 0, manual: 0 }
  for (const row of rows) {
    const label = row[7] || ""
    if (label === "آماده فعال\u200cسازی") counts.ready += 1
    else if (label === "فعال\u200cسازی با اسم جدید") counts.rename += 1
    else counts.manual += 1
  }
  return counts
}
