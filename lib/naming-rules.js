const GENERIC_EN = new Set(["the", "and", "of", "shop", "store", "online", "official", "iran", "www", "com"])
const GENERIC_FA = new Set(["و", "فروشگاه", "اینترنتی", "آنلاین", "وبسایت", "وب", "سایت"])
const approvedExampleIndex = new WeakMap()
const RULES = [
  { keys: ["پوشاک زنانه", "لباس زنانه"], fa: "پوشاک زنانه", en: "womenswear" },
  { keys: ["پوشاک مردانه", "لباس مردانه"], fa: "پوشاک مردانه", en: "menwear" },
  { keys: ["پوشاک بچگانه", "لباس بچگانه", "لباس کودک"], fa: "پوشاک بچگانه", en: "kids" },
  { keys: ["لباس زیر"], fa: "لباس زیر", en: "underwear" },
  { keys: ["لوازم آرایشی", "آرایشی و بهداشتی", "آرایشی"], fa: "آرایشی", en: "cosmetics" },
  { keys: ["مراقبت پوست", "پوست"], fa: "مراقبت پوست", en: "skincare" },
  { keys: ["مراقبت مو", "مو"], fa: "مراقبت مو", en: "haircare" },
  { keys: ["ساعت"], fa: "ساعت", en: "watch" },
  { keys: ["کفش"], fa: "کفش", en: "shoes" },
  { keys: ["کیف"], fa: "کیف", en: "bags" },
  { keys: ["عینک"], fa: "عینک", en: "eyewear" },
  { keys: ["لوازم التحریر", "لوازم‌التحریر", "تحریر"], fa: "لوازم التحریر", en: "tahrir" },
  { keys: ["ظروف آشپزخانه", "ظروف"], fa: "ظروف", en: "kitchenware" },
  { keys: ["زیورآلات", "جواهرات"], fa: "زیورآلات", en: "jewelry" },
  { keys: ["عطر", "ادکلن"], fa: "عطر", en: "perfume" },
  { keys: ["موبایل", "تلفن همراه"], fa: "موبایل", en: "mobile" },
  { keys: ["لوازم جانبی موبایل"], fa: "لوازم جانبی", en: "accessories" },
  { keys: ["لوازم جانبی"], fa: "لوازم جانبی", en: "accessories" },
  { keys: ["پوشاک"], fa: "پوشاک", en: "clothing" },
  { keys: ["الکترونیکی", "دیجیتال"], fa: "لوازم الکترونیکی", en: "electronics" },
  { keys: ["اسباب بازی", "اسباب‌بازی"], fa: "اسباب بازی", en: "toys" },
  { keys: ["مواد غذایی", "خوراکی"], fa: "مواد غذایی", en: "food" },
  { keys: ["ورزشی"], fa: "ورزشی", en: "sports" },
  { keys: ["پارچه", "منسوجات"], fa: "پارچه", en: "textile" },
]

export const NAMING_GUIDE = Object.freeze({
  source: "New Flow approved rows with P=Ready to Live; reviewed workbook patterns are rules-only",
  persianOrder: "short-subcategory-descriptor + cleaned original Persian brand",
  englishOrder: "lowercase original English brand + concise English descriptor",
  locations: "Never add branch, city, region, or contract identifiers",
  englishCharacters: "a-z, 0-9, and hyphen only; begins with a letter; at most two hyphens",
  uncertain: "Return no guessed proposal and route a rename case to manual review",
})

