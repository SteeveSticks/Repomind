"""Tests for the cited chat data model declared in db/schema.ts."""

from __future__ import annotations

import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "db" / "schema.ts"
CONTAINER = "repomind-postgres-1"
ZERO_VECTOR = "[" + ",".join("0" for _ in range(1024)) + "]"
PUBLIC_TABLES = (
    "ask_rate_limits",
    "chats",
    "chunks",
    "citations",
    "ingest_jobs",
    "messages",
    "sources",
)
LATER_SLICE_TABLES = (
    "users",
    "usage_events",
    "share_links",
    "file_blobs",
    "blobs",
)


class PsqlError(Exception):
    def __init__(self, stderr: str, returncode: int) -> None:
        super().__init__(stderr)
        self.stderr = stderr
        self.returncode = returncode


def run_sql(sql: str) -> str:
    result = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            CONTAINER,
            "psql",
            "-U",
            "repomind",
            "-d",
            "repomind",
            "-v",
            "ON_ERROR_STOP=1",
            "-q",
            "-t",
            "-A",
        ],
        input=sql,
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        check=False,
    )
    if result.returncode != 0:
        raise PsqlError(result.stderr, result.returncode)
    lines = [
        line
        for line in result.stdout.splitlines()
        if line and not line.startswith(("INSERT", "DELETE", "UPDATE", "SELECT"))
    ]
    return "\n".join(lines)


@pytest.fixture(scope="session", autouse=True)
def postgres_is_up() -> None:
    try:
        one = run_sql("SELECT 1")
    except (PsqlError, OSError) as exc:
        pytest.fail(f"Compose Postgres is not reachable as {CONTAINER}: {exc}")
    assert one == "1"


@pytest.fixture(scope="session", autouse=True)
def wipe_leftover_test_rows(postgres_is_up: None) -> None:
    run_sql("DELETE FROM sources WHERE identity LIKE 'test-schema/%'")
    run_sql("DELETE FROM ingest_jobs WHERE repo_url LIKE 'https://example.test/%'")
    run_sql("DELETE FROM ask_rate_limits WHERE ip LIKE 'test-schema-%'")


@pytest.fixture
def stamp() -> str:
    return uuid4().hex


@pytest.fixture
def track() -> dict[str, list[str]]:
    rows: dict[str, list[str]] = {"sources": [], "jobs": [], "ips": []}
    yield rows
    for ip in rows["ips"]:
        try:
            run_sql(f"DELETE FROM ask_rate_limits WHERE ip = '{ip}'")
        except PsqlError:
            pass
    for source_id in rows["sources"]:
        try:
            run_sql(f"DELETE FROM sources WHERE id = '{source_id}'")
        except PsqlError:
            pass
    for job_id in rows["jobs"]:
        try:
            run_sql(f"DELETE FROM ingest_jobs WHERE id = '{job_id}'")
        except PsqlError:
            pass


def insert_source(track: dict[str, list[str]], stamp: str, owner_sql: str = "NULL") -> str:
    source_id = run_sql(
        "INSERT INTO sources (kind, identity, origin_url, owner_user_id) "
        f"VALUES ('github_repo', 'test-schema/{stamp}', "
        f"'https://github.com/test-schema/{stamp}', {owner_sql}) "
        "RETURNING id"
    )
    track["sources"].append(source_id)
    return source_id


def insert_job(
    track: dict[str, list[str]],
    stamp: str,
    status: str,
    source_id: str | None = None,
) -> str:
    source_sql = "NULL" if source_id is None else f"'{source_id}'"
    job_id = run_sql(
        "INSERT INTO ingest_jobs (repo_url, status, source_id) "
        f"VALUES ('https://example.test/{stamp}', '{status}', {source_sql}) "
        "RETURNING id"
    )
    track["jobs"].append(job_id)
    return job_id


def insert_chunk(source_id: str, job_id: str, path: str = "src/app.ts") -> str:
    return run_sql(
        "INSERT INTO chunks (source_id, job_id, path, start_line, end_line, text, embedding) "
        f"VALUES ('{source_id}', '{job_id}', '{path}', 1, 80, 'const x = 1', "
        f"'{ZERO_VECTOR}'::vector) RETURNING id"
    )


