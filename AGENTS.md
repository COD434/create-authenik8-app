# AGENTS.md

## Scope

These instructions apply to the `original-feature` branch of
`COD434/create-authenik8-app`.

This branch is not an early Lovable prototype. It already contains a large,
integrated product surface:

- four generator presets;
- `--frontend lovable` for the full-stack preset;
- a generated Lovable integration pack;
- a generated Lovable orchestration skill;
- an expanded OpenAPI 3.1 document;
- a configurable browser API client;
- Lovable Doctor;
- general Authenik8 Doctor;
- operational maintenance commands;
- upgrade planning and acknowledgement;
- signed operational receipts;
- local Authenik8 Studio;
- cross-platform and fresh-project CI;
- release automation and package provenance.

The first responsibility of every agent is to preserve this system.

Do not treat the repository as a blank implementation of an old roadmap.

---

## Product mission

Authenik8 provides the identity and security-sensitive backend foundation for
AI-generated and hand-coded applications.

Primary positioning:

> Vibe-code the interface. Keep identity on a backend you own.

Lovable is the first supported AI-frontend path. It is one frontend target,
not the source of truth for Authenik8 identity, authorization, sessions, data,
or secrets.

---

## Branch safety

The branch has diverged from `main`.

Before any branch operation:

1. Inspect `git status`.
2. Inspect the current branch.
3. Fetch branch metadata.
4. Compare `original-feature` with `main`.
5. Do not merge, rebase, reset, or force-push automatically.
6. Do not assume “behind main” means missing product code. A main-only merge
   commit may make Git report divergence even when the feature branch contains
   newer work.
7. Preserve uncommitted work.
8. Use a new working branch for changes.
9. Keep pull requests narrow.

Never push directly to `main` or rewrite `original-feature` history unless the
maintainer explicitly requests it.

---

## Current architecture

### Root CLI

The root command routes to:

```text
create
add
doctor
doctor frontend
upgrade
ops
studio
```

Relevant source:

```text
src/bin/cli.ts
src/lib/rootCommand.ts
```

Do not replace the root router with a new CLI framework.

### Generator

Project generation currently uses:

```text
src/bin/index.ts
src/lib/args.ts
src/lib/nonInteractive.ts
src/lib/schemas.ts
src/lib/types.ts
src/steps/prompts.ts
src/steps/createProject.ts
src/lib/projectManifest.ts
```

The generator:

- validates state with Zod;
- selects one existing template;
- copies through a staging directory;
- customizes the staged project;
- writes `authenik8.json`;
- moves the staged directory atomically;
- supports interactive and non-interactive usage;
- supports resume and fresh-project verification.

Preserve atomic generation. Do not write a project directly into the final
target directory while generation is incomplete.

### Presets

Current presets:

```text
base
auth
auth-oauth
fullstack
```

The `fullstack` preset supports frontend mode:

```text
react
lovable
```

`react` remains the default.

Do not create another full-stack template solely for Lovable. The current
design uses the full-stack template and conditionally retains or removes the
Lovable-specific artifacts.

### Generated project manifest

`authenik8.json` is the source-controlled project contract.

Relevant source:

```text
src/lib/projectManifest.ts
```

It records:

- schema version;
- generator version;
- identity-engine version;
- preset;
- package manager;
- runtime;
- database;
- Prisma capability;
- OAuth providers;
- PM2 capability;
- optional frontend mode.

Manifest changes are migrations, not casual edits.

If changing the manifest:

1. update the Zod schema;
2. update writers;
3. update readers;
4. update Doctor;
5. update Studio;
6. update upgrade planning;
7. update tests;
8. define backward compatibility.

Do not add secrets or deployment credentials to `authenik8.json`.

### Authenik8 engine loading

Operational and diagnostic commands load the generated project’s installed
`authenik8-core` rather than assuming the CLI’s development dependency.

Relevant source:

```text
src/lib/projectEngine.ts
```

Preserve this project-local engine boundary.

Do not silently fall back to the CLI’s own `authenik8-core` when inspecting or
operating on a generated project.

### Doctor

Doctor is an existing product surface, not a future placeholder.

Relevant source:

```text
src/commands/doctor/
```

It includes:

- diagnostic catalog;
- normal and deep checks;
- fixes;
- reports;
- structured output;
- production checks;
- exit-code policy.

Do not create a second diagnostic framework for Lovable, Studio, MCP, or the
future Console when existing Doctor contracts can be extended.

### Lovable Doctor

Frontend validation already has a dedicated command:

```text
src/commands/lovableDoctor/
```

Root usage:

```bash
npx create-authenik8-app doctor frontend
```