function foldFa(value) {
  return String(value || "").replace(/\u200c/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim().toLowerCase()
}

function words(value, english) {
  const text = english ? String(value || "").toLowerCase() : foldFa(value)
  const parts = text.match(english ? /[a-z0-9]+/g : /[\p{L}\p{N}]+/gu) || []
  const stop = english ? GENERIC_EN : GENERIC_FA
  return parts.filter((part) => !stop.has(part))
}

export function nameKey(value, english) {
  return english
    ? String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    : foldFa(value)
}

const compactEnglishBrand = (value) => words(value, true).join("")

function subcategoryRule(item) {
  const sub = foldFa(item.sub)
  const cat = foldFa(item.cat)
  const normalizePhrase = (value) => foldFa(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  const includesPhrase = (text, phrase) => (" " + text + " ").includes(" " + normalizePhrase(phrase) + " ")
  function bestRule(text) {
    const matches = []
    for (const rule of RULES) {
      const matched = rule.keys.filter((phrase) => includesPhrase(text, phrase))
      if (!matched.length) continue
      const phrase = matched.sort((a, b) => normalizePhrase(b).split(" ").length - normalizePhrase(a).split(" ").length)[0]
      matches.push({ rule, specificity: normalizePhrase(phrase).split(" ").length })
    }
    if (!matches.length) return null
    matches.sort((a, b) => b.specificity - a.specificity)
    const best = matches.filter((entry) => entry.specificity === matches[0].specificity)
    const identities = new Set(best.map((entry) => entry.rule.fa + "|" + entry.rule.en))
    return identities.size === 1 ? best[0].rule : null
  }
  return bestRule(sub) || bestRule(cat)
}

function cleanPersianBrand(value, item) {
  const source = words(value, false)
  const sub = words(item.sub, false)
  const cat = words(item.cat, false)
  const categoryWords = new Set([...sub, ...cat])
  if (source.length && source.every((word) => categoryWords.has(word))) return ""
  let result = source.slice()
  for (const descriptor of [sub, cat]) {
    if (descriptor.length && result.length > descriptor.length && descriptor.every((word, index) => result[index] === word)) {
      result = result.slice(descriptor.length)
      break
    }
  }
  return result.join(" ").trim()
}

function approvedParts(sample, source, english) {
  const sampleWords = words(sample, english)
  const sourceWords = words(source, english)
  if (!sampleWords.length || !sourceWords.length) return null
  const brandKey = sourceWords.join("")
  if (english) {
    for (let start = 0; start < sampleWords.length; start += 1) {
      for (let end = start + 1; end <= sampleWords.length; end += 1) {
        if (sampleWords.slice(start, end).join("") === brandKey) {
          const brand = sampleWords.slice(start, end).join("-")
          const descriptor = [...sampleWords.slice(0, start), ...sampleWords.slice(end)].join("-")
          return { brand, descriptor }
        }
      }
    }
    return null
  }
  const remaining = sampleWords.slice()
  const matched = []
  for (const sourceWord of sourceWords) {
    const index = remaining.indexOf(sourceWord)
    if (index < 0) return null
    matched.push(remaining[index])
    remaining.splice(index, 1)
  }
  return { brand: matched.join(" "), descriptor: remaining.join(" ") }
}

function indexExamples(examples) {
  if (approvedExampleIndex.has(examples)) return approvedExampleIndex.get(examples)
  const index = { byBrandFa: new Map(), byBrandEn: new Map(), bySub: new Map(), byCat: new Map() }
  function add(map, key, entry) {
    if (!key) return
    const rows = map.get(key) || []
    rows.push(entry)
    map.set(key, rows)
  }
  for (const example of examples) {
    const entry = {
      example,
      sub: foldFa(example.sub),
      cat: foldFa(example.cat),
      brandFa: nameKey(cleanPersianBrand(example.sourceFa, example), false),
      brandEn: compactEnglishBrand(example.sourceEn),
      partsFa: approvedParts(example.fa, example.sourceFa, false),
      partsEn: approvedParts(example.en, example.sourceEn, true),
    }
    add(index.byBrandFa, entry.brandFa, entry)
    add(index.byBrandEn, entry.brandEn, entry)
    add(index.bySub, entry.sub, entry)
    add(index.byCat, entry.cat, entry)
  }
  approvedExampleIndex.set(examples, index)
  return index
}

function referenceExamples(item, examples, english) {
  const index = indexExamples(examples)
  const itemSub = foldFa(item.sub)
  const itemCat = foldFa(item.cat)
  const brandKey = english ? compactEnglishBrand(item.en) : nameKey(cleanPersianBrand(item.fa, item), false)
  const matchingBrand = (english ? index.byBrandEn : index.byBrandFa).get(brandKey) || []
  const brandCounts = new Map()
  for (const entry of matchingBrand) {
    const parts = english ? entry.partsEn : entry.partsFa
    if (!parts || !parts.brand) continue
    const normalized = english ? parts.brand.toLowerCase() : foldFa(parts.brand)
    brandCounts.set(normalized, (brandCounts.get(normalized) || 0) + 1)
  }

  const sameSub = itemSub ? (index.bySub.get(itemSub) || []) : []
  const scoped = sameSub.length ? sameSub : (itemCat ? (index.byCat.get(itemCat) || []) : [])
  const descriptorCounts = new Map()
  let descriptorObservations = 0
  for (const entry of scoped) {
    const parts = english ? entry.partsEn : entry.partsFa
    if (!parts || !parts.descriptor) continue
    descriptorObservations += 1
    const normalized = english ? parts.descriptor.toLowerCase() : foldFa(parts.descriptor)
    descriptorCounts.set(normalized, { text: parts.descriptor, count: (descriptorCounts.get(normalized)?.count || 0) + 1 })
  }
  const rankedDescriptors = [...descriptorCounts.values()].sort((a, b) => b.count - a.count)
  const leader = rankedDescriptors[0]
  const runnerUp = rankedDescriptors[1]
  const sortedDescriptors = leader && (!runnerUp || leader.count > runnerUp.count) &&
    leader.count / Math.max(1, descriptorObservations) >= 0.6
    ? rankedDescriptors.map((entry) => entry.text)
    : []
  const rankedBrands = [...brandCounts.entries()].sort((a, b) => b[1] - a[1])
  const brandStyle = rankedBrands.length && (!rankedBrands[1] || rankedBrands[0][1] > rankedBrands[1][1]) ? rankedBrands[0][0] : ""
  return { descriptors: sortedDescriptors, brandStyle }
}

function descriptorsFor(item, profile, english) {
  const rule = subcategoryRule(item)
  if (rule) return [english ? rule.en : rule.fa]
  const learned = profile.descriptors
  if (learned.length) return learned
  return []
}

function styleBrand(item, profile, english) {
  const source = english ? item.en : cleanPersianBrand(item.fa, item)
  if (!String(source || "").trim()) return ""
  const approved = profile.brandStyle
  if (approved) return approved
  return english ? words(source, true).join("-") : words(source, false).join(" ")
}

function formatEnglish(brand, descriptor) {
  const brandParts = String(brand || "").toLowerCase().match(/[a-z0-9]+/g) || []
  const descriptorParts = String(descriptor || "").toLowerCase().match(/[a-z0-9]+/g) || []
  if (!brandParts.length || !descriptorParts.length) return ""
  const allBrand = brandParts.length > 2 ? [brandParts.join("")] : brandParts
  let parts = [...allBrand, ...descriptorParts]
  if (parts.length > 3 && allBrand.length > 1) parts = [allBrand.join(""), ...descriptorParts]
  if (parts.length > 3 || !/^[a-z]/.test(parts[0] || "")) return ""
  const output = parts.join("-")
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+){0,2}$/.test(output) ? output : ""
}

function collides(candidate, counts, seen, own, duplicate, english) {
  const candidateKey = nameKey(candidate, english)
  const ownKey = nameKey(own, english)
  const canKeepOwn = !duplicate && ownKey === candidateKey
  return seen.has(candidateKey) || (counts.get(candidateKey) || 0) > (canKeepOwn ? 1 : 0) || (duplicate && ownKey === candidateKey)
}

function chooseCandidate(candidates, counts, seen, own, duplicate, english) {
  for (const candidate of candidates) {
    if (candidate && !collides(candidate, counts, seen, own, duplicate, english)) {
      return candidate
    }
  }
  return ""
}

export function makeNameSuggestions(item, examples, existingFa, existingEn, seenFa, seenEn) {
  const faProfile = referenceExamples(item, examples, false)
  const enProfile = referenceExamples(item, examples, true)
  const brandFa = styleBrand(item, faProfile, false)
  const brandEn = styleBrand(item, enProfile, true)
  const faDescriptors = descriptorsFor(item, faProfile, false)
  const enDescriptors = descriptorsFor(item, enProfile, true)
  const faCandidates = faDescriptors.map((descriptor) => [descriptor, brandFa].filter(Boolean).join(" ").replace(/\s+/g, " ").trim())
  const enCandidates = enDescriptors.map((descriptor) => formatEnglish(brandEn, descriptor)).filter(Boolean)
  const suggestionFa = chooseCandidate(faCandidates, existingFa, seenFa, item.sampleFa, Boolean(item.duplicateFa), false)
  const suggestionEn = chooseCandidate(enCandidates, existingEn, seenEn, item.sampleEn, Boolean(item.duplicateEn), true)
  if (!suggestionFa || !suggestionEn) return { suggestionFa: "", suggestionEn: "" }
  seenFa.add(nameKey(suggestionFa, false))
  seenEn.add(nameKey(suggestionEn, true))
  return { suggestionFa, suggestionEn }
}

export function suggestedPersian(item) {
  return String(item && item.suggestionFa || "").trim()
}

export function suggestedEnglish(item) {
  return String(item && item.suggestionEn || "").trim()
}