def schema_text() -> str:
    return SCHEMA_PATH.read_text(encoding="utf-8")


def test_schema_ts_declares_the_seven_sql_tables() -> None:
    """names the seven public tables in SQL strings."""
    # covers: AC-1
    text = schema_text()
    for name in PUBLIC_TABLES:
        assert f'"{name}"' in text


def test_schema_ts_omits_later_slice_tables() -> None:
    """does not declare users, usage, share, or blob tables."""
    # covers: AC-6
    text = schema_text()
    for name in LATER_SLICE_TABLES:
        assert f'"{name}"' not in text
        assert f"pgTable(\"{name}\"" not in text


def test_public_schema_has_only_the_seven_tables() -> None:
    """after migrate, public tables are only the cited chat set."""
    # covers: AC-6
    names = run_sql(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    ).splitlines()
    assert names == sorted(PUBLIC_TABLES)
    leftover = run_sql(
        "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' "
        "AND tablename IN ('users', 'usage_events', 'share_links', 'file_blobs', 'blobs')"
    )
    assert leftover == "0"


def test_chunk_embedding_is_vector_1024() -> None:
    """stores embeddings as vector(1024) NOT NULL."""
    # covers: AC-1
    typ = run_sql(
        "SELECT format_type(a.atttypid, a.atttypmod) "
        "FROM pg_attribute a "
        "JOIN pg_class c ON a.attrelid = c.oid "
        "JOIN pg_namespace n ON c.relnamespace = n.oid "
        "WHERE n.nspname = 'public' AND c.relname = 'chunks' "
        "AND a.attname = 'embedding' AND NOT a.attisdropped"
    )
    not_null = run_sql(
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = 'chunks' "
        "AND column_name = 'embedding'"
    )
    assert typ == "vector(1024)"
    assert not_null == "NO"


def test_chunks_have_hnsw_cosine_and_source_indexes() -> None:
    """indexes embeddings with HNSW cosine and sources with btree."""
    # covers: AC-1
    hnsw = run_sql(
        "SELECT indexdef FROM pg_indexes "
        "WHERE schemaname = 'public' AND indexname = 'chunks_embedding_hnsw'"
    )
    btree = run_sql(
        "SELECT indexdef FROM pg_indexes "
        "WHERE schemaname = 'public' AND indexname = 'chunks_source_id_idx'"
    )
    assert "hnsw" in hnsw.lower()
    assert "vector_cosine_ops" in hnsw
    assert "btree" in btree.lower()
    assert "source_id" in btree


def test_citations_store_path_and_line_without_chunk_id() -> None:
    """citations remember path and line, not a live chunk id."""
    # covers: AC-1
    columns = run_sql(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = 'citations' "
        "ORDER BY ordinal_position"
    ).splitlines()
    assert columns == ["id", "message_id", "path", "start_line", "end_line"]


def test_persists_the_cited_chat_tree(track: dict[str, list[str]], stamp: str) -> None:
    """persists a source, job, chunk, chat, messages, citations, and a rate row, then joins them."""
    # covers: AC-1
    source_id = insert_source(track, stamp)
    job_id = insert_job(track, stamp, "succeeded", source_id)
    insert_chunk(source_id, job_id)
    chat_id = run_sql(
        f"INSERT INTO chats (source_id) VALUES ('{source_id}') RETURNING id"
    )
    user_id = run_sql(
        "INSERT INTO messages (chat_id, role, content) "
        f"VALUES ('{chat_id}', 'user', 'where is the handler') RETURNING id"
    )
    assistant_id = run_sql(
        "INSERT INTO messages (chat_id, role, content) "
        f"VALUES ('{chat_id}', 'assistant', 'in src/app.ts') RETURNING id"
    )
    run_sql(
        "INSERT INTO citations (message_id, path, start_line, end_line) "
        f"VALUES ('{assistant_id}', 'src/app.ts', 1, 80)"
    )
    ip = f"test-schema-{stamp}"
    track["ips"].append(ip)
    run_sql(
        "INSERT INTO ask_rate_limits (ip, window_start, count) "
        f"VALUES ('{ip}', timestamptz '2026-08-15 14:00:00+00', 1)"
    )

    joined = run_sql(
        "SELECT COUNT(*) FROM sources s "
        "JOIN ingest_jobs j ON j.source_id = s.id "
        "JOIN chunks k ON k.source_id = s.id AND k.job_id = j.id "
        "JOIN chats c ON c.source_id = s.id "
        "JOIN messages um ON um.chat_id = c.id AND um.role = 'user' "
        "JOIN messages am ON am.chat_id = c.id AND am.role = 'assistant' "
        "JOIN citations ci ON ci.message_id = am.id "
        f"WHERE s.id = '{source_id}'"
    )
    rates = run_sql(f"SELECT count FROM ask_rate_limits WHERE ip = '{ip}'")
    assert joined == "1"
    assert rates == "1"
    assert user_id != assistant_id


