from dataclasses import dataclass, field
from typing import Literal

MessageKind = Literal["table", "ranking", "stats", "custom"]

@dataclass
class MessageModel:
    kind: MessageKind = "table"
    title: str = ""
    subtitle: str = ""
    headers: list[str] = field(default_factory=list)
    rows: list[list[str]] = field(default_factory=list)
    footer: str = ""
    style: str = "classic"
    show_index: bool = False
    align: str = "auto"

    def normalized(self) -> "MessageModel":
        headers = [str(x).strip() for x in self.headers]
        width = len(headers)
        rows = []
        for row in self.rows:
            values = [str(x).strip() for x in row]
            values += [""] * max(0, width - len(values))
            rows.append(values[:width])
        return MessageModel(self.kind, self.title.strip(), self.subtitle.strip(), headers, rows, self.footer.strip(), self.style, self.show_index, self.align)
