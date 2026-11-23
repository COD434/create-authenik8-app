# Authenik8 Studio Windows Launcher Context

## Product direction

- Authenik8's public domain serves the marketing site and documentation.
- Studio stays local-first for this release: projects, command execution, previews, and generated files live on the user's Windows machine.
- Do not expose the current Studio server as a shared public service. It binds to loopback and uses a single local sandbox; hosted multi-user Studio would require a separate authenticated, isolated execution architecture.
- The marketing site's Build actions should lead Windows users to a downloadable Studio installer. Installing or launching Studio opens the local Studio in the user's browser.

## Current implementation

- `packages/create-authenik8-studio` provides `npx create-authenik8-studio`.
- That launcher requires Node.js 22+, installs no desktop shortcut, and is not a standalone Windows download.
- `apps/web-studio` contains the local Studio server and browser UI. The server binds to `127.0.0.1`.
- The root marketing page currently links Build directly to `/studio`, which is appropriate when served by the combined local development server but not a public marketing-only deployment.

## Windows distribution target

- Produce a per-user Windows installer that includes the Node runtime and built Studio files, so end users do not need to install Node separately.
- Install a Start menu shortcut and launch Studio at a loopback URL.
- Keep the existing npm launcher for developers; the installer is the simpler public download path.
- Publish downloadable installer assets through GitHub Releases and direct the marketing Build action to a stable download page/release URL.
- Keep API/model keys out of installer configuration and disk; continue collecting them in Studio at use time.
- OpenCode remains an optional external dependency for agent features; core browser-based Studio features should launch without it.

## Work status and follow-up

- `scripts/package-windows-studio.mjs` stages the built server, UI, dependencies, Node runtime, and npm CLI into `dist/windows-studio`.
- `apps/desktop/windows/setup.iss` defines a per-user Inno Setup installer; its shortcuts use the VBS launcher and stop helper.
- `.github/workflows/release-windows-studio.yml` builds the installer with read-only permissions, publishes it from a separate write-scoped job, and attaches a SHA-256 checksum when a `v*` tag is pushed. Workflow actions are pinned to commit SHAs.
- The public Build links now route to `/download`. The direct installer URL will become live after the first tagged release is published.
- The launcher pins project files under `Documents\Authenik8 Studio\workspace`; the Stop shortcut asks the background server to close cleanly.
- The packaged app was staged and launched locally with its bundled Node/npm runtime, then stopped through the stop-file flow. Full build, typecheck, stylesheet, and packaging-launcher tests remain to be rerun after the final edits.
- Release signing is optional and requires the GitHub Actions secrets `WINDOWS_SIGNING_CERT_BASE64` (PFX encoded as base64) and `WINDOWS_SIGNING_CERT_PASSWORD`. Without them, releases are explicitly marked unsigned and include the checksum. The checksum detects corruption but does not replace a trusted Authenticode signature.