Generated-project usage may also be exposed through package scripts.

Add rules only when they are:

- high-confidence;
- tied to stable IDs;
- supported by evidence;
- covered by secure and insecure fixtures;
- documented with remediation.

Do not turn Lovable Doctor into a generic linter.

### Operations

Operational maintenance is implemented under:

```text
src/commands/ops/
```

It covers live, explicit maintenance actions with structured results, receipts,
runtime checks, signing, and failure codes.

Do not add production mutations to Doctor or Studio.

Operational rules:

- explicit command;
- explicit scope;
- prerequisite validation;
- signed or verifiable evidence where designed;
- structured receipt;
- no hidden background mutation;
- no secret logging;
- no automatic production action from a dashboard page.

### Upgrade

Upgrade planning and acknowledgement are implemented under:

```text
src/commands/upgrade/
```

Preserve:

- version-aware plans;
- explicit acknowledgement;
- migration visibility;
- current output and exit-code behavior.

Do not silently apply template changes over user-modified projects.

### Authenik8 Studio

Studio is an existing local Community feature.

Relevant source:

```text
src/commands/studio/
studio-src/
studio/
scripts/build-studio.mjs
scripts/verify-studio-package.mjs
tsconfig.studio.json
```

Studio is:

- local;
- read-only;
- manually invoked;
- bound to loopback;
- based on an immutable startup snapshot;
- offline for its default assessment;
- independent from generated app runtime;
- packaged inside the CLI tarball.

Studio does not:

- read `.env` secrets;
- contact user databases in default mode;
- mutate projects;
- run as a background service;
- certify production readiness;
- require an Authenik8 account.

Do not convert local Studio into the future hosted Console inside this
repository.

A hosted Console may reuse contracts later, but it is a separate trust and
deployment boundary.

---

## Existing Lovable implementation

The Lovable path is already implemented.

Relevant root documentation:

```text
docs/lovable.md
docs/lovable/
examples/lovable-reference/
```

Relevant generated artifacts:

```text
templates/fullstack/integrations/lovable/
templates/fullstack/.agents/skills/authenik8-lovable/SKILL.md
templates/fullstack/scripts/doctor-lovable.mjs
templates/fullstack/scripts/export-lovable-client.mjs
```

Relevant API and client:

```text
templates/fullstack/apps/api/src/openapi.ts
templates/fullstack/apps/api/scripts/generate-openapi.ts
templates/fullstack/apps/api/scripts/validate-openapi.ts
templates/fullstack/packages/contracts/
templates/fullstack/packages/api-client/
```

Do not create these again.

Do not follow an old plan that starts with:

- inventorying the auth contract from scratch;
- adding `--frontend lovable`;
- creating the integration pack;
- making the API client configurable;
- creating Lovable Doctor;
- writing first-pass Lovable documentation.

Those tasks already exist on this branch.

The next task must be selected from confirmed defects, incomplete release
criteria, external user feedback, or marketplace requirements.

---

## Current Lovable boundary

### Runtime

```text
Lovable-generated React frontend
               │
               │ Standard HTTPS
               ▼
      Authenik8 Express API
               │
       ┌───────┴────────┐
       ▼                ▼
  PostgreSQL          Redis
```

### Build time

```text
Lovable agent
     │
     │ Reads exported contracts and instructions
     ▼
Authenik8 integration pack or connector
```

MCP and Lovable tooling are build-time or orchestration surfaces.

Production authentication requests must go directly to the Authenik8 REST API.

### Authenik8 remains authoritative for

- users;
- identities;
- password hashing;
- OAuth state;
- provider callbacks;
- account linking;
- access-token verification;
- refresh-token rotation;
- session state and revocation;
- CSRF;
- CORS and Origin policy;
- roles;
- permissions;
- administrator authorization;
- audit events;
- business-resource policies;
- PostgreSQL and Redis data.

### Lovable may provide

- visual design;
- pages;
- components;
- forms;
- responsive behavior;
- calls through the exported Authenik8 client;
- safe rendering of API errors.

### Never permit Lovable to

- enable Lovable Cloud authentication;
- enable Supabase Auth;
- create a second users table;
- create a second sessions table;
- implement OAuth callbacks;
- store access tokens in persistent browser storage;
- read refresh tokens;
- use frontend route guards as authorization;
- recreate Authenik8 backend routes in Edge Functions;
- receive backend secrets through `VITE_*` variables.

---

## Existing API contract

The full-stack template already exposes a broad OpenAPI 3.1 contract.

Relevant route families include:

