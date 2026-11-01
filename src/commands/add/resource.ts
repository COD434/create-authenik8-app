import path from "node:path";
import fs from "fs-extra";

import type { AddContext, PlannedFileChange } from "./types.js";

export class AddResourceError extends Error {}

export type ResourceFieldType = "string" | "number" | "boolean" | "date";

export type ResourceField = {
  name: string;
  type: ResourceFieldType;
  optional: boolean;
};

export type ResourceRequest = {
  name: string;
  fields: readonly ResourceField[];
};

const reservedFieldNames = new Set(["id", "ownerId", "owner", "createdAt", "updatedAt"]);
const maximumFields = 12;

const camelName = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

/**
 * Parses and validates the PascalCase resource identifier. The exact spelling
 * is reused as model name, contract types, and operation ids, so only strict
 * TypeScript-safe identifiers are accepted (no injection surface).
 */
export function parseResourceName(name: string): string {
  const candidate = name.trim();
  if (!/^[A-Z][a-zA-Z0-9]{0,39}$/.test(candidate)) {
    throw new AddResourceError(
      `Resource name "${candidate}" must be a PascalCase identifier (example: Invoice).`,
    );
  }
  return candidate;
}

/**
 * Parses a comma-separated field list such as "amount:number,dueAt:date?".
 * Supported types: string, number, boolean, date. A trailing ? marks the
 * column nullable and the contract input optional. Field names become
 * TypeScript identifiers and are validated strictly.
 */
export function parseResourceFields(spec: string): ResourceField[] {
  if (!spec || !spec.trim()) {
    throw new AddResourceError(
      '--fields is required for resource recipes; example: --fields "amount:number,dueAt:date?"',
    );
  }
  const fields: ResourceField[] = [];
  for (const part of spec.split(",")) {
    const entry = part.trim();
    if (!entry) {
      throw new AddResourceError(`Empty --fields entry in "${spec}".`);
    }
    const match = /^([a-z][a-zA-Z0-9]{0,39}):(string|number|boolean|date)(\?)?$/.exec(entry);
    if (!match) {
      throw new AddResourceError(
        `Invalid field spec "${entry}". Use "<camelCaseName>:string|number|boolean|date" with an optional trailing ? for nullability.`,
      );
    }
    const name = match[1]!;
    const type = match[2]! as ResourceFieldType;
    const optional = Boolean(match[3]);
    if (reservedFieldNames.has(name)) {
      throw new AddResourceError(
        `Field name "${name}" is reserved by the generated owner/timestamp shape.`,
      );
    }
    if (fields.some((field) => field.name === name)) {
      throw new AddResourceError(`Duplicate field name "${name}".`);
    }
    fields.push({ name, type, optional });
  }
  if (fields.length > maximumFields) {
    throw new AddResourceError(`At most ${maximumFields} fields are supported per resource.`);
  }
  return fields;
}

function requireAnchor(source: string, relativePath: string, pattern: RegExp, label: string): void {
  const globalPattern = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  const matches = [...source.matchAll(globalPattern)];
  if (matches.length !== 1) {
    throw new AddResourceError(
      `${relativePath} must contain exactly one ${label}; found ${matches.length}. The resource scaffold expects the stock generated shape and refuses to guess.`,
    );
  }
}

function prismaColumn(field: ResourceField): string {
  const column = field.type === "string"
    ? "String"
    : field.type === "number"
      ? "Float"
      : field.type === "boolean"
        ? "Boolean"
        : "DateTime";
  return `${field.name.padEnd(10)}${column}${field.optional ? "?" : ""}`;
}

function zodSchemaExpression(field: ResourceField): string {
  const base = field.type === "string"
    ? `z.string().trim().min(1, "${field.name} is required").max(2000)`
    : field.type === "number"
      ? "z.coerce.number().finite()"
      : field.type === "boolean"
        ? "z.boolean()"
        : "z.coerce.date()";
  return field.optional ? `${base}.nullish()` : base;
}

function contractFieldType(field: ResourceField): string {
  return field.type === "date" ? "string" : field.type;
}

