# AskUser Popup

AskUser Popup is a local human-in-the-loop MCP tool. Code agents call the
`AskUser` tool, the question appears in a browser workbench, and the tool call
returns after the user replies.

The approved rewrite design is in [docs/approved-design.md](docs/approved-design.md).
The implementation plan is in [docs/implementation-plan.md](docs/implementation-plan.md).

## Run

Build the web UI into the embedded daemon assets:

```bash
pnpm --dir web install
pnpm --dir web build
pnpm --dir web sync:embed
```

Start the local daemon:

```bash
go run ./cmd/popupd
```

Open:

```text
http://127.0.0.1:8765
```

The daemon can be configured with:

```bash
ASKUSER_ADDR=127.0.0.1:8765
ASKUSER_DB=askuser-popup.db
```

## MCP Server

Build or run the stdio MCP server:

```bash
go run ./cmd/popup-mcp
```

Build a binary for MCP client configuration:

```bash
go build -o popup-mcp ./cmd/popup-mcp
```

Example MCP configuration:

```json
{
  "servers": {
    "popup": {
      "command": "/home/t103o/workbench/projects/informuser-go/popup-mcp"
    }
  }
}
```

The MCP server connects to `http://127.0.0.1:8765` by default. Override it with:

```bash
ASKUSER_DAEMON_URL=http://127.0.0.1:8765
```

## Verify

```bash
go test ./...
pnpm --dir web check
pnpm --dir web lint
pnpm --dir web build
pnpm --dir web sync:embed
pnpm --dir web test:e2e
```