```text
/.well-known/jwks.json
/api/health/*
/api/docs/openapi.json
/api/auth/*
/api/account/*
/api/projects/*
/api/admin/*
```

The current contract includes:

- registration;
- login;
- CSRF bootstrap;
- refresh;
- logout;
- current user;
- email verification;
- password recovery;
- OAuth start;
- OAuth callback;
- one-time OAuth exchange;
- provider linking;
- profile;
- password change;
- sessions;
- linked providers;
- projects;
- administrator users;
- administrator audit;
- health;
- JWKS.

Do not edit OpenAPI independently from routes, contracts, clients, and tests.

Any API change must update, as applicable:

1. route implementation;
2. Zod/shared contract;
3. service/controller;
4. OpenAPI;
5. generated static OpenAPI artifact;
6. API client;
7. React reference app;
8. Lovable integration documentation;
9. tests.

---

## Existing browser client

The full-stack API client already supports:

```ts
createAuthenik8Client({
  baseUrl,
  fetch,
  broadcastChannelName,
});
```

It already implements:

- HTTP(S), `/api`, and same-origin base URL normalization;
- in-memory access tokens;
- HttpOnly refresh-cookie use;
- CSRF bootstrap;
- CSRF retry;
- one shared refresh request;
- one retry of the original authenticated request;
- cross-tab coordination through `BroadcastChannel`;
- handling for refresh-lock conflict;
- typed errors;
- OAuth exchange;
- user, account, session, project, admin, audit, and health groups;
- compatibility exports for the included React application.

Do not replace it with another client.

Do not add token persistence.

Do not create a Lovable-only fork of the client.

Changes must preserve compatibility exports unless a documented breaking
release is approved.

---

## Session and browser security rules

Never:

- persist access tokens in `localStorage`;
- persist access tokens in `sessionStorage`;
- persist access tokens in IndexedDB;
- expose refresh tokens to JavaScript;
- put access or refresh tokens in URLs;
- disable CSRF to fix a preview;
- permit wildcard credentialed CORS;
- accept arbitrary post-login redirect URLs;
- treat a UI role check as authorization;
- weaken cookie policy for convenience;
- log cookies or authorization headers.

Current intended behavior:

- access token in memory;
- refresh token in sealed HttpOnly cookie;
- CSRF cookie plus returned header token;
- `credentials: "include"`;
- exact browser Origin;
- one retry after refresh;
- logout revokes the server session;
- password changes revoke sessions;
- API middleware enforces active-session and role policy.

Any security-sensitive behavior change requires focused tests and documentation.

---

## Domain model

The recommended production layouts are:

```text
https://app.example.com
https://api.example.com
```

or a same-origin reverse proxy:

```text
https://example.com
https://example.com/api
```

Current strict cookies and exact-origin rules mean a `*.lovable.app` preview is
not the final proof of the complete production session lifecycle.

Use previews for visual work.

Test complete authentication on a supported same-site custom-domain setup.

Do not “solve” this limitation by loosening Authenik8’s production boundary.

---

## Generated Lovable skill

The template already includes:

```text
templates/fullstack/.agents/skills/authenik8-lovable/SKILL.md
```

Treat this skill as executable integration code.

Before changing it:

1. inspect the actual tool names exposed by the target Lovable connector;
2. inspect the target host: ChatGPT, Codex, another MCP client, or direct
   Lovable integration;
3. do not assume connector methods exist because an older plan named them;
4. update documentation and tests with tool-contract changes;
5. keep the workflow resilient when a connector lacks file listing, diff,
   workspace listing, or GitHub-link actions;
6. avoid embedding one host’s UI steps into the core security contract.

Prefer capability language over a hard-coded host name where possible.

Example:

```text
Confirm the Lovable connector is connected and authenticated.
```

is safer than:

```text
Enable the Lovable connector in Codex.
```

unless Codex support is deliberately and currently verified.

---

## Known verification targets

Before marketplace work, verify these existing areas.

### 1. Non-Lovable full-stack cleanup

`src/steps/createProject.ts` conditionally removes Lovable artifacts when the
frontend target is not `lovable`.

Verify that a normal React full-stack generation contains no unintended
Lovable-only files, scripts, directories, package archives, generated prompt,
or agent skill.

The cleanup test must compare the complete generated file tree, not only a
small expected list.

### 2. Connector method compatibility

Compare the generated Lovable skill with the actual connector schema.

Fail clearly when a required capability is unavailable.

Do not tell users to call methods that the connected tool does not expose.

### 3. Complete release checklist

Use:

```text
docs/lovable/release-checklist.md
```

Do not declare production-ready marketplace status until the checklist is
actually satisfied.

