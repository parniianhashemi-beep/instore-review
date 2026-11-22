"""Classify New Flow rows from sheet values. No network and no key."""

from __future__ import annotations

import re

FILTER_N = "ONLINE SITE EXISTS - DUPLICATE NAME KEPT"
OUTPUT_TABS = [
    "general",
    "آماده فعال\u200cسازی",
    "نیاز به تغییر نام",
    "نیازمند بررسی دستی",
    "تغییر نام انجام شد",
]
KEEP_TABS = [
    "New Flow",
    "online",
    "social",
    "گزارش",
    "لیست بررسی حضوری",
    "صفحات بررسی",
    "راهنما",
]
SHEET_HEADERS = [
    "شناسه درخواست",
    "برند",
    "دسته",
    "سایت",
    "نام متقاضی",
    "موبایل",
    "وضعیت NBO",
    "پیشنهاد سامانه",
    "دلیل پیشنهاد",
    "تصمیم نهایی",
    "اسم فارسی قابل فعال\u200cسازی",
    "اسم انگلیسی قابل فعال\u200cسازی",
    "وضعیت بررسی",
    "انجام تغییر نام",
    "مرجع تطبیق",
    "لینک",
    "توضیح لینک",
    "کد ملی",
    "توضیح کد ملی",
    "موبایل نتیجه",
    "توضیح موبایل",
    "نام فارسی فروشگاه",
    "توضیح نام فارسی",
    "نام انگلیسی فروشگاه",
    "توضیح نام انگلیسی",
    "نام صاحب امتیاز",
    "توضیح نام صاحب امتیاز",
    "نام خانوادگی صاحب امتیاز",
    "توضیح نام خانوادگی",
    "گواهی",
    "توضیح گواهی",
    "دسته نتیجه",
    "توضیح دسته",
    "زیردسته نتیجه",
    "توضیح زیردسته",
]
FIELD_KEYS = [
    "link",
    "national_id",
    "mobile",
    "fa",
    "en",
    "owner_first",
    "owner_last",
    "certificate",
    "category",
    "subcategory",
]
OK = "جور است"
NO = "جور نیست"
UNK = "نتوانستم بررسی کنم"
SKIP = "بررسی نمی‌شود"
SOCIAL_HOSTS = [
    "instagram.com", "instagr.am", "t.me", "telegram.me", "telegram.org",
    "rubika.ir", "web.rubika.ir", "whatsapp.com", "wa.me", "api.whatsapp.com",
    "twitter.com", "x.com", "linkedin.com", "aparat.com", "facebook.com",
    "fb.com", "fb.me", "fb.watch", "tiktok.com", "youtube.com", "youtu.be",
    "eitaa.com", "eitaa.ir", "bale.ai", "ble.ir", "splus.ir", "gap.im",
    "igap.net", "pin.it", "pinterest.com", "threads.net",
]
IG_SKIP = {"p", "reel", "reels", "stories", "tv", "explore", "accounts", "direct", "about"}
PATH_SKIP = {"p", "reel", "reels", "stories", "tv", "page", "joinchat", "joinc"}
_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_SPLIT = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#]*)([^?#]*)(?:\?([^#]*))?")
_USER = re.compile(r"[^0-9a-z\u0600-\u06ff._]+")
_IG = re.compile(r"instagram\.com/([A-Za-z0-9._]+)", re.I)


def norm(value) -> str:
    return re.sub(r"[\s_\-()]+", "", str(value or "").strip().lower())


def cell(row, index) -> str:
    if index is None or index < 0 or not row or index >= len(row):
        return ""
    return "" if row[index] is None else str(row[index]).strip()


def row_has_any(row) -> bool:
    return any(str(value or "").strip() for value in row)


def fold_name(value) -> str:
    text = str(value or "").replace("\u200c", "").replace("ي", "ی").replace("ك", "ک")
    return re.sub(r"\s+", " ", text.strip()).lower()


def first_token(raw) -> str:
    token = str(raw or "").strip()
    if not token:
        return ""
    if "|" in token or re.search(r"\s", token):
        for part in re.split(r"[|\s]+", token):
            if "." in part or "://" in part:
                return part
    return token


def ensure_scheme(url) -> str:
    text = str(url or "").strip()
    if not text:
        return ""
    return text if _SCHEME.match(text) else "https://" + text


def split_url(url):
    match = _SPLIT.match(url or "")
    if not match:
        return None
    return {"netloc": match.group(1), "path": match.group(2) or "", "query": match.group(3) or ""}


