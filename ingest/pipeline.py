"""RepoMind ingest worker pipeline."""

import concurrent.futures
import os
import re
import shutil
import tarfile
import tempfile
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv
import psycopg
import requests
import voyageai
from pgvector.psycopg import register_vector

load_dotenv()

MAX_UNPACKED_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_SINGLE_FILE_BYTES = 1024 * 1024  # 1 MB
CHUNK_WINDOW_LINES = 80
CHUNK_OVERLAP_LINES = 10
CHUNK_STEP_LINES = CHUNK_WINDOW_LINES - CHUNK_OVERLAP_LINES  # 70 lines
VOYAGE_MODEL = "voyage-code-3"

MAX_EMBEDDING_TOKENS = 120_000  # voyage-code-3 max tokens per batch
SAFE_EMBEDDING_TOKENS = 110_000  # safe limit with headroom for tokenizer differences

IGNORED_DIRECTORIES = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "vendor",
    ".venv",
    "__pycache__",
    ".next",
    ".turbo",
    "target",
}

IGNORED_EXTENSIONS = {
    # Images
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".svg",
    # Fonts
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    # Media
    ".mp3",
    ".mp4",
    ".mov",
    ".wav",
    ".webm",
    # Archives
    ".zip",
    ".gz",
    ".tar",
    ".7z",
    ".rar",
    # Lockfiles
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "cargo.lock",
    "poetry.lock",
    "uv.lock",
    # Binaries
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".wasm",
    ".bin",
    ".class",
    ".o",
    ".a",
    ".pyc",
}


@dataclass
class CodeChunk:
    path: str
    start_line: int
    end_line: int
    text: str


class IngestError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def parse_and_validate_github_url(raw_url: str) -> tuple[str, str, str]:
    """
    Validate GitHub repository URL and return (owner, repo, canonical_identity).
    Accepts https://github.com/{owner}/{repo} with optional .git or trailing slash.
    Rejects extra subpaths or non-GitHub hosts.
    """
    if not raw_url or not isinstance(raw_url, str):
        raise IngestError("bad_url", "Repository URL is required.")

    cleaned = raw_url.strip()
    parsed = urlparse(cleaned)

    if parsed.scheme not in ("http", "https") or parsed.netloc.lower() not in (
        "github.com",
        "www.github.com",
    ):
        raise IngestError("bad_url", "Only public GitHub repositories are supported.")

    path = parsed.path.strip("/")
    path = path.removesuffix(".git")

    parts = [p for p in path.split("/") if p]
    if len(parts) != 2:
        raise IngestError(
            "bad_url",
            "URL must match https://github.com/{owner}/{repo} without subdirectories.",
        )

    owner, repo = parts[0], parts[1]
    name_pattern = re.compile(r"^[A-Za-z0-9_.-]+$")
    if not name_pattern.match(owner) or not name_pattern.match(repo):
        raise IngestError("bad_url", "Invalid repository owner or name.")

    identity = f"{owner.lower()}/{repo.lower()}"
    return owner, repo, identity


