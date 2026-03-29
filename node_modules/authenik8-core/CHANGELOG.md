# Changelog

## [0.1.2] - 2026-03-22
### Fixed
- Patched a vulnerability allowing reuse of old refresh tokens.
- Refresh token rotation now uses Redis locks to prevent concurrent refresh exploits.
- Concurrent refresh requests are handled safely, ensuring only one succeeds.