def clean_host(netloc) -> str:
    host = str(netloc or "").strip().lower()
    if "@" in host:
        host = host.rsplit("@", 1)[-1]
    if host.startswith("www."):
        host = host[4:]
    return host.strip("[]").rstrip(".")


def normalize_url_key(url) -> str:
    raw = first_token(url)
    if not raw:
        return ""
    parsed = split_url(ensure_scheme(raw))
    if not parsed:
        return raw.lower().rstrip("/")
    host = clean_host(parsed["netloc"])
    path = (parsed["path"] or "").rstrip("/")
    query = "?" + parsed["query"] if parsed["query"] else ""
    if not host and not path:
        return ""
    return (host + path + query).lower()


def url_host(url) -> str:
    parsed = split_url(ensure_scheme(first_token(url)))
    return clean_host(parsed["netloc"]) if parsed else ""


def host_is_social(host) -> bool:
    if not host:
        return False
    cleaned = str(host).split("|", 1)[0].strip()
    for domain in SOCIAL_HOSTS:
        if cleaned == domain:
            return True
        if len(cleaned) > len(domain) + 1 and cleaned.endswith("." + domain):
            return True
    return False


def clean_user(user) -> str:
    return _USER.sub("", str(user or "").lstrip("@").lower())


def instagram_username(url) -> str:
    host = url_host(url)
    lowered = str(url or "").lower()
    if host not in {"instagram.com", "instagr.am"} and not host.endswith(".instagram.com") and "instagram.com" not in lowered:
        return ""
    parsed = split_url(ensure_scheme(first_token(url)))
    if not parsed:
        return ""
    parts = [part for part in parsed["path"].split("/") if part]
    if not parts or parts[0].lower() in IG_SKIP:
        return ""
    return clean_user(parts[0])


def social_path_user(url) -> str:
    full = normalize_url_key(url)
    if not full or "/" not in full:
        return ""
    user = full.split("/", 1)[1].split("/", 1)[0].split("?", 1)[0].strip()
    if not user or user in PATH_SKIP:
        return ""
    return user


def classify_url(url) -> str:
    raw = str(url or "").strip()
    if not raw:
        return "social"
    lowered = raw.lower()
    if any(domain in lowered for domain in SOCIAL_HOSTS):
        return "social"
    host = url_host(raw)
    if host_is_social(host):
        return "social"
    if host and "." in host:
        return "website"
    return "social"


def bare_social(url) -> bool:
    host = url_host(url)
    if not host or not host_is_social(host):
        lowered = str(url or "").lower()
        if not any(domain in lowered for domain in SOCIAL_HOSTS):
            return False
    return not instagram_username(url) and not social_path_user(url)


def resolve_new_flow(header):
    fields = [
        ("contract", 0, ["request id", "request_id", "کد قرارداد", "contract code", "a"]),
        ("fa", 1, ["brand name (fa)", "اسم فارسی", "نام فارسی", "persian name", "local_name", "b"]),
        ("en", 2, ["brand name (en)", "اسم انگلیسی", "نام انگلیسی", "english name", "c"]),
        ("cat", 3, ["category", "کتگوری", "دسته", "d"]),
        ("sub", 4, ["sub category", "subcategory", "sub_category", "زیردسته", "ساب‌کتگوری", "e"]),
        ("finalFa", 9, ["final suggested fa name", "final suggested fa", "j"]),
        ("finalEn", 12, ["final suggested name", "final english name", "m"]),
        ("filterN", 13, ["online site alert", "online site exists - duplicate name kept", "n"]),
        ("url", 14, ["duplicate callback url", "url", "site url", "o"]),
        ("filterP", 15, ["final step", "p"]),
        ("ownerId", 16, ["owner national code", "owner national id", "national code", "کد ملی", "national id", "q"]),
        ("mobile", 17, ["owner mobile", "موبایل", "mobile", "r"]),
        ("ownerFirst", 18, ["owner first name", "نام مالک", "first name", "s"]),
        ("ownerLast", 19, ["owner last name", "نام خانوادگی", "last name", "t"]),
        ("filterZ", 25, ["z"]),
    ]
    by_name = {}
    for index, name in enumerate(header):
        key = norm(name)
        if key and key not in by_name:
            by_name[key] = index
    mapping = {}
    for key, fallback, aliases in fields:
        found = None
        for alias in aliases:
            folded = norm(alias)
            if folded and folded in by_name:
                found = by_name[folded]
                break
        mapping[key] = fallback if found is None else found
    return mapping


