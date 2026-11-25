import { allowedPageUrl } from "./site.js"
import {
  makeNameSuggestions as makeNamingSuggestions,
  suggestedEnglish as namingSuggestedEnglish,
  suggestedPersian as namingSuggestedPersian,
} from "./naming-rules.js"

export const FILTER_N = "ONLINE SITE EXISTS - DUPLICATE NAME KEPT"
const OUTPUT = ["general", "آماده فعال\u200cسازی", "نیاز به تغییر نام", "نیازمند بررسی دستی", "تغییر نام انجام شد"]
const SOCIAL_NAME = "از تب social اسم پیدا نشد"
const ONLINE_NAME = "از تب آنلاین اسم پیدا نشد"
const OK = "جور است"
const NO = "جور نیست"
const UNK = "نتوانستم بررسی کنم"
const SOCIAL_HOSTS = ["instagram.com", "instagr.am", "t.me", "telegram.me", "telegram.org", "rubika.ir", "web.rubika.ir", "whatsapp.com", "wa.me", "api.whatsapp.com", "twitter.com", "x.com", "linkedin.com", "aparat.com", "facebook.com", "fb.com", "fb.me", "fb.watch", "tiktok.com", "youtube.com", "youtu.be", "eitaa.com", "eitaa.ir", "bale.ai", "ble.ir", "splus.ir", "gap.im", "igap.net", "pin.it", "pinterest.com", "threads.net"]
const IG_SKIP = new Set(["p", "reel", "reels", "stories", "tv", "explore", "accounts", "direct", "about"])
const PATH_SKIP = new Set(["p", "reel", "reels", "stories", "tv", "page", "joinchat", "joinc"])
export const HEADERS = ["شناسه درخواست", "برند", "دسته", "سایت", "نام متقاضی", "موبایل", "وضعیت NBO", "پیشنهاد سامانه", "دلیل پیشنهاد", "تصمیم نهایی", "نام فارسی اصلی", "نام انگلیسی اصلی", "وضعیت بررسی", "انجام تغییر نام", "مرجع تطبیق", "لینک", "توضیح لینک", "کد ملی", "توضیح کد ملی", "موبایل نتیجه", "توضیح موبایل", "نام فارسی فروشگاه", "توضیح نام فارسی", "نام انگلیسی فروشگاه", "توضیح نام انگلیسی", "نام صاحب امتیاز", "توضیح نام صاحب امتیاز", "نام خانوادگی صاحب امتیاز", "توضیح نام خانوادگی", "گواهی", "توضیح گواهی", "دسته نتیجه", "توضیح دسته", "زیردسته نتیجه", "توضیح زیردسته", "شهر شعبه نتیجه", "توضیح شهر شعبه", "پیشنهاد نام فارسی", "پیشنهاد نام انگلیسی", "نام فارسی قابل فعال‌سازی", "نام انگلیسی قابل فعال‌سازی"]
const REPORT_FIELDS = HEADERS
const STATUS_FIELDS = HEADERS
function orderedHeaders(first, all) {
  return [...first.filter((header) => all.includes(header)), ...all.filter((header) => !first.includes(header))]
}
const GENERAL_FIRST = [
  "شناسه درخواست", "تصمیم نهایی", "نام فارسی اصلی", "نام انگلیسی اصلی", "سایت", "دسته", "نام متقاضی", "موبایل", "وضعیت NBO",
  "مرجع تطبیق", "دلیل پیشنهاد", "وضعیت بررسی", "پیشنهاد نام فارسی", "پیشنهاد نام انگلیسی",
  "نام فارسی قابل فعال‌سازی", "نام انگلیسی قابل فعال‌سازی", "انجام تغییر نام",
]
const READY_FIRST = [
  "شناسه درخواست", "نام فارسی قابل فعال‌سازی", "نام انگلیسی قابل فعال‌سازی", "تصمیم نهایی", "نام فارسی اصلی", "نام انگلیسی اصلی",
  "سایت", "دسته", "نام متقاضی", "موبایل", "مرجع تطبیق", "دلیل پیشنهاد", "وضعیت بررسی",
]
const RENAME_FIRST = [
  "پیشنهاد نام فارسی", "پیشنهاد نام انگلیسی", "شناسه درخواست", "تصمیم نهایی", "نام فارسی اصلی", "نام انگلیسی اصلی",
  "سایت", "دسته", "نام متقاضی", "موبایل", "مرجع تطبیق", "دلیل پیشنهاد", "وضعیت بررسی",
]
const MANUAL_FIRST = [
  "شناسه درخواست", "تصمیم نهایی", "نام فارسی اصلی", "نام انگلیسی اصلی", "سایت", "دسته", "نام متقاضی", "موبایل",
  "دلیل پیشنهاد", "مرجع تطبیق", "وضعیت بررسی",
]
const CHANGED_FIRST = [
  "شناسه درخواست", "تصمیم نهایی", "نام فارسی قابل فعال‌سازی", "نام انگلیسی قابل فعال‌سازی", "پیشنهاد نام فارسی", "پیشنهاد نام انگلیسی",
  "نام فارسی اصلی", "نام انگلیسی اصلی", "سایت", "دسته", "دلیل پیشنهاد", "مرجع تطبیق",
]
export const OUTPUT_SCHEMAS = Object.freeze({
  general: orderedHeaders(GENERAL_FIRST, REPORT_FIELDS),
  [OUTPUT[1]]: orderedHeaders(READY_FIRST, STATUS_FIELDS),
  [OUTPUT[2]]: orderedHeaders(RENAME_FIRST, STATUS_FIELDS),
  [OUTPUT[3]]: orderedHeaders(MANUAL_FIRST, STATUS_FIELDS),
  [OUTPUT[4]]: orderedHeaders(CHANGED_FIRST, STATUS_FIELDS),
})
const FIELD_KEYS = ["link", "national_id", "mobile", "fa", "en", "owner_first", "owner_last", "certificate", "category", "subcategory", "city"]

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
export function isReviewedSourceStatus(filterN, filterP, filterZ) {
  return String(filterN || "").trim() === FILTER_N &&
    (String(filterP || "").trim() !== "" || String(filterZ || "").trim().toLowerCase() === "completed")
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
const NAME_NOISE = new Set(["فروشگاه", "بوتیک", "آنلاین", "پوشاک", "لباس", "زنانه", "مردانه", "بچگانه", "store", "shop", "online", "fashion", "clothing", "apparel", "women", "woman", "men", "mens", "womens", "kids"])
const GENDER_WORDS = { women: ["زنانه", "دخترانه", "women", "woman", "female"], men: ["مردانه", "پسرانه", "men", "mens", "male"], kids: ["بچگانه", "کودک", "نوزاد", "kids", "children", "baby"] }
const PRODUCT_FAMILIES = [
  ["clothing", ["پوشاک", "لباس", "مانتو", "شلوار", "پیراهن", "تی شرت", "تیشرت", "clothing", "apparel"]],
  ["footwear", ["کفش", "کتانی", "بوت", "صندل", "دمپایی", "shoes", "footwear", "sneakers"]],
  ["bags", ["کیف", "کوله", "چمدان", "bags", "backpack", "luggage"]],
  ["jewelry", ["نقره", "طلا", "جواهر", "زیورآلات", "انگشتر", "گردنبند", "دستبند", "گوشواره", "silver", "gold", "jewelry", "jewellery"]],
  ["cosmetics", ["آرایشی", "بهداشتی", "لوازم آرایش", "کرم", "رژ", "عطر", "ادکلن", "cosmetics", "skincare", "perfume"]],
  ["electronics", ["موبایل", "گوشی", "لپتاپ", "لپ تاپ", "تبلت", "کامپیوتر", "الکترونیک", "electronics", "mobile phone", "laptop", "computer"]],
  ["appliances", ["لوازم خانگی", "یخچال", "تلویزیون", "لباسشویی", "جاروبرقی", "ظرفشویی", "appliances", "refrigerator", "television"]],
  ["food", ["مواد غذایی", "خوراکی", "قهوه", "شیرینی", "آجیل", "خشکبار", "food", "grocery", "coffee"]],
  ["books", ["کتاب", "نوشت افزار", "books", "stationery"]],
  ["furniture", ["مبلمان", "میز", "صندلی", "دکوراسیون", "furniture", "home decor"]],
]
function nameTokens(value, stripNoise = true) {
  const clean = fold(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  const all = clean ? clean.split(/\s+/) : []
  const core = stripNoise ? all.filter((part) => !NAME_NOISE.has(part)) : all
  return { all, core: core.length ? core : all }
}
function editDistanceAtMostOne(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) i += 1
    else if (right.length > left.length) j += 1
    else { i += 1; j += 1 }
  }
  if (i < left.length || j < right.length) edits += 1
  return edits <= 1
}
function tokenNear(left, right) {
  return left === right || (Math.min(left.length, right.length) >= 4 && editDistanceAtMostOne(left, right))
}
function brandRelation(left, right) {
  if (!String(left || "").trim() || !String(right || "").trim()) return "unknown"
  const leftData = nameTokens(left)
  const rightData = nameTokens(right)
  const a = leftData.core
  const b = rightData.core
  const leftBrand = leftData.all.filter((part) => !NAME_NOISE.has(part))
  const rightBrand = rightData.all.filter((part) => !NAME_NOISE.has(part))
  const leftGender = genderOf(left)
  const rightGender = genderOf(right)
  const opposingGender = (leftGender.includes("women") && rightGender.includes("men")) ||
    (leftGender.includes("men") && rightGender.includes("women")) ||
    (leftGender.includes("kids") && (rightGender.includes("women") || rightGender.includes("men"))) ||
    (rightGender.includes("kids") && (leftGender.includes("women") || leftGender.includes("men")))
  if (opposingGender && !leftBrand.some((part) => rightBrand.includes(part))) return "close"
  if (a.join(" ") === b.join(" ")) return "same"
  if (a.every((part) => b.includes(part)) || b.every((part) => a.includes(part))) return "same"
  if (a.every((part) => b.some((other) => tokenNear(part, other))) && b.every((part) => a.some((other) => tokenNear(part, other)))) return "same"
  if (a.length === 1 && b.length === 1 && tokenNear(a[0], b[0])) return "same"
  const common = a.filter((part) => b.includes(part))
  if (common.length || a.some((part) => b.some((other) => tokenNear(part, other)))) return "close"
  const rawA = leftData.all
  const rawB = rightData.all
  if (rawA.some((part) => rawB.includes(part))) return "close"
  return "different"
}
function nameCheck(left, right, label) {
  const relation = brandRelation(left, right)
  const verdict = relation === "same" ? OK : relation === "different" ? NO : UNK
  const note = relation === "same"
    ? `نام ${label} با اختلاف جزئی/واژهٔ توضیحی یکسان حساب شد.`
    : relation === "different"
      ? `نام ${label} کاملاً متفاوت است: درخواست «${left}» و مرجع «${right}».`
      : `نام ${label} به‌طور قطعی تطبیق داده نشد؛ بررسی نشد: درخواست «${left || "خالی"}» و مرجع «${right || "خالی"}».`
  return [verdict, note, relation]
}
function productFamilies(value) {
  const text = fold(value)
  return PRODUCT_FAMILIES.filter(([, words]) => words.some((word) => text.includes(fold(word)))).map(([key]) => key)
}
function genderOf(value) {
  const text = fold(value)
  return Object.entries(GENDER_WORDS).filter(([, words]) => words.some((word) => text.includes(fold(word)))).map(([key]) => key)
}
function relatedProductFamilies(left, right) {
  const related = new Set(["clothing:footwear", "footwear:bags", "clothing:bags"])
  return related.has(left + ":" + right) || related.has(right + ":" + left)
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
function cityFromBranch(value) {
  const parts = String(value || "").split(/\s*[-–—]\s*/).filter(Boolean)
  return (parts.length > 1 ? parts[parts.length - 1] : (parts[0] || "")).trim()
}
function suggestedEnglish(item) {
  return namingSuggestedEnglish(item)
}
function suggestedPersian(item) {
  return namingSuggestedPersian(item)
}
function pageNameCheck(names, page) {
  const text = fold((page && page.text) || "")
  if (!text || text.replace(/\s/g, "").length < 40) return [UNK, "نام فروشگاه روی سایت خوانا نبود؛ تطبیق نام بررسی نشد."]
  for (const name of names) {
    const parts = nameTokens(name).core
    if (parts.length && parts.every((part) => text.includes(part))) return [OK, "نام فروشگاه با واژه‌های اصلی نام درخواست در محتوای سایت دیده شد."]
  }
  return [UNK, "نام مستقل فروشگاه از محتوای سایت قطعی خوانده نشد؛ تطبیق نام بررسی نشد."]
}
function brandCheck(item, tabFa, tabEn, page) {
  const checks = []
  if (item.fa && tabFa) checks.push(brandRelation(item.fa, tabFa))
  if (item.en && tabEn) checks.push(brandRelation(item.en, tabEn))
  if (checks.length && checks.every((value) => value === "same")) return [OK, "نام فروشگاه با اختلاف جزئی یا واژهٔ توضیحی یکسان حساب شد."]
  if (checks.length && checks.every((value) => value === "different")) {
    return [NO, "نام فروشگاه کاملاً متفاوت است؛ نام درخواست و نام ردیف آنلاین با هم تطبیق ندارند."]
  }
  if (checks.includes("same") && checks.includes("different")) return [UNK, "نام فارسی و انگلیسی نتیجهٔ متناقض دارند؛ تطبیق نام بررسی نشد."]
  if (checks.includes("close")) return [UNK, "شباهت نام برای تطبیق قطعی کافی نیست؛ نام فروشگاه بررسی نشد."]
  return pageNameCheck([item.fa, item.en], page)
}
function fieldNameCheck(left, right, page, label) {
  if (left && right) {
    const [verdict, note] = nameCheck(left, right, label)
    return [verdict, note]
  }
  if (left && page) return pageNameCheck([left], page)
  return [UNK, `نام ${label} کامل خوانده نشد؛ تطبیق نام بررسی نشد.`]
}
function sellsMatch(value, page) {
  if (!page || !page.opened) return UNK
  const text = fold(page.text || "")
  const sold = fold(page.sold || "")
  const blob = fold(text + " " + sold)
  const wanted = tokens(value)
  if (!wanted.length || blob.replace(/\s/g, "").length < 40) return UNK
  if (/(?:captcha|cloudflare|enable javascript|javascript is required|دسترسی ربات|تأیید کنید که ربات نیستید)/i.test(blob)) return UNK
  const requestedFamilies = productFamilies(value)
  const soldFamilies = productFamilies(sold)
  const pageFamilies = productFamilies(text)
  const evidenceFamilies = soldFamilies.length ? soldFamilies : pageFamilies
  const requestedGender = genderOf(value)
  const evidenceGender = genderOf(soldFamilies.length ? sold : text)
  if (requestedGender.length && evidenceGender.length && !requestedGender.some((gender) => evidenceGender.includes(gender))) {
    if (requestedFamilies.some((family) => evidenceFamilies.includes(family))) return UNK
  }
  if (requestedFamilies.length && evidenceFamilies.length) {
    if (requestedFamilies.some((family) => evidenceFamilies.includes(family))) {
      if (!soldFamilies.length && pageFamilies.length) return UNK
      return OK
    }
    if (requestedFamilies.some((left) => evidenceFamilies.some((right) => relatedProductFamilies(left, right)))) return UNK
    return NO
  }
  if (wanted.some((token) => blob.includes(token))) return OK
  return page.catalogOpened && evidenceFamilies.length ? NO : UNK
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
  if (status === "rename" && (!String(fa || "").trim() || !String(en || "").trim())) {
    return {
      status: "manual",
      fa: "",
      en: "",
      reason: String(reason || "") + " نام پیشنهادی فارسی و انگلیسی با اطمینان کافی ساخته نشد؛ به بررسی دستی منتقل شد و نام حدسی پیشنهاد نشد.",
      against: against || "",
    }
  }
  return { status, fa, en, reason, against: against || "" }
}
function reportUnchecked(reason, fields) {
  const unverified = (fields || []).filter((one) => one && one.verdict === UNK)
  if (!unverified.length) return reason
  const details = unverified.map((one) => one.name + ": " + (one.note || "بررسی نشد.")).join(" ")
  return reason + " مواردی که بررسی نشد: " + details
}
function decideSocial(item, hits, cols) {
  let hit = hits.length === 1 ? hits[0] : null
  let hitById = false
  if (!hit && hits.length > 1) {
    const byId = hits.filter((row) => compareId(item.owner_id, objCell(row, cols.id))[0] === OK)
    if (byId.length === 1) {
      hit = byId[0]
      hitById = true
    }
  }
  const linkVerdict = hit ? OK : hits.length > 1 ? UNK : NO
  const linkNote = hit
    ? hitById ? "چند ردیف با لینک پیدا شد؛ کد ملی درخواست فقط با همین یک ردیف جور است." : "لینک در تب social دقیقاً به یک ردیف رسید."
    : hits.length > 1
      ? "لینک به " + hits.length + " ردیف رسید و کد ملی نتوانست یک ردیف یکتا را مشخص کند."
      : !String(item.url || "").trim()
        ? "لینک سوشال در درخواست خالی است."
        : "این لینک در تب social پیدا نشد."
  const id = hit ? compareId(item.owner_id, objCell(hit, cols.id)) : [UNK, hits.length > 1 ? "چند ردیف با لینک پیدا شد و کد ملی هیچ ردیف یکتایی را مشخص نکرد." : "ردیف یکتایی پیدا نشد و کد ملی مقایسه نشد."]
  const tabFa = hit ? objCell(hit, cols.fa) : ""
  const tabEn = hit ? objCell(hit, cols.en) : ""
  const fa = hit ? (tabFa || item.fa || "") : (item.fa || "")
  const en = hit ? (tabEn || item.en || "") : (item.en || "")
  const faCheck = hit ? fieldNameCheck(item.fa, tabFa, null, "فارسی فروشگاه") : [UNK, "ردیف یکتایی پیدا نشد؛ تطبیق نام فارسی بررسی نشد."]
  const faRelation = hit && tabFa && item.fa ? brandRelation(item.fa, tabFa) : "unknown"
  const fields = [
    { key: "link", name: "لینک در تب social", verdict: linkVerdict, note: linkNote },
    { key: "national_id", name: "کد ملی", verdict: id[0], note: id[1] },
    { key: "fa", name: "نام فارسی فروشگاه", verdict: faCheck[0], note: faCheck[1] },
    { key: "en", name: "نام انگلیسی فروشگاه", verdict: "بررسی نمی‌شود", note: "نام انگلیسی در وضعیت سوشال معیار تصمیم نیست؛ نام فارسی بررسی می‌شود." },
  ]
  if (!hit) {
    return { ...result("rename", suggestedPersian(item), suggestedEnglish(item), reportUnchecked("تغییر نام پیشنهاد شد چون لینک سوشال به یک ردیف یکتا نرسید. لینک پیدا نشد یا تطبیق آن مبهم بود؛ بررسی نشد. لینک و نام پیشنهادی را در جزئیات همین ردیف بررسی کنید.", fields), "تب social"), fields }
  }
  if (id[0] === NO) {
    return { ...result("rename", suggestedPersian(item), suggestedEnglish(item), reportUnchecked("تغییر نام پیشنهاد شد چون کد ملی درخواست و ردیف تب social جور نیست: " + id[1], fields), "تب social"), fields }
  }
  if (id[0] !== OK) {
    return { ...result("manual", item.fa || "", item.en || "", reportUnchecked("کد ملی در تب social خوانده نشد؛ تطبیق کد ملی بررسی نشد. " + id[1], fields), "تب social"), fields }
  }
  if (faRelation === "different") {
    return { ...result("rename", suggestedPersian(item), suggestedEnglish(item), reportUnchecked("تغییر نام پیشنهاد شد چون نام فارسی فروشگاه با نام تب social کاملاً متفاوت است. " + faCheck[1], fields), "تب social"), fields }
  }
  if (faRelation !== "same") {
    return { ...result("manual", item.fa || "", item.en || "", reportUnchecked("بررسی دستی لازم است چون نام فارسی فروشگاه فقط تا حدی شبیه است یا قابل خواندن نیست؛ تطبیق نام بررسی نشد. " + faCheck[1], fields), "تب social"), fields }
  }
  const reason = "آماده فعال‌سازی است چون لینک یکتا، کد ملی و نام فارسی با تب social جور هستند. شماره موبایل در بررسی سوشال معیار نیست."
  return { ...result("ready", fa, en, reportUnchecked(reason, fields), "تب social"), fields, activationFa: tabFa || "نام فارسی در تب social یافت نشد", activationEn: tabEn || "نام انگلیسی در تب social یافت نشد" }
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
  const urlId = hits.length === 1 ? compareId(item.owner_id, objCell(hits[0], cols.id)) : [UNK, ""]
  const onlineConflict = (hits.length > 1 && !hit) || (hits.length === 1 && urlId[0] === NO)
  const evidence = hits.length
    ? (hit ? "تب آنلاین با URL یا کد ملی تطبیق شد." : "چند رکورد تب آنلاین با این URL پیدا شد و تطبیقشان روشن نیست.")
    : "در تب آنلاین یافت نشد؛ نبودن ردیف به‌تنهایی مانع آماده‌سازی نیست."
  const tabFa = hit ? objCell(hit, cols.fa) : ""
  const tabEn = hit ? objCell(hit, cols.en) : ""
  const fa = tabFa || item.fa || ""
  const en = tabEn || item.en || ""
  const fields = []
  const add = (key, name, verdict, note) => fields.push({ key, name, verdict: verdict || UNK, note: note || "" })
  const finish = (status, resultFa, resultEn, reason, against, activationFa = "", activationEn = "") => ({
    ...result(status, resultFa, resultEn, reportUnchecked(reason, fields), against),
    fields,
    activationFa,
    activationEn,
  })
  add("link", "لینک در تب آنلاین", hits.length === 1 ? OK : (hits.length > 1 ? UNK : NO), hits.length ? evidence : "در تب آنلاین یافت نشد؛ این مورد ثبت شد و به‌تنهایی مانع آماده‌سازی نیست.")
  add("national_id", "کد ملی در تب آنلاین", hit ? compareId(item.owner_id, objCell(hit, cols.id))[0] : (idMatches.length === 1 ? OK : (idMatches.length > 1 ? UNK : compareId(item.owner_id, "")[0])), idMatches.length ? idMatches.length + " ردیف با کد ملی پیدا شد." : "با کد ملی ردیفی پیدا نشد؛ تطبیق کد ملی بررسی نشد.")
  const onlineMobile = hit ? compareMobile(item.mobile, objCell(hit, cols.mobile)) : [UNK, "ردیف آنلاین پیدا نشد؛ تطبیق موبایل بررسی نشد."]
  add("mobile", "موبایل در تب آنلاین", onlineMobile[0], onlineMobile[1] || "موبایل یکی از دو ردیف خالی است؛ تطبیق موبایل بررسی نشد.")
  const faField = fieldNameCheck(item.fa, tabFa, page, "فارسی فروشگاه")
  const enField = fieldNameCheck(item.en, tabEn, page, "انگلیسی فروشگاه")
  const storeName = brandCheck(item, tabFa, tabEn, page)
  add("fa", "نام فارسی فروشگاه", faField[0], faField[1])
  add("en", "نام انگلیسی فروشگاه", enField[0], enField[1])
  const cert = certificateState(page)
  const certificateNote = [
    cert[1],
    page && page.enamadUrl ? "لینک اختصاصی اینماد: " + page.enamadUrl : "",
  ].filter(Boolean).join(" ")
  if (!page || !page.opened) {
    const reason = page && page.error ? page.error : "سایت باز نشد."
    const certNote = certificateNote || "استعلام اینماد نتیجهٔ قطعی نداد."
    add("owner_first", "نام صاحب امتیاز", UNK, "چون سایت باز نشد، صاحب امتیاز از اینماد بررسی نشد.")
    add("owner_last", "نام خانوادگی صاحب امتیاز", UNK, "چون سایت باز نشد، نام خانوادگی صاحب امتیاز بررسی نشد.")
    add("certificate", "اینماد", cert[0], certNote)
    add("category", "دسته", UNK, "سایت باز نشد؛ تطبیق دسته بررسی نشد.")
    add("subcategory", "زیردسته", UNK, "سایت باز نشد؛ تطبیق زیردسته بررسی نشد.")
    const city = cityState(item, page)
    add("city", "شهر شعبه", city[0], city[1])
    return finish("manual", fa, en, reason + " " + certNote + " " + evidence, "")
  }
  const owner = ownerState(item, page)
  const city = cityState(item, page)
  const category = sellsMatch(item.cat, page)
  const subcategory = sellsMatch(item.sub, page)
  const holder = fold(page.holder)
  const first = fold(item.owner_first)
  const last = fold(item.owner_last)
  const firstVerdict = !first || !page.holder ? UNK : holder.includes(first) ? OK : NO
  const lastVerdict = !last || !page.holder ? UNK : holder.includes(last) ? OK : NO
  add("owner_first", "نام صاحب امتیاز", firstVerdict, page.holder ? (firstVerdict === NO ? "صاحب امتیاز با نام مالک درخواست تطبیق ندارد: " + page.holder : firstVerdict === OK ? "نام مالک در صاحب امتیاز خوانده شد: " + page.holder : "نام مالک درخواست خالی است؛ بررسی نشد.") : "نام صاحب امتیاز اینماد خوانده نشد؛ تطبیق بررسی نشد.")
  add("owner_last", "نام خانوادگی صاحب امتیاز", lastVerdict, page.holder ? (lastVerdict === NO ? "نام خانوادگی صاحب امتیاز با مالک درخواست تطبیق ندارد: " + page.holder : lastVerdict === OK ? "نام خانوادگی در صاحب امتیاز خوانده شد: " + page.holder : "نام خانوادگی مالک درخواست خالی است؛ بررسی نشد.") : "نام خانوادگی صاحب امتیاز اینماد خوانده نشد؛ تطبیق بررسی نشد.")
  add("certificate", "اینماد", cert[0], certificateNote)
  add("category", "دسته", category, category === OK ? "دسته با شواهد کالاهای سایت جور است." : category === NO ? "گروه کالایی سایت با دستهٔ درخواست تفاوت روشن دارد." : "شواهد کافی یا قطعی نبود؛ تطبیق دسته بررسی نشد.")
  add("subcategory", "زیردسته", subcategory, subcategory === OK ? "زیردسته با شواهد کالاهای سایت جور است." : subcategory === NO ? "گروه کالایی سایت با زیردستهٔ درخواست تفاوت روشن دارد." : "شواهد کافی یا قطعی نبود؛ تطبیق زیردسته بررسی نشد.")
  add("city", "شهر شعبه", city[0], city[1])
  if (onlineConflict) return finish("manual", fa, en, "تطبیق ردیف آنلاین مبهم است؛ نتیجهٔ تب به‌تنهایی بررسی نشد. " + evidence, "تب آنلاین")
  if (owner === "no") return finish("rename", suggestedPersian(item), suggestedEnglish(item), "تغییر نام لازم است چون صاحب امتیاز اینماد/دی‌نماد با مالک درخواست تطبیق ندارد. " + evidence, "اینماد/دی‌نماد")
  if (owner === "empty" || owner === "unread") return finish("manual", fa, en, "اطلاعات لازم صاحب امتیاز خوانده نشد یا نام مالک در درخواست خالی است؛ تطبیق بررسی نشد. " + evidence, "")
  if (cert[0] !== OK) return finish("manual", fa, en, "گواهی یا وضعیت آن قابل تأیید نبود؛ بررسی نشد: " + cert[1] + " " + evidence, "")
  if (category === NO || subcategory === NO) {
    const mismatches = [category === NO ? "دسته" : "", subcategory === NO ? "زیردسته" : ""].filter(Boolean).join(" و ")
    return finish("rename", suggestedPersian(item), suggestedEnglish(item), "تغییر نام لازم است چون محصولات سایت با " + mismatches + " درخواست تفاوت روشن دارند. " + evidence, "سایت")
  }
  if (storeName[0] === NO) {
    const phoneNote = onlineMobile[0] === NO ? " شمارهٔ موبایل هم با ردیف آنلاین متفاوت است." : ""
    return finish("rename", suggestedPersian(item), suggestedEnglish(item), "تغییر نام لازم است چون نام فروشگاه با نام ثبت‌شده در New Flow کاملاً متفاوت است. " + storeName[1] + phoneNote + " " + evidence, "تب آنلاین و سایت")
  }
  if (city[0] !== OK) return finish("manual", fa, en, "تطبیق شهر شعبه قطعی نیست؛ بررسی دستی لازم است. " + city[1] + " " + evidence, "اینماد/دی‌نماد و ستون G")
  if (category !== OK || subcategory !== OK) {
    const unread = [category !== OK ? "دسته" : "", subcategory !== OK ? "زیردسته" : ""].filter(Boolean).join(" و ")
    return finish("manual", fa, en, "شواهد محصول مبهم یا ناکافی است؛ تطبیق " + unread + " بررسی نشد. " + evidence, "سایت")
  }
  if (storeName[0] !== OK) return finish("manual", fa, en, "نام فروشگاه قطعی خوانده یا تطبیق داده نشد؛ بررسی نشد. " + storeName[1] + " " + evidence, "سایت و تب آنلاین")
  const certificate = page.certificate === "dinamad" ? "دی‌نماد" : "اینماد"
  const reason = "آماده فعال‌سازی است چون صاحب امتیاز، گواهی، شهر ستون G، دسته و زیردسته با سایت تطبیق دارند. " + evidence
  const activationFa = hits.length ? (tabFa || "نام فارسی در تب آنلاین یافت نشد") : "در تب آنلاین یافت نشد"
  const activationEn = hits.length ? (tabEn || "نام انگلیسی در تب آنلاین یافت نشد") : "در تب آنلاین یافت نشد"
  return finish("ready", fa, en, reason, "تب آنلاین و " + certificate, activationFa, activationEn)
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
  const status = decision.status
  const label = status === "ready"
    ? "آماده فعال\u200cسازی"
    : status === "rename"
      ? "فعال\u200cسازی با اسم جدید"
      : "بررسی دستی"
  const review = status === "manual" ? "نیازمند بررسی" : "تأیید اپراتور"
  const reason = decision.reason || ""
  return [
    item.contract || "",
    item.fa || "",
    item.cat || "",
    item.url || "",
    item.owner || "",
    item.mobile || "",
    item.nbo || "",
    label,
    reason,
    label,
    item.fa || "",
    item.en || "",
    review,
    "",
    decision.against || "",
    ...FIELD_KEYS.flatMap((key) => {
      const pair = (decision.fields || []).find((item) => item && item.key === key)
      return fieldPair(pair && pair.verdict, pair && pair.note)
    }),
    status === "rename" ? decision.fa || "" : "",
    status === "rename" ? decision.en || "" : "",
    status === "ready" ? decision.activationFa || "" : "",
    status === "ready" ? decision.activationEn || "" : "",
  ]
}
export function prepareTables(nfValues, onlineValues, socialValues, duplicateFlags = []) {
  if (!nfValues || nfValues.length < 2) throw new Error("New Flow خالی است.")
  if (!onlineValues || onlineValues.length < 2) throw new Error("تب آنلاین خالی است.")
  if (!socialValues || socialValues.length < 2) throw new Error("social خالی است.")
  const mapping = resolveNewFlow(nfValues[0])
  const online = rowsAsObjects(onlineValues)
  const social = rowsAsObjects(socialValues)
  const onlineCols = helperCols(online.headers, false)
  const socialCols = helperCols(social.headers, true)
  const items = []
  const approvedExamples = []
  const existingFa = new Map()
  const existingEn = new Map()
  for (let sourceRow = 1; sourceRow < nfValues.length; sourceRow += 1) {
    const src = nfValues[sourceRow]
    if (!src) continue
    const faName = cellAt(src, mapping.duplicateFa).trim()
    const enName = cellAt(src, mapping.duplicateEn).trim()
    if (faName) existingFa.set(fold(faName), (existingFa.get(fold(faName)) || 0) + 1)
    if (enName) existingEn.set(slugPart(enName), (existingEn.get(slugPart(enName)) || 0) + 1)
    const readyToLive = cellAt(src, mapping.filterP).trim().toLowerCase() === "ready to live"
    const flags = duplicateFlags[sourceRow] || {}
    if (readyToLive && faName && enName && !flags.fa && !flags.en) {
      approvedExamples.push({
        fa: faName,
        en: enName,
        sourceFa: cellAt(src, mapping.fa),
        sourceEn: cellAt(src, mapping.en),
        cat: cellAt(src, mapping.cat),
        sub: cellAt(src, mapping.sub),
      })
    }
  }
  const nameSuggestions = []
  const suggestionsBySourceRow = new Map()
  const seenSuggestedFa = new Set()
  const seenSuggestedEn = new Set()
  for (let sourceRow = 1; sourceRow < nfValues.length; sourceRow += 1) {
    const src = nfValues[sourceRow]
    if (!src || !src.some((value) => String(value || "").trim())) continue
    const nameItem = {
      sourceRow,
      contract: cellAt(src, mapping.contract),
      fa: cellAt(src, mapping.fa),
      en: cellAt(src, mapping.en),
      cat: cellAt(src, mapping.cat),
      sub: cellAt(src, mapping.sub),
      city: cityFromBranch(cellAt(src, mapping.city)),
      sampleFa: cellAt(src, mapping.duplicateFa),
      sampleEn: cellAt(src, mapping.duplicateEn),
      duplicateFa: Boolean(duplicateFlags[sourceRow] && duplicateFlags[sourceRow].fa),
      duplicateEn: Boolean(duplicateFlags[sourceRow] && duplicateFlags[sourceRow].en),
    }
    Object.assign(nameItem, makeNamingSuggestions(nameItem, approvedExamples, existingFa, existingEn, seenSuggestedFa, seenSuggestedEn))
    const suggestion = {
      sourceRow,
      contract: nameItem.contract,
      suggestionFa: nameItem.suggestionFa,
      suggestionEn: nameItem.suggestionEn,
    }
    nameSuggestions.push(suggestion)
    suggestionsBySourceRow.set(sourceRow, suggestion)
  }
  for (let sourceRow = 1; sourceRow < nfValues.length; sourceRow += 1) {
    const src = nfValues[sourceRow]
    if (!src || !src.some((value) => String(value || "").trim())) continue
    const filterN = cellAt(src, mapping.filterN)
    const filterP = cellAt(src, mapping.filterP)
    const filterZ = cellAt(src, mapping.filterZ)
    if (filterN !== FILTER_N || isReviewedSourceStatus(filterN, filterP, filterZ)) continue
    const fa = cellAt(src, mapping.fa)
    const en = cellAt(src, mapping.en)
    const first = cellAt(src, mapping.ownerFirst)
    const last = cellAt(src, mapping.ownerLast)
    const url = cellAt(src, mapping.url)
    const item = {
      contract: cellAt(src, mapping.contract),
      fa,
      en,
      cat: cellAt(src, mapping.cat),
      sub: cellAt(src, mapping.sub),
      city: cityFromBranch(cellAt(src, mapping.city)),
      sampleFa: cellAt(src, mapping.duplicateFa),
      sampleEn: cellAt(src, mapping.duplicateEn),
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
    }
    Object.assign(item, suggestionsBySourceRow.get(sourceRow) || {})
    items.push(item)
  }
  return {
    items,
    nameSuggestions,
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
  const project = (row, headers) => headers.map((header) => {
    const index = HEADERS.indexOf(header)
    return index >= 0 ? (row[index] ?? "") : ""
  })
  const gridFor = (name, items) => [OUTPUT_SCHEMAS[name], ...items.map((row) => project(row, OUTPUT_SCHEMAS[name]))]
  return [
    ["general", gridFor("general", rows)],
    [OUTPUT[1], gridFor(OUTPUT[1], ready)],
    [OUTPUT[2], gridFor(OUTPUT[2], rename)],
    [OUTPUT[3], gridFor(OUTPUT[3], manual)],
    [OUTPUT[4], gridFor(OUTPUT[4], [])],
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
