# Contributing

Thanks for considering a contribution to AskUser Popup.

## Development Setup

Requirements:

- Go 1.26.3 or newer compatible toolchain.
- Node.js 24 LTS.
- pnpm 10.

Install web dependencies:

```bash
pnpm --dir web install
```

Run the daemon during local development:

```bash
pnpm --dir web build
pnpm --dir web sync:embed
go run ./cmd/popupd
```

## Verification

Before opening a pull request, run:

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

If `pnpm --dir web sync:embed` changes `internal/webui/dist`, include the generated files in the same commit as the web UI change.

## Pull Requests

- Keep changes focused.
- Add tests for user-visible behavior and protocol changes.
- Update `README.md` or `CHANGELOG.md` when behavior, installation, or release artifacts change.
- Do not commit local databases, screenshots, coverage output, or temporary files.

## Commit Style

Use concise conventional-style prefixes where they fit:

- `feat:` for new behavior.
- `fix:` for bug fixes.
- `test:` for test-only changes.
- `docs:` for documentation.
- `build:` for generated assets or release tooling.

