<<<<<<< HEAD
<<<<<<< HEAD


=======
Good catch — then your README should reflect that. Don’t undersell what you already built.

Let’s fix it properly.
>>>>>>> 5471da4 (Update file README.md)


---

<<<<<<< HEAD
=======
✅ Updated npm README (with RBAC included)

Replace your README with this version:

>>>>>>> 5471da4 (Update file README.md)
# create-authenik8-app

<p align="center">
  <b>Scaffold secure Express authentication APIs in seconds</b>
</p>
<<<<<<< HEAD

<p align="center">
  JWT • Refresh Tokens • Redis • RBAC • TypeScript • Express
</p>

---

## 📦 Usage

Create a new project:

```bash
npx create-authenik8-app my-app

Then:

cd my-app
npm install
npm run dev
```

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

## Why Authenik8?

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

## Redis Setup
```

Local

redis-server

Docker

docker run -p 6379:6379 redis

```
---

## Environment Variables

Generated automatically:
```
JWT_SECRET=your-secret
REFRESH_SECRET=your-refresh-secret

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

```
---

## RBAC Example
```
Example of a protected route:

app.get("/admin", auth.requireAdmin, (req, res) => {
  res.json({ message: "Admin only route" });
});

```
---

📦 Powered by

authenik8-core



---

## Project Structure
```

my-app/
├── src/
│   | 
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



---
# Create-authenik8-app
=======
# create-authenik8-app
>>>>>>> 01efb21 (Update file README.md)

<p align="center">
  <b>Scaffold secure Express authentication APIs in seconds</b>
  </p>
=======
>>>>>>> 5471da4 (Update file README.md)

<p align="center">
  JWT • Refresh Tokens • Redis • RBAC • TypeScript • Express
</p>

<<<<<<< HEAD
    ---

    ## 📦 Install & Usage

    Create a new project:

    ```bash
    npx create-authenik8-app my-app

    cd my-app
    npm install
    npm run dev

    ## What you get instantly

    A fully working Express authentication starter with:
    JWT authentication (access + refresh tokens)
    Secure refresh token rotation
    Redis-based token storage
     TypeScript setup
    Express server preconfigured
    Clean scalable folder structure
    .env file generated automatically
    ---
    ##  Why Authenik8?
    Most auth setups require:
    manual JWT wiring
    session or Redis configuration
    refresh token logic
    security edge cases
    Authenik8 removes that complexity and gives you a working auth system instantly.
    ---
    ## Requirements
    Node.js 18+
    Redis (required for refresh tokens)
    🧩 Redis Setup
    ```
    Local
    Bash
    redis-server
    ```
    Docker
    Bash
    docker run -p 
    6379:6379 redis
    ```
    ## Environment 
    Variables
    Automatically generated:
    ```
    Environment
    JWT_SECRET=your-secret
    REFRESH_SECRET=your-refresh-secret

    REDIS_HOST=127.0.0.1
    REDIS_PORT=6379
    ```
    ## Powered by
    ```
    authenik8-core
    🧱 Project Structure
=======
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

Requirements

Node.js 18+

Redis (required for refresh tokens)



---

 Redis Setup
 ```

Local

redis-server

Docker

docker run -p 6379:6379 redis
>>>>>>> d0dcbbf (feature:oauth + Pm2)
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

📦 Powered by

authenik8-core



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

📌 Notes

Redis is required for refresh token handling

This CLI generates a starter project, not a full framework

RBAC is included via middleware (e.g. requireAdmin)



---

🧱 Roadmap

OAuth providers (Google, GitHub)

Advanced RBAC (custom roles/permissions)

Docker templates

Admin dashboard

Production presets

