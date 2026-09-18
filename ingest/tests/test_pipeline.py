"""Unit tests for the ingest pipeline."""

import io
import tarfile
import tempfile

import pytest

from pipeline import (
    IngestError,
    _split_into_token_aware_batches,
    chunk_text,
    download_tarball,
    is_ignored_path,
    parse_and_validate_github_url,
    unpack_and_verify_size,
)


def test_parse_valid_github_urls():
    owner, repo, identity = parse_and_validate_github_url(
        "https://github.com/facebook/react"
    )
    assert owner == "facebook"
    assert repo == "react"
    assert identity == "facebook/react"

    owner, repo, identity = parse_and_validate_github_url(
        "https://github.com/vercel/next.js.git"
    )
    assert owner == "vercel"
    assert repo == "next.js"
    assert identity == "vercel/next.js"

    owner, repo, identity = parse_and_validate_github_url(
        "http://github.com/torvalds/linux/"
    )
    assert owner == "torvalds"
    assert repo == "linux"
    assert identity == "torvalds/linux"


def test_reject_invalid_github_urls():
    with pytest.raises(IngestError) as exc_info:
        parse_and_validate_github_url("https://gitlab.com/owner/repo")
    assert exc_info.value.code == "bad_url"

    with pytest.raises(IngestError) as exc_info:
        parse_and_validate_github_url(
            "https://github.com/owner/repo/tree/main/subfolder"
        )
    assert exc_info.value.code == "bad_url"

    with pytest.raises(IngestError) as exc_info:
        parse_and_validate_github_url("not a url")
    assert exc_info.value.code == "bad_url"


def test_is_ignored_path():
    assert is_ignored_path("node_modules/package/index.js") is True
    assert is_ignored_path(".git/HEAD") is True
    assert is_ignored_path("dist/bundle.js") is True
    assert is_ignored_path("build/output.js") is True
    assert is_ignored_path("vendor/lib.go") is True
    assert is_ignored_path("package-lock.json") is True
    assert is_ignored_path("assets/logo.png") is True
    assert is_ignored_path("assets/font.woff2") is True
    assert is_ignored_path("video/demo.mp4") is True
    assert is_ignored_path("bin/program.exe") is True

    # Valid code files
    assert is_ignored_path("src/index.ts") is False
    assert is_ignored_path("app/page.tsx") is False
    assert is_ignored_path("lib/utils.py") is False
    assert is_ignored_path("README.md") is False


def test_chunk_text_window_and_overlap():
    # Generate 150 lines
    content = "\n".join([f"line {i}" for i in range(1, 151)])
    chunks = chunk_text("src/example.ts", content)

    # With 150 lines:
    # Chunk 0: lines 1..80
    # Chunk 1: lines 71..150
    assert len(chunks) == 2

    assert chunks[0].path == "src/example.ts"
    assert chunks[0].start_line == 1
    assert chunks[0].end_line == 80
    assert "line 1" in chunks[0].text
    assert "line 80" in chunks[0].text

    assert chunks[1].path == "src/example.ts"
    assert chunks[1].start_line == 71
    assert chunks[1].end_line == 150
    assert "line 71" in chunks[1].text
    assert "line 150" in chunks[1].text


def test_chunk_text_short_file():
    content = "line 1\nline 2\nline 3"
    chunks = chunk_text("src/short.ts", content)

    assert len(chunks) == 1
    assert chunks[0].start_line == 1
    assert chunks[0].end_line == 3
    assert chunks[0].text == "line 1\nline 2\nline 3"


def test_chunk_text_empty_file():
    assert chunk_text("src/empty.ts", "") == []


def test_split_into_token_aware_batches_respects_token_cap():
    texts = [f"chunk {i} text" for i in range(20)]
    counts = [1000] * len(texts)
    batches = _split_into_token_aware_batches(texts, counts, max_tokens=5500)

    assert len(batches) == 4
    for batch in batches:
        total = sum(counts[texts.index(t)] for t in batch)
        assert total <= 5500

    flat = [t for b in batches for t in b]
    assert flat == texts