def test_source_is_ready_only_after_a_succeeded_job(
    track: dict[str, list[str]], stamp: str
) -> None:
    """a source is ready to ask only once a job has succeeded."""
    # covers: AC-1
    source_id = insert_source(track, stamp)
    insert_job(track, stamp + "a", "failed", source_id)
    ready_after_fail = run_sql(
        "SELECT EXISTS (SELECT 1 FROM ingest_jobs "
        f"WHERE source_id = '{source_id}' AND status = 'succeeded')"
    )
    insert_job(track, stamp + "b", "succeeded", source_id)
    ready_after_success = run_sql(
        "SELECT EXISTS (SELECT 1 FROM ingest_jobs "
        f"WHERE source_id = '{source_id}' AND status = 'succeeded')"
    )
    insert_job(track, stamp + "c", "failed", source_id)
    ready_after_later_fail = run_sql(
        "SELECT EXISTS (SELECT 1 FROM ingest_jobs "
        f"WHERE source_id = '{source_id}' AND status = 'succeeded')"
    )
    assert ready_after_fail == "f"
    assert ready_after_success == "t"
    assert ready_after_later_fail == "t"


def test_kind_accepts_github_repo(track: dict[str, list[str]], stamp: str) -> None:
    """kind accepts github_repo."""
    # covers: AC-2
    source_id = insert_source(track, stamp)
    kind = run_sql(f"SELECT kind FROM sources WHERE id = '{source_id}'")
    assert kind == "github_repo"


def test_kind_rejects_an_unknown_value(track: dict[str, list[str]], stamp: str) -> None:
    """kind rejects a value outside the check list."""
    # covers: AC-2
    with pytest.raises(PsqlError, match="sources_kind_check"):
        run_sql(
            "INSERT INTO sources (kind, identity, origin_url) "
            f"VALUES ('upload', 'test-schema/{stamp}', "
            f"'https://github.com/test-schema/{stamp}')"
        )


def test_owner_user_id_may_be_null(track: dict[str, list[str]], stamp: str) -> None:
    """owner_user_id may be null."""
    # covers: AC-2
    source_id = insert_source(track, stamp, owner_sql="NULL")
    owner = run_sql(f"SELECT owner_user_id FROM sources WHERE id = '{source_id}'")
    assert owner == ""


def test_owner_user_id_accepts_a_uuid_without_a_foreign_key(
    track: dict[str, list[str]], stamp: str
) -> None:
    """owner_user_id stores a random uuid because there is no foreign key."""
    # covers: AC-2
    owner = str(uuid4())
    source_id = insert_source(track, stamp, owner_sql=f"'{owner}'")
    stored = run_sql(f"SELECT owner_user_id FROM sources WHERE id = '{source_id}'")
    fk_count = run_sql(
        "SELECT COUNT(*) FROM information_schema.table_constraints tc "
        "JOIN information_schema.key_column_usage kcu "
        "ON tc.constraint_name = kcu.constraint_name "
        "AND tc.table_schema = kcu.table_schema "
        "WHERE tc.table_schema = 'public' AND tc.table_name = 'sources' "
        "AND tc.constraint_type = 'FOREIGN KEY' "
        "AND kcu.column_name = 'owner_user_id'"
    )
    assert stored == owner
    assert fk_count == "0"