### 4. Branch divergence

Inspect the main-only commit before bringing `main` into this branch.

Do not merge it merely to make “behind by one” disappear.

### 5. Packaged empty/generated files

Several template files are generated during build or project setup.

Verify package contents and runtime generation. Do not conclude that a
zero-byte source artifact is broken without checking the generation step.

---

## Root CI contract

The branch CI is broader than a normal TypeScript package.

The Linux quality gate includes:

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run build
npm run test:studio:package
npm run test:coverage
npm run test:templates
npm pack --dry-run
```

Compatibility runs on:

```text
Windows / Node 22.12
macOS / Node 24
```

Fresh-project CI covers at least:

```bash
npm run test:fresh -- auth-oauth
npm run test:fresh -- fullstack
```

A local change is not complete merely because `npm test` passes.

Use the smallest focused test while developing, then run the relevant full
gate.

If the full gate cannot run, state exactly what remains unverified.

---

## Required validation by area

### Generator changes

Run:

```bash
npm run build
npm test
npm run test:templates
npm run test:fresh -- fullstack
```

Also generate:

```text
fullstack + react
fullstack + lovable
auth-oauth
```

Inspect the generated file trees.

### Studio changes

Run:

```bash
npm run build:studio
npm run test:studio:package
npm test -- studio
```

Also verify:

- loopback binding;
- Host validation;
- GET/HEAD-only server;
- CSP;
- snapshot rejection;
- all four presets.

### Doctor changes

Run focused Doctor tests plus:

```bash
npm run test:coverage
```

Verify:

- stable IDs;
- JSON output;
- exit codes;
- strict behavior;
- fix dry-run;
- report redaction.

### Lovable changes

Run:

```bash
npm run build
npm run test:coverage
npm run test:templates
npm run test:fresh -- fullstack
```

Then verify a fresh Lovable generation:

- expected integration files exist;
- exported packages are generated;
- OpenAPI check passes;
- Lovable Doctor passes secure fixtures;
- insecure fixtures fail with stable IDs;
- normal React generation does not retain Lovable-only artifacts.

### OpenAPI changes

Verify:

- OpenAPI 3.1 validity;
- deterministic generation;
- committed output is current;
- unique operation IDs;
- routes match mounted paths;
- root JWKS path is represented correctly;
- security schemes match actual middleware;
- examples contain no secrets.

### Release changes

Verify:

```bash
npm pack --dry-run
npm run test:studio:package
```

Do not modify release automation, provenance, action pins, or npm packaging as
part of an unrelated feature.

---

## Testing rules

Tests are product contracts.

Do not:

- delete a failing security test to land a feature;
- weaken an assertion without explaining changed behavior;
- rely only on snapshots for authorization;
- mock away the identity engine when the integration is the behavior under
  test;
- mark a flaky cross-platform failure as ignored without a root-cause note;
- skip fresh generation after template changes.

Add regression tests before or with bug fixes.

High-risk behavior requires both positive and negative cases.

---

## Template rules

When changing a generated application:

1. edit the template source;
2. update shared contracts first;
3. update API implementation;
4. update OpenAPI;
5. update client;
6. update React reference use;
7. update Lovable artifacts;
8. update Doctor rules if needed;
9. update fresh-project tests;
10. inspect packaged output.

Do not patch only:

```text
examples/lovable-reference
create-authenik8-app-example
```

and claim the generator is fixed.

---

## Existing release boundary

This package is already designed for npm release with:

- semantic release;
- provenance;
- pinned GitHub Actions;
- package verification;
- packaged Studio;
- generated templates.

Preserve supply-chain controls.

Do not:

- replace pinned actions with floating tags;
- remove package provenance;
- add install-time network scripts casually;
- download executables during package installation;
- publish secrets;
- alter npm contents without pack inspection.

---

## Future MCP and OpenAI work

Future Authenik8 MCP and OpenAI marketplace work must not destabilize the CLI.

Recommended boundary:

```text
create-authenik8-app
  source templates
  manifest schemas
  static contracts
  generation library boundary

authenik8-platform or authenik8-mcp
  user accounts
  OAuth for external users
  hosted MCP endpoint
  GitHub installations
  deployment credentials
  billing
  project provisioning
