"""Action log endpoint — receives batches of frontend action log entries and appends to JSONL file."""

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter()
logger = logging.getLogger(__name__)

LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_FILE = LOG_DIR / "action-log.jsonl"


@router.post("/action-log")
async def append_action_log(entries: list[dict[str, Any]]) -> dict[str, int]:
    """Append a batch of log entries to the JSONL file."""
    if not entries:
        return {"written": 0}
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as e:
        logger.error("Failed to write action log: %s", e)
        raise HTTPException(status_code=500, detail="Failed to write log")
    return {"written": len(entries)}