def rows_as_objects(values):
    header = values[0]
    names = []
    seen = {}
    for index, raw in enumerate(header):
        name = str("" if raw is None else raw).strip()
        if not name:
            name = f"__col_{index}"
        count = seen.get(name, 0) + 1
        seen[name] = count
        names.append(name if count == 1 else f"{name}_{count}")
    rows = []
    for row_index, src in enumerate(values[1:], start=1):
        if not row_has_any(src):
            continue
        obj = {"__id": row_index}
        for index, name in enumerate(names):
            value = src[index] if index < len(src) and src[index] is not None else ""
            obj[name] = str(value).strip()
        rows.append(obj)
    return {"headers": names, "rows": rows}


def optional_col(headers, aliases) -> str:
    by_name = {}
    for name in headers:
        folded = norm(name)
        if folded and folded not in by_name and not str(name).startswith("__"):
            by_name[folded] = name
    for alias in aliases:
        folded = norm(alias)
        if folded and folded in by_name:
            return by_name[folded]
    return ""


def require_col(headers, aliases, label) -> str:
    found = optional_col(headers, aliases)
    if not found:
        raise RuntimeError(f"ستون «{label}» پیدا نشد.")
    return found


def helper_cols(headers, social):
    cols = {
        "en": require_col(headers, ["name", "english name"], "نام انگلیسی"),
        "fa": require_col(headers, ["local_name", "فارسی", "persian name"], "نام فارسی"),
        "site": require_col(headers, ["site_link", "site link", "website", "url"], "لینک سایت"),
        "id": optional_col(headers, ["national_id", "national id", "کد ملی"]),
        "mobile": optional_col(headers, ["mobile", "موبایل"]),
        "enamad": optional_col(headers, ["enamad", "e-namad", "اینماد", "e namad"]),
    }
    if social:
        cols["callback"] = optional_col(headers, ["call back", "callback", "callback url"])
    return cols


def obj_cell(row, key) -> str:
    if not row or not key or key not in row:
        return ""
    return "" if row[key] is None else str(row[key]).strip()


def index_add(index, key, row):
    if not key:
        return
    bucket = index.setdefault(key, [])
    if any(item["__id"] == row["__id"] for item in bucket):
        return
    bucket.append(row)


def take(index, keys):
    seen = set()
    out = []
    for key in keys:
        for row in index.get(key, []):
            if row["__id"] in seen:
                continue
            seen.add(row["__id"])
            out.append(row)
    return out


def build_online_index(rows, cols):
    index = {}
    for row in rows:
        site = obj_cell(row, cols["site"])
        if not site:
            continue
        index_add(index, normalize_url_key(site), row)
        index_add(index, url_host(site), row)
    return index


def build_social_index(rows, cols):
    index = {}
    for row in rows:
        urls = [obj_cell(row, cols["site"])]
        if cols.get("callback"):
            urls.append(obj_cell(row, cols["callback"]))
        for site in urls:
            if not site:
                continue
            host = url_host(site)
            ig = instagram_username(site)
            if ig:
                index_add(index, "ig:" + ig, row)
                index_add(index, "instagram.com/" + ig, row)
                continue
            user = social_path_user(site)
            if host and host_is_social(host):
                if not user:
                    continue
                index_add(index, normalize_url_key(site), row)
                index_add(index, host + "/" + user, row)
            elif host and not host_is_social(host):
                index_add(index, normalize_url_key(site), row)
                index_add(index, host, row)
    return index


def lookup_online(url, index):
    keys = []
    full = normalize_url_key(url)
    host = url_host(url)
    if full:
        keys.append(full)
    if host and not host_is_social(host) and host != full:
        keys.append(host)
    return take(index, keys)


def lookup_social(url, index):
    ig = instagram_username(url)
    if not ig and "instagram.com" in str(url or "").lower():
        match = _IG.search(url or "")
        if match and match.group(1).lower() not in IG_SKIP:
            ig = clean_user(match.group(1))
    if ig:
        return take(index, ["ig:" + ig, "instagram.com/" + ig])
    host = url_host(url)
    user = social_path_user(url)
    if host and host_is_social(host) and not user:
        return []
    keys = []
    full = normalize_url_key(url)
    if full:
        keys.append(full)
    if host and user:
        keys.append(host + "/" + user)
    if host and not host_is_social(host):
        keys.append(host)
    return take(index, keys)


