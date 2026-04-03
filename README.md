
# create-authenik8-app

<p align="center">
  <b>Scaffold secure Express authentication APIs in seconds</b>
</p>

<p align="center">
  JWT • Refresh Tokens • Redis • RBAC • TypeScript • Express
</p>

---

## Problems It Solves

Real pain points that slow down backend development.

01
Setting up JWT auth from scratch is repetitive

02
Refresh token logic is often implemented incorrectly

03
Redis-backed sessions are complex to wire properly

04
Security middleware setup is inconsistent

05
Prisma setup takes time and configuration

06
Developers spend time on boilerplate instead of features

---

##  Usage

Create a new project:

```bash
npx create-authenik8-app my-app

Then:

cd my-app

redis-server --daemonize yes

npm run dev

```
---

## What you get instantly

A fully working Express authentication starter with:

• JWT authentication (access + refresh tokens)

• Secure refresh token rotation

• Redis-based token storage

• Role-Based Access Control (RBAC)

• TypeScript setup

• Express server preconfigured

• Clean scalable folder structure

• .env file generated automatically



---

## Why Authenik8?

Authentication systems usually require:

• manual JWT setup

• refresh token handling

• Redis/session configuration

• access control logic


Authenik8 provides all of this out of the box so you can start building your API immediately.


---
## Philosophy
→ Authenik8 is not a full framework

→ It provides secure defaults, not business logic

→ You remain in control of your application

→ Designed for real-world backend systems

---
## What It Avoids
✕ No over-engineered frameworks

✕ No forced architecture

✕ No hidden magic

✕ No vendor lock-in

✕ No incomplete or insecure auth examples

---

## Requirements

Node.js 18+

Redis (required for refresh tokens)



---

 ## Redis Setup
 ```

Local

redis-server

Docker

docker run -p 6379:6379 redis
```
---

 Environment Variables

Generated automatically:
```
JWT_SECRET=your-secret
REFRESH_SECRET=your-refresh-secret

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

---

RBAC Example

Example of a protected route:
```
app.get("/admin", auth.requireAdmin, (req, res) => {
  res.json({ message: "Admin only route" });
});
```

---

## Powered by

authenik8-core



---

## Project Structure
```
my-app/
├── src/
│   ├
│   ├
│   └── server.ts
├── .env
├── package.json
└── tsconfig.json

```
---

## Notes

Redis is required for refresh token handling

This CLI generates a starter project, not a full framework

RBAC is included via middleware (e.g. requireAdmin)

---

## Roadmap

OAuth providers (Google, GitHub)

Advanced RBAC (custom roles/permissions)

Docker templates

Admin dashboard

Production presets

