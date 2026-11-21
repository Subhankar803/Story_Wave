"""Document export and import service (DOCX, PDF, TXT) for Story Wave."""
import io
import re
from typing import Any
import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import pypdf


def html_to_plain_text(html: str) -> str:
    """Strip HTML tags and convert block tags into clean line breaks."""
    if not html:
        return ""
    # Replace paragraph/break tags with newlines
    text = re.sub(r'<(?:br|p|div|h[1-6])[^>]*>', '\n', html, flags=re.IGNORECASE)
    text = re.sub(r'</(?:p|div|h[1-6])>', '\n', text, flags=re.IGNORECASE)
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode basic HTML entities
    text = (
        text.replace('&quot;', '"')
        .replace('&apos;', "'")
        .replace('&#39;', "'")
        .replace('&amp;', '&')
        .replace('&lt;', '<')
        .replace('&gt;', '>')
        .replace('&nbsp;', ' ')
    )
    # Normalize multiple line breaks
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def export_docx(title: str, chapters: list[dict[str, Any]]) -> bytes:
    """Generate a clean Microsoft Word (.docx) document."""
    doc = docx.Document()

    # Document Title
    title_p = doc.add_heading(title or "Untitled Story", level=0)
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    for ch in chapters:
        ch_num = ch.get("number", 1)
        ch_title = ch.get("title") or f"Chapter {ch_num}"
        subtitle = ch.get("subtitle", "")
        heading_text = f"{ch_title}: {subtitle}" if subtitle else ch_title

        doc.add_heading(heading_text, level=1)
        raw_content = ch.get("content") or ch.get("text") or ""
        clean_text = html_to_plain_text(raw_content)

        for paragraph in clean_text.split("\n\n"):
            p_strip = paragraph.strip()
            if p_strip:
                p = doc.add_paragraph(p_strip)
                p.paragraph_format.line_spacing = 1.15
                p.paragraph_format.space_after = Pt(6)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def export_txt(title: str, chapters: list[dict[str, Any]]) -> bytes:
    """Generate a clean plain text (.txt) document."""
    lines = [
        "=" * 60,
        (title or "UNTITLED STORY").upper().center(60),
        "=" * 60,
        "",
    ]
    for ch in chapters:
        ch_num = ch.get("number", 1)
        ch_title = ch.get("title") or f"Chapter {ch_num}"
        subtitle = ch.get("subtitle", "")
        heading_text = f"{ch_title}: {subtitle}" if subtitle else ch_title

        lines.append("")
        lines.append(heading_text)
        lines.append("-" * len(heading_text))
        lines.append("")

        raw_content = ch.get("content") or ch.get("text") or ""
        lines.append(html_to_plain_text(raw_content))
        lines.append("")

    return "\n".join(lines).encode("utf-8")


