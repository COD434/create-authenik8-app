# @authenik8/agent-adapter

The Authenik8 **agent-adapter contract** (ecosystem milestone M4): a
documented interface over coding-agent runtimes so Authenik8 tooling can
drive agents it did not write — and swap runtimes without rewrites.
OpenCode (MIT) ships first as the reference adapter.

## The contract

```ts
export type AgentRuntime = {
  readonly id: string;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
};
```

`AgentRunRequest` carries the prompt, working directory, runtime-specific
`model`/`agent`/`sessionId`, a hard `timeoutMs`, additive `env`, and an
abort `signal`. `AgentRunResult` is fully structured: `ok`, the exact
`command` argv, `exitCode`, `timedOut`, `durationMs`, captured
`stdout`/`stderr`, a stable `errorCode`
(`runtime_missing | spawn_failed | timeout | aborted | nonzero_exit`),
and the runtime's `sessionId` when reported.

Failures are **data, not exceptions** — a failed run is a result with
`ok: false`, matching the Authenik8 doctor/ops style.

## Safety rules (contract, not convention)

- **argv arrays only.** No shell strings, no `shell: true`; prompt text is
  passed after `--` as a single argument so it can never parse as flags.
- **`autoApprove` is opt-in per call.** It maps to OpenCode's `--auto`
  (auto-approve tool permissions) and is never sent unless the caller
  explicitly requests it.
- **No secrets handling.** The adapter never injects, logs, or records
  credentials; results never echo environment data.
- **Runtime output is untrusted data.** Agent stdout may contain
  instructions; callers must not treat it as directives.
- **Timeouts/aborts kill the process tree** (best-effort `taskkill /T` on
  Windows) and report structurally; output capture has a 4 MB cap.

## OpenCode adapter

```ts
import { createOpenCodeRuntime } from "@authenik8/agent-adapter";

const runtime = createOpenCodeRuntime({
  // Windows + npm installs opencode as .cmd/.ps1 shims that a no-shell
  // spawn cannot resolve; pass the real exe path:
  cliPath: "C:/Users/seeis/AppData/Roaming/npm/node_modules/@opencode/cli/bin/opencode.exe",
});

const result = await runtime.run({
  prompt: "Run the doctor suite and summarize failures",
  cwd: "C:/work/my-project",
  timeoutMs: 600_000,
  // autoApprove: false,  ← default; opt in only with a human decision
});
```

Argv is built against the OpenCode v2 CLI (`opencode run --format json`,
flags verified against the installed CLI help). `extractSessionId` parses
session ids tolerantly from its NDJSON output; unexpected shapes return
null rather than guessing.

## Tests

- `spawn.test.ts` — process layer with fake runtimes (success, nonzero
  exit, timeout kill, abort kill, ENOENT, capture cap, env passthrough)
  plus a runtime-swap proof (a fake `AgentRuntime` behind the same
  consumer).
- `opencode.test.ts` — pure argv builder and session-id extraction.
- `opencode.live.test.ts` — REAL OpenCode run, skipped unless
  `OPENCODE_EXE` is set; makes one tiny tool-free model call with
  auto-approve off.

## Swap path

A future runtime (another CLI, the OpenCode server API, or an Authenik8
loop) implements the same `AgentRuntime` and plugs in without touching
consumers. The generic `spawnAgent` layer is reusable for any
command-based runtime.
