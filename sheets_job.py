"""Read the source sheet and wipe-rewrite the five report tabs as the service account."""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from classify import KEEP_TABS, OUTPUT_TABS, classify_tables, output_tables

ROOT = Path(__file__).resolve().parent
KEY_PATH = ROOT / "service-account.json"
ACCOUNT = "general-service-account@turing-clock-510312-s9.iam.gserviceaccount.com"
SOURCE_ID = "19dQcEMVJUEtD9PJD7l84l4JsZH2hxNoK9ejCWN3nH1M"
REPORT_ID = "1YF81MqW8l3GKwwQCj74c8HfaBDEaN6hpOgGXgmtqA6I"
SOURCE_TABS = ("New Flow", "online", "social")
_LOCK = threading.RLock()
_ROW_DELETE_IDS = set()
_TOKEN = {"value": "", "exp": 0}


class SheetError(RuntimeError):
    pass


def _b64(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def load_key() -> dict:
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw:
        try:
            key = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise SheetError("فایل کلید سرویس خوانده نشد.") from exc
    elif not KEY_PATH.is_file():
        raise SheetError("فایل کلید سرویس روی سرور نیست.")
    else:
        try:
            key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise SheetError("فایل کلید سرویس خوانده نشد.") from exc
    email = str(key.get("client_email") or "")
    private = str(key.get("private_key") or "")
    if email != ACCOUNT or "BEGIN PRIVATE KEY" not in private:
        raise SheetError("فایل کلید سرویس برای این حساب نیست.")
    return key


def _safe(text: str) -> str:
    lowered = text.lower()
    if "private key" in lowered or "begin private" in lowered or "-----" in text:
        return "ورود سرویس به شیت ناموفق بود."
    return text.replace("\n", " ")[:300]


def access_token(key: dict) -> str:
    now = int(time.time())
    if _TOKEN["value"] and _TOKEN["exp"] > now + 60:
        return _TOKEN["value"]
    header = _b64(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode())
    claim = _b64(json.dumps({
        "iss": key["client_email"],
        "scope": "https://www.googleapis.com/auth/spreadsheets",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }, separators=(",", ":")).encode())
    signing = f"{header}.{claim}".encode()
    private = serialization.load_pem_private_key(key["private_key"].encode(), password=None)
    signature = private.sign(signing, padding.PKCS1v15(), hashes.SHA256())
    assertion = signing.decode() + "." + _b64(signature)
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }).encode()
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise SheetError("ورود سرویس به شیت ناموفق بود. " + _safe(detail)) from exc
    token = payload.get("access_token") or ""
    if not token:
        raise SheetError("ورود سرویس به شیت ناموفق بود.")
    _TOKEN["value"] = token
    _TOKEN["exp"] = now + int(payload.get("expires_in") or 3600)
    return token


def _guard_write(method: str, url: str, body) -> None:
    if method.upper() in ("GET", "HEAD"):
        return
    plain = urllib.parse.unquote(url)
    if SOURCE_ID in plain:
        raise SheetError("شیت مبدأ نوشته نمی‌شود.")
    if REPORT_ID not in plain:
        raise SheetError("فقط شیت گزارش نوشته می‌شود.")
    if ":batchUpdate" in plain:
        requests = (body or {}).get("requests") or []
        for req in requests:
            if list(req) == ["addSheet"]:
                title = ((req.get("addSheet") or {}).get("properties") or {}).get("title")
                if title not in OUTPUT_TABS or title in KEEP_TABS:
                    raise SheetError("فقط پنج تب خروجی نوشته می‌شود.")
                continue
            delete = req.get("deleteDimension") or {}
            span = delete.get("range") or {}
            if (
                list(req) == ["deleteDimension"]
                and span.get("dimension") == "ROWS"
                and span.get("sheetId") in _ROW_DELETE_IDS
                and span.get("startIndex", 0) > 0
            ):
                continue
            raise SheetError("فقط پنج تب خروجی نوشته می‌شود.")
        return
    if any(name in plain for name in KEEP_TABS):
        raise SheetError("تب منبع پاک نمی‌شود.")
    if not any(name in plain for name in OUTPUT_TABS):
        raise SheetError("فقط پنج تب خروجی نوشته می‌شود.")


