# Requirements

- Node.js 20.19+, 22.12+, or 24+ for every preset
- Docker with Compose only if you choose the optional container workflow
- Redis for production deployments. Every preset provides an in-process compatible store for local development.

The CLI is tested on Linux, Windows, and macOS. Express presets support npm, pnpm, and Bun dependency installation. The fullstack preset uses npm workspaces. Prisma-backed pnpm and Bun projects include explicit approvals for the native dependency build steps they require.

Git initialization is skipped with a clear status when Git is unavailable. Installer failures retain the package manager's diagnostic output, while successful interactive runs keep the progress display concise.

[Back to the documentation index](../README.md#documentation)
