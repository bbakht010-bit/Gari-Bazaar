"""One-off bulk patch: attach brand.css, drop duplicate Google font links and :root token blocks."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ROOT_BLOCK = re.compile(r"\s*:root\s*\{[^}]+\}\s*", re.MULTILINE)
FONT_LINK = re.compile(
    r'<link\s+href="https://fonts\.googleapis\.com/[^>]+\>', re.IGNORECASE
)


def patch(text: str) -> str:
    if "brand.css" not in text:
        text = re.sub(
            r"(<meta\s+name=[\"']viewport[\"'][^>]*>\s*)",
            r'\1<link rel="stylesheet" href="brand.css">\n',
            text,
            count=1,
            flags=re.IGNORECASE,
        )

    text = FONT_LINK.sub("", text, count=10)

    for _ in range(5):
        new = ROOT_BLOCK.sub("\n", text, count=1)
        if new == text:
            break
        text = new

    text = text.replace("Playfair Display", "Plus Jakarta Sans")
    text = text.replace("'DM Sans'", "'Plus Jakarta Sans'")
    text = text.replace('"DM Sans"', '"Plus Jakarta Sans"')

    return text


def main() -> None:
    for path in sorted(ROOT.glob("*.html")):
        raw = path.read_text(encoding="utf-8")
        out = patch(raw)
        if out != raw:
            path.write_text(out, encoding="utf-8", newline="\n")
            print("patched:", path.name)


if __name__ == "__main__":
    main()
