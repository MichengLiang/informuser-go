#!/usr/bin/env python3
"""Manual black-box client for the Go AskUser MCP server.

Run from the repository root:

    uv run python scripts/askuser_blackbox.py

Start `go run ./cmd/popupd` first and open http://127.0.0.1:8765. This script
starts the stdio MCP server, calls `AskUser`, then prints the reply you submit
in the browser workbench.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import shlex
import sys
from pathlib import Path
from typing import Any

try:
    from fastmcp import Client
    from fastmcp.client.transports import StdioTransport
except ModuleNotFoundError as exc:
    raise SystemExit(
        "fastmcp is required. Run with `uv run --with fastmcp python "
        "scripts/askuser_blackbox.py`, or add fastmcp to the active uv env."
    ) from exc


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ABSTRACT = "Black-box AskUser MCP test"
DEFAULT_CONTENT = """# Black-box AskUser MCP test

This message was sent by `scripts/askuser_blackbox.py`.

- Server under test: Go stdio MCP server at `cmd/popup-mcp`
- Tool under test: `AskUser`
- Expected behavior: this message appears in the browser workbench, and the
  Python client prints your reply after you submit it.

Reply with any short text to complete the test.
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Call the Go AskUser MCP server through stdio for manual black-box testing.",
    )
    parser.add_argument(
        "--abstract",
        default=DEFAULT_ABSTRACT,
        help="Short task title shown in the popup UI.",
    )
    parser.add_argument(
        "--content",
        default=DEFAULT_CONTENT,
        help="Markdown body sent to AskUser.",
    )
    parser.add_argument(
        "--content-file",
        type=Path,
        help="Read Markdown body from this file instead of --content.",
    )
    parser.add_argument(
        "--daemon-url",
        default=os.environ.get("ASKUSER_DAEMON_URL", "http://127.0.0.1:8765"),
        help="Daemon URL passed to popup-mcp as ASKUSER_DAEMON_URL.",
    )
    parser.add_argument(
        "--mcp-command",
        default="go run ./cmd/popup-mcp",
        help="Command used to start the stdio MCP server.",
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=PROJECT_ROOT,
        help="Working directory for the MCP server command.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=None,
        help="Optional tool-call timeout in seconds. Omit it for normal human-in-the-loop waiting.",
    )
    parser.add_argument(
        "--list-tools",
        action="store_true",
        help="List available tools before calling AskUser.",
    )
    return parser.parse_args()


def read_content(args: argparse.Namespace) -> str:
    if args.content_file is None:
        return args.content
    return args.content_file.read_text(encoding="utf-8")


def result_text(result: Any) -> str:
    text_blocks: list[str] = []
    for block in getattr(result, "content", []):
        text = getattr(block, "text", None)
        if text is not None:
            text_blocks.append(text)
    if text_blocks:
        return "\n".join(text_blocks)

    data = getattr(result, "data", None)
    if data is not None:
        return str(data)

    return str(result)


async def call_askuser(args: argparse.Namespace) -> int:
    command_parts = shlex.split(args.mcp_command)
    if not command_parts:
        raise ValueError("--mcp-command must not be empty")

    env = {**os.environ, "ASKUSER_DAEMON_URL": args.daemon_url}
    transport = StdioTransport(
        command=command_parts[0],
        args=command_parts[1:],
        env=env,
        cwd=str(args.project_root.resolve()),
        keep_alive=False,
    )
    client = Client(transport=transport, timeout=args.timeout)

    payload = {
        "abstract": args.abstract,
        "content": read_content(args),
    }

    print(f"Starting MCP server: {args.mcp_command}", flush=True)
    print(f"Project root: {args.project_root.resolve()}", flush=True)
    print(f"Daemon URL: {args.daemon_url}", flush=True)
    print("Calling AskUser. Submit a reply in the browser workbench to finish.", flush=True)

    async with client:
        if args.list_tools:
            tools = await client.list_tools()
            print("Available tools:", ", ".join(tool.name for tool in tools), flush=True)

        result = await client.call_tool("AskUser", payload, timeout=args.timeout)

    print("\nAskUser reply:")
    print(result_text(result))
    return 0


def main() -> int:
    args = parse_args()
    try:
        return asyncio.run(call_askuser(args))
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"\nAskUser black-box call failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
