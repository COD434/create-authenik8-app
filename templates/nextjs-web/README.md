# Authenik8 Next.js starter

This directory is generated when `--frontend next` is selected. It provides a
minimal Next.js App Router frontend connected to your Authenik8 API.

## Commands

```bash
npm run dev
npm run build
npm run start
npm run test   # typecheck gate
npm run typecheck
```

## Environment

Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_API_URL`.

## Notes

- Sign-in on `/login` uses the typed client, which performs the CSRF bootstrap
  automatically. Do not call `/api/auth/*` with raw `fetch`.
- Auth state lives on the Authenik8 backend. Keep tokens out of the browser.
- Use the typed client from `packages/api-client` for production calls.
