import { ENAMAD_UNREAD, allowedPageUrl } from "./site.js"

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
  const text = String(url || "").trim()
  if (!text) return ""
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
      if (part.includes(".") || part.includes("://")) return part
    }
  }
  return token
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
  const lowered = raw.toLowerCase()
  if (SOCIAL_HOSTS.some((domain) => lowered.includes(domain))) return "social"
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
function suggestedEnglish(item) {
  const text = [slugPart(item.sub), slugPart(item.en)].filter(Boolean).join("-")
  return text.replace(/^[^a-z]+/, "").replace(/^-+|-+$/g, "")
}
function suggestedPersian(item) {
  return [String(item.sub || "").trim(), String(item.fa || "").trim()].filter(Boolean).join(" ")
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
function sellsMatch(item, page) {
  if (!page || !page.opened) return false
  const blob = fold((page.text || "") + " " + (page.sold || ""))
  const groups = [tokens(item.cat), tokens(item.sub)].filter((list) => list.length)
  if (!groups.length) return true
  return groups.every((list) => list.some((token) => blob.includes(token)))
}
function ownerState(item, page) {
  if (!page || !page.opened) return "closed"
  if (!page.holder || page.enamadUnread) return "unread"
  const holder = fold(page.holder)
  const first = fold(item.owner_first)
  const last = fold(item.owner_last)
  if (!first && !last) return "empty"
  if (first && !holder.includes(first)) return "no"
  if (last && !holder.includes(last)) return "no"
  return "yes"
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
function decideWebsite(item, hits, cols, page) {
  if (hits.length > 1) {
    return result("manual", item.fa || "", item.en || "", "با این لینک چند فروشنده در تب online پیدا شد.", "")
  }
  const hit = hits.length === 1 ? hits[0] : null
  if (hit) {
    const id = compareId(item.owner_id, objCell(hit, cols.id))
    if (id[0] !== OK) return result("manual", item.fa || "", item.en || "", id[1], "")
  }
  const tabFa = hit ? objCell(hit, cols.fa) : ""
  const tabEn = hit ? objCell(hit, cols.en) : ""
  const [fa, en] = shownNames(hit, cols, ONLINE_NAME)
  if (!page || !page.opened) {
    const reason = page && page.error ? "سایت باز نشد. " + page.error : "سایت باز نشد."
    return result("manual", fa, en, reason, "")
  }
  if (page.enamadUnread || !page.holder) return result("manual", fa, en, ENAMAD_UNREAD, "")
  const owner = ownerState(item, page)
  const sells = sellsMatch(item, page)
  if (owner === "yes" && sells) {
    if (brandDiffers(item, tabFa, tabEn, page)) {
      return result(
        "rename",
        suggestedPersian(item),
        suggestedEnglish(item),
        "نام صاحب امتیاز و آنچه می‌فروشد جور است و نام برند فرق دارد.",
        page.certificate === "dinamad" ? "دی‌نماد" : "اینماد",
      )
    }
    let reason = "آماده فعال‌سازی است چون دسته، آنچه می‌فروشد، و صاحب امتیاز اینماد یا دی‌نماد جور است."
    const phone = hit ? compareMobile(item.mobile, objCell(hit, cols.mobile)) : [OK, ""]
    if (phone[0] === NO && phone[1]) reason += " " + phone[1]
    return result("ready", fa, en, reason, page.certificate === "dinamad" ? "دی‌نماد" : "اینماد")
  }
  if (owner === "no") return result("manual", fa, en, "نام یا نام خانوادگی مالک با صاحب امتیاز اینماد یا دی‌نماد یکی نیست.", "")
  if (owner === "empty") return result("manual", fa, en, "نام مالک در درخواست خالی است.", "")
  return result("manual", fa, en, "دسته یا آنچه سایت می‌فروشد با درخواست جور نیست.", "")
}
export function decideRow(item, ctx, page) {
  if (item.kind === "website") return decideWebsite(item, lookupOnline(item.url, ctx.onlineIndex), ctx.onlineCols, page)
  return decideSocial(item, lookupSocial(item.url, ctx.socialIndex), ctx.socialCols)
}
export function shouldOpen(item, ctx) {
  if (!item || item.kind !== "website") return false
  const hits = lookupOnline(item.url, ctx.onlineIndex)
  if (hits.length > 1) return false
  if (hits.length === 1) {
    const id = compareId(item.owner_id, objCell(hits[0], ctx.onlineCols.id))
    if (id[0] !== OK) return false
  }
  return true
}
function fieldPair(verdict, note) {
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
export function prepareTables(nfValues, onlineValues, socialValues) {
  if (!nfValues || nfValues.length < 2) throw new Error("New Flow خالی است.")
  if (!onlineValues || onlineValues.length < 2) throw new Error("online خالی است.")
  if (!socialValues || socialValues.length < 2) throw new Error("social خالی است.")
  const mapping = resolveNewFlow(nfValues[0])
  const online = rowsAsObjects(onlineValues)
  const social = rowsAsObjects(socialValues)
  const onlineCols = helperCols(online.headers, false)
  const socialCols = helperCols(social.headers, true)
  const items = []
  for (const src of nfValues.slice(1)) {
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
