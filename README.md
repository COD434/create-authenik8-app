![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D18-green)
![status](https://img.shields.io/badge/status-active-brightgreen)

# create-authenik8-app

Scaffold secure Express authentication APIs in seconds

![Authenik8 install demo]()

JWT • Refresh Tokens • Redis • RBAC • TypeScript • Express

---

##  What is Authenik8?

Authenik8 is a CLI tool that generates a production-ready authentication backend for Express applications.

It removes the repetitive setup of authentication systems so you can focus on building features.

---

##  Features

- JWT authentication (access + refresh tokens)
- Secure refresh token rotation
- Redis-based session and token storage
- Role-Based Access Control (RBAC)
- TypeScript preconfigured
- Express server setup included
- Clean modular project structure
- Environment variables auto-generated

---

##  Quick Start

```bash
npx create-authenik8-app my-app
```
---
then:
```
cd my-app
redis-server --daemonize yes
npm run dev
```
---
# Authentication Flow Included

• Register / Login endpoints

• Access token (JWT)

• Refresh token rotation

• Redis-backed session tracking

• Protected routes via middleware

---

# RBAC Example

```TypeScript
app.get("/admin", auth.requireAdmin, (req, res) => {
  res.json({ message: "Admin only route" });
  });
  ```
 ---
 # Requirements

• Node.js 18+

• Redis (required for refresh token storage)

---

 Redis Setup
 Local:
 ```Bash
 redis-server
 ```
 Docker:

 ```Bash
 docker run -p 6379:6379 redis
 ```
 ---
# Environment Variables

 Auto-generated during setup:
 Environment
 ```JWT_SECRET=your-secret
 REFRESH_SECRET=your-refresh-secret

 REDIS_HOST=127.0.0.1
 REDIS_PORT=6379
 ```
 ---

 # Philosophy

Authenik8 is built on a simple principle:

•Provide secure defaults

•Avoid unnecessary abstraction

•Keep full developer control

•Generate real production-ready structure

•It is not a full framework...yet🙃.

•It is a secure starting point for backend systems.

---

# What it avoids

• No hidden framework magic

• No forced architecture

• No vendor lock-in

• No incomplete auth templates

• No over-engineering

---

# Roadmap

• OAuth (Google, 
GitHub)

• Advanced RBAC (roles + permissions)

• Docker templates

•Fastify support

• Production presets

---

# Powered by

authenik8-core

---

# Why this exists

Most backend projects lose time in authentication setup.
Authenik8 standardizes that foundation so teams can move faster with consistent security patterns.