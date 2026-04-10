🚀 Authenik8 CLI — Changelog

[1.0.6] — 2026-04-10

✨ Added

- Authentication Modes
  
  - "base" → JWT only (no auth routes)
  - "auth" → Email + Password authentication
  - "auth-oauth" → Full Auth (Password + OAuth: Google, GitHub)

- OAuth Integration
  
  - Google OAuth support
  - GitHub OAuth support
  - Unified auth flow (JWT + OAuth tokens)

- Production Mode ("--production-ready")
  
  - Integrated PM2 cluster mode
  - Auto scaling across CPU cores
  - Memory-based auto restart (300MB limit)
  - Production README instructions

- CLI UX Improvements
  
  - Interactive authentication mode selection
  - Cleaner onboarding flow (inspired by modern CLIs)
  - Improved feature summaries after setup

- Developer Experience
  
  - Automatic Prisma setup (PostgreSQL / SQLite)
  - Auto dependency installation
  - Argon2 password hashing integration
  - Redis-ready auth flow

---

 Improved

- Refactored template selection logic (authMode-driven)
- Cleaner endpoint output based on selected auth mode
- Better stack summary (database + ORM detection)
- Improved CLI structure for scalability

---

Templates

- "express-base" → minimal JWT setup
- "express-auth" → password-based auth
- "express-auth+" → full auth (password + OAuth)

All templates now:

- Follow cleaner structure
- Are production-ready compatible
- Support Redis + JWT flows

---

Fixed

- Fixed incorrect template selection when combining auth options
- Fixed CLI crash ("includes" on undefined)
- Fixed incorrect auth feature output display
- Fixed PM2 interpreter issues (forced Node runtime)
- Fixed conditional Argon2 installation (only for auth modes)

---

 Performance

- Enabled horizontal scaling via PM2 cluster mode
- Improved resilience with automatic process restarts
- Optimized startup flow

---

Security

- JWT + Refresh token flow stabilized
- Redis-backed token storage supported
- Role-based middleware ("requireAdmin") integrated

---

 Notes

- OAuth identity resolution handled internally in "authenik8-core"
- CLI focuses on developer experience and rapid setup
- Designed for both local development and production readiness

---

Summary

This release transforms Authenik8 CLI from:

«Basic auth scaffolding tool»

into:

«Production-ready authentication system generator»

---

 Next (Planned)

- Metrics & observability (Grafana integration)
- Fastify template support
- CLI onboarding enhancements
- Hosted admin dashboard (future premium feature)

---
