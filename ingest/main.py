"""RepoMind ingest worker entrypoint."""

import sys

from pipeline import process_ingest_job


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python main.py <job_id>")
        sys.exit(1)

    job_id = sys.argv[1]
    print(f"Starting ingest pipeline for job {job_id}...")
    result = process_ingest_job(job_id)
    print(f"Pipeline finished: {result}")

    if result.get("status") != "succeeded":
        sys.exit(1)


if __name__ == "__main__":
    main()
