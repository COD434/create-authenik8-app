import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const templatesRoot = path.join(repoRoot, "templates");

const flushAsyncWork = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

const writeModule = async (targetPath, source) => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, source);
};

const writePackage = async (targetDir, name) => {
  await writeModule(
    path.join(targetDir, "package.json"),
    JSON.stringify(
      {
        name,
        type: "module",
      },
      null,
      2,
    ),
  );
};

const packageWithEntry = (name) =>
  JSON.stringify(
    {
      name,
      type: "module",
      main: "./index.js",
      exports: "./index.js",
    },
    null,
    2,
  );

const runtimeState = () => ({
  dotenvConfigCalls: 0,
  createAuthenik8Calls: [],
  createAppCalls: [],
  listenCalls: [],
  processEvents: [],
  intervals: [],
  logs: [],
  errors: [],
  exitCalls: [],
  initAuthCalls: 0,
  appUseCalls: [],
  expressJsonCalls: 0,
});

const installCommonStubs = async (tempDir) => {
  await writePackage(tempDir, "template-server-test");

  await writeModule(
    path.join(tempDir, "node_modules/dotenv/package.json"),
    packageWithEntry("dotenv"),
  );
  await writeModule(
    path.join(tempDir, "node_modules/dotenv/index.js"),
    `export default {
  config() {
    globalThis.__templateServerTestState.dotenvConfigCalls += 1;
  }
};
`,
  );

  await writeModule(
    path.join(tempDir, "node_modules/authenik8-core/package.json"),
    packageWithEntry("authenik8-core"),
  );
  await writeModule(
    path.join(tempDir, "node_modules/authenik8-core/index.js"),
    `export async function createAuthenik8(config) {
  const state = globalThis.__templateServerTestState;
  state.createAuthenik8Calls.push(config);
  return globalThis.__templateServerAuthInstance;
}
`,
  );
};

const installExpressStub = async (tempDir) => {
  await writeModule(
    path.join(tempDir, "node_modules/express/package.json"),
    packageWithEntry("express"),
  );
  await writeModule(
    path.join(tempDir, "node_modules/express/index.js"),
    `function createRouter() {
  return {
    get() {},
    post() {},
    use() {},
  };
}

function express() {
  return {
    use(...args) {
      globalThis.__templateServerTestState.appUseCalls.push(args);
    },
    listen(port, callback) {
      globalThis.__templateServerTestState.listenCalls.push(port);
      if (callback) callback();
    },
  };
}

express.json = function json() {
  globalThis.__templateServerTestState.expressJsonCalls += 1;
  return "json-middleware";
};

express.Router = createRouter;

export default express;
`,
  );
};

const withPatchedRuntime = async (fn) => {
  const originalOn = process.on;
  const originalExit = process.exit;
  const originalMemoryUsage = process.memoryUsage;
  const originalSetInterval = globalThis.setInterval;
  const originalLog = console.log;
  const originalError = console.error;

  const state = runtimeState();
  globalThis.__templateServerTestState = state;

  process.on = ((event, handler) => {
    state.processEvents.push({ event, handler });
    return process;
  });

  process.exit = ((code) => {
    state.exitCalls.push(code);
    throw new Error(`process.exit:${code}`);
  });

  process.memoryUsage = (() => ({ heapUsed: 32 * 1024 * 1024 }));

  globalThis.setInterval = ((handler, ms) => {
    const interval = { handler, ms };
    state.intervals.push(interval);
    return interval;
  });

  console.log = (...args) => {
    state.logs.push(args.join(" "));
  };

  console.error = (...args) => {
    state.errors.push(args.join(" "));
  };

  try {
    await fn(state);
  } finally {
    process.on = originalOn;
    process.exit = originalExit;
    process.memoryUsage = originalMemoryUsage;
    globalThis.setInterval = originalSetInterval;
    console.log = originalLog;
    console.error = originalError;
    delete globalThis.__templateServerTestState;
    delete globalThis.__templateServerAuthInstance;
  }
};

const importServer = async (serverPath) => {
  await import(`${pathToFileURL(serverPath).href}?t=${Date.now()}-${Math.random()}`);
  await flushAsyncWork();
};

const createTempFixture = async () => mkdtemp(path.join(os.tmpdir(), "template-server-test-"));