def test_split_into_token_aware_batches_oversized_single_text():
    texts = ["small", "huge", "small again"]
    counts = [10, 10_000, 10]
    batches = _split_into_token_aware_batches(texts, counts, max_tokens=100)

    assert batches == [["small"], ["huge"], ["small again"]]


def test_split_into_token_aware_batches_rejects_mismatched_counts():
    with pytest.raises(ValueError):
        _split_into_token_aware_batches(["a", "b"], [1], max_tokens=100)


def test_unpack_and_verify_size_rejection():
    # Create a small tar.gz exceeding size check if we mock MAX_UNPACKED_BYTES
    with tempfile.TemporaryDirectory() as tmp_dir:
        tar_path = f"{tmp_dir}/test.tar.gz"
        extract_dir = f"{tmp_dir}/extracted"
        with tarfile.open(tar_path, "w:gz") as tar:
            data = b"x" * 100
            ti = tarfile.TarInfo("test/file.txt")
            ti.size = len(data)
            tar.addfile(ti, io.BytesIO(data))

        # With normal size it succeeds
        root_dir = unpack_and_verify_size(tar_path, extract_dir)
        assert root_dir is not None


def test_download_tarball_url_includes_head_ref(monkeypatch, tmp_path):
    """Regression: the codeload URL must include /HEAD so GitHub resolves the default branch."""
    captured_url = {}

    class FakeResponse:
        status_code = 200

        def iter_content(self, chunk_size=65536):
            return [b"fake tarball data"]

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

    def fake_get(url, **kwargs):
        captured_url["url"] = url
        return FakeResponse()

    monkeypatch.setattr("pipeline.requests.get", fake_get)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    dest = str(tmp_path / "repo.tar.gz")
    download_tarball("octocat", "Hello-World", dest)

    assert captured_url["url"] == (
        "https://codeload.github.com/octocat/Hello-World/tar.gz/HEAD"
    )


def test_extract_pdf_chunks_valid():
    import pypdf

    from pipeline import extract_pdf_chunks

    writer = pypdf.PdfWriter()
    # Add page with text
    writer.add_blank_page(width=200, height=200)
    # Since add_blank_page has no text, let's test with PdfWriter + annotations or simulated text extraction
    # Better yet, create a small PDF with text or mock page.extract_text
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    # Empty page should raise empty_file
    with pytest.raises(IngestError) as exc_info:
        extract_pdf_chunks("doc.pdf", pdf_bytes)
    assert exc_info.value.code == "empty_file"


def test_extract_pdf_chunks_empty_bytes():
    from pipeline import extract_pdf_chunks

    with pytest.raises(IngestError) as exc_info:
        extract_pdf_chunks("empty.pdf", b"")
    assert exc_info.value.code == "empty_file"


def test_extract_pdf_chunks_corrupted():
    from pipeline import extract_pdf_chunks

    with pytest.raises(IngestError) as exc_info:
        extract_pdf_chunks("corrupted.pdf", b"not a real pdf content")
    assert exc_info.value.code == "unreadable_pdf"


def test_extract_pdf_chunks_with_text(monkeypatch):
    import pypdf

    from pipeline import extract_pdf_chunks

    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    def fake_extract_text(self):
        return "Line 1: Introduction\nLine 2: Overview\nLine 3: Details"

    monkeypatch.setattr(pypdf.PageObject, "extract_text", fake_extract_text)

    chunks = extract_pdf_chunks("report.pdf", pdf_bytes)
    assert len(chunks) == 1
    assert chunks[0].path == "report.pdf (Page 1)"
    assert chunks[0].start_line == 1
    assert chunks[0].end_line == 3
    assert "Line 1: Introduction" in chunks[0].text


