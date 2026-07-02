#!/usr/bin/env python3
import argparse
import re
import sys
from pathlib import Path

from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = REPO_ROOT / "HELLPIERCERS v1.02.pdf"


def load_reader(pdf_path: Path) -> PdfReader:
    if not pdf_path.is_file():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        print("Place HELLPIERCERS v1.02.pdf at the repo root (gitignored).", file=sys.stderr)
        sys.exit(1)
    return PdfReader(str(pdf_path))


def page_text(reader: PdfReader, page_num: int) -> str:
    return reader.pages[page_num - 1].extract_text() or ""


def print_pages(reader: PdfReader, start: int, end: int) -> None:
    total = len(reader.pages)
    start = max(1, start)
    end = min(total, end)
    for page_num in range(start, end + 1):
        print(f"\n=== PAGE {page_num} ===\n")
        print(page_text(reader, page_num))


def search_pages(reader: PdfReader, query: str, context: int) -> None:
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    hits = 0
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if not pattern.search(text):
            continue
        hits += 1
        print(f"\n=== PAGE {i} ===\n")
        if context <= 0:
            print(text)
            continue
        for match in pattern.finditer(text):
            start = max(0, match.start() - context)
            end = min(len(text), match.end() + context)
            snippet = text[start:end].replace("\n", " ")
            print(f"...{snippet}...")
    if hits == 0:
        print(f"No matches for {query!r}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract text from the Hellpiercers rulebook PDF")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="Path to rulebook PDF")
    parser.add_argument("--page", type=int, help="Single page number (1-indexed)")
    parser.add_argument("--from-page", type=int, dest="from_page", help="Start page (1-indexed)")
    parser.add_argument("--to-page", type=int, dest="to_page", help="End page (1-indexed)")
    parser.add_argument("--search", "-s", help="Search all pages (case-insensitive)")
    parser.add_argument(
        "--context",
        type=int,
        default=120,
        help="Characters of context around each search hit (0 = full page)",
    )
    parser.add_argument("--pages", action="store_true", help="Print total page count and exit")
    args = parser.parse_args()

    reader = load_reader(args.pdf)

    if args.pages:
        print(len(reader.pages))
        return

    if args.search:
        search_pages(reader, args.search, args.context)
        return

    if args.page is not None:
        print_pages(reader, args.page, args.page)
        return

    if args.from_page is not None or args.to_page is not None:
        start = args.from_page or 1
        end = args.to_page or len(reader.pages)
        print_pages(reader, start, end)
        return

    parser.print_help()
    sys.exit(2)


if __name__ == "__main__":
    main()