def nbo_of(header, row) -> str:
    wanted = norm("وضعیت NBO")
    for index, name in enumerate(header):
        folded = norm(name)
        if not folded:
            continue
        if folded == "nbo" or folded == wanted or folded.endswith("nbo"):
            return cell(row, index)
    return ""


def evidence_note(item, hits, cols, tab) -> str:
    parts = ["سایت درخواست: " + (item["url"] or "خالی")]
    if len(hits) == 1:
        site = obj_cell(hits[0], cols["site"])
        callback = obj_cell(hits[0], cols["callback"]) if cols.get("callback") else ""
        if site:
            parts.append(f"سایت تب {tab}: {site}")
        if callback:
            parts.append("Call Back: " + callback)
        if cols.get("enamad"):
            enamad = obj_cell(hits[0], cols["enamad"])
            parts.append("اینماد در شیت: " + enamad if enamad else "ستون اینماد در ردیف فروشنده خالی است")
        else:
            parts.append("اینماد در داده‌های شیت نیست")
    elif tab == "online":
        parts.append("اینماد در داده‌های شیت نیست")
    return ". ".join(parts) + "."


def opened_site_reason(page, hits, tab) -> str:
    """Reason after the site was actually requested. Never tell the reader to open it."""
    if not page or not page.get("opened"):
        err = str((page or {}).get("error") or "باز نشد").strip()
        extra = ""
        if len(hits) == 0 and tab == "online":
            extra = " در تب online هم فروشنده‌ای با همین آدرس پیدا نشد."
        return f"بررسی دستی شد چون سایت باز نشد. {err}.{extra}"
    parts = ["سایت باز شد."]
    sold = str(page.get("sold") or "").strip()
    if sold:
        parts.append(f"آنچه می‌فروشد: {sold}.")
    holder = str(page.get("holder") or "").strip()
    kind = page.get("certificate") or ""
    if holder and kind == "dinamad":
        parts.append(f"اینماد نبود. صاحب امتیاز دی‌نماد: {holder}.")
    elif holder:
        parts.append(f"صاحب امتیاز اینماد: {holder}.")
    else:
        parts.append(str(page.get("enamad_error") or "اینماد و دی‌نماد پیدا نشد.").strip())
    if len(hits) == 0:
        parts.append("در تب online فروشنده‌ای با همین آدرس پیدا نشد.")
    elif len(hits) > 1:
        parts.append(f"با این لینک {len(hits)} فروشنده در تب {tab} پیدا شد.")
    return "بررسی دستی شد. " + " ".join(parts)


def manual_reason(item, kind, hits, tab) -> str:
    """Why this row is manual, then what to check. One plain Persian paragraph."""
    url = str(item.get("url") or "").strip()
    if not url:
        return (
            "بررسی دستی شد چون این درخواست لینک ندارد و در شیت فروشنده‌ای برایش پیدا نشد. "
            "برای مطمئن شدن، لینک فروشگاه را از پرونده پیدا کنید و نام فارسی و انگلیسی روی آن را با همین درخواست مقایسه کنید."
        )
    if kind != "website" and bare_social(url):
        return (
            "بررسی دستی شد چون لینک فقط آدرس شبکهٔ اجتماعی است و نام صفحه ندارد، پس با تب social مقایسه نشد. "
            "برای مطمئن شدن، لینک کامل همان صفحه را باز کنید و ببینید نام صفحه با نام فارسی و انگلیسی درخواست یکی است یا نه."
        )
    count = len(hits)
    if count == 0 and kind == "website":
        return (
            "بررسی دستی شد چون این لینک سایت است ولی در تب online فروشنده‌ای با همین آدرس پیدا نشد. "
            "برای مطمئن شدن، خود سایت را باز کنید، اینماد را نگاه کنید، و نام روی سایت را با نام فارسی و انگلیسی درخواست مقایسه کنید. نبودن در تب online به‌تنهایی یعنی فروشگاه آنلاین ندارد نیست."
        )
    if count == 0:
        return (
            "بررسی دستی شد چون این لینک شبکهٔ اجتماعی است ولی در تب social صفحه‌ای با همین لینک پیدا نشد. "
            "برای مطمئن شدن، لینک را باز کنید و نام صفحه را با نام فارسی و انگلیسی درخواست مقایسه کنید."
        )
    if count > 1:
        return (
            f"بررسی دستی شد چون با این لینک {count} فروشنده در تب {tab} پیدا شد و معلوم نیست کدام‌یک همین درخواست است. "
            "برای مطمئن شدن، همان ردیف‌ها را ببینید و فقط فروشنده‌ای را انتخاب کنید که نام فارسی و انگلیسی‌اش با این درخواست یکی است."
        )
    missing = []
    if hits and not obj_cell(hits[0], "fa"):
        missing.append("فارسی")
    if hits and not obj_cell(hits[0], "en"):
        missing.append("انگلیسی")
    which = " و ".join(missing) if missing else "فارسی یا انگلیسی"
    return (
        f"بررسی دستی شد چون یک فروشنده در تب {tab} با همین لینک پیدا شد، ولی نام {which} آن در شیت خالی است. "
        f"برای مطمئن شدن، نام {which} را از خود سایت یا صفحه بردارید و با نام این درخواست مقایسه کنید."
    )


