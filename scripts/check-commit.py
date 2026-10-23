"""pre-commit commit-msg hook, independent of shell quoting rules."""

import re
import sys
from pathlib import Path

message = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()[0]
if not re.fullmatch(
    r"(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-z0-9._/-]+\))?!?: .{1,72}",
    message,
):
    sys.exit("Use a short Conventional Commit: feat: add source validation")
