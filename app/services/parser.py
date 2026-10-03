from dataclasses import dataclass

@dataclass
class ParsedTable:
    headers: list[str]
    rows: list[list[str]]

def parse_table(text: str) -> ParsedTable:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError("حداقل یک ردیف عنوان و یک ردیف داده لازم است.")
    matrix = []
    for line in lines:
        cells = [cell.strip() for cell in line.split("|")]
        if len(cells) < 2:
            raise ValueError("فرمت هر ردیف باید با | از هم جدا شود؛ مثال: نام | امتیاز")
        matrix.append(cells)
    width = len(matrix[0])
    normalized = []
    for row in matrix:
        if len(row) > width:
            raise ValueError("تعداد ستون‌های همه ردیف‌ها باید یکسان باشد.")
        normalized.append(row + [""] * (width - len(row)))
    return ParsedTable(normalized[0], normalized[1:])