def test_deleting_chunks_by_job_id_leaves_the_other_job(
    track: dict[str, list[str]], stamp: str
) -> None:
    """a failed job can delete only its own chunks."""
    # covers: AC-3
    source_id = insert_source(track, stamp)
    keep_job = insert_job(track, stamp + "keep", "succeeded", source_id)
    drop_job = insert_job(track, stamp + "drop", "failed", source_id)
    keep_chunk = insert_chunk(source_id, keep_job, "src/keep.ts")
    drop_chunk = insert_chunk(source_id, drop_job, "src/drop.ts")
    run_sql(f"DELETE FROM chunks WHERE job_id = '{drop_job}'")
    remaining = run_sql(
        f"SELECT id FROM chunks WHERE source_id = '{source_id}' ORDER BY path"
    ).splitlines()
    assert remaining == [keep_chunk]
    assert drop_chunk not in remaining


def test_replacing_chunks_on_success_leaves_the_chat(
    track: dict[str, list[str]], stamp: str
) -> None:
    """a later success replaces other jobs' chunks and leaves the chat."""
    # covers: AC-3
    source_id = insert_source(track, stamp)
    old_job = insert_job(track, stamp + "old", "succeeded", source_id)
    new_job = insert_job(track, stamp + "new", "succeeded", source_id)
    insert_chunk(source_id, old_job, "src/old.ts")
    new_chunk = insert_chunk(source_id, new_job, "src/new.ts")
    chat_id = run_sql(
        f"INSERT INTO chats (source_id) VALUES ('{source_id}') RETURNING id"
    )
    run_sql(
        f"DELETE FROM chunks WHERE source_id = '{source_id}' AND job_id <> '{new_job}'"
    )
    leftover = run_sql(
        f"SELECT id FROM chunks WHERE source_id = '{source_id}'"
    ).splitlines()
    chat_still = run_sql(f"SELECT id FROM chats WHERE source_id = '{source_id}'")
    assert leftover == [new_chunk]
    assert chat_still == chat_id


def test_kind_and_identity_are_unique(track: dict[str, list[str]], stamp: str) -> None:
    """UNIQUE (kind, identity) allows many sources but not a duplicate pair."""
    # covers: AC-4
    insert_source(track, stamp)
    other = insert_source(track, stamp + "other")
    assert other
    with pytest.raises(PsqlError, match="sources_kind_identity_key"):
        run_sql(
            "INSERT INTO sources (kind, identity, origin_url) "
            f"VALUES ('github_repo', 'test-schema/{stamp}', "
            f"'https://github.com/test-schema/{stamp}')"
        )


def test_upsert_on_source_id_leaves_one_chat(
    track: dict[str, list[str]], stamp: str
) -> None:
    """two upserts on the same source_id leave one chats row."""
    # covers: AC-4
    source_id = insert_source(track, stamp)
    run_sql(
        f"INSERT INTO chats (source_id) VALUES ('{source_id}') "
        "ON CONFLICT (source_id) DO NOTHING"
    )
    run_sql(
        f"INSERT INTO chats (source_id) VALUES ('{source_id}') "
        "ON CONFLICT (source_id) DO NOTHING"
    )
    count = run_sql(f"SELECT COUNT(*) FROM chats WHERE source_id = '{source_id}'")
    assert count == "1"


def test_rate_limit_inserts_one_then_increments(
    track: dict[str, list[str]], stamp: str
) -> None:
    """first insert writes count 1; a conflict increment leaves count 2."""
    # covers: AC-5
    ip = f"test-schema-{stamp}"
    track["ips"].append(ip)
    first = run_sql(
        "INSERT INTO ask_rate_limits (ip, window_start, count) "
        f"VALUES ('{ip}', timestamptz '2026-08-15 14:00:00+00', 1) "
        "RETURNING count"
    )
    second = run_sql(
        "INSERT INTO ask_rate_limits (ip, window_start, count) "
        f"VALUES ('{ip}', timestamptz '2026-08-15 14:00:00+00', 1) "
        "ON CONFLICT (ip, window_start) DO UPDATE "
        "SET count = ask_rate_limits.count + 1 "
        "RETURNING count"
    )
    assert first == "1"
    assert second == "2"