def pad_national_id(value) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if not digits:
        return ""
    if len(digits) < 10:
        return digits.zfill(10)
    return digits


def mobile_key(value) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if digits.startswith("98") and len(digits) > 10:
        digits = digits[2:]
    return digits.lstrip("0")


def field(key, name, verdict, note):
    return {"key": key, "name": name, "verdict": verdict, "note": note}


def compare_id(left, right):
    left_id = pad_national_id(left)
    right_id = pad_national_id(right)
    if not left_id or not right_id:
        side = "درخواست" if not left_id else "تب"
        return UNK, f"کد ملی {side} خالی است و مقایسه نشد."
    if len(left_id) != 10 or len(right_id) != 10:
        return UNK, f"کد ملی باید ۱۰ رقم باشد. درخواست {left_id} و تب {right_id}."
    if left_id == right_id:
        return OK, f"هر دو کد ملی {left_id} است."
    return NO, f"درخواست {left_id} و تب {right_id} یکی نیست."


def compare_mobile(left, right, nid_ok):
    left_mobile = mobile_key(left)
    right_mobile = mobile_key(right)
    if not left_mobile or not right_mobile:
        return UNK, "یکی از شماره‌ها خالی است و مقایسه نشد."
    if left_mobile == right_mobile:
        return OK, "شماره موبایل یکی است."
    note = "شماره درخواست و شماره تب یکی نیست."
    if nid_ok:
        note += " کد ملی یکی است و صاحب یکی است. فروشگاه حضوری و فروشگاه آنلاین یا سوشال می‌توانند با دو شماره ثبت شده باشند. این تفاوت شماره به‌تنهایی رد نمی‌شود."
    return NO, note


def compare_brand(left, right, missing_note):
    if not str(right or "").strip():
        return UNK, missing_note
    if not str(left or "").strip():
        return UNK, "نام درخواست خالی است."
    if fold_name(left) == fold_name(right):
        return OK, "نام یکی است."
    return NO, f"نام درخواست «{left}» و نام تب «{right}» یکی نیست."


def proposed_names(item):
    """Ready-to-Live rows use column J and column M as written. Do not rebuild them."""
    return str(item.get("final_fa") or "").strip(), str(item.get("final_en") or "").strip()


def _tokens(value) -> list:
    stop = {"و", "یا", "از", "با", "برای", "انواع", "لوازم", "محصولات", "سایر", "فروشگاه"}
    parts = re.split(r"[\s،,()/\-]+", fold_name(value))
    return [part for part in parts if len(part) >= 3 and part not in stop]


def _page_has(text, token) -> bool:
    return bool(token) and token in fold_name(text)