def _request(token: str, method: str, url: str, body=None):
    _guard_write(method, url, body)
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        message = detail
        try:
            message = json.loads(detail).get("error", {}).get("message") or detail
        except json.JSONDecodeError:
            pass
        raise SheetError("شیت: " + _safe(str(message))) from exc


def _quote(name: str) -> str:
    return "'" + name.replace("'", "''") + "'"


def _sheet_url(spreadsheet_id: str, suffix: str) -> str:
    return f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}{suffix}"


def read_tab(token: str, spreadsheet_id: str, name: str):
    encoded = urllib.parse.quote(_quote(name) + "!A:ZZ", safe="")
    data = _request(
        token,
        "GET",
        _sheet_url(spreadsheet_id, f"/values/{encoded}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS"),
    )
    values = data.get("values") or []
    if not values:
        raise SheetError(f"تب «{name}» خالی است یا پیدا نشد.")
    return values


def sheet_map(token: str, spreadsheet_id: str) -> dict:
    data = _request(token, "GET", _sheet_url(spreadsheet_id, "?fields=sheets.properties(sheetId,title)"))
    out = {}
    for sheet in data.get("sheets") or []:
        props = sheet.get("properties") or {}
        title = props.get("title")
        if title:
            out[title] = props.get("sheetId")
    return out


def ensure_output_sheets(token: str, titles: dict) -> dict:
    missing = [name for name in OUTPUT_TABS if name not in titles]
    for name in OUTPUT_TABS:
        if name in KEEP_TABS:
            raise SheetError("تب منبع پاک نمی‌شود.")
    if missing:
        _request(token, "POST", _sheet_url(REPORT_ID, ":batchUpdate"), {
            "requests": [{"addSheet": {"properties": {"title": name}}} for name in missing]
        })
        titles = sheet_map(token, REPORT_ID)
    for name in OUTPUT_TABS:
        if name not in titles or name in KEEP_TABS:
            raise SheetError("تب خروجی پیدا نشد.")
    return titles


def clear_output(token: str, name: str) -> None:
    if name in KEEP_TABS or name not in OUTPUT_TABS:
        raise SheetError("تب منبع پاک نمی‌شود.")
    encoded = urllib.parse.quote(_quote(name), safe="")
    _request(token, "POST", _sheet_url(REPORT_ID, f"/values/{encoded}:clear"), {})


def write_grid(token: str, name: str, grid) -> None:
    if name in KEEP_TABS or name not in OUTPUT_TABS:
        raise SheetError("تب منبع پاک نمی‌شود.")
    width = len(grid[0])
    step = 2000
    for start in range(0, len(grid), step):
        slice_ = grid[start:start + step]
        cell = f"A{start + 1}"
        encoded = urllib.parse.quote(f"{_quote(name)}!{cell}", safe="")
        _request(
            token,
            "PUT",
            _sheet_url(REPORT_ID, f"/values/{encoded}?valueInputOption=RAW"),
            {"range": f"{_quote(name)}!{cell}", "majorDimension": "ROWS", "values": slice_},
        )
        _ = width


def locate_source_tab(token: str, name: str) -> str:
    """New Flow is on the source spreadsheet. online and social live on the report spreadsheet."""
    for spreadsheet_id in (SOURCE_ID, REPORT_ID):
        titles = sheet_map(token, spreadsheet_id)
        if name in titles:
            if name in OUTPUT_TABS:
                raise SheetError("تب منبع با تب خروجی یکی شد.")
            return spreadsheet_id
    raise SheetError(f"تب «{name}» پیدا نشد.")


def report_view() -> dict:
    """Read the written general tab. Does not clear or write anything."""
    with _LOCK:
        token = access_token(load_key())
        values = read_tab(token, REPORT_ID, "general")
    if not values or values[0][:1] != ["شناسه درخواست"]:
        raise SheetError("تب general سرستون مورد انتظار را ندارد.")
    rows = values[1:]
    ready = rename = manual = 0
    for row in rows:
        label = row[7] if len(row) > 7 else ""
        if label == "آماده فعال\u200cسازی":
            ready += 1
        elif label == "فعال\u200cسازی با اسم جدید":
            rename += 1
        else:
            manual += 1
    return {
        "ok": True,
        "general": len(rows),
        "ready": ready,
        "rename": rename,
        "manual": manual,
        "done": 0,
        "rows": rows,
    }