test("templates/express-base/src/server.ts boots with auth config and safety handlers", async () => {
  await withPatchedRuntime(async (state) => {
    const tempDir = await createTempFixture();
    globalThis.__templateServerAuthInstance = { helmet: "helmet", rateLimit: "rate-limit" };

    try {
      await installCommonStubs(tempDir);

      const serverSource = await readFile(
        path.join(templatesRoot, "express-base/src/server.ts"),
        "utf8",
      );

      await writeModule(path.join(tempDir, "src/server.ts"), serverSource);
      await writeModule(
        path.join(tempDir, "app.ts"),
        `export function createApp(auth) {
  globalThis.__templateServerTestState.createAppCalls.push(auth);
  return {
    listen(port, callback) {
      globalThis.__templateServerTestState.listenCalls.push(port);
      if (callback) callback();
    },
  };
}
`,
      );

      process.env.JWT_SECRET = "jwt-secret";
      process.env.REFRESH_SECRET = "refresh-secret";

      await importServer(path.join(tempDir, "src/server.ts"));

      assert.equal(state.dotenvConfigCalls, 1);
      assert.deepEqual(state.createAuthenik8Calls, [
        { jwtSecret: "jwt-secret", refreshSecret: "refresh-secret" },
      ]);
      assert.equal(state.createAppCalls.length, 1);
      assert.equal(state.createAppCalls[0], globalThis.__templateServerAuthInstance);
      assert.deepEqual(state.listenCalls, [3000]);
      assert.match(state.logs.join("\n"), /Server running on http:\/\/localhost:3000/);
      assert.deepEqual(
        state.processEvents.map(({ event }) => event),
        ["uncaughtException", "unhandledRejection"],
      );
      assert.equal(state.intervals.length, 1);
      assert.equal(state.intervals[0].ms, 10000);

      process.memoryUsage = (() => ({ heapUsed: 301 * 1024 * 1024 }));
      assert.throws(() => state.intervals[0].handler(), /process\.exit:1/);
      assert.deepEqual(state.exitCalls, [1]);
      assert.match(state.errors.join("\n"), /Memory exceeded:/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test("templates/express-auth/src/server.ts boots with auth config and safety handlers", async () => {
  await withPatchedRuntime(async (state) => {
    const tempDir = await createTempFixture();
    globalThis.__templateServerAuthInstance = { kind: "auth-instance" };

    try {
      await installCommonStubs(tempDir);

      const serverSource = await readFile(
        path.join(templatesRoot, "express-auth/src/server.ts"),
        "utf8",
      );

      await writeModule(path.join(tempDir, "src/server.ts"), serverSource);
      await writeModule(
        path.join(tempDir, "src/app.ts"),
        `export function createApp(auth) {
  globalThis.__templateServerTestState.createAppCalls.push(auth);
  return {
    listen(port, callback) {
      globalThis.__templateServerTestState.listenCalls.push(port);
      if (callback) callback();
    },
  };
}
`,
      );

      process.env.JWT_SECRET = "jwt-secret";
      process.env.REFRESH_SECRET = "refresh-secret";

      await importServer(path.join(tempDir, "src/server.ts"));

      assert.equal(state.dotenvConfigCalls, 1);
      assert.deepEqual(state.createAuthenik8Calls, [
        { jwtSecret: "jwt-secret", refreshSecret: "refresh-secret" },
      ]);
      assert.equal(state.createAppCalls.length, 1);
      assert.equal(state.createAppCalls[0], globalThis.__templateServerAuthInstance);
      assert.deepEqual(state.listenCalls, [3000]);
      assert.match(state.logs.join("\n"), /Server running on http:\/\/localhost:3000/);
      assert.deepEqual(
        state.processEvents.map(({ event }) => event),
        ["uncaughtException", "unhandledRejection"],
      );
      assert.equal(state.intervals.length, 1);
      assert.equal(state.intervals[0].ms, 10000);

      process.memoryUsage = (() => ({ heapUsed: 301 * 1024 * 1024 }));
      assert.throws(() => state.intervals[0].handler(), /process\.exit:1/);
      assert.deepEqual(state.exitCalls, [1]);
      assert.match(state.errors.join("\n"), /Memory exceeded:/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test("templates/express-auth+/src/server.ts initializes auth, mounts routes, and starts safely", async () => {
  await withPatchedRuntime(async (state) => {
    const tempDir = await createTempFixture();

    try {
      await writePackage(tempDir, "template-server-test");
      await installExpressStub(tempDir);

      const serverSource = await readFile(
        path.join(templatesRoot, "express-auth+/src/server.ts"),
        "utf8",
      );

      await writeModule(path.join(tempDir, "src/server.ts"), serverSource);
      await writeModule(
        path.join(tempDir, "src/auth/auth.ts"),
        `export async function initAuth() {
  globalThis.__templateServerTestState.initAuthCalls += 1;
}
`,
      );
      await writeModule(
        path.join(tempDir, "src/auth/password.route.ts"),
        `export default "password-routes";
`,
      );
      await writeModule(
        path.join(tempDir, "src/auth/oauth.routes.ts"),
        `export default "oauth-routes";
`,
      );
      await writeModule(
        path.join(tempDir, "src/auth/protected.routes.ts"),
        `export default "protected-routes";
`,
      );

      await importServer(path.join(tempDir, "src/server.ts"));

      assert.equal(state.initAuthCalls, 1);
      assert.equal(state.expressJsonCalls, 1);
      assert.deepEqual(state.appUseCalls, [
        ["json-middleware"],
        ["/auth", "password-routes"],
        ["/auth", "oauth-routes"],
        ["/", "protected-routes"],
      ]);
      assert.deepEqual(state.listenCalls, [3000]);
      assert.match(state.logs.join("\n"), /Auth system running on http:\/\/localhost:3000/);
      assert.deepEqual(
        state.processEvents.map(({ event }) => event),
        ["uncaughtException", "unhandledRejection"],
      );
      assert.equal(state.intervals.length, 1);
      assert.equal(state.intervals[0].ms, 10000);

      process.memoryUsage = (() => ({ heapUsed: 301 * 1024 * 1024 }));
      assert.throws(() => state.intervals[0].handler(), /process\.exit:1/);
      assert.deepEqual(state.exitCalls, [1]);
      assert.match(state.errors.join("\n"), /Memory exceeded:/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
