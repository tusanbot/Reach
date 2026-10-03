from html import escape
from app.services.parser import ParsedTable

STYLES = {
    "classic": {"title": "📊", "top": ("┌", "┬", "┐"), "mid": ("├", "┼", "┤"), "bottom": ("└", "┴", "┘"), "line": "─", "cell": "│"},
    "clean": {"title": "✨", "top": ("╭", "┬", "╮"), "mid": ("├", "┼", "┤"), "bottom": ("╰", "┴", "╯"), "line": "─", "cell": "│"},
    "competition": {"title": "🏆", "top": ("╔", "╦", "╗"), "mid": ("╠", "╬", "╣"), "bottom": ("╚", "╩", "╝"), "line": "═", "cell": "║"},
}

def _fit(value: str, width: int) -> str:
    value = value[:width]
    return value + " " * max(0, width - len(value))

def render_table(table: ParsedTable, title: str | None = None, footer: str | None = None, style: str = "classic") -> str:
    spec = STYLES.get(style, STYLES["classic"])
    matrix = [table.headers, *table.rows]
    widths = [max(len(row[i]) for row in matrix) for i in range(len(table.headers))]
    def border(parts):
        left, joint, right = parts
        return left + joint.join(spec["line"] * (width + 2) for width in widths) + right
    def row(values):
        return spec["cell"] + spec["cell"].join(f" {_fit(value, widths[i])} " for i, value in enumerate(values)) + spec["cell"]
    output = []
    if title:
        output += [f"{spec['title']} <b>{escape(title)}</b>", ""]
    output += [border(spec["top"]), row(table.headers), border(spec["mid"])]
    output += [row(r) for r in table.rows]
    output.append(border(spec["bottom"]))
    if footer:
        output += ["", escape(footer)]
    return "\n".join(output)
