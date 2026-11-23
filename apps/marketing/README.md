# @authenik8/marketing

The marketing site is a standalone static site, separate from Studio and its project sandbox. It serves `/`, `/docs`, `/pricing`, and `/download`. The home page pricing section distinguishes the available free local product from proposed paid plans; it does not collect payments.

## Run locally

From the workspace root, run:

```bash
npm run dev
# open http://127.0.0.1:4000
```

## Build

```bash
npm run build
# outputs static files to dist/
```

The marketing dev server serves the static site independently on port 4000. Studio runs separately on port 4870. The marketing page uses plain HTML and CSS with no external assets.
