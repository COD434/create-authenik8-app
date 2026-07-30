# Lovable integration release checklist

- [ ] Full repository tests and generator integration suite pass.
- [ ] Fresh `--frontend lovable` generation installs, tests, typechecks, and builds.
- [ ] OpenAPI validates and committed output is current.
- [ ] Exported client archives install in a clean Vite project.
- [ ] Official reference application passes Lovable Doctor.
- [ ] Deliberately insecure fixtures fail with stable IDs.
- [ ] Chromium, Firefox, and Safari pass the custom-domain checklist.
- [ ] Ordinary user receives `403` from admin API.
- [ ] Revoked and replayed refresh sessions fail.
- [ ] OAuth invalid/expired state, callback mismatch, collision, and fixed return route are tested.
- [ ] Built frontend contains no secrets or tokens.
- [ ] Documentation commands are tested on a clean machine.
- [ ] Hosted demo contains no personal data or real reusable credentials.
- [ ] Five-builder test threshold is met before production-ready marketing.
- [ ] Changelog and release notes state preview/custom-domain limitations.
- [ ] npm package contents and a clean `npx` install are inspected.
