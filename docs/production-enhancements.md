# Production enhancements

The production-ready Express option adds:

- PM2 cluster mode and automatic restart
- A 300 MB memory restart threshold for the Node.js PM2 configuration

All Express presets include Authenik8 security middleware such as Helmet and Redis-backed rate limiting, whether or not PM2 generation is selected.

Generated projects also include production guidance and a threat model. These defaults do not replace deployment review. Configure secrets, HTTPS, Redis isolation, CORS, OAuth callbacks, observability, and application-specific authorization for the target environment.

Use `--production-ready` during generation and select a supported runtime with `--runtime node` or `--runtime bun`.

[Back to the documentation index](../README.md#documentation)
