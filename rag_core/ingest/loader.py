from __future__ import annotations

import datetime
import re
from pathlib import Path
from typing import TypedDict


class DocChunk(TypedDict):
    text: str
    metadata: dict


def _load_pdf(path: Path) -> str:
    import PyPDF2

    text_parts: list[str] = []
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            raw = page.extract_text()
            if raw:
                text_parts.append(raw.strip())
    return "\n\n".join(text_parts)


def _load_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def _load_md(path: Path) -> str:
    return path.read_text(encoding="utf-8")


_PARSERS = {
    ".pdf": _load_pdf,
    ".docx": _load_docx,
    ".md": _load_md,
}


def load_document(path: str | Path) -> DocChunk:
    """Load a single document and return its text with metadata."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {path}")

    suffix = path.suffix.lower()
    parser = _PARSERS.get(suffix)
    if parser is None:
        raise ValueError(
            f"Unsupported file type: {suffix}. Supported: {list(_PARSERS)}"
        )

    text = parser(path)
    if not text.strip():
        raise ValueError(f"Extracted empty text from {path.name}")

    date_match = re.search(r"20\d{2}", text[:200])
    date_str = date_match.group(0) if date_match else str(datetime.date.today().year)

    metadata = {
        "source_file": path.name,
        "title": path.stem.replace("_", " "),
        "date": date_str,
        "doc_type": suffix.lstrip("."),
        "file_path": str(path.resolve()),
    }
    return DocChunk(text=text, metadata=metadata)


def load_all(data_dir: str | Path) -> list[DocChunk]:
    """Load all supported documents from a directory."""
    data_dir = Path(data_dir)
    docs: list[DocChunk] = []
    for suffix in _PARSERS:
        for file in sorted(data_dir.glob(f"*{suffix}")):
            if file.name.startswith("_") or file.name.startswith("."):
                continue
            try:
                doc = load_document(file)
                docs.append(doc)
                print(f"  Loaded: {file.name} ({len(doc['text'])} chars)")
            except Exception as exc:
                print(f"  [WARN] Skipping {file.name}: {exc}")
    return docs