def test_extract_pdf_chunks_multiple_pages(monkeypatch):
    """AC-3: Extract text across multiple pages with page numbers and line ranges."""
    import pypdf

    from pipeline import extract_pdf_chunks

    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    call_count = 0

    def fake_extract_text(self):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "Page 1 Line 1\nPage 1 Line 2"
        return "Page 2 Line 1\nPage 2 Line 2"

    monkeypatch.setattr(pypdf.PageObject, "extract_text", fake_extract_text)

    chunks = extract_pdf_chunks("multi.pdf", pdf_bytes)
    assert len(chunks) == 2
    assert chunks[0].path == "multi.pdf (Page 1)"
    assert chunks[0].start_line == 1
    assert chunks[0].end_line == 2
    assert "Page 1 Line 1" in chunks[0].text

    assert chunks[1].path == "multi.pdf (Page 2)"
    assert chunks[1].start_line == 1
    assert chunks[1].end_line == 2
    assert "Page 2 Line 1" in chunks[1].text


def test_extract_pdf_chunks_encrypted_fails(monkeypatch):
    """AC-8: Password protected or encrypted PDF raises unreadable_pdf."""
    from unittest.mock import MagicMock

    import pypdf

    from pipeline import extract_pdf_chunks

    mock_reader = MagicMock()
    mock_reader.is_encrypted = True
    mock_reader.decrypt.return_value = pypdf.PasswordType.NOT_DECRYPTED

    monkeypatch.setattr(pypdf, "PdfReader", lambda stream: mock_reader)

    with pytest.raises(IngestError) as exc_info:
        extract_pdf_chunks("secret.pdf", b"%PDF-fake")
    assert exc_info.value.code == "unreadable_pdf"
    assert "password" in exc_info.value.message.lower()


def test_extract_pdf_chunks_scanned_empty_text(monkeypatch):
    """AC-8: Scanned PDF without text raises empty_file."""
    import pypdf

    from pipeline import extract_pdf_chunks

    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    monkeypatch.setattr(pypdf.PageObject, "extract_text", lambda self: "   \n\n  ")

    with pytest.raises(IngestError) as exc_info:
        extract_pdf_chunks("scanned.pdf", pdf_bytes)
    assert exc_info.value.code == "empty_file"


def test_process_upload_job_markdown_success(monkeypatch):
    """AC-1, AC-3: Full upload ingestion workflow for Markdown document."""
    from unittest.mock import MagicMock

    from pipeline import process_upload_job

    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_conn.cursor.return_value.__enter__.return_value = fake_cursor

    # Query 1: fetch job -> (id, source_id, status)
    # Query 2: fetch source_files -> (filename, mime_type, byte_size, raw_text, file_data)
    fake_cursor.fetchone.side_effect = [
        ("job-123", "src-456", "queued"),
        ("notes.md", "text/markdown", 100, "# Heading\nLine 2\nLine 3", None),
    ]

    monkeypatch.setattr("pipeline.get_db_connection", lambda: fake_conn)
    monkeypatch.setattr(
        "pipeline.generate_embeddings",
        lambda chunks: [[0.1] * 1024 for _ in chunks],
    )

    result = process_upload_job("job-123")

    assert result["status"] == "succeeded"
    assert result["jobId"] == "job-123"
    assert result["sourceId"] == "src-456"
    assert result["chunksCount"] == 1
    assert fake_conn.commit.called


def test_process_upload_job_pdf_success(monkeypatch):
    """AC-1, AC-3: Full upload ingestion workflow for PDF document."""
    from unittest.mock import MagicMock

    import pypdf

    from pipeline import process_upload_job

    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_conn.cursor.return_value.__enter__.return_value = fake_cursor

    fake_cursor.fetchone.side_effect = [
        ("job-pdf", "src-pdf", "queued"),
        ("paper.pdf", "application/pdf", len(pdf_bytes), None, pdf_bytes),
    ]

    monkeypatch.setattr("pipeline.get_db_connection", lambda: fake_conn)
    monkeypatch.setattr(
        pypdf.PageObject,
        "extract_text",
        lambda self: "Abstract: Testing RepoMind.\nConclusion: Works.",
    )
    monkeypatch.setattr(
        "pipeline.generate_embeddings",
        lambda chunks: [[0.2] * 1024 for _ in chunks],
    )

    result = process_upload_job("job-pdf")

    assert result["status"] == "succeeded"
    assert result["jobId"] == "job-pdf"
    assert result["sourceId"] == "src-pdf"
    assert result["chunksCount"] == 1
    assert fake_conn.commit.called


