
# Create-authenik8-app



<p align="center">
  <b>Scaffold secure Express authentication APIs in seconds</b>
  </p>


![subtitle](https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&pause=1000&color=00C2FF&width=600&lines=Production-ready+Auth+Generator;JWT+%2B+OAuth+%2B+Prisma+%2B+Redis;Identity+Engine+powered+authentication+system)

---

##  Usage

Create a new project:

```bash
npx create-authenik8-app my-app

Then:

cd my-app
npm install
npm run dev

---

## What you get instantly

A fully working Express authentication starter with:

JWT authentication (access + refresh tokens)

 Secure refresh token rotation

 Redis-based token storage

 Role-Based Access Control (RBAC)

TypeScript setup

 Express server preconfigured

Clean scalable folder structure

 .env file generated automatically



---

🧠 Why Authenik8?

Authentication systems usually require:

manual JWT setup

refresh token handling

Redis/session configuration

access control logic


Authenik8 provides all of this out of the box so you can start building your API immediately.


---

## Requirements

Node.js 18+

Redis (required for refresh tokens)



---

 Redis Setup
 ```Local

redis-server

Docker

docker run -p 6379:6379 redis

---

 Environment Variables

Generated automatically:

```JWT_SECRET=your-secret
REFRESH_SECRET=your-refresh-secret

REDIS_HOST=127.0.0.1
REDIS_PORT=6379


---

## RBAC Example

Example of a protected route:
```
app.get("/admin", auth.requireAdmin, (req, res) => {
  res.json({ message: "Admin only route" });
});


---
## Powered by

authenik8-core

---

## Design Goal
Authenik8 is not an auth library.
It is an auth system generator.
It removes setup time and enforces consistent backend security patterns by default.

Authenik8 treats authentication as an identity resolution problem, not just a login system.

At the core is an Identity Engine that ensures consistent user identity across:
- credentials (email/password)
- OAuth providers
- future authentication strategies

---

## OAuth
• Google
• Github
OAuth in Authenik8 is not a direct provider integration layer.

It is implemented through an internal Identity Engine that sits inside `authenik8-core`.

The Identity Engine is responsible for:
- Resolving OAuth profiles into system identities
- Handling login vs account linking flows
- Preventing duplicate identity creation across providers
- Normalizing provider-specific user data into a unified schema

This allows OAuth support to remain consistent regardless of provider complexity.
---

### Production Enhancements

- PM2 cluster mode support
- Auto restart on crashes
- Memory usage guardrails
- Basic security middleware (helmet, rate limiting)
---
📁 Project Structure

my-app/
├── src/
│   ├
│   ├
│   └── server.ts
├── .env
├── package.json
└── tsconfig.json


---

## Notes

Redis is required for refresh token handling

This CLI generates a starter project, not a full framework

RBAC is included via middleware (e.g. requireAdmin)



---

## Roadmap

Advanced RBAC (custom roles/permissions)

Docker templates

Admin dashboard

Production presets

