# AskUser Popup

[![CI](https://github.com/MichengLiang/informuser-go/actions/workflows/ci.yml/badge.svg)](https://github.com/MichengLiang/informuser-go/actions/workflows/ci.yml)
[![Release](https://github.com/MichengLiang/informuser-go/actions/workflows/release.yml/badge.svg)](https://github.com/MichengLiang/informuser-go/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/MichengLiang/informuser-go)](LICENSE)
[![Go Reference](https://pkg.go.dev/badge/github.com/MichengLiang/informuser-go.svg)](https://pkg.go.dev/github.com/MichengLiang/informuser-go)

AskUser Popup is a local human-in-the-loop MCP tool. Code agents call the
`AskUser` tool, the question appears in a browser workbench, and the tool call
returns after the user replies.

It is built for local agent workflows where a model occasionally needs a real
human decision, approval, or pasted answer without leaving the terminal session
blocked forever.

## Features

- Stdio MCP server exposing one `AskUser` tool.
- Local Go daemon with SQLite persistence.
- Browser workbench served by the daemon.
- Pending, history, and archived task views grouped by client/session.
- Markdown reader with rendered/raw modes.
- Quick paste replies and a full reply drafting panel.
- Optional browser notifications and sound cue.
- LAN-ready startup URLs printed by the daemon.
- Embedded web assets, so release binaries do not need a separate web server.

## Architecture

AskUser Popup has two binaries:

- `popupd`: HTTP daemon that stores tasks, serves the web UI, and accepts replies.
- `popup-mcp`: stdio MCP server that registers questions with `popupd` and polls until the user replies.

The browser UI is a React/Vite app embedded into the Go daemon under
`internal/webui/dist`.

## Install From Source

Requirements:

- Go 1.26.3 or newer compatible toolchain.
- Node.js 24 LTS.
- pnpm 10.

Install the binaries with Go:

```bash
go install github.com/MichengLiang/informuser-go/cmd/popupd@latest
go install github.com/MichengLiang/informuser-go/cmd/popup-mcp@latest
```

Release archives are also attached to tagged GitHub Releases.

Build the embedded web UI and both Go binaries:

```bash
pnpm --dir web install
./scripts/build_all.py
```

The binaries are written to:

```text
bin/popupd
bin/popup-mcp
```

## Run The Daemon

Start the local daemon:

```bash
go run ./cmd/popupd
```

The startup log prints clickable browser URLs:

```text
local_url=http://127.0.0.1:8765/
lan_urls="[http://<your-lan-ip>:8765/]"
```

Open the local URL on the same machine, or a LAN URL from another device on the
same network.

Configuration:

```bash
ASKUSER_ADDR=0.0.0.0:8765
ASKUSER_DB=askuser-popup.db
```

Set `ASKUSER_ADDR=127.0.0.1:8765` if you want loopback-only access.

## Configure MCP

Build a binary for MCP client configuration:

```bash
go build -o popup-mcp ./cmd/popup-mcp
```

Example MCP configuration:

```json
{
  "servers": {
    "popup": {
      "command": "/absolute/path/to/popup-mcp"
    }
  }
}
```

The MCP server connects to `http://127.0.0.1:8765` by default. Override it with:

```bash
ASKUSER_DAEMON_URL=http://127.0.0.1:8765
```

## Development

Manual build steps:

```bash
pnpm --dir web install
pnpm --dir web build
pnpm --dir web sync:embed
go build -o bin/popupd ./cmd/popupd
go build -o bin/popup-mcp ./cmd/popup-mcp
```

Run the verification suite:

```bash
go test ./...
./scripts/check_go_coverage.sh
pnpm --dir web check
pnpm --dir web lint
pnpm --dir web test:coverage
pnpm --dir web build
pnpm --dir web sync:embed
pnpm --dir web test:e2e
```

## Release

Pushing a semantic version tag such as `v0.1.0` runs the release workflow. The
workflow builds release archives for Linux, macOS, and Windows and attaches them
to a GitHub Release.

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Design notes](docs/approved-design.md)

## License

AskUser Popup is licensed under the [Apache License 2.0](LICENSE).