def website_fields(item, page):
    if not page or not page.get("opened"):
        note = "سایت باز نشد. " + str((page or {}).get("error") or "باز نشد")
        return [
            field("owner_first", "نام صاحب امتیاز", UNK, note),
            field("owner_last", "نام خانوادگی صاحب امتیاز", UNK, note),
            field("certificate", "گواهی", UNK, note),
            field("category", "دسته", UNK, note),
            field("subcategory", "زیردسته", UNK, note),
        ]
    sold = str(page.get("sold") or "").strip()
    seen = f" روی سایت دیده شد: {sold}." if sold else ""
    holder = str(page.get("holder") or "").strip()
    kind = page.get("certificate") or ""
    if kind == "enamad" and holder:
        cert_note = f"اینماد باز شد. صاحب امتیاز: {holder}."
        cert = (OK, cert_note)
    elif kind == "dinamad" and holder:
        cert_note = f"اینماد نبود. دی‌نماد دیجی‌کالا بررسی شد. صاحب امتیاز: {holder}."
        cert = (OK, cert_note)
    elif kind == "enamad":
        cert = (UNK, page.get("enamad_error") or "صفحه اینماد باز نشد.")
    elif kind == "dinamad":
        cert = (UNK, page.get("enamad_error") or "دی‌نماد دیده شد ولی نام صاحب امتیاز خوانده نشد.")
    else:
        cert = (UNK, page.get("enamad_error") or "سایت باز شد ولی اینماد و دی‌نماد پیدا نشد.")
    first = str(item.get("owner_first") or "").strip()
    last = str(item.get("owner_last") or "").strip()
    if holder:
        first_ok = _page_has(holder, fold_name(first)) if first else False
        last_ok = _page_has(holder, fold_name(last)) if last else False
        first_field = (OK, f"نام «{first}» در صاحب امتیاز گواهی هست.") if first and first_ok else (
            (NO, f"نام درخواست «{first}» در صاحب امتیاز «{holder}» نیست.") if first else (UNK, "نام مالک در درخواست خالی است.")
        )
        last_field = (OK, f"نام خانوادگی «{last}» در صاحب امتیاز گواهی هست.") if last and last_ok else (
            (NO, f"نام خانوادگی درخواست «{last}» در صاحب امتیاز «{holder}» نیست.") if last else (UNK, "نام خانوادگی در درخواست خالی است.")
        )
    else:
        note = cert[1]
        first_field = (UNK, note)
        last_field = (UNK, note)

    def category_field(label, value):
        tokens = _tokens(value)
        if not tokens:
            return UNK, f"{label} در درخواست خالی است."
        hits = [token for token in tokens if _page_has(page.get("text") or "", token)]
        if hits:
            return OK, f"{label} «{value}» روی خود سایت دیده شد.{seen}"
        if len(page.get("text") or "") < 40:
            return UNK, f"سایت باز شد ولی متن کافی برای {label} پیدا نشد."
        return NO, f"{label} «{value}» روی سایت پیدا نشد.{seen}"

    cat_verdict, cat_note = category_field("دسته", item.get("cat"))
    sub_verdict, sub_note = category_field("زیردسته", item.get("sub"))
    return [
        field("owner_first", "نام صاحب امتیاز", first_field[0], first_field[1]),
        field("owner_last", "نام خانوادگی صاحب امتیاز", last_field[0], last_field[1]),
        field("certificate", "گواهی", cert[0], cert[1]),
        field("category", "دسته", cat_verdict, cat_note),
        field("subcategory", "زیردسته", sub_verdict, sub_note),
    ]


def skip_website_fields():
    note = "برای لینک سوشال این مورد بررسی نمی‌شود."
    return [
        field("owner_first", "نام صاحب امتیاز", SKIP, note),
        field("owner_last", "نام خانوادگی صاحب امتیاز", SKIP, note),
        field("certificate", "گواهی", SKIP, note),
        field("category", "دسته", SKIP, note),
        field("subcategory", "زیردسته", SKIP, note),
    ]


def is_blocking(item_field, nid_ok) -> bool:
    verdict = item_field["verdict"]
    if verdict == SKIP:
        return False
    if item_field["key"] == "mobile" and verdict == NO and nid_ok:
        return False
    return verdict != OK


def manual_from_fields(blocks) -> str:
    if len(blocks) == 1:
        one = blocks[0]
        return f"بررسی دستی شد چون «{one['name']}» {one['verdict']} است. {one['note']} برای مطمئن شدن، همین مورد را بررسی کنید."
    names = "، ".join(one["name"] for one in blocks)
    details = " ".join(f"{one['name']}: {one['verdict']}. {one['note']}" for one in blocks)
    return f"بررسی دستی شد چون این موردها جور نیستند: {names}. {details}"


def name_cells(hit, cols, kind):
    missing = "از تب آنلاین اسم پیدا نشد" if kind == "website" else "از تب سوشال اسم پیدا نشد"
    fa = obj_cell(hit, cols["fa"]) if hit else ""
    en = obj_cell(hit, cols["en"]) if hit else ""
    return fa or missing, en or missing