def test_rejects_a_second_queued_job(track: dict[str, list[str]], stamp: str) -> None:
    """at most one ingest_jobs row may be queued or running."""
    # covers: AC-7
    foreign = run_sql(
        "SELECT COUNT(*) FROM ingest_jobs "
        "WHERE status IN ('queued', 'running') "
        "AND repo_url NOT LIKE 'https://example.test/%'"
    )
    if foreign != "0":
        pytest.fail(
            "an active ingest job already exists; the one active index is global"
        )
    insert_job(track, stamp + "one", "queued")
    with pytest.raises(PsqlError, match="ingest_jobs_one_active"):
        insert_job(track, stamp + "two", "queued")


def test_a_finished_job_does_not_block_a_new_queued_job(
    track: dict[str, list[str]], stamp: str
) -> None:
    """a succeeded job does not use the one active slot."""
    # covers: AC-7
    source_id = insert_source(track, stamp)
    insert_job(track, stamp + "done", "succeeded", source_id)
    queued = insert_job(track, stamp + "next", "queued", source_id)
    status = run_sql(f"SELECT status FROM ingest_jobs WHERE id = '{queued}'")
    assert status == "queued"


def test_status_rejects_an_unknown_value(track: dict[str, list[str]], stamp: str) -> None:
    """status rejects a value outside queued, running, succeeded, failed."""
    # covers: AC-1
    with pytest.raises(PsqlError, match="ingest_jobs_status_check"):
        run_sql(
            "INSERT INTO ingest_jobs (repo_url, status) "
            f"VALUES ('https://example.test/{stamp}', 'pending')"
        )


def test_role_rejects_an_unknown_value(track: dict[str, list[str]], stamp: str) -> None:
    """role rejects a value outside user and assistant."""
    # covers: AC-1
    source_id = insert_source(track, stamp)
    chat_id = run_sql(
        f"INSERT INTO chats (source_id) VALUES ('{source_id}') RETURNING id"
    )
    with pytest.raises(PsqlError, match="messages_role_check"):
        run_sql(
            "INSERT INTO messages (chat_id, role, content) "
            f"VALUES ('{chat_id}', 'system', 'nope')"
        )


def test_deleting_a_source_cascades_the_tree(
    track: dict[str, list[str]], stamp: str
) -> None:
    """deleting a source removes its jobs, chunks, chat, messages, and citations."""
    # covers: AC-1
    source_id = insert_source(track, stamp)
    job_id = insert_job(track, stamp, "succeeded", source_id)
    chunk_id = insert_chunk(source_id, job_id)
    chat_id = run_sql(
        f"INSERT INTO chats (source_id) VALUES ('{source_id}') RETURNING id"
    )
    message_id = run_sql(
        "INSERT INTO messages (chat_id, role, content) "
        f"VALUES ('{chat_id}', 'user', 'hello') RETURNING id"
    )
    citation_id = run_sql(
        "INSERT INTO citations (message_id, path, start_line, end_line) "
        f"VALUES ('{message_id}', 'src/app.ts', 1, 10) RETURNING id"
    )
    run_sql(f"DELETE FROM sources WHERE id = '{source_id}'")
    track["sources"].remove(source_id)
    leftover = run_sql(
        "SELECT "
        f"(SELECT COUNT(*) FROM ingest_jobs WHERE id = '{job_id}') + "
        f"(SELECT COUNT(*) FROM chunks WHERE id = '{chunk_id}') + "
        f"(SELECT COUNT(*) FROM chats WHERE id = '{chat_id}') + "
        f"(SELECT COUNT(*) FROM messages WHERE id = '{message_id}') + "
        f"(SELECT COUNT(*) FROM citations WHERE id = '{citation_id}')"
    )
    assert leftover == "0"
