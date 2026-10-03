from copy import deepcopy

BLOCK_LABELS = {
    "header": "🏷 سربرگ",
    "text": "📝 متن",
    "table": "📊 جدول",
    "stats": "📈 آمار",
    "highlight": "⭐ برجسته",
    "separator": "➖ جداکننده",
    "footer": "📌 پاورقی",
}


def default_layout(kind="table"):
    title = {"ranking": "🏆 رتبه‌بندی", "stats": "📈 آمار", "custom": "📝 پیام سفارشی", "table": "📊 جدول"}.get(kind, "📊 جدول")
    return [
        {"type": "header", "title": title, "subtitle": ""},
        {"type": "table"},
        {"type": "stats", "items": [{"label": "تعداد ردیف", "value": "{{count}}"}]},
        {"type": "footer", "text": ""},
    ]


def normalize_layout(layout, kind="table"):
    if not isinstance(layout, list) or not layout:
        return default_layout(kind)
    result = []
    for block in layout:
        if not isinstance(block, dict) or block.get("type") not in BLOCK_LABELS:
            continue
        item = deepcopy(block)
        if item["type"] == "header":
            item.setdefault("title", "")
            item.setdefault("subtitle", "")
        elif item["type"] == "text":
            item.setdefault("text", "")
        elif item["type"] == "stats":
            item.setdefault("items", [])
        elif item["type"] == "highlight":
            item.setdefault("title", "")
            item.setdefault("text", "")
        elif item["type"] == "footer":
            item.setdefault("text", "")
        result.append(item)
    return result or default_layout(kind)


def migrate_legacy(config, kind="table"):
    config = config or {}
    if config.get("layout"):
        return normalize_layout(config["layout"], kind)
    layout = default_layout(kind)
    for block in layout:
        if block["type"] == "header":
            block["title"] = config.get("title", block["title"])
            block["subtitle"] = config.get("subtitle", "")
        elif block["type"] == "footer":
            block["text"] = config.get("footer", "")
    return layout


def with_derived_values(layout, rows):
    count = len(rows or [])
    result = deepcopy(layout)
    for block in result:
        if block.get("type") == "stats":
            for item in block.get("items", []):
                item["value"] = str(item.get("value", "")).replace("{{count}}", str(count))
        elif block.get("type") == "highlight" and not block.get("text") and rows:
            block["text"] = " · ".join(str(x) for x in rows[0][:3])
    return result
