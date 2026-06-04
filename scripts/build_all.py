#!/usr/bin/env python3
"""Build the embedded web UI and both Go binaries."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BIN_DIR = ROOT / "bin"


def run_step(name: str, command: list[str]) -> None:
    print(f"\n==> {name}", flush=True)
    print(" ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    BIN_DIR.mkdir(exist_ok=True)

    steps = [
        ("Build web UI", ["pnpm", "--dir", "web", "build"]),
        ("Sync embedded web assets", ["pnpm", "--dir", "web", "sync:embed"]),
        ("Build popup daemon", ["go", "build", "-o", "bin/popupd", "./cmd/popupd"]),
        ("Build MCP server", ["go", "build", "-o", "bin/popup-mcp", "./cmd/popup-mcp"]),
    ]

    try:
        for name, command in steps:
            run_step(name, command)
    except subprocess.CalledProcessError as error:
        return error.returncode

    print("\nBuild complete:")
    print(f"  {BIN_DIR / 'popupd'}")
    print(f"  {BIN_DIR / 'popup-mcp'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
