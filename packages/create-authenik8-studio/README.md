# create-authenik8-studio

The developer one-liner for Authenik8 Studio:

```bash
npx create-authenik8-studio
```

For a normal Windows install, download the Authenik8 Studio installer from the
[latest GitHub release](https://github.com/authenik8/create-authenik8-app/releases/latest).
The installer includes Node.js and opens Studio in your browser. It stores
projects in `Documents\Authenik8 Studio\workspace`.

The npm launcher remains useful for development and requires Node.js 22 or newer.
What it does:

1. Picks a free port near 4870 (a busy port never crashes the run — it falls back upward).
2. Boots the localhost studio (chat, sandbox file tools, live preview, build agent, run, export).
3. Opens the browser tab for you.

Everything executes on **this machine** — that is the product: the sandbox is a real
folder on your disk, the preview is served from it, and generated projects run with
real `npm install` / `npm start`. Nothing is uploaded anywhere; the OpenRouter key
lives in the browser tab only (BYOK, no telemetry).

Options: `--port <n>` (preferred port), `--no-open` (skip the browser tab).

Running from a clone of the authenik8 workspace? `npm install && npm run build` at the
root first — the launcher loads `@authenik8/web-studio`'s dist.