function openApiPropertyFor(field: ResourceField): string {
  const base = field.type === "string"
    ? '{ type: "string" }'
    : field.type === "number"
      ? '{ type: "number" }'
      : field.type === "boolean"
        ? '{ type: "boolean" }'
        : '{ type: "string", format: "date-time" }';
  return field.optional ? `${base.slice(0, -1)}, nullable: true }` : base;
}

function openApiExampleValue(field: ResourceField): string {
  if (field.type === "number") return "1";
  if (field.type === "boolean") return "true";
  if (field.type === "date") return '"2026-01-01T00:00:00.000Z"';
  return `"${field.name} example"`;
}

function exampleRecord(fields: readonly ResourceField[]): string {
  return fields.map((field) => `${field.name}: ${openApiExampleValue(field)}`).join(", ");
}

function renderContractsBlock(name: string, fields: readonly ResourceField[]): string {
  const lower = camelName(name);
  const createLines = fields.map((field) => `  ${field.name}: ${zodSchemaExpression(field)},`);
  const typeLines = fields.map((field) =>
    field.optional
      ? `  ${field.name}?: ${contractFieldType(field)} | null;`
      : `  ${field.name}: ${contractFieldType(field)};`,
  );
  return [
    `// --- ${name} resource (added by create-authenik8-app add resource) ---`,
    `export const ${lower}CreateSchema = z.strictObject({`,
    ...createLines,
    "});",
    "",
    `export const ${lower}UpdateSchema = ${lower}CreateSchema.partial().refine(`,
    "  (value) => Object.keys(value).length > 0,",
    '  "Provide at least one field",',
    ");",
    "",
    `export type ${name}CreateInput = z.infer<typeof ${lower}CreateSchema>;`,
    `export type ${name}UpdateInput = z.infer<typeof ${lower}UpdateSchema>;`,
    "",
    `export type ${name} = {`,
    "  id: string;",
    ...typeLines,
    "  ownerId: string;",
    "  createdAt: string;",
    "  updatedAt: string;",
    "};",
    "",
  ].join("\n");
}

function renderPrismaModel(name: string, fields: readonly ResourceField[]): string {
  return [
    `model ${name} {`,
    "  id        String   @id @default(uuid())",
    ...fields.map((field) => `  ${prismaColumn(field)}`),
    "  ownerId   String",
    "  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)",
    "  createdAt DateTime @default(now())",
    "  updatedAt DateTime @updatedAt",
    "",
    "  @@index([ownerId, updatedAt])",
    "}",
  ].join("\n");
}

function renderPolicy(name: string): string {
  return [
    "type Actor = { userId: string; role: \"USER\" | \"ADMIN\" };",
    "type Resource = { ownerId: string };",
    "",
    `export function canRead${name}(actor: Actor, resource: Resource): boolean {`,
    "  return actor.role === \"ADMIN\" || resource.ownerId === actor.userId;",
    "}",
    "",
    `export function canWrite${name}(actor: Actor, resource: Resource): boolean {`,
    "  return actor.role === \"ADMIN\" || resource.ownerId === actor.userId;",
    "}",
    "",
    `export function ${camelName(name)}ListScope(actor: Actor) {`,
    "  return actor.role === \"ADMIN\" ? {} : { ownerId: actor.userId };",
    "}",
    "",
  ].join("\n");
}

function renderRepository(name: string): string {
  const lower = camelName(name);
  return [
    `import type { Prisma, ${name} } from "@prisma/client";`,
    'import { prisma } from "../../config/prisma.js";',
    "",
    `export const ${lower}Repository = {`,
    `  list(where: Prisma.${name}WhereInput): Promise<${name}[]> {`,
    `    return prisma.${lower}.findMany({ where, orderBy: { updatedAt: "desc" } });`,
    "  },",
    `  findById(id: string): Promise<${name} | null> {`,
    `    return prisma.${lower}.findUnique({ where: { id } });`,
    "  },",
    `  create(data: Prisma.${name}UncheckedCreateInput): Promise<${name}> {`,
    `    return prisma.${lower}.create({ data });`,
    "  },",
    `  update(id: string, data: Prisma.${name}UpdateInput): Promise<${name}> {`,
    `    return prisma.${lower}.update({ where: { id }, data });`,
    "  },",
    `  remove(id: string): Promise<${name}> {`,
    `    return prisma.${lower}.delete({ where: { id } });`,
    "  },",
    "};",
    "",
  ].join("\n");
}

