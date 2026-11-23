"""Open a shop URL, then its enamad or Digikala دی‌نماد page. No key material."""

from __future__ import annotations

import re
import ssl
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
INSECURE = ssl._create_unverified_context()
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
ENAMAD_RE = re.compile(r"https?://(?:www\.)?(?:trustseal\.enamad\.ir|enamad\.ir)/\?(?:[^\"'\s<>]+)", re.I)
DINAMAD_RE = re.compile(r"دی[\s\u200c]*نماد|دینماد|dinamad|d-namad", re.I)
DIGI_RE = re.compile(r"https?://(?:www\.)?digikala\.com/[^\"'\s<>]{0,120}", re.I)
STOP = {
    "و", "یا", "از", "با", "برای", "این", "آن", "های", "ها", "را", "که", "یک",
    "انواع", "لوازم", "محصولات", "سایر", "فروشگاه", "خرید", "فروش", "آنلاین",
    "صفحه", "اصلی", "جدید", "محصول", "تومان", "تخفیف", "ارسال", "سبد", "افزودن",
    "علاقه", "مندی", "مقایسه", "بستن", "مشاهده", "مشتری", "امتیاز", "قیمت",
    "تماس", "ادامه", "مطلب", "ویژه", "عددی", "قسط", "سانت",
    "راهنما", "درباره", "پرداخت", "سفارش", "چگونه", "ورود", "خانه", "عضویت",
    "قوانین", "حریم", "سوالات", "جستجو", "حساب", "است", "بود",
}


def short_error(exc: BaseException) -> str:
    text = str(exc).lower()
    if "handshake" in text and ("timed out" in text or "timeout" in text):
        return "دست‌دادن SSL تمام شد"
    if "timed out" in text or "timeout" in text:
        return "زمان اتصال تمام شد"
    if "name or service not known" in text or "nodename nor servname" in text or "getaddrinfo" in text:
        return "آدرس پیدا نشد"
    if "certificate" in text or "ssl" in text:
        return "گواهی امنیتی سایت خطا داد"
    if "connection refused" in text:
        return "اتصال رد شد"
    if "404" in text:
        return "صفحه پیدا نشد"
    return "باز نشد"


def fetch(url: str, timeout: int = 12, referer: str = "") -> dict:
    headers = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"}
    if referer:
        headers["Referer"] = referer
    last = "باز نشد"
    for context in (CTX, INSECURE):
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                body = response.read(450000)
                return {
                    "ok": True,
                    "url": response.geturl(),
                    "ctype": response.headers.get("content-type") or "",
                    "body": body,
                    "error": "",
                }
        except urllib.error.HTTPError as exc:
            last = f"پاسخ {exc.code}"
            break
        except Exception as exc:
            last = short_error(exc)
            if "گواهی" not in last:
                break
    return {"ok": False, "url": url, "ctype": "", "body": b"", "error": last}


def html_text(body: bytes, ctype: str) -> str:
    if "1256" in ctype.lower():
        text = body.decode("cp1256", "replace")
    else:
        text = body.decode("utf-8", "replace")
    text = re.sub(r"(?is)<script\b.*?>.*?</script>", " ", text)
    text = re.sub(r"(?is)<style\b.*?>.*?</style>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text)[:20000]


def sold_words(text: str) -> str:
    words = re.findall(r"[\u0600-\u06ff]{3,}", text)
    counts = {}
    for word in words:
        if word in STOP:
            continue
        counts[word] = counts.get(word, 0) + 1
    ranked = sorted(counts, key=lambda word: (-counts[word], -len(word)))
    return "، ".join(ranked[:6])


def holder_from_text(text: str) -> str:
    patterns = [
        r"صاحب\s*امتیاز(?:\s*سایت)?\s*[:：]\s*([^\n|<]{2,80})",
        r"نام\s*صاحب\s*امتیاز\s*[:：]?\s*([^\n|<]{2,80})",
        r"certificate\s*holder\s*[:：]\s*([^\n|<]{2,80})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            name = re.sub(r"\s+", " ", match.group(1)).strip(" :-|")
            if name and "اینماد" not in name:
                return name[:80]
    return ""


def check_site(url: str) -> dict:
    page = fetch(url, timeout=12)
    result = {
        "opened": False,
        "error": page["error"],
        "enamad_url": "",
        "enamad_opened": False,
        "enamad_error": "",
        "holder": "",
        "certificate": "",
        "text": "",
        "sold": "",
    }
    if not page["ok"]:
        return result
    raw = page["body"].decode("utf-8", "replace")
    text = html_text(page["body"], page["ctype"])
    result["opened"] = True
    result["error"] = ""
    result["text"] = text
    result["sold"] = sold_words(text)
    enamad = ENAMAD_RE.search(raw) or ENAMAD_RE.search(text)
    dinamad = DINAMAD_RE.search(raw) or DINAMAD_RE.search(text)
    if enamad:
        result["certificate"] = "enamad"
        result["enamad_url"] = enamad.group(0).replace("&amp;", "&")
        seal = fetch(result["enamad_url"], timeout=8, referer=page["url"])
        if seal["ok"]:
            seal_text = html_text(seal["body"], seal["ctype"])
            result["enamad_opened"] = True
            result["holder"] = holder_from_text(seal_text) or holder_from_text(seal["body"].decode("utf-8", "replace"))
            if not result["holder"]:
                result["enamad_error"] = "صفحه اینماد باز شد ولی نام صاحب امتیاز در آن پیدا نشد"
        else:
            result["enamad_error"] = "صفحه اینماد باز نشد. " + seal["error"]
        return result
    if dinamad:
        result["certificate"] = "dinamad"
        digi = DIGI_RE.search(raw)
        if digi:
            extra = fetch(digi.group(0).replace("&amp;", "&"), timeout=8, referer=page["url"])
            if extra["ok"]:
                extra_text = html_text(extra["body"], extra["ctype"])
                result["holder"] = holder_from_text(extra_text)
                result["text"] = (text + " " + extra_text)[:20000]
                result["sold"] = sold_words(result["text"]) or result["sold"]
                result["enamad_opened"] = True
            else:
                result["enamad_error"] = "دی‌نماد دیده شد ولی صفحه دیجی‌کالا باز نشد. " + extra["error"]
        else:
            result["holder"] = holder_from_text(text)
            if not result["holder"]:
                result["enamad_error"] = "دی‌نماد روی سایت دیده شد ولی نام صاحب امتیاز کنار آن پیدا نشد"
            else:
                result["enamad_opened"] = True
        return result
    result["enamad_error"] = "سایت باز شد ولی اینماد و دی‌نماد پیدا نشد"
    return result