def export_pdf(title: str, chapters: list[dict[str, Any]]) -> bytes:
    """Generate a valid, paginated PDF 1.4 document."""
    def wrap_text(txt: str, max_chars: int = 75) -> list[str]:
        wrapped: list[str] = []
        for line in txt.split("\n"):
            words = line.split()
            if not words:
                wrapped.append("")
                continue
            curr = ""
            for w in words:
                if len(curr) + len(w) + 1 <= max_chars:
                    curr = (curr + " " + w).strip()
                else:
                    wrapped.append(curr)
                    curr = w
            if curr:
                wrapped.append(curr)
        return wrapped

    all_items: list[tuple[str, str]] = [("title", title or "Untitled Story"), ("space", "")]
    for ch in chapters:
        ch_num = ch.get("number", 1)
        ch_title = ch.get("title") or f"Chapter {ch_num}"
        subtitle = ch.get("subtitle", "")
        heading = f"{ch_title}: {subtitle}" if subtitle else ch_title

        all_items.append(("heading", heading))
        clean_text = html_to_plain_text(ch.get("content") or ch.get("text") or "")
        for w_line in wrap_text(clean_text):
            all_items.append(("body", w_line))
        all_items.append(("space", ""))

    # Paginate (page height 792pt, printable top 740pt down to 60pt)
    pages: list[list[tuple[str, str, int]]] = []
    current_page: list[tuple[str, str, int]] = []
    y = 740

    for kind, text in all_items:
        h = 26 if kind == "title" else (20 if kind == "heading" else 14)
        if y - h < 55:
            pages.append(current_page)
            current_page = []
            y = 740
        current_page.append((kind, text, y))
        y -= h

    if current_page or not pages:
        pages.append(current_page)

    objs: list[str] = []

    def add_obj(body: str) -> int:
        objs.append(body)
        return len(objs)

    f_norm = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    f_bold = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    page_obj_ids: list[int] = []
    # Pages catalog will be created after all page objects
    pages_obj_id = len(objs) + len(pages) * 2 + 1

    for p_lines in pages:
        stream_lines = ["BT"]
        for kind, text, y_pos in p_lines:
            if kind == "space" or not text:
                continue
            f_num = 2 if kind in ("title", "heading") else 1
            sz = 18 if kind == "title" else (13 if kind == "heading" else 10)
            # Escape PDF string literals
            safe_txt = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            stream_lines.append(f"/F{f_num} {sz} Tf")
            stream_lines.append(f"50 {y_pos} Td")
            stream_lines.append(f"({safe_txt}) Tj")
            stream_lines.append(f"-50 -{y_pos} Td")
        stream_lines.append("ET")
        stream_content = "\n".join(stream_lines)
        c_bytes = stream_content.encode("latin-1", errors="replace")

        c_id = add_obj(f"<< /Length {len(c_bytes)} >>\nstream\n{stream_content}\nendstream")
        p_id = add_obj(
            f"<< /Type /Page /Parent {pages_obj_id} 0 R /MediaBox [0 0 612 792] "
            f"/Contents {c_id} 0 R /Resources << /Font << /F1 {f_norm} 0 R /F2 {f_bold} 0 R >> >> >>"
        )
        page_obj_ids.append(p_id)

    kids_str = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
    pages_id = add_obj(f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_obj_ids)} >>")
    cat_id = add_obj(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

    # Serialize PDF
    out = ["%PDF-1.4\n"]
    offsets = [0]
    for i, o in enumerate(objs, 1):
        offsets.append(sum(len(x.encode("latin-1", errors="replace")) for x in out))
        out.append(f"{i} 0 obj\n{o}\nendobj\n")

    start_xref = sum(len(x.encode("latin-1", errors="replace")) for x in out)
    out.append(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n")
    for off in offsets[1:]:
        out.append(f"{off:010d} 00000 n \n")
    out.append(f"trailer\n<< /Size {len(objs) + 1} /Root {cat_id} 0 R >>\nstartxref\n{start_xref}\n%%EOF")

    return "".join(out).encode("latin-1", errors="replace")


def import_file(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Import and parse DOCX, PDF, TXT or JSON into structured story title and chapters."""
    clean_name = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
    lower_name = filename.lower()

    # 1. DOCX Import
    if lower_name.endswith(".docx"):
        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        if not paragraphs:
            return {"title": clean_name, "chapters": [{"number": 1, "title": "Chapter 1", "subtitle": "Imported Scene", "content": ""}]}

        story_title = clean_name
        # Check if first paragraph is a story title heading
        first_p = paragraphs[0]
        start_idx = 0
        if not re.match(r"^chapter\s+\d+", first_p, re.IGNORECASE) and len(first_p) < 60:
            story_title = first_p
            start_idx = 1

        chapters: list[dict[str, Any]] = []
        curr_text_lines: list[str] = []
        curr_subtitle = "Imported Scene"
        curr_title = "Chapter 1"

        chap_pattern = re.compile(r"^chapter\s+(\d+)(?::\s*(.*))?", re.IGNORECASE)

        for p in paragraphs[start_idx:]:
            m = chap_pattern.match(p)
            if m:
                if curr_text_lines:
                    chapters.append({
                        "number": len(chapters) + 1,
                        "title": curr_title,
                        "subtitle": curr_subtitle,
                        "content": "\n\n".join(curr_text_lines),
                    })
                    curr_text_lines = []
                curr_title = f"Chapter {m.group(1)}"
                curr_subtitle = (m.group(2) or "Scene").strip()
            else:
                curr_text_lines.append(f"<p>{p}</p>")

        if curr_text_lines or not chapters:
            chapters.append({
                "number": len(chapters) + 1,
                "title": curr_title,
                "subtitle": curr_subtitle,
                "content": "\n\n".join(curr_text_lines) if curr_text_lines else "",
            })

        return {"title": story_title, "chapters": chapters}

    # 2. PDF Import
    elif lower_name.endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text_parts = [page.extract_text() or "" for page in reader.pages]
        full_text = "\n".join(text_parts).strip()
        lines = [l.strip() for l in full_text.split("\n") if l.strip()]

        chapters = []
        curr_lines: list[str] = []
        curr_num = 1
        curr_sub = "Scene"
        chap_pat = re.compile(r"^chapter\s+(\d+)(?::\s*(.*))?", re.IGNORECASE)

        for line in lines:
            m = chap_pat.match(line)
            if m:
                if curr_lines:
                    chapters.append({
                        "number": curr_num,
                        "title": f"Chapter {curr_num}",
                        "subtitle": curr_sub,
                        "content": "<p>" + "</p><p>".join(curr_lines) + "</p>",
                    })
                    curr_lines = []
                curr_num = int(m.group(1))
                curr_sub = (m.group(2) or "Scene").strip()
            else:
                curr_lines.append(line)

        if curr_lines or not chapters:
            chapters.append({
                "number": curr_num,
                "title": f"Chapter {curr_num}",
                "subtitle": curr_sub,
                "content": "<p>" + "</p><p>".join(curr_lines) + "</p>",
            })

        return {"title": clean_name, "chapters": chapters}

    # 3. Plain Text / Markdown Import
    else:
        text = file_bytes.decode("utf-8", errors="replace").strip()
        lines = [l.strip() for l in text.split("\n")]
        chapters = []
        curr_lines = []
        curr_num = 1
        curr_sub = "Scene"
        chap_pat = re.compile(r"^chapter\s+(\d+)(?::\s*(.*))?", re.IGNORECASE)

        for line in lines:
            m = chap_pat.match(line)
            if m:
                if curr_lines:
                    chapters.append({
                        "number": curr_num,
                        "title": f"Chapter {curr_num}",
                        "subtitle": curr_sub,
                        "content": "<p>" + "</p><p>".join([cl for cl in curr_lines if cl]) + "</p>",
                    })
                    curr_lines = []
                curr_num = int(m.group(1))
                curr_sub = (m.group(2) or "Scene").strip()
            else:
                curr_lines.append(line)

        if curr_lines or not chapters:
            chapters.append({
                "number": curr_num,
                "title": f"Chapter {curr_num}",
                "subtitle": curr_sub,
                "content": "<p>" + "</p><p>".join([cl for cl in curr_lines if cl]) + "</p>",
            })

        return {"title": clean_name, "chapters": chapters}