function renderService(name: string): string {
  const lower = camelName(name);
  const repository = `${lower}Repository`;
  return [
    `import { ${lower}CreateSchema, ${lower}UpdateSchema } from "@authenik8/contracts";`,
    `import type { ${name} } from "@prisma/client";`,
    'import { AppError } from "../../utils/http.js";',
    `import { canRead${name}, canWrite${name}, ${lower}ListScope } from "./${lower}.policy.js";`,
    `import { ${repository} } from "./${lower}.repository.js";`,
    "",
    'type Actor = { userId: string; role: "USER" | "ADMIN" };',
    "",
    `function present(${lower}: ${name}) {`,
    `  return { ...${lower}, createdAt: ${lower}.createdAt.toISOString(), updatedAt: ${lower}.updatedAt.toISOString() };`,
    "}",
    "",
    `async function authorized${name}(actor: Actor, id: string, write = false) {`,
    `  const ${lower} = await ${repository}.findById(id);`,
    `  const allowed = ${lower} && (write ? canWrite${name}(actor, ${lower}) : canRead${name}(actor, ${lower}));`,
    `  if (!${lower} || !allowed) throw new AppError(404, "${name.toUpperCase()}_NOT_FOUND", "${name} not found");`,
    `  return ${lower};`,
    "}",
    "",
    `export async function list${name}s(actor: Actor) {`,
    `  return (await ${repository}.list(${lower}ListScope(actor))).map(present);`,
    "}",
    "",
    `export async function get${name}(actor: Actor, id: string) {`,
    `  return present(await authorized${name}(actor, id));`,
    "}",
    "",
    `export async function create${name}(actor: Actor, body: unknown) {`,
    `  const input = ${lower}CreateSchema.parse(body);`,
    `  return present(await ${repository}.create({ ...input, ownerId: actor.userId }));`,
    "}",
    "",
    `export async function update${name}(actor: Actor, id: string, body: unknown) {`,
    `  await authorized${name}(actor, id, true);`,
    `  return present(await ${repository}.update(id, ${lower}UpdateSchema.parse(body)));`,
    "}",
    "",
    `export async function delete${name}(actor: Actor, id: string) {`,
    `  await authorized${name}(actor, id, true);`,
    `  await ${repository}.remove(id);`,
    "}",
    "",
  ].join("\n");
}

function renderController(name: string): string {
  const lower = camelName(name);
  return [
    'import { asyncHandler } from "../../utils/http.js";',
    'import { identifierSchema } from "@authenik8/contracts";',
    `import { create${name}, delete${name}, get${name}, list${name}s, update${name} } from "./${lower}.service.js";`,
    "",
    'const actor = (user: NonNullable<Express.Request["user"]>) => ({ userId: user.userId, role: user.role });',
    "",
    `export const list${name}sController = asyncHandler(async (req, res) => {`,
    `  res.json({ ${lower}s: await list${name}s(actor(req.user!)) });`,
    "});",
    `export const get${name}Controller = asyncHandler(async (req, res) => {`,
    `  res.json({ ${lower}: await get${name}(actor(req.user!), identifierSchema.parse(req.params.id)) });`,
    "});",
    `export const create${name}Controller = asyncHandler(async (req, res) => {`,
    `  res.status(201).json({ ${lower}: await create${name}(actor(req.user!), req.body) });`,
    "});",
    `export const update${name}Controller = asyncHandler(async (req, res) => {`,
    `  res.json({ ${lower}: await update${name}(actor(req.user!), identifierSchema.parse(req.params.id), req.body) });`,
    "});",
    `export const delete${name}Controller = asyncHandler(async (req, res) => {`,
    `  await delete${name}(actor(req.user!), identifierSchema.parse(req.params.id));`,
    "  res.status(204).send();",
    "});",
    "",
  ].join("\n");
}

