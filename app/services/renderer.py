from html import escape
from app.services.parser import ParsedTable

STYLES = {
    "classic": {"title": "📊", "top": ("┌", "┬", "┐"), "mid": ("├", "┼", "┤"), "bottom": ("└", "┴", "┘"), "line": "─", "cell": "│"},
    "clean": {"title": "✨", "top": ("╭", "┬", "╮"), "mid": ("├", "┼", "┤"), "bottom": ("╰", "┴", "╯"), "line": "─", "cell": "│"},
    "competition": {"title": "🏆", "top": ("╔", "╦", "╗"), "mid": ("╠", "╬", "╣"), "bottom": ("╚", "╩", "╝"), "line": "═", "cell": "║"},
}

def _fit(value: str, width: int, align: str = "left") -> str:
    value = value[:width]
    gap = max(0, width - len(value))
    if align == "right":
        return " " * gap + value
    if align == "center":
        left = gap // 2
        return " " * left + value + " " * (gap - left)
    return value + " " * gap

def render_message(headers, rows, title="", subtitle="", footer="", style="classic", show_index=False, align="left"):
    headers = list(headers)
    rows = [list(row) for row in rows]
    if show_index:
        headers = ["#", *headers]
        rows = [[str(i), *row] for i, row in enumerate(rows, 1)]

    spec = STYLES.get(style, STYLES["classic"])
    matrix = [headers, *rows]
    widths = [max(len(str(row[i])) for row in matrix) for i in range(len(headers))]

    def border(parts):
        left, joint, right = parts
        return left + joint.join(spec["line"] * (width + 2) for width in widths) + right

    def row(values):
        safe = [escape(str(v)) for v in values]
        return spec["cell"] + spec["cell"].join(
            f" {_fit(v, widths[i], align)} " for i, v in enumerate(safe)
        ) + spec["cell"]

    output = []
    if title:
        output.append(f"{spec['title']} <b>{escape(title)}</b>")
    if subtitle:
        output.append(escape(subtitle))
    if title or subtitle:
        output.append("")
    output.extend([border(spec["top"]), row(headers), border(spec["mid"])])
    output.extend(row(r) for r in rows)
    output.append(border(spec["bottom"]))
    if footer:
        output.extend(["", escape(footer)])
    return "\n".join(output)

def render_table(table: ParsedTable, title=None, footer=None, style="classic"):
    return render_message(table.headers, table.rows, title=title or "", footer=footer or "", style=style)


def render_layout(layout, headers, rows, style="classic", show_index=False, align="left"):
    """Render a multi-block Telegram message into one safe HTML message."""
    from app.services.layout import normalize_layout, with_derived_values
    blocks = with_derived_values(normalize_layout(layout), rows)
    parts = []
    for block in blocks:
        kind = block.get("type")
        if kind == "header":
            title = block.get("title", "")
            subtitle = block.get("subtitle", "")
            if title:
                icon = STYLES.get(style, STYLES["classic"])["title"]
                parts.append(f"{icon} <b>{escape(str(title))}</b>")
            if subtitle:
                parts.append(escape(str(subtitle)))
        elif kind == "text":
            text = str(block.get("text", "")).strip()
            if text:
                parts.append(escape(text))
        elif kind == "table":
            parts.append(render_message(headers, rows, style=style, show_index=show_index, align=align))
        elif kind == "stats":
            items = block.get("items", [])
            lines = ["📈 <b>آمار</b>"]
            for item in items:
                label = escape(str(item.get("label", "")))
                value = escape(str(item.get("value", "")))
                if label or value:
                    lines.append(f"• <b>{label}</b>: {value}")
            if len(lines) > 1:
                parts.append("\\n".join(lines))
        elif kind == "highlight":
            title = str(block.get("title", "")).strip()
            text = str(block.get("text", "")).strip()
            if title or text:
                lines = ["⭐ <b>" + escape(title) + "</b>" if title else "⭐"]
                if text:
                    lines.append(escape(text))
                parts.append("\\n".join(lines))
        elif kind == "separator":
            parts.append("────────────")
        elif kind == "footer":
            text = str(block.get("text", "")).strip()
            if text:
                parts.append("📌 " + escape(text))
    return "\\n\\n".join(part for part in parts if part).strip()