def download_tarball(owner: str, repo: str, destination_path: str) -> None:
    """Download repository archive tarball from GitHub."""
    tarball_url = f"https://codeload.github.com/{owner}/{repo}/tar.gz/HEAD"
    headers = {"User-Agent": "RepoMind"}

    github_token = os.getenv("GITHUB_TOKEN")
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"

    try:
        response = requests.get(tarball_url, headers=headers, stream=True, timeout=60)
    except requests.RequestException as err:
        raise IngestError(
            "fetch_failed", f"Failed to connect to GitHub: {err}"
        ) from err

    if response.status_code == 404:
        raise IngestError("fetch_failed", "Repository not found or private on GitHub.")
    if response.status_code != 200:
        raise IngestError(
            "fetch_failed",
            f"GitHub returned HTTP status {response.status_code} when downloading tarball.",
        )

    try:
        with open(destination_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
    except OSError as err:
        raise IngestError(
            "fetch_failed", f"Failed writing tarball to disk: {err}"
        ) from err


def _is_safe_path(extract_dir: str, member_path: str) -> bool:
    """Check if extracted path would escape the extract directory (directory traversal protection)."""
    abs_extract = os.path.abspath(extract_dir)
    abs_member = os.path.abspath(member_path)
    return abs_member.startswith(abs_extract + os.sep) or abs_member == abs_extract


def unpack_and_verify_size(tarball_path: str, extract_dir: str) -> str:
    """
    Unpack tarball and verify total unpacked size does not exceed 50 MB limit.
    Returns the root directory of the unpacked contents.
    """
    try:
        with tarfile.open(tarball_path, "r:gz") as tar:
            total_size = 0
            for member in tar.getmembers():
                total_size += member.size
                if total_size > MAX_UNPACKED_BYTES:
                    raise IngestError(
                        "too_large",
                        "Repository exceeds 50 MB unpacked size limit.",
                    )
                # Manual path traversal check (replaces filter="data" from Python 3.12+)
                member_path = os.path.join(extract_dir, member.name)
                if not _is_safe_path(extract_dir, member_path):
                    raise IngestError(
                        "fetch_failed", f"Archive contains unsafe path: {member.name}"
                    )
            tar.extractall(path=extract_dir)
    except IngestError:
        raise
    except Exception as err:
        raise IngestError(
            "fetch_failed", f"Failed to extract repository archive: {err}"
        ) from err

    entries = os.listdir(extract_dir)
    if not entries:
        raise IngestError("empty_repo", "Repository archive is empty.")

    # Typically GitHub tarballs extract into a single top directory e.g. 'repo-default-branch'
    first_entry = os.path.join(extract_dir, entries[0])
    if os.path.isdir(first_entry) and len(entries) == 1:
        return first_entry
    return extract_dir


def is_ignored_path(relative_path: str) -> bool:
    """Check whether a path or file extension should be ignored."""
    parts = relative_path.replace("\\", "/").split("/")
    for part in parts:
        if part in IGNORED_DIRECTORIES:
            return True

    file_name = parts[-1].lower()
    if file_name in IGNORED_EXTENSIONS:
        return True

    for ext in IGNORED_EXTENSIONS:
        if ext.startswith(".") and file_name.endswith(ext):
            return True

    return False


def _process_file(full_path: str, root_dir: str) -> tuple[str, list[CodeChunk]] | None:
    """Process a single file: read and chunk. Returns (rel_path, chunks) or None."""
    rel_path = os.path.relpath(full_path, root_dir)

    try:
        stat_info = os.stat(full_path)
        if stat_info.st_size > MAX_SINGLE_FILE_BYTES:
            return None
    except OSError:
        return None

    try:
        with open(full_path, "r", encoding="utf-8", errors="strict") as f:
            content = f.read()
    except (UnicodeDecodeError, OSError):
        return None

    file_chunks = chunk_text(rel_path, content)
    if not file_chunks:
        return None

    return (rel_path, file_chunks)


def chunk_text(file_path: str, content: str) -> list[CodeChunk]:
    """Split file content into line windows (80 lines, 10 line overlap)."""
    lines = content.splitlines(keepends=True)
    total_lines = len(lines)
    if total_lines == 0:
        return []

    chunks: list[CodeChunk] = []
    start_idx = 0

    while start_idx < total_lines:
        end_idx = min(start_idx + CHUNK_WINDOW_LINES, total_lines)
        chunk_lines = lines[start_idx:end_idx]
        chunk_text_content = "".join(chunk_lines).strip()

        if chunk_text_content:
            chunks.append(
                CodeChunk(
                    path=file_path.replace("\\", "/"),
                    start_line=start_idx + 1,
                    end_line=end_idx,
                    text=chunk_text_content,
                )
            )

        if end_idx == total_lines:
            break
        start_idx += CHUNK_STEP_LINES

    return chunks


def collect_repo_chunks(root_dir: str) -> list[CodeChunk]:
    """Traverse unpacked repository and extract chunks from valid UTF-8 source files."""
    all_chunks: list[CodeChunk] = []
    ignore_set = IGNORED_DIRECTORIES

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter directories in place to prevent descending into ignored folders
        dirnames[:] = [d for d in dirnames if d not in ignore_set]

        relevant_files = []
        for filename in filenames:
            full_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(full_path, root_dir)

            # Quick pre-filter using ignored path check
            if is_ignored_path(rel_path):
                continue

            # Size check
            try:
                if os.path.getsize(full_path) > MAX_SINGLE_FILE_BYTES:
                    continue
            except OSError:
                continue

            relevant_files.append(full_path)

        # Process files in parallel
        with concurrent.futures.ThreadPoolExecutor() as executor:
            results = executor.map(
                lambda fp: _process_file(fp, root_dir), relevant_files
            )

        for result in results:
            if result is not None:
                rel_path, file_chunks = result
                all_chunks.extend(file_chunks)

    return all_chunks


def _token_counts(client: voyageai.Client, texts: list[str]) -> list[int]:
    """Exact token counts via the model tokenizer (local, no API call)."""
    try:
        tokenized = client.tokenize(texts, model=VOYAGE_MODEL)
        return [len(t) for t in tokenized]
    except Exception:  # noqa: BLE001
        # Fallback: conservative upper estimate (~2 chars/token for code).
        return [max(1, len(t) // 2) for t in texts]


def _split_into_token_aware_batches(
    texts: list[str],
    token_counts: list[int],
    max_tokens: int = SAFE_EMBEDDING_TOKENS,
) -> list[list[str]]:
    """Split texts into batches respecting the max tokens per batch limit."""
    if len(texts) != len(token_counts):
        raise ValueError("token_counts must align one-to-one with texts")

    batches: list[list[str]] = []
    current_batch: list[str] = []
    current_tokens = 0

    for text, count in zip(texts, token_counts):
        if count > max_tokens:
            # Single text exceeds limit - flush pending batch, then emit alone
            # (it will likely fail at the API on its own).
            if current_batch:
                batches.append(current_batch)
                current_batch = []
                current_tokens = 0
            batches.append([text])
            continue

        if current_batch and current_tokens + count > max_tokens:
            batches.append(current_batch)
            current_batch = [text]
            current_tokens = count
        else:
            current_batch.append(text)
            current_tokens += count

    if current_batch:
        batches.append(current_batch)

    return batches


def generate_embeddings(
    chunks: list[CodeChunk], api_key: str | None = None
) -> list[list[float]]:
    """Generate 1024-dimension embeddings for chunks using Voyage AI voyage-code-3."""
    key = api_key or os.getenv("VOYAGE_API_KEY")
    if not key:
        raise IngestError(
            "embed_failed", "VOYAGE_API_KEY environment variable is not set."
        )

    client = voyageai.Client(api_key=key)
    all_embeddings: list[list[float]] = []

    texts = [c.text for c in chunks]

    # Count tokens exactly, then pack batches under the safe 110k cap (120k is
    # the hard API limit; the headroom absorbs tokenizer/truncation differences).
    token_counts = _token_counts(client, texts)
    batches = _split_into_token_aware_batches(
        texts, token_counts, SAFE_EMBEDDING_TOKENS
    )

    for batch in batches:
        try:
            result = client.embed(
                batch,
                model=VOYAGE_MODEL,
                input_type="document",
                output_dimension=1024,
            )
            all_embeddings.extend(result.embeddings)
        except Exception as err:
            raise IngestError(
                "embed_failed", f"Voyage AI embedding generation failed: {err}"
            ) from err

    return all_embeddings


def get_db_connection():
    """Get direct Postgres connection with pgvector registered."""
    db_url = os.getenv("DATABASE_URL_DIRECT") or os.getenv("DATABASE_URL")
    if not db_url:
        raise IngestError(
            "database_error",
            "DATABASE_URL_DIRECT or DATABASE_URL is not configured.",
        )
    conn = psycopg.connect(db_url)
    register_vector(conn)
    return conn


def process_ingest_job(job_id: str) -> dict[str, Any]:
    """Execute complete ingest pipeline for a job ID."""
    conn = get_db_connection()
    temp_dir = tempfile.mkdtemp(prefix="repomind_ingest_")

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, repo_url, status FROM ingest_jobs WHERE id = %s",
                (job_id,),
            )
            row = cur.fetchone()
            if not row:
                raise IngestError(
                    "job_not_found", f"Job ID {job_id} not found in database."
                )

            _, repo_url, _ = row

            # Mark job running
            cur.execute(
                """
                UPDATE ingest_jobs
                SET status = 'running', started_at = NOW(), error = NULL
                WHERE id = %s
                """,
                (job_id,),
            )
            conn.commit()

        # Step 1: Validate URL
        owner, repo, identity = parse_and_validate_github_url(repo_url)
        origin_url = f"https://github.com/{owner}/{repo}"

        # Step 2: Download tarball
        tarball_path = os.path.join(temp_dir, "repo.tar.gz")
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)

        download_tarball(owner, repo, tarball_path)

        # Step 3: Unpack and check size
        root_content_dir = unpack_and_verify_size(tarball_path, extract_dir)

        # Step 4: Collect chunks
        chunks = collect_repo_chunks(root_content_dir)
        if not chunks:
            raise IngestError(
                "empty_repo",
                "No indexable source code files found in repository.",
            )

        # Step 5: Embed chunks
        embeddings = generate_embeddings(chunks)

        # Step 6: Write to Postgres
        with conn.cursor() as cur:
            # Upsert source
            cur.execute(
                """
                INSERT INTO sources (id, kind, identity, origin_url, created_at, updated_at)
                VALUES (gen_random_uuid(), 'github_repo', %s, %s, NOW(), NOW())
                ON CONFLICT (kind, identity) DO UPDATE
                SET updated_at = NOW(), origin_url = %s
                RETURNING id
                """,
                (identity, origin_url, origin_url),
            )
            source_row = cur.fetchone()
            source_id = source_row[0]

            # Link source to job
            cur.execute(
                "UPDATE ingest_jobs SET source_id = %s WHERE id = %s",
                (source_id, job_id),
            )

            # Ensure chat session exists for source
            cur.execute(
                """
                INSERT INTO chats (id, source_id, created_at, updated_at)
                VALUES (gen_random_uuid(), %s, NOW(), NOW())
                ON CONFLICT (source_id) DO NOTHING
                """,
                (source_id,),
            )

            # Delete old chunks for this source
            cur.execute("DELETE FROM chunks WHERE source_id = %s", (source_id,))

            # Batch insert new chunks
            chunk_records = []
            for chunk, emb in zip(chunks, embeddings):
                chunk_records.append(
                    (
                        source_id,
                        job_id,
                        chunk.path,
                        chunk.start_line,
                        chunk.end_line,
                        chunk.text,
                        emb,
                    )
                )

            cur.executemany(
                """
                INSERT INTO chunks (id, source_id, job_id, path, start_line, end_line, text, embedding)
                VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s)
                """,
                chunk_records,
            )

            # Mark job succeeded
            cur.execute(
                """
                UPDATE ingest_jobs
                SET status = 'succeeded', finished_at = NOW(), error = NULL
                WHERE id = %s
                """,
                (job_id,),
            )
            conn.commit()

        return {
            "status": "succeeded",
            "jobId": job_id,
            "sourceId": str(source_id),
            "chunksCount": len(chunks),
        }

    except IngestError as err:
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ingest_jobs
                SET status = 'failed', finished_at = NOW(), error = %s
                WHERE id = %s
                """,
                (f"{err.code}: {err.message}", job_id),
            )
            # Remove any chunks inserted by this job
            cur.execute("DELETE FROM chunks WHERE job_id = %s", (job_id,))
            conn.commit()
        return {"status": "failed", "jobId": job_id, "error": str(err)}

    except Exception as err:  # noqa: BLE001
        conn.rollback()
        safe_msg = f"internal_error: Unexpected error during ingestion: {err}"
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ingest_jobs
                SET status = 'failed', finished_at = NOW(), error = %s
                WHERE id = %s
                """,
                (safe_msg, job_id),
            )
            cur.execute("DELETE FROM chunks WHERE job_id = %s", (job_id,))
            conn.commit()
        return {"status": "failed", "jobId": job_id, "error": safe_msg}

    finally:
        conn.close()
        shutil.rmtree(temp_dir, ignore_errors=True)
