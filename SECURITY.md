# Security Policy

## Supported Versions

Security fixes are applied to the default branch. Public version support starts with the first tagged release.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Report security concerns by emailing the maintainer or by using GitHub private vulnerability reporting if it is enabled for the repository.

Include:

- A clear description of the issue.
- Steps to reproduce.
- Whether the issue requires local access, LAN access, or a malicious web page.
- Any relevant logs or configuration.

## Security Notes

The daemon listens on `0.0.0.0:8765` by default so the browser workbench can be opened from other devices on the same LAN. Use `ASKUSER_ADDR=127.0.0.1:8765` if you want loopback-only access.