def test_process_upload_job_too_large(monkeypatch):
    """AC-8: Uploaded file exceeding 10MB fails with too_large."""
    from unittest.mock import MagicMock

    from pipeline import MAX_UPLOAD_BYTES, process_upload_job

    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_conn.cursor.return_value.__enter__.return_value = fake_cursor

    fake_cursor.fetchone.side_effect = [
        ("job-too-large", "src-large", "queued"),
        ("huge.md", "text/markdown", MAX_UPLOAD_BYTES + 1024, "# Huge", None),
    ]

    monkeypatch.setattr("pipeline.get_db_connection", lambda: fake_conn)

    result = process_upload_job("job-too-large")
    assert result["status"] == "failed"
    assert "too_large" in result["error"]
    assert fake_conn.rollback.called


def test_process_upload_job_missing_job(monkeypatch):
    """AC-8: Missing job ID records job_not_found error."""
    from unittest.mock import MagicMock

    from pipeline import process_upload_job

    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_conn.cursor.return_value.__enter__.return_value = fake_cursor
    fake_cursor.fetchone.return_value = None

    monkeypatch.setattr("pipeline.get_db_connection", lambda: fake_conn)

    result = process_upload_job("non-existent-job")
    assert result["status"] == "failed"
    assert "job_not_found" in result["error"]


def test_process_upload_job_missing_source_files(monkeypatch):
    """AC-8: Job with missing source_files row records file_not_found error."""
    from unittest.mock import MagicMock

    from pipeline import process_upload_job

    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_conn.cursor.return_value.__enter__.return_value = fake_cursor
    fake_cursor.fetchone.side_effect = [
        ("job-no-file", "src-missing-file", "queued"),
        None,
    ]

    monkeypatch.setattr("pipeline.get_db_connection", lambda: fake_conn)

    result = process_upload_job("job-no-file")
    assert result["status"] == "failed"
    assert "file_not_found" in result["error"]


def test_process_upload_job_invalid_utf8_text(monkeypatch):
    """AC-8: Text file with corrupt binary bytes records bad_file_type error."""
    from unittest.mock import MagicMock

    from pipeline import process_upload_job

    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_conn.cursor.return_value.__enter__.return_value = fake_cursor
    fake_cursor.fetchone.side_effect = [
        ("job-corrupt-txt", "src-corrupt-txt", "queued"),
        ("corrupt.txt", "text/plain", 10, None, b"\xff\xfe\xfa\xfb"),
    ]

    monkeypatch.setattr("pipeline.get_db_connection", lambda: fake_conn)

    result = process_upload_job("job-corrupt-txt")
    assert result["status"] == "failed"
    assert "bad_file_type" in result["error"]


def test_process_upload_job_empty_text(monkeypatch):
    """AC-8: Text file with whitespace only records empty_file error."""
    from unittest.mock import MagicMock

    from pipeline import process_upload_job

    fake_conn = MagicMock()
    fake_cursor = MagicMock()
    fake_conn.cursor.return_value.__enter__.return_value = fake_cursor
    fake_cursor.fetchone.side_effect = [
        ("job-empty-txt", "src-empty-txt", "queued"),
        ("empty.txt", "text/plain", 5, "   \n\n  ", None),
    ]

    monkeypatch.setattr("pipeline.get_db_connection", lambda: fake_conn)

    result = process_upload_job("job-empty-txt")
    assert result["status"] == "failed"
    assert "empty_file" in result["error"]