_SAVED = Path("/tmp/operator-saves.json")
_STATUS_TABS = {
    "آماده فعال\u200cسازی": ("آماده فعال\u200cسازی", "آماده فعال\u200cسازی"),
    "نیاز به تغییر نام": ("فعال\u200cسازی با اسم جدید", "نیاز به تغییر نام"),
    "نیازمند بررسی دستی": ("بررسی دستی", "نیازمند بررسی دستی"),
}


def saved_contracts() -> set:
    if not _SAVED.is_file():
        return set()
    try:
        data = json.loads(_SAVED.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()
    return {str(key) for key, value in data.items() if value}


def _remember_save(contract: str) -> None:
    data = {}
    if _SAVED.is_file():
        try:
            data = json.loads(_SAVED.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    data[str(contract)] = True
    _SAVED.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _put_row(token: str, name: str, sheet_row: int, values) -> None:
    if name in KEEP_TABS or name not in OUTPUT_TABS:
        raise SheetError("تب منبع پاک نمی‌شود.")
    cell = f"A{sheet_row}"
    encoded = urllib.parse.quote(f"{_quote(name)}!{cell}", safe="")
    _request(
        token,
        "PUT",
        _sheet_url(REPORT_ID, f"/values/{encoded}?valueInputOption=RAW"),
        {"range": f"{_quote(name)}!{cell}", "majorDimension": "ROWS", "values": [values]},
    )


def _append_row(token: str, name: str, values) -> None:
    if name in KEEP_TABS or name not in OUTPUT_TABS:
        raise SheetError("تب منبع پاک نمی‌شود.")
    encoded = urllib.parse.quote(_quote(name) + "!A1", safe="")
    _request(
        token,
        "POST",
        _sheet_url(REPORT_ID, f"/values/{encoded}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"),
        {"range": f"{_quote(name)}!A1", "majorDimension": "ROWS", "values": [values]},
    )


def _delete_sheet_rows(token: str, sheet_id: int, indexes) -> None:
    global _ROW_DELETE_IDS
    if not indexes:
        return
    _ROW_DELETE_IDS = {sheet_id}
    requests = []
    for index in sorted(indexes, reverse=True):
        requests.append({
            "deleteDimension": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "ROWS",
                    "startIndex": index,
                    "endIndex": index + 1,
                }
            }
        })
    _request(token, "POST", _sheet_url(REPORT_ID, ":batchUpdate"), {"requests": requests})


def save_store(payload: dict) -> dict:
    """Write one operator decision onto general and move that row between the status tabs."""
    contract = str(payload.get("contract") or "").strip()
    status = str(payload.get("status") or "").strip()
    if not contract or status not in _STATUS_TABS:
        raise SheetError("تصمیم این فروشگاه ذخیره نشد.")
    label, target = _STATUS_TABS[status]
    with _LOCK:
        token = access_token(load_key())
        general = read_tab(token, REPORT_ID, "general")
        hits = [i for i, row in enumerate(general) if i and row and row[0] == contract]
        if len(hits) != 1:
            raise SheetError("این شناسه در تب general یک ردیف مشخص نیست.")
        index = hits[0]
        row = list(general[index])
        while len(row) < 35:
            row.append("")
        row[7] = label
        row[8] = str(payload.get("reason") or "")
        row[9] = label
        row[10] = str(payload.get("fa") or "")
        row[11] = str(payload.get("en") or "")
        row[12] = "نیازمند بررسی" if status == "نیازمند بررسی دستی" else "تأیید اپراتور"
        ref = str(payload.get("ref") or "").strip()
        if ref:
            row[14] = ref
        _put_row(token, "general", index + 1, row)
        titles = sheet_map(token, REPORT_ID)
        for name in (OUTPUT_TABS[1], OUTPUT_TABS[2], OUTPUT_TABS[3]):
            if name in KEEP_TABS or name not in titles:
                raise SheetError("تب خروجی پیدا نشد.")
            values = read_tab(token, REPORT_ID, name)
            found = [i for i, one in enumerate(values) if i and one and one[0] == contract]
            if name == target:
                if found:
                    _put_row(token, name, found[0] + 1, row)
                    _delete_sheet_rows(token, titles[name], found[1:])
                else:
                    _append_row(token, name, row)
            elif found:
                _delete_sheet_rows(token, titles[name], found)
        _remember_save(contract)
        return {"ok": True, "contract": contract, "status": status, "tab": target}


def run_review() -> dict:
    with _LOCK:
        from batch_sites import publish_report
        return publish_report(0)
