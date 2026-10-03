from dataclasses import dataclass
import csv
import io

@dataclass
class ParsedTable:
    headers: list[str]
    rows: list[list[str]]

def _normalize(rows: list[list[str]]) -> ParsedTable:
    rows = [[cell.strip() for cell in row] for row in rows if any(cell.strip() for cell in row)]
    if len(rows) < 2:
        raise ValueError("حداقل یک ردیف عنوان و یک ردیف داده لازم است.")
    width = len(rows[0])
    if width < 2:
        raise ValueError("جدول باید حداقل دو ستون داشته باشد.")
    if any(len(row) > width for row in rows):
        raise ValueError("تعداد ستون‌های ردیف‌ها نباید بیشتر از ردیف عنوان باشد.")
    return ParsedTable(rows[0], [row + [""] * (width - len(row)) for row in rows[1:]])

def parse_table(text: str) -> ParsedTable:
    rows = []
    for line in text.splitlines():
        if line.strip():
            rows.append([cell.strip() for cell in line.split("|")])
    return _normalize(rows)

def parse_csv(text: str) -> ParsedTable:
    return _normalize(list(csv.reader(io.StringIO(text))))
