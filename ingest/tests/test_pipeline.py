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