function renderRoutes(name: string): string {
  const lower = camelName(name);
  return [
    'import { Router } from "express";',
    'import { authenticate } from "../../middleware/authenticate.js";',
    'import { requireCsrf } from "../../middleware/csrf.js";',
    'import { requireAllowedOrigin } from "../../middleware/origin.js";',
    "import {",
    `  create${name}Controller,`,
    `  delete${name}Controller,`,
    `  get${name}Controller,`,
    `  list${name}sController,`,
    `  update${name}Controller,`,
    `} from "./${lower}.controller.js";`,
    "",
    `export const ${lower}Routes = Router();`,
    "// authenik8-core's global Redis-backed limiter runs before this router.",
    "// codeql[js/missing-rate-limiting]",
    `${lower}Routes.use(authenticate);`,
    `${lower}Routes.get("/", list${name}sController);`,
    `${lower}Routes.post("/", requireAllowedOrigin, requireCsrf, create${name}Controller);`,
    `${lower}Routes.get("/:id", get${name}Controller);`,
    `${lower}Routes.patch("/:id", requireAllowedOrigin, requireCsrf, update${name}Controller);`,
    `${lower}Routes.delete("/:id", requireAllowedOrigin, requireCsrf, delete${name}Controller);`,
    "",
  ].join("\n");
}

function renderOpenApiComponents(name: string, fields: readonly ResourceField[]): string {
  const lower = camelName(name);
  const plural = `${lower}s`;
  const requiredEntries = [
    "id",
    ...fields.filter((field) => !field.optional).map((field) => field.name),
    "ownerId",
    "createdAt",
    "updatedAt",
  ].map((entry) => JSON.stringify(entry)).join(", ");
  const propertyLines = [
    '          id: { type: "string", format: "uuid" },',
    ...fields.map((field) => `          ${field.name}: ${openApiPropertyFor(field)},`),
    '          ownerId: { type: "string", format: "uuid" },',
    '          createdAt: { type: "string", format: "date-time" },',
    '          updatedAt: { type: "string", format: "date-time" },',
  ];
  const exampleId = "0cbb641e-37e7-4452-a907-b5664e41fc79";
  const exampleOwner = "760e21f4-48f0-4d0a-9af5-292ef6ac7e55";
  return [
    `      ${name}: {`,
    '        type: "object",',
    `        required: [${requiredEntries}],`,
    `        example: { ${exampleRecord(fields)}, id: "${exampleId}", ownerId: "${exampleOwner}", createdAt: "2026-07-29T09:00:00.000Z", updatedAt: "2026-07-29T09:15:00.000Z" },`,
    '        properties: {',
    ...propertyLines,
    "        },",
    "      },",
    `      ${name}Response: {`,
    '        type: "object",',
    `        required: ["${lower}"],`,
    `        properties: { ${lower}: ref("${name}") },`,
    "      },",
    `      ${name}List: {`,
    '        type: "object",',
    `        required: ["${plural}"],`,
    `        properties: { ${plural}: { type: "array", items: ref("${name}") } },`,
    "      },",
    `      ${name}CreateInput: inputSchemaWithExample(${lower}CreateSchema, {`,
    `        ${exampleRecord(fields)},`,
    `      }, [${fields.filter((field) => !field.optional).map((field) => JSON.stringify(field.name)).join(", ")}]),`,
    `      ${name}UpdateInput: inputSchemaWithExample(${lower}UpdateSchema, {`,
    `        ${exampleRecord(fields)},`,
    "      }),",
    "",
  ].join("\n");
}