```

This repository may expose reusable, side-effect-controlled functions or a
versioned specification.

It must not absorb:

- hosted customer accounts;
- billing;
- cloud deployment credentials;
- public MCP server secrets;
- marketplace OAuth secrets;
- multi-tenant hosted state.

Before extracting a shared project specification, inspect existing:

```text
src/lib/schemas.ts
src/lib/types.ts
src/lib/projectManifest.ts
src/lib/nonInteractive.ts
src/steps/createProject.ts
```

Do not create a parallel schema that disagrees with CLI state and
`authenik8.json`.

---

## MCP tool rules

Initial tools should be read-only or planning-oriented:

```text
get_supported_features
plan_authenik8_project
validate_project_spec
get_project_contract
generate_lovable_integration
validate_lovable_integration
```

Rules:

- narrow Zod schemas;
- no arbitrary code execution;
- no shell input from the model;
- no secrets in tool results;
- no production login traffic through MCP;
- no repository writes without confirmation;
- no deployment without confirmation;
- structured unsupported-capability errors;
- idempotency for future writes;
- audit records for future writes;
- OAuth for user-specific operations.

Do not add MCP server runtime dependencies to generated customer applications.

---

## Marketplace readiness

Marketplace submission is not the next automatic coding task.

First satisfy:

- the existing Lovable release checklist;
- connector compatibility;
- five external builders;
- stable production deployment;
- privacy policy;
- terms;
- support contact;
- user-data deletion process;
- Authenik8 account authentication where user-specific operations exist;
- revocable credentials;
- monitoring;
- structured failures;
- demonstration video;
- no development tunnel;
- no unverified production-ready claims.

The directory is distribution, not the product.

---

## Coding-agent protocol

### Before editing

Report:

```text
Branch and commit
Current subsystem
Current behavior
Confirmed defect or requested behavior
Files to inspect
Security boundary
Smallest complete change
Tests to run
```

Do not begin implementation from an outdated roadmap item.

### During editing

- keep diffs narrow;
- preserve public commands;
- preserve manifest compatibility;
- preserve generated-project compatibility;
- avoid unrelated dependency upgrades;
- avoid broad refactors;
- add tests with behavior;
- parse untrusted data with Zod;
- use explicit errors;
- preserve structured output;
- never print secrets;
- do not mutate production state from read-only commands;
- do not add new telemetry without consent and documentation.

### After editing

Report:

```text
Scope
Files changed
Behavior implemented
Security impact
Compatibility impact
Tests run
Tests not run
Known limitations
Next smallest step
```

Do not say “all tests pass” unless the stated test commands actually ran.

---

## Pull-request size

Good pull requests:

- remove all Lovable artifacts from React-mode generation;
- align the generated Lovable skill to the current connector schema;
- add one missing OpenAPI response and client test;
- fix one Doctor rule with secure and insecure fixtures;
- add one Studio snapshot field end to end;
- fix one cross-platform path issue;
- expose one side-effect-free reusable generation function.

Bad pull requests:

- rewrite the CLI and templates;
- introduce a hosted Console inside the CLI;
- add MCP, billing, deployment, and marketplace submission together;
- replace the API client;
- split the monolith into services;
- change auth architecture to make Lovable preview easier;
- merge unrelated dependency upgrades with a feature.

---

## Stop conditions

Stop and report when:

- the requested change weakens authentication;
- a migration may destroy user data;
- branch reconciliation is ambiguous;
- the target connector schema is unavailable;
- production credentials would be required;
- a write action lacks confirmation;
- generated user code would be overwritten;
- a public command would break without migration;
- a fix requires disabling CSRF, Origin checks, strict cookies, OAuth state, or
  backend authorization;
- CI cannot validate a critical platform;
- package contents differ unexpectedly;
- secret material appears in output or fixtures.

State the exact blocker and safest next step.

---

## Definition of done

A change is done only when:

- it fixes a confirmed requirement or defect;
- the relevant existing subsystem is extended rather than duplicated;
- security boundaries remain server-side;
- Zod validates new external input;
- public compatibility is preserved or migration is documented;
- generated React mode remains correct;
- generated Lovable mode remains correct;
- manifest behavior remains correct;
- OpenAPI and client remain aligned when affected;
- Doctor and Studio remain aligned when affected;
- focused tests pass;
- relevant CI-equivalent tests pass;
- package contents are inspected when affected;
- documentation describes actual behavior;
- limitations are stated honestly.

---

## Immediate recommended work

Do not start by rebuilding the Lovable integration.

Start with a branch-preservation audit:

1. compare `original-feature` and `main`;
2. generate `fullstack + react`;
3. generate `fullstack + lovable`;
4. compare complete generated trees;
5. verify React mode contains no Lovable-only artifacts;
6. compare the generated Lovable skill against the currently exposed Lovable
   connector methods;
7. run the existing Lovable release checklist;
8. record only confirmed gaps;
9. fix one gap per pull request.

This is the fastest safe route to Lovable and OpenAI marketplace readiness.
