"""Unit tests for document export and import."""
from app.services import document_export


def test_export_and_import_docx():
    chapters = [
        {"number": 1, "title": "Chapter 1", "subtitle": "Arrival", "content": "<p>Aarav arrived in Delhi.</p>"},
        {"number": 2, "title": "Chapter 2", "subtitle": "Departure", "content": "<p>Later he boarded the train.</p>"},
    ]
    data = document_export.export_docx("The Last Kingdom", chapters)
    assert len(data) > 500

    imported = document_export.import_file(data, "The_Last_Kingdom.docx")
    assert "Last Kingdom" in imported["title"]
    assert len(imported["chapters"]) >= 1


def test_export_and_import_txt():
    chapters = [
        {"number": 1, "title": "Chapter 1", "subtitle": "Arrival", "content": "Aarav arrived in Delhi."}
    ]
    data = document_export.export_txt("My Story", chapters)
    assert b"MY STORY" in data
    assert b"Aarav arrived in Delhi." in data

    imported = document_export.import_file(data, "My_Story.txt")
    assert imported["title"] == "My Story"
    assert len(imported["chapters"]) >= 1


def test_export_and_import_pdf():
    chapters = [
        {"number": 1, "title": "Chapter 1", "subtitle": "First Scene", "content": "<p>This is a PDF test story line.</p>"}
    ]
    data = document_export.export_pdf("PDF Tale", chapters)
    assert data.startswith(b"%PDF-1.4")

    imported = document_export.import_file(data, "PDF_Tale.pdf")
    assert imported["title"] == "Pdf Tale"
    assert len(imported["chapters"]) >= 1