def decide(item, online_index, social_index, online_cols, social_cols, page=None):
    kind = classify_url(item["url"])
    website = kind == "website"
    tab = "online" if website else "social"
    cols = online_cols if website else social_cols
    hits = lookup_online(item["url"], online_index) if website else lookup_social(item["url"], social_index)
    missing_name = "از تب آنلاین اسم پیدا نشد" if website else "از تب سوشال اسم پیدا نشد"
    hit = hits[0] if len(hits) == 1 else None
    tab_fa = obj_cell(hit, cols["fa"]) if hit else ""
    tab_en = obj_cell(hit, cols["en"]) if hit else ""
    tab_id = obj_cell(hit, cols.get("id")) if hit else ""
    tab_mobile = obj_cell(hit, cols.get("mobile")) if hit else ""
    id_verdict, id_note = compare_id(item.get("owner_id"), tab_id) if hit else (UNK, "فروشندهٔ مشخصی پیدا نشد و کد ملی مقایسه نشد.")
    nid_ok = id_verdict == OK
    mobile_verdict, mobile_note = compare_mobile(item.get("mobile"), tab_mobile, nid_ok) if hit else (UNK, "فروشندهٔ مشخصی پیدا نشد و موبایل مقایسه نشد.")
    if hit:
        link_verdict, link_note = OK, f"همین لینک در تب {tab} پیدا شد."
    elif len(hits) > 1:
        link_verdict, link_note = UNK, f"با این لینک {len(hits)} فروشنده در تب {tab} پیدا شد."
    else:
        link_verdict, link_note = NO, f"این لینک در تب {tab} پیدا نشد."
    fa_verdict, fa_note = compare_brand(item.get("fa"), tab_fa, missing_name) if hit else (UNK, "فروشندهٔ مشخصی پیدا نشد و نام فارسی مقایسه نشد.")
    en_verdict, en_note = compare_brand(item.get("en"), tab_en, missing_name) if hit else (UNK, "فروشندهٔ مشخصی پیدا نشد و نام انگلیسی مقایسه نشد.")
    fields = [
        field("link", "لینک", link_verdict, link_note),
        field("national_id", "کد ملی", id_verdict, id_note),
        field("mobile", "موبایل", mobile_verdict, mobile_note),
        field("fa", "نام فارسی فروشگاه", fa_verdict, fa_note),
        field("en", "نام انگلیسی فروشگاه", en_verdict, en_note),
    ]
    fields.extend(website_fields(item, page) if website else skip_website_fields())
    shown_fa, shown_en = (name_cells(hit, cols, kind) if hit else (item.get("fa") or "", item.get("en") or ""))
    if len(hits) != 1:
        if website and page is not None:
            reason = opened_site_reason(page, hits, tab)
        else:
            reason = manual_reason(item, kind, hits, tab)
        return {"status": "manual", "fa": shown_fa, "en": shown_en, "reason": reason, "against": "", "fields": fields}
    other = [one for one in fields if one["key"] not in ("fa", "en") and is_blocking(one, nid_ok)]
    name_no = [one for one in fields if one["key"] in ("fa", "en") and one["verdict"] == NO]
    name_unk = [one for one in fields if one["key"] in ("fa", "en") and one["verdict"] == UNK]
    if not other and not name_unk and name_no and website:
        proposed_fa, proposed_en = proposed_names(item)
        if proposed_fa and proposed_en:
            return {
                "status": "rename",
                "fa": proposed_fa,
                "en": proposed_en,
                "reason": "نام صاحب امتیاز و دستهٔ سایت جور است و فقط نام فارسی یا انگلیسی فرق دارد. اسم پیشنهادی همان نام نهایی شیت است.",
                "against": "تب online",
                "fields": fields,
            }
        other = name_unk or [field("fa", "نام فارسی فروشگاه", UNK, missing_name)]
    blocks = other + name_unk + ([] if website and not other and not name_unk else name_no)
    if not website:
        blocks = other + name_unk + name_no
    if blocks:
        if not website and name_no and not other and not name_unk:
            reason = (
                "بررسی دستی شد چون نام فارسی یا انگلیسی با تب social یکی نیست. "
                "برای سوشال فقط لینک، کد ملی و موبایل بررسی می‌شود و نام صاحب و محصولات دیده نمی‌شود، "
                "پس فقط به‌خاطر تفاوت نام همان فروشگاه حساب نمی‌شود و در نیاز به تغییر نام نمی‌رود. "
                + manual_from_fields(name_no)
            )
        else:
            reason = manual_from_fields(blocks)
        return {"status": "manual", "fa": shown_fa, "en": shown_en, "reason": reason, "against": "", "fields": fields}
    if website:
        used = (page or {}).get("certificate")
        if used == "dinamad":
            reason = "آماده فعال‌سازی است چون با تب online و دی‌نماد دیجی‌کالا جور شد و دستهٔ سایت هم جور است."
            against = "دی‌نماد"
        else:
            reason = "آماده فعال‌سازی است چون با تب online و اینماد جور شد و دستهٔ سایت هم جور است."
            against = "سایت و اینماد"
    else:
        reason = "آماده فعال‌سازی است چون با تب social جور شد. لینک و کد ملی یکی است."
        against = "تب social"
    if nid_ok:
        phone = next(one for one in fields if one["key"] == "mobile")
        if phone["verdict"] == NO:
            reason += " " + phone["note"]
    return {"status": "ready", "fa": tab_fa or missing_name, "en": tab_en or missing_name, "reason": reason, "against": against, "fields": fields}


