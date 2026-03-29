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
```
    my-app/
    ├── src/
    │   ├
    │   |
    │   └── server.ts
    ├── .env
    ├── package.json
    └── tsconfig.json
    ```
    ## Notes

    This CLI generates a starter project (not production-ready by default)
    Redis is required for refresh token handling

    Built for Express + TypeScript developers

    ## Roadmap
    fastify support 
    OAuth providers (Google, GitHub)
    Docker templates
    Admin dashboard starter
    Production presets