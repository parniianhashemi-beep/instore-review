"""Open website rows in batches and write the five report tabs after each batch."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from classify import (
    FILTER_N,
    OUTPUT_TABS,
    SHEET_HEADERS,
    cell,
    classify_url,
    decide,
    nbo_of,
    output_tables,
    resolve_new_flow,
    row_has_any,
    rows_as_objects,
    helper_cols,
    build_online_index,
    build_social_index,
    sheet_row,
)
from sheets_job import (
    REPORT_ID,
    SOURCE_ID,
    SOURCE_TABS,
    SheetError,
    _LOCK,
    access_token,
    clear_output,
    ensure_output_sheets,
    load_key,
    locate_source_tab,
    read_tab,
    saved_contracts,
    sheet_map,
    write_grid,
)
from site_check import check_site, sold_words

CACHE = Path("/tmp/site-check-cache.json")
READY = "آماده فعال\u200cسازی"
RENAME = "فعال\u200cسازی با اسم جدید"
MANUAL = "بررسی دستی"


def queue_items(nf_values):
    mapping = resolve_new_flow(nf_values[0])
    items = []
    for src in nf_values[1:]:
        if not row_has_any(src):
            continue
        if cell(src, mapping["filterN"]) != FILTER_N:
            continue
        if cell(src, mapping["filterP"]) or cell(src, mapping["filterZ"]):
            continue
        items.append({
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
        })
    return items


def load_cache():
    if not CACHE.is_file():
        return {}
    return json.loads(CACHE.read_text(encoding="utf-8"))


def save_cache(cache):
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def indexes(online_values, social_values):
    online = rows_as_objects(online_values)
    social = rows_as_objects(social_values)
    online_cols = helper_cols(online["headers"], False)
    social_cols = helper_cols(social["headers"], True)
    return (
        build_online_index(online["rows"], online_cols),
        build_social_index(social["rows"], social_cols),
        online_cols,
        social_cols,
    )


def partition(general_rows):
    ready, rename, manual = [], [], []
    for row in general_rows:
        label = row[7] if len(row) > 7 else ""
        if label == READY:
            ready.append(row)
        elif label == RENAME:
            rename.append(row)
        else:
            manual.append(row)
    header = SHEET_HEADERS[:]
    return [
        ("general", [header, *general_rows]),
        (OUTPUT_TABS[1], [header, *ready]),
        (OUTPUT_TABS[2], [header, *rename]),
        (OUTPUT_TABS[3], [header, *manual]),
        (OUTPUT_TABS[4], [header]),
    ]


def write_tables(token, tables):
    titles = ensure_output_sheets(token, sheet_map(token, REPORT_ID))
    protected = [title for title in titles if title not in {name for name, _ in tables}]
    for name, _grid in tables:
        clear_output(token, name)
    for name, grid in tables:
        write_grid(token, name, grid)
    return protected


def open_batch(items, cache, limit):
    websites = [item for item in items if classify_url(item["url"]) == "website" and item["url"] not in cache]
    batch = websites[:limit]
    print(f"batch {len(batch)} of {len(websites)} websites still closed", flush=True)
    for index, item in enumerate(batch, start=1):
        print(f"{index}/{len(batch)} {item['contract']} {item['url']}", flush=True)
        page = check_site(item["url"])
        cache[item["url"]] = page
        save_cache(cache)
        print(
            f"  opened={page['opened']} cert={page['certificate'] or '-'} holder={page['holder'] or '-'} sold={page['sold'][:80]} err={page['error'] or page['enamad_error']}",
            flush=True,
        )
    return batch


def apply_cache(items, cache, online_index, social_index, online_cols, social_cols, general_rows):
    by_contract = {row[0]: i for i, row in enumerate(general_rows) if row}
    kept = saved_contracts()
    updated = 0
    for item in items:
        if item["contract"] in kept:
            continue
        page = cache.get(item["url"])
        if not page or classify_url(item["url"]) != "website":
            continue
        decision = decide(item, online_index, social_index, online_cols, social_cols, page=page)
        row = sheet_row(item, decision)
        pos = by_contract.get(item["contract"])
        if pos is None:
            continue
        width = max(len(general_rows[pos]), len(row))
        padded = row + [""] * (width - len(row))
        general_rows[pos] = padded
        updated += 1
    return updated


def publish_report(limit: int = 0) -> dict:
    """Rewrite only the five report tabs, using sites already opened."""
    with _LOCK:
        return _publish_report(limit)


def _publish_report(limit: int = 0) -> dict:
    key = load_key()
    token = access_token(key)
    tables_in = [read_tab(token, locate_source_tab(token, name), name) for name in SOURCE_TABS]
    items = queue_items(tables_in[0])
    online_index, social_index, online_cols, social_cols = indexes(tables_in[1], tables_in[2])
    cache = load_cache()
    for page in cache.values():
        if page.get("text"):
            page["sold"] = sold_words(page["text"])
    open_batch(items, cache, limit)
    general = read_tab(token, REPORT_ID, "general")
    if not general or general[0][0] != SHEET_HEADERS[0]:
        raise SheetError("تب general سرستون مورد انتظار را ندارد.")
    body = general[1:]
    updated = apply_cache(items, cache, online_index, social_index, online_cols, social_cols, body)
    tables = partition(body)
    if [name for name, _grid in tables] != list(OUTPUT_TABS):
        raise SheetError("خروجی پنج تب نیست.")
    write_tables(token, tables)
    labels = {}
    for row in body:
        labels[row[7]] = labels.get(row[7], 0) + 1
    print("UPDATED", updated, "ROWS", len(body), "LABELS", labels, flush=True)
    return {
        "ok": True,
        "general": len(body),
        "ready": labels.get(READY, 0),
        "rename": labels.get(RENAME, 0),
        "manual": labels.get(MANUAL, 0),
        "done": 0,
    }


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    publish_report(limit)


if __name__ == "__main__":
    try:
        main()
    except SheetError as exc:
        print("ERROR", str(exc))
        sys.exit(1)