def sheet_row(item, decision):
    if decision["status"] == "ready":
        label = "آماده فعال\u200cسازی"
    elif decision["status"] == "rename":
        label = "فعال\u200cسازی با اسم جدید"
    else:
        label = "بررسی دستی"
    review = "نیازمند بررسی" if decision["status"] == "manual" else "تأیید اپراتور"
    by_key = {one["key"]: one for one in decision.get("fields") or []}
    tail = [decision.get("against") or ""]
    for key in FIELD_KEYS:
        one = by_key.get(key) or {"verdict": "", "note": ""}
        tail.extend([one.get("verdict") or "", one.get("note") or ""])
    return [
        item["contract"] or "",
        item["fa"] or "",
        item["cat"] or "",
        item["url"] or "",
        item["owner"] or "",
        item["mobile"] or "",
        item["nbo"] or "",
        label,
        decision["reason"] or "",
        label,
        decision["fa"] or "",
        decision["en"] or "",
        review,
        "",
        *tail,
    ]


def classify_tables(nf_values, online_values, social_values):
    if not nf_values or len(nf_values) < 2:
        raise RuntimeError("New Flow خالی است.")
    if not online_values or len(online_values) < 2:
        raise RuntimeError("online خالی است.")
    if not social_values or len(social_values) < 2:
        raise RuntimeError("social خالی است.")
    mapping = resolve_new_flow(nf_values[0])
    online = rows_as_objects(online_values)
    social = rows_as_objects(social_values)
    online_cols = helper_cols(online["headers"], False)
    social_cols = helper_cols(social["headers"], True)
    online_index = build_online_index(online["rows"], online_cols)
    social_index = build_social_index(social["rows"], social_cols)
    general, ready, rename, manual = [], [], [], []
    for src in nf_values[1:]:
        if not row_has_any(src):
            continue
        if cell(src, mapping["filterN"]) != FILTER_N:
            continue
        if cell(src, mapping["filterP"]) or cell(src, mapping["filterZ"]):
            continue
        item = {
            "contract": cell(src, mapping["contract"]),
            "fa": cell(src, mapping["fa"]),
            "en": cell(src, mapping["en"]),
            "cat": cell(src, mapping["cat"]),
            "sub": cell(src, mapping["sub"]),
            "final_fa": cell(src, mapping["finalFa"]),
            "final_en": cell(src, mapping["finalEn"]),
            "url": cell(src, mapping["url"]),
            "owner_id": cell(src, mapping["ownerId"]),
            "owner_first": cell(src, mapping["ownerFirst"]),
            "owner_last": cell(src, mapping["ownerLast"]),
            "owner": " ".join(part for part in (cell(src, mapping["ownerFirst"]), cell(src, mapping["ownerLast"])) if part),
            "mobile": cell(src, mapping["mobile"]),
            "nbo": nbo_of(nf_values[0], src),
        }
        decision = decide(item, online_index, social_index, online_cols, social_cols)
        row = sheet_row(item, decision)
        general.append(row)
        if decision["status"] == "ready":
            ready.append(row)
        elif decision["status"] == "rename":
            rename.append(row)
        else:
            manual.append(row)
    if not general:
        raise RuntimeError("هیچ ردیفی پس از فیلتر New Flow باقی نماند.")
    return {
        "general": [SHEET_HEADERS[:], *general],
        "ready": [SHEET_HEADERS[:], *ready],
        "rename": [SHEET_HEADERS[:], *rename],
        "manual": [SHEET_HEADERS[:], *manual],
        "done": [SHEET_HEADERS[:]],
    }


def output_tables(classified):
    names = OUTPUT_TABS
    grids = [classified["general"], classified["ready"], classified["rename"], classified["manual"], classified["done"]]
    if any(name in KEEP_TABS for name in names):
        raise RuntimeError("تب منبع پاک نمی‌شود.")
    return list(zip(names, grids))
