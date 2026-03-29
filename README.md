
# create-authenik8-app

# create-authenik8-app

<p align="center">
  <b>Scaffold secure Express authentication APIs in seconds</b>
</p>

<p align="center">
  JWT • Refresh Tokens • Redis • TypeScript • Express
</p>

---

## 📦 Install & Usage

Create a new project:

```bash
npx create-authenik8-app my-app
---

## 🚀 Usage

Create a new project:

```bash
npx create-authenik8-app my-app
Then:
```
Bash
cd my-app
npm install
npm run dev
```
## What gets generated
The CLI creates a full Express starter project with:
JWT authentication (access + refresh tokens)
Redis integration for refresh token storage
---
## TypeScript setup
Pre-configured project structure
.env file
Auth routes and middleware
Express server setup
---
🧠 Requirements
```
Node.js 18+
Redis (required for refresh token storage)
Redis setup
You must have Redis running before starting the app.


Local (Termux / Linux)
```
Bash
redis-server
```
---
## Environment Variables
```
A .env file is generated automatically:
Environment
JWT_SECRET=your-secret
REFRESH_SECRET=your-refresh-secret

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```
---
## Core dependency
This CLI uses:
```
Bash
authenik8-core
for authentication logic.
```
---
## Notes
This CLI generates a starter project (not a production framework)
Redis is required for refresh token handling
Designed for Express + TypeScript projects