function renderOpenApiPaths(name: string): string {
  const lower = camelName(name);
  const plural = `${lower}s`;
  return [
    `    "/api/${plural}": {`,
    "      get: {",
    `        operationId: "list${name}s",`,
    `        tags: ["${plural}"],`,
    `        summary: "List authorized ${plural}",`,
    '        "x-authenik8-requires-active-session": true,',
    "        security: bearerSecurity,",
    "        responses: {",
    "          ...authenticatedErrors,",
    `          "200": jsonResponse("${name} list", ref("${name}List")),`,
    "        },",
    "      },",
    "      post: {",
    `        operationId: "create${name}",`,
    `        tags: ["${plural}"],`,
    `        summary: "Create an owned ${lower}",`,
    '        "x-authenik8-requires-active-session": true,',
    '        "x-authenik8-credentials": "include",',
    "        security: protectedMutationSecurity,",
    `        requestBody: requestBody("${name}CreateInput"),`,
    "        responses: {",
    "          ...protectedMutationErrors,",
    `          "201": jsonResponse("${name} created", ref("${name}Response")),`,
    '          "422": errorResponse("Validation error"),',
    "        },",
    "      },",
    "    },",
    `    "/api/${plural}/{id}": {`,
    "      parameters: [idParameter],",
    "      get: {",
    `        operationId: "get${name}",`,
    `        tags: ["${plural}"],`,
    `        summary: "Read an authorized ${lower}",`,
    '        "x-authenik8-requires-active-session": true,',
    "        security: bearerSecurity,",
    "        responses: {",
    "          ...authenticatedErrors,",
    `          "200": jsonResponse("${name}", ref("${name}Response")),`,
    '          "404": errorResponse("Not found or not authorized"),',
    `          "422": errorResponse("Malformed ${lower} identifier"),`,
    "        },",
    "      },",
    "      patch: {",
    `        operationId: "update${name}",`,
    `        tags: ["${plural}"],`,
    `        summary: "Update an authorized ${lower}",`,
    '        "x-authenik8-requires-active-session": true,',
    '        "x-authenik8-credentials": "include",',
    "        security: protectedMutationSecurity,",
    `        requestBody: requestBody("${name}UpdateInput"),`,
    "        responses: {",
    "          ...protectedMutationErrors,",
    `          "200": jsonResponse("${name} updated", ref("${name}Response")),`,
    '          "404": errorResponse("Not found or not authorized"),',
    '          "422": errorResponse("Validation error"),',
    "        },",
    "      },",
    "      delete: {",
    `        operationId: "delete${name}",`,
    `        tags: ["${plural}"],`,
    `        summary: "Delete an authorized ${lower}",`,
    '        "x-authenik8-requires-active-session": true,',
    '        "x-authenik8-credentials": "include",',
    "        security: protectedMutationSecurity,",
    "        responses: {",
    "          ...protectedMutationErrors,",
    `          "204": { description: "${name} deleted" },`,
    '          "404": errorResponse("Not found or not authorized"),',
    `          "422": errorResponse("Malformed ${lower} identifier"),`,
    "        },",
    "      },",
    "    },",
    "",
  ].join("\n");
}

function renderClientGroup(name: string): string {
  const lower = camelName(name);
  const plural = `${lower}s`;
  return [
    `  const ${plural} = {`,
    `    list: () => request<{ ${plural}: ${name}[] }>("/${plural}"),`,
    `    get: (id: string) => request<{ ${lower}: ${name} }>(\`/${plural}/\${encodeURIComponent(id)}\`),`,
    `    create: (input: ${name}CreateInput) =>`,
    `      request<{ ${lower}: ${name} }>("/${plural}", { method: "POST", body: json(input) }),`,
    `    update: (id: string, input: ${name}UpdateInput) =>`,
    `      request<{ ${lower}: ${name} }>(\`/${plural}/\${encodeURIComponent(id)}\`, {`,
    '        method: "PATCH",',
    "        body: json(input),",
    "      }),",
    "    remove: (id: string) =>",
    `      request<void>(\`/${plural}/\${encodeURIComponent(id)}\`, { method: "DELETE" }),`,
    "  };",
    "",
  ].join("\n");
}

