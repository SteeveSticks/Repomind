"""Tests for the ingest entry point."""

import sys
from unittest.mock import patch

import pytest

from main import main


def test_main_without_arguments(capsys):
    with patch.object(sys, "argv", ["main.py"]), pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code == 1
    captured = capsys.readouterr()
    assert "Usage: python main.py <job_id>" in captured.out


def test_main_with_job_id_success(capsys):
    with (
        patch.object(sys, "argv", ["main.py", "mock-job-id"]),
        patch("main.process_ingest_job") as mock_process,
    ):
        mock_process.return_value = {"status": "succeeded", "jobId": "mock-job-id"}
        main()
    captured = capsys.readouterr()
    assert "Starting ingest pipeline for job mock-job-id" in captured.out
    assert "Pipeline finished" in captured.out
