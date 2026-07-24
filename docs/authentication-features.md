# Core authentication features

- JWT authentication with access and refresh tokens and secure rotation
- Redis-based token storage
- Role-Based Access Control (RBAC)
- TypeScript setup
- Express server configured with security middleware
- Clean, scalable folder structure
- Automatically generated `.env`
- Generated threat model and production guidance

The generated design uses Redis to provide refresh-token replay protection, concurrent refresh protection, OAuth state validation, rate limiting, and server-side session control. Read [Using authenik8-core](authenik8-core.md) for the detailed lifecycle.

[Back to the documentation index](../README.md#documentation)