/**
 * Plans the full API-side scaffold for one scalar-field CRUD resource on a
 * generated fullstack project: module files, Prisma model plus owner relation,
 * shared contracts, OpenAPI source additions, and typed-client additions.
 * The React reference app and generated tests are intentionally deferred.
 */
export async function planResource(
  context: AddContext,
  request: ResourceRequest,
): Promise<PlannedFileChange[]> {
  const name = parseResourceName(request.name);
  const lower = camelName(name);
  const plural = `${lower}s`;
  const changes: PlannedFileChange[] = [];
  const addChange = (relativePath: string, before: string | null, after: string): void => {
    if (before !== after) changes.push({ relativePath, before, after });
  };
  const requireFile = (relativePath: string): Promise<string> =>
    fs.readFile(path.join(context.rootDir, relativePath), "utf8").catch(() => {
      throw new AddResourceError(
        `Required generated file is missing: ${relativePath}. The resource scaffold currently supports fullstack projects only.`,
      );
    });

  if (context.manifest.preset !== "fullstack") {
    throw new AddResourceError(
      "Resource scaffolding currently supports fullstack projects only.",
    );
  }
  if (request.fields.length === 0) {
    throw new AddResourceError(
      "At least one field is required; example: --fields \"amount:number\".",
    );
  }
  const fields = request.fields;

  const schemaRelative = "apps/api/prisma/schema.prisma";
  const schema = await requireFile(schemaRelative);
  requireAnchor(schema, schemaRelative, /^(\s*)projects[ \t]+Project\[\]$/gm, "User projects relation line");

  const appRelative = "apps/api/src/app.ts";
  const appSource = await requireFile(appRelative);
  requireAnchor(
    appSource,
    appRelative,
    /^import \{ projectRoutes \} from "\.\/modules\/projects\/project\.routes\.js";$/m,
    "project routes import",
  );
  requireAnchor(
    appSource,
    appRelative,
    /^ {2}app\.use\("\/api\/projects", projectRoutes\);$/m,
    "project routes mount",
  );

  const contractsRelative = "packages/contracts/src/index.ts";
  const contracts = await requireFile(contractsRelative);
  if (!contracts.includes(`export const ${lower}CreateSchema`)) {
    addChange(contractsRelative, contracts, `${contracts}\n${renderContractsBlock(name, fields)}`);
  }

  const openApiRelative = "apps/api/src/openapi.ts";
  const openApi = await requireFile(openApiRelative);
  requireAnchor(openApi, openApiRelative, /^  loginSchema,$/m, "contracts import anchor");
  requireAnchor(openApi, openApiRelative, /\{ name: "Projects"/, "Projects tag anchor");
  requireAnchor(openApi, openApiRelative, /^      Session: \{$/m, "components anchor");
  requireAnchor(openApi, openApiRelative, /^      AdminUserUpdateInput: inputSchemaWithExample\(/m, "input schema anchor");
  requireAnchor(openApi, openApiRelative, /^ {4}"\/api\/admin\/users": \{$/m, "paths anchor");
  if (!new RegExp(`"/api/${plural}": \\{`).test(openApi)) {
    const openApiAfter = openApi
      .replace(/^  loginSchema,$/m, `  ${lower}CreateSchema,\n  ${lower}UpdateSchema,\n  loginSchema,`)
      .replace(
        /^(\s*\{ name: "Projects"[^\n]*\},)$/m,
        `$1\n    { name: "${plural}", description: "Application resource scaffolded by Authenik8. Every operation is authorized on the backend." },`,
      )
      .replace(
        /^      Session: \{$/m,
        `${renderOpenApiComponents(name, fields)}      Session: {`,
      )
      .replace(
        /^ {4}"\/api\/admin\/users": \{$/m,
        `${renderOpenApiPaths(name)}    "/api/admin/users": {`,
      );
    addChange(openApiRelative, openApi, openApiAfter);
  }

  const clientRelative = "packages/api-client/src/index.ts";
  const client = await requireFile(clientRelative);
  requireAnchor(client, clientRelative, /^  Page,$/m, "contract type import anchor");
  requireAnchor(client, clientRelative, /^ {2}const projects = \{$/m, "project group anchor");
  requireAnchor(client, clientRelative, /^ {4}projects,$/m, "client composition anchor");
  requireAnchor(
    client,
    clientRelative,
    /^export const projectApi = defaultClient\.projects;$/m,
    "project alias anchor",
  );
  if (!new RegExp(`^ {2}const ${plural} = \\{$`, "m").test(client)) {
    const clientAfter = client
      .replace(/^  Page,$/m, `  ${name},\n  ${name}CreateInput,\n  ${name}UpdateInput,\n  Page,`)
      .replace(
        /^ {2}const projects = \{$/m,
        `${renderClientGroup(name)}  const projects = {`,
      )
      .replace(/^ {4}projects,$/m, `    projects,\n    ${plural},`)
      .replace(
        /^export const projectApi = defaultClient\.projects;$/m,
        `export const projectApi = defaultClient.projects;\nexport const ${lower}Api = defaultClient.${plural};`,
      );
    addChange(clientRelative, client, clientAfter);
  }

  const appAfter = (() => {
    if (appSource.includes(`./modules/${plural}/${lower}.routes.js`)) return appSource;
    return appSource
      .replace(
        'import { projectRoutes } from "./modules/projects/project.routes.js";',
        `import { projectRoutes } from "./modules/projects/project.routes.js";\nimport { ${lower}Routes } from "./modules/${plural}/${lower}.routes.js";`,
      )
      .replace(
        'app.use("/api/projects", projectRoutes);',
        `app.use("/api/projects", projectRoutes);\n  app.use("/api/${plural}", ${lower}Routes);`,
      );
  })();
  addChange(appRelative, appSource, appAfter);

  const hasModel = new RegExp(`^model ${name} \\{`, "m").test(schema);
  const hasRelation = new RegExp(`^[ \t]*${plural}[ \t]+${name}\\[\\]`, "m").test(schema);
  if (hasModel !== hasRelation) {
    throw new AddResourceError(
      `${schemaRelative} contains a partial ${name} scaffold (a model without the projects relation or vice versa); refusing to guess.`,
    );
  }
  if (!hasModel) {
    const withRelation = schema.replace(
      /^([ \t]*)projects[ \t]+Project\[\]/m,
      (line, indent) => `${line}\n${indent}${plural.padEnd(18)}${name}[]`,
    );
    if (withRelation === schema) {
      throw new AddResourceError(
        `${schemaRelative} relation anchor could not be rewritten; refusing to guess.`,
      );
    }
    addChange(schemaRelative, schema, appendUnlessPresent(withRelation, `model ${name} {`, renderPrismaModel(name, fields)));
  } else {
    addChange(schemaRelative, schema, schema);
  }

  const modulePrefix = `apps/api/src/modules/${plural}/${lower}`;
  const moduleFiles: readonly [string, string][] = [
    [`${modulePrefix}.policy.ts`, renderPolicy(name)],
    [`${modulePrefix}.repository.ts`, renderRepository(name)],
    [`${modulePrefix}.service.ts`, renderService(name)],
    [`${modulePrefix}.controller.ts`, renderController(name)],
    [`${modulePrefix}.routes.ts`, renderRoutes(name)],
  ];
  const moduleDir = path.join(context.rootDir, "apps", "api", "src", "modules", plural);
  if (await fs.pathExists(moduleDir)) {
    for (const [relativePath, content] of moduleFiles) {
      const existing = await fs.readFile(path.join(context.rootDir, relativePath), "utf8").catch(() => null);
      if (existing !== content) {
        throw new AddResourceError(
          `apps/api/src/modules/${plural} already exists with different content; refusing to guess whether it is this resource.`,
        );
      }
    }
  } else {
    for (const [relativePath, content] of moduleFiles) {
      addChange(relativePath, null, content);
    }
  }

  return changes;
}

function appendUnlessPresent(source: string, marker: string, block: string): string {
  if (source.includes(marker)) return source;
  return `${source.endsWith("\n") ? source : `${source}\n`}\n${block}\n`;
}
