import path from "node:path";
import fs from "fs-extra";

import type { AddContext, PlannedFileChange } from "./types.js";

export class AddResourceError extends Error {}

export type ResourceFieldType = "string" | "number" | "boolean" | "date" | "enum";

export type ResourceField = {
  name: string;
  type: ResourceFieldType;
  optional: boolean;
  /** SCREAMING_SNAKE values, set only for enum fields. */
  values?: readonly string[];
};

export type ResourceRequest = {
  name: string;
  fields: readonly ResourceField[];
  withTests: boolean;
  withCrudUi: boolean;
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
 * Splits a field spec on top-level commas only; commas inside enum(...) must
 * not split fields, and unbalanced parentheses are refused.
 */
function splitTopLevel(spec: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of spec) {
    if (character === "(") {
      depth += 1;
      current += character;
    } else if (character === ")") {
      depth -= 1;
      if (depth < 0) {
        throw new AddResourceError(`Unbalanced ")" in --fields: "${spec}".`);
      }
      current += character;
    } else if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (depth !== 0) {
    throw new AddResourceError(`Unbalanced "(" in --fields: "${spec}".`);
  }
  parts.push(current);
  return parts;
}

const enumValuePattern = /^[A-Z][A-Z0-9_]{0,29}$/;

function parseEnumValues(typeSpec: string): string[] {
  const inner = typeSpec.slice("enum(".length, -1);
  const values = inner.split(",").map((value) => value.trim());
  if (values.some((value) => !enumValuePattern.test(value))) {
    throw new AddResourceError(
      `Enum values in "${typeSpec}" must be SCREAMING_SNAKE identifiers (example: enum(DRAFT,ACTIVE)).`,
    );
  }
  if (new Set(values).size !== values.length) {
    throw new AddResourceError(`Duplicate enum values in "${typeSpec}".`);
  }
  return values;
}

const scalarFieldTypes = new Set(["string", "number", "boolean", "date"]);

/**
 * Parses a comma-separated field list such as "amount:number,status:enum(DRAFT,ACTIVE)".
 * Supported types: string, number, boolean, date, and enum(values). A trailing
 * ? marks the column nullable and the contract input optional. Field names and
 * enum values are validated strictly before any code is generated.
 */
export function parseResourceFields(spec: string): ResourceField[] {
  if (!spec || !spec.trim()) {
    throw new AddResourceError(
      '--fields is required for resource recipes; example: --fields "amount:number,dueAt:date?"',
    );
  }
  const fields: ResourceField[] = [];
  for (const part of splitTopLevel(spec)) {
    const entry = part.trim();
    if (!entry) {
      throw new AddResourceError(`Empty --fields entry in "${spec}".`);
    }
    const colon = entry.indexOf(":");
    const name = colon === -1 ? "" : entry.slice(0, colon);
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/.test(name)) {
      throw new AddResourceError(
        `Invalid field spec "${entry}". Use "<camelCaseName>:string|number|boolean|date|enum(VALUES)" with an optional trailing ? for nullability.`,
      );
    }
    let typeSpec = entry.slice(colon + 1).trim();
    let optional = false;
    if (typeSpec.endsWith("?")) {
      optional = true;
      typeSpec = typeSpec.slice(0, -1).trim();
    }
    let field: ResourceField;
    if (typeSpec.startsWith("enum(")) {
      if (!typeSpec.endsWith(")")) {
        throw new AddResourceError(
          `Enum field "${name}" must close its value list: ${name}:enum(VALUE,VALUE).`,
        );
      }
      field = { name, type: "enum", optional, values: parseEnumValues(typeSpec) };
    } else if (scalarFieldTypes.has(typeSpec)) {
      field = { name, type: typeSpec as ResourceFieldType, optional };
    } else {
      throw new AddResourceError(
        `Invalid field spec "${entry}". Use "<camelCaseName>:string|number|boolean|date|enum(VALUES)" with an optional trailing ? for nullability.`,
      );
    }
    if (reservedFieldNames.has(name)) {
      throw new AddResourceError(
        `Field name "${name}" is reserved by the generated owner/timestamp shape.`,
      );
    }
    if (fields.some((field) => field.name === name)) {
      throw new AddResourceError(`Duplicate field name "${name}".`);
    }
    fields.push(field);
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

function pascalName(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Prisma enum type and contract type name for an enum field, e.g. InvoiceStatus. */
export function enumTypeName(resourceName: string, field: ResourceField): string {
  return `${resourceName}${pascalName(field.name)}`;
}

function prismaColumn(resource: string, field: ResourceField): string {
  const column = field.type === "string"
    ? "String"
    : field.type === "number"
      ? "Float"
      : field.type === "boolean"
        ? "Boolean"
        : field.type === "enum"
          ? enumTypeName(resource, field)
          : "DateTime";
  return `${field.name.padEnd(10)}${column}${field.optional ? "?" : ""}`;
}

function zodSchemaExpression(field: ResourceField, lower: string): string {
  const base = field.type === "string"
    ? `z.string().trim().min(1, "${field.name} is required").max(2000)`
    : field.type === "number"
      ? "z.coerce.number().finite()"
      : field.type === "boolean"
        ? "z.boolean()"
        : field.type === "enum"
          ? `${lower}${pascalName(field.name)}Schema`
          : "z.coerce.date()";
  return field.optional ? `${base}.nullish()` : base;
}

function contractFieldType(resource: string, field: ResourceField): string {
  if (field.type === "date") return "string";
  if (field.type === "enum") return enumTypeName(resource, field);
  return field.type;
}

function openApiPropertyFor(field: ResourceField): string {
  const base = field.type === "string"
    ? '{ type: "string" }'
    : field.type === "number"
      ? '{ type: "number" }'
      : field.type === "boolean"
        ? '{ type: "boolean" }'
        : field.type === "enum"
          ? `{ type: "string", enum: [${field.values!.map((value) => JSON.stringify(value)).join(", ")}] }`
          : '{ type: "string", format: "date-time" }';
  return field.optional ? `${base.slice(0, -1)}, nullable: true }` : base;
}

function openApiExampleValue(field: ResourceField): string {
  if (field.type === "number") return "1";
  if (field.type === "boolean") return "true";
  if (field.type === "date") return '"2026-01-01T00:00:00.000Z"';
  if (field.type === "enum") return JSON.stringify(field.values![0]);
  return `"${field.name} example"`;
}

function exampleRecord(fields: readonly ResourceField[]): string {
  return fields.map((field) => `${field.name}: ${openApiExampleValue(field)}`).join(", ");
}

function renderContractsBlock(name: string, fields: readonly ResourceField[]): string {
  const lower = camelName(name);
  const enumLines = fields.filter((field) => field.type === "enum").flatMap((field) => [
    `export const ${lower}${pascalName(field.name)}Schema = z.enum([${field.values!.map((value) => JSON.stringify(value)).join(", ")}]);`,
    `export type ${enumTypeName(name, field)} = z.infer<typeof ${lower}${pascalName(field.name)}Schema>;`,
    "",
  ]);
  const createLines = fields.map((field) => `  ${field.name}: ${zodSchemaExpression(field, lower)},`);
  const typeLines = fields.map((field) =>
    field.optional
      ? `  ${field.name}?: ${contractFieldType(name, field)} | null;`
      : `  ${field.name}: ${contractFieldType(name, field)};`,
  );
  return [
    `// --- ${name} resource (added by create-authenik8-app add resource) ---`,
    ...enumLines,
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
    ...fields.map((field) => `  ${prismaColumn(name, field)}`),
    "  ownerId   String",
    "  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)",
    "  createdAt DateTime @default(now())",
    "  updatedAt DateTime @updatedAt",
    "",
    "  @@index([ownerId, updatedAt])",
    "}",
  ].join("\n");
}

function renderPrismaEnumBlocks(name: string, fields: readonly ResourceField[]): string[] {
  return fields.filter((field) => field.type === "enum").map((field) =>
    [
      `enum ${enumTypeName(name, field)} {`,
      ...field.values!.map((value) => `  ${value}`),
      "}",
    ].join("\n"),
  );
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

function renderPolicyTest(name: string): string {
  const lower = camelName(name);
  return [
    'import { describe, expect, it } from "vitest";',
    `import { canRead${name}, canWrite${name}, ${lower}ListScope } from "../src/modules/${lower}s/${lower}.policy.js";`,
    "",
    `describe("${name} ownership policy", () => {`,
    '  const owner = { userId: "user-1", role: "USER" as const };',
    '  const stranger = { userId: "user-2", role: "USER" as const };',
    '  const admin = { userId: "admin-1", role: "ADMIN" as const };',
    `  const ${lower} = { ownerId: "user-1" };`,
    "",
    '  it("allows the owner to read and write", () => {',
    `    expect(canRead${name}(owner, ${lower})).toBe(true);`,
    `    expect(canWrite${name}(owner, ${lower})).toBe(true);`,
    "  });",
    "",
    '  it("rejects another normal user", () => {',
    `    expect(canRead${name}(stranger, ${lower})).toBe(false);`,
    `    expect(canWrite${name}(stranger, ${lower})).toBe(false);`,
    `    expect(${lower}ListScope(stranger)).toEqual({ ownerId: "user-2" });`,
    "  });",
    "",
    '  it("allows an administrator through the explicit policy", () => {',
    `    expect(canRead${name}(admin, ${lower})).toBe(true);`,
    `    expect(canWrite${name}(admin, ${lower})).toBe(true);`,
    `    expect(${lower}ListScope(admin)).toEqual({});`,
    "  });",
    "});",
    "",
  ].join("\n");
}

/**
 * Deterministic human label for a camelCase field or SCREAMING_SNAKE enum
 * value: "dueAt" -> "Due at", "IN_PROGRESS" -> "In progress". Mirrors the
 * label casing used across the included reference app.
 */
function humanizeLabel(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return value;
  const first = words[0]!;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(" ");
}

/**
 * JSX expression rendering one field value for a record variable (used in
 * list cells and detail meta). Optional fields degrade to "-".
 */
function renderFieldValue(field: ResourceField, record: string): string {
  const value = `${record}.${field.name}`;
  switch (field.type) {
    case "string":
      return field.optional ? `{${value} ?? "-"}` : `{${value}}`;
    case "number":
      return field.optional ? `{${value} ?? "-"}` : `{${value}}`;
    case "boolean":
      return field.optional
        ? `{${value} ? "Yes" : ${value} === false ? "No" : "-"}`
        : `{${value} ? "Yes" : "No"}`;
    case "date":
      return field.optional
        ? `{${value} ? formatDate(${value}) : "-"}`
        : `{formatDate(${value})}`;
    case "enum":
      return field.optional
        ? `{${value} ? <Badge>{${value}}</Badge> : "-"}`
        : `<Badge>{${value}}</Badge>`;
  }
}

function renderFormField(name: string, field: ResourceField, id: string): string {
  const label = humanizeLabel(field.name);
  const change = (assignment: string) => `onChange={(event) => setForm({ ...form, ${assignment} })}`;
  switch (field.type) {
    case "string":
      return `        <Field label="${label}" htmlFor="${id}"><Input id="${id}" value={form.${field.name}} ${change(`${field.name}: event.target.value`)}${field.optional ? "" : " required"} maxLength={2000} /></Field>`;
    case "number":
      return `        <Field label="${label}" htmlFor="${id}"><input id="${id}" className="input" type="number" step="any" value={form.${field.name}} ${change(`${field.name}: event.target.value`)}${field.optional ? "" : " required"} /></Field>`;
    case "date":
      return `        <Field label="${label}" htmlFor="${id}"><input id="${id}" className="input" type="date" value={form.${field.name}} ${change(`${field.name}: event.target.value`)}${field.optional ? "" : " required"} /></Field>`;
    case "boolean": {
      if (!field.optional) {
        return `        <Field label="${label}" htmlFor="${id}"><input id="${id}" type="checkbox" checked={form.${field.name}} ${change(`${field.name}: event.target.checked`)} /></Field>`;
      }
      return `        <Field label="${label}" htmlFor="${id}"><select id="${id}" className="input" value={form.${field.name}} ${change(`${field.name}: event.target.value`)}><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></select></Field>`;
    }
    case "enum": {
      const options = field.values!.map((value) => `<option value="${value}">${humanizeLabel(value)}</option>`).join("");
      const leading = field.optional ? `<option value="">Not set</option>` : "";
      return `        <Field label="${label}" htmlFor="${id}"><select id="${id}" className="input" value={form.${field.name}} ${change(`${field.name}: event.target.value as ${enumTypeName(name, field)}`)}>${leading}${options}</select></Field>`;
    }
  }
}

function renderFormState(
  name: string,
  fields: readonly ResourceField[],
): { typeLines: string[]; initLines: string[]; digestLines: string[]; payloadLines: string[] } {
  const typeLines = fields.map((field) => {
    if (field.type === "boolean") return `    ${field.name}: ${field.optional ? "string" : "boolean"};`;
    if (field.type === "enum" && !field.optional) return `    ${field.name}: ${enumTypeName(name, field)};`;
    return `    ${field.name}: string;`;
  });
  const initLines = fields.map((field) => {
    if (field.type === "boolean" && !field.optional) return `    ${field.name}: false,`;
    if (field.type === "enum" && !field.optional) return `    ${field.name}: "${field.values![0]}",`;
    return `    ${field.name}: "",`;
  });
  const payloadLines = fields.map((field) => {
    const formValue = `form.${field.name}`;
    if (field.type === "string") {
      return `    ${field.name}: form.${field.name}${field.optional ? " || undefined" : ""},`;
    }
    if (field.type === "number") {
      return field.optional
        ? `    ${field.name}: ${formValue} === "" ? undefined : Number(${formValue}),`
        : `    ${field.name}: Number(${formValue}),`;
    }
    if (field.type === "boolean") {
      return field.optional
        ? `    ${field.name}: ${formValue} === "" ? undefined : ${formValue} === "true",`
        : `    ${field.name}: ${formValue},`;
    }
    if (field.type === "date") {
      return field.optional
        ? `    ${field.name}: ${formValue} === "" ? undefined : new Date(${formValue}),`
        : `    ${field.name}: new Date(${formValue}),`;
    }
    if (field.optional) {
      return `    ${field.name}: ${formValue} === "" ? undefined : (${formValue} as ${enumTypeName(name, field)}),`;
    }
    return `    ${field.name}: ${formValue},`;
  });
  const digestSetLines = fields.map((field) => {
    if (field.type === "number") {
      return field.optional
        ? `      ${field.name}: ${field.name} === null || ${field.name} === undefined ? "" : String(${field.name}),`
        : `      ${field.name}: String(${field.name}),`;
    }
    if (field.type === "boolean") {
      return !field.optional
        ? `      ${field.name},`
        : `      ${field.name}: ${field.name} === null || ${field.name} === undefined ? "" : String(${field.name}),`;
    }
    if (field.type === "date") {
      return field.optional
        ? `      ${field.name}: ${field.name}?.slice(0, 10) ?? "",`
        : `      ${field.name}: ${field.name}.slice(0, 10),`;
    }
    if (field.optional) return `      ${field.name}: ${field.name} ?? "",`;
    return `      ${field.name},`;
  });
  return { typeLines, initLines, digestLines: digestSetLines, payloadLines };
}

/**
 * Renders the web feature file for a scaffolded resource: list, create/edit
 * form, and detail pages mirroring the included projects screens, driven by
 * the typed client generated for the resource.
 */
function renderCrudUiPages(name: string, fields: readonly ResourceField[]): string {
  const lower = camelName(name);
  const plural = `${lower}s`;
  const pluralCap = pascalName(plural);
  const stringFields = fields.filter((field) => field.type === "string");
  const enumFields = fields.filter((field) => field.type === "enum");
  const titleField = stringFields.find((field) => !field.optional) ?? stringFields[0];
  const subtitleField = stringFields.filter((field) => field !== titleField)[0];
  const listFields = fields.filter((field) => field !== titleField && field !== subtitleField);

  const uiImports = [...new Set([...(enumFields.length ? ["Badge"] : []), "Button", "EmptyState", ...(titleField ? ["Input"] : []), "Spinner"])]
    .sort()
    .join(", ");
  const typeImport = enumFields.length
    ? `import type { ${enumFields.map((field) => enumTypeName(name, field)).join(", ")} } from "@authenik8/contracts";`
    : null;

  const primaryCell = titleField
    ? `<td><Link className="table-link" to={\`/${plural}/\${${lower}.id}\`}>{${lower}.${titleField.name}}</Link>${subtitleField ? `<small className="table-subtitle">{${lower}.${subtitleField.name} || "Not provided"}</small>` : ""}</td>`
    : `<td><Link className="table-link" to={\`/${plural}/\${${lower}.id}\`}>{${lower}.id}</Link></td>`;
  const editAria = titleField
    ? "aria-label={`Edit ${" + lower + "." + titleField.name + "}`}"
    : `aria-label="Edit ${lower}"`;
  const headerTitle = titleField ? `{${lower}.${titleField.name}}` : `{${lower}.id}`;

  const state = renderFormState(name, fields);

  const detailMain = subtitleField
    ? `        <div className="detail-main"><p className="detail-label">${humanizeLabel(subtitleField.name)}</p><p>{${lower}.${subtitleField.name} || "Not provided."}</p></div>\n`
    : "";
  const metaDivs = listFields
    .map((field) => `<div><dt>${humanizeLabel(field.name)}</dt><dd>${renderFieldValue(field, lower)}</dd></div>`)
    .join("");

  return [
    'import { useEffect, useState, type FormEvent } from "react";',
    'import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";',
    'import { ArrowLeft, Edit3, Plus, Save, Table, Trash2 } from "lucide-react";',
    'import { Link, useNavigate, useParams } from "react-router";',
    `import { ${uiImports} } from "@authenik8/ui";`,
    `import { ${lower}Api } from "../../lib/authenik8";`,
    ...(typeImport ? [typeImport] : []),
    'import { ErrorNotice, Field, PageHeader } from "../../components/Page";',
    "",
    `export function ${pluralCap}Page() {`,
    `  const query = useQuery({ queryKey: ["${plural}"], queryFn: ${lower}Api.list });`,
    "  return (",
    "    <>",
    `      <PageHeader title="${pluralCap}" description="Owned ${plural} in this workspace." action={<Link className="button button-primary" to="/${plural}/new"><Plus size={17} /> New ${lower}</Link>} />`,
    "      <section className=\"panel\">",
    `        {query.isPending ? <div className="panel-loading"><Spinner /></div> : query.error ? <ErrorNotice error={query.error} /> : query.data!.${plural}.length === 0 ? (`,
    `          <EmptyState icon={<Table />} title="No ${plural} found" action={<Link className="button button-primary" to="/${plural}/new">Create ${lower}</Link>}>${pluralCap} you create will appear here.</EmptyState>`,
    `        ) : <div className="table-wrap"><table><thead><tr><th>${titleField ? humanizeLabel(titleField.name) : "ID"}</th>${listFields.map((field) => `<th>${humanizeLabel(field.name)}</th>`).join("")}<th>Created</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>`,
    `          {query.data!.${plural}.map((${lower}) => <tr key={${lower}.id}>${primaryCell}${listFields.map((field) => `<td>${renderFieldValue(field, lower)}</td>`).join("")}<td>{formatDate(${lower}.createdAt)}</td><td>{formatDate(${lower}.updatedAt)}</td><td><Link className="icon-link" to={\`/${plural}/\${${lower}.id}/edit\`} ${editAria} title="Edit ${lower}"><Edit3 size={17} /></Link></td></tr>)}`,
    "        </tbody></table></div>}",
    "      </section>",
    "    </>",
    "  );",
    "}",
    "",
    `export function ${name}FormPage() {`,
    "  const { id } = useParams();",
    "  const edit = Boolean(id);",
    "  const navigate = useNavigate();",
    "  const client = useQueryClient();",
    `  const ${lower} = useQuery({ queryKey: ["${lower}", id], queryFn: () => ${lower}Api.get(id!), enabled: edit });`,
    `  const [form, setForm] = useState<{`,
    state.typeLines.join("\n"),
    "  }>({",
    state.initLines.join("\n"),
    "  });",
    "  useEffect(() => {",
    `    if (!${lower}.data) return;`,
    `    const { ${fields.map((field) => field.name).join(", ")} } = ${lower}.data.${lower};`,
    "    setForm({",
    state.digestLines.join("\n"),
    "    });",
    `  }, [${lower}.data]);`,
    "  const payload = {",
    state.payloadLines.join("\n"),
    "  };",
    "  const mutation = useMutation({",
    `    mutationFn: () => edit ? ${lower}Api.update(id!, payload) : ${lower}Api.create(payload),`,
    "    onSuccess: async ({" + ` ${lower}: saved ` + "}) => {",
    `      await client.invalidateQueries({ queryKey: ["${plural}"] });`,
    "      navigate(`/" + plural + "/${saved.id}`);",
    "    },",
    "  });",
    "  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }",
    `  if (edit && ${lower}.isPending) return <div className="screen-loader"><Spinner /></div>;`,
    "  return (",
    "    <>",
    `      <PageHeader title={edit ? "Edit ${lower}" : "Create ${lower}"} description="Define the ${lower} details." />`,
    '      <form className="form-panel" onSubmit={submit}>',
    "        {mutation.error && <ErrorNotice error={mutation.error} />}",
    ...fields.map((field) => renderFormField(name, field, field.name)),
    `        <div className="form-actions"><Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save size={17} /> {mutation.isPending ? "Saving..." : "Save ${lower}"}</Button></div>`,
    "      </form>",
    "    </>",
    "  );",
    "}",
    "",
    `export function ${name}DetailPage() {`,
    "  const { id } = useParams();",
    "  const navigate = useNavigate();",
    "  const client = useQueryClient();",
    `  const query = useQuery({ queryKey: ["${lower}", id], queryFn: () => ${lower}Api.get(id!) });`,
    `  const remove = useMutation({ mutationFn: () => ${lower}Api.remove(id!), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["${plural}"] }); navigate("/${plural}"); } });`,
    "  if (query.isPending) return <div className=\"screen-loader\"><Spinner /></div>;",
    "  if (query.error) return <ErrorNotice error={query.error} />;",
    `  const ${lower} = query.data!.${lower};`,
    "  return (",
    "    <>",
    `      <Link className="back-link" to="/${plural}"><ArrowLeft size={15} /> ${pluralCap}</Link>`,
    '      <PageHeader title=' + headerTitle
    + " description={`Created ${formatDate(" + lower + ".createdAt)}`}"
    + ' action={<div className="action-row"><Link className="button button-secondary" to={`/' + plural + '/${' + lower + '.id}/edit`}><Edit3 size={17} /> Edit</Link>'
    + '<Button variant="danger" onClick={() => { if (window.confirm("Delete this ' + lower + ' permanently?")) remove.mutate(); }}><Trash2 size={17} /> Delete</Button></div>} />',
    "      {remove.error && <ErrorNotice error={remove.error} />}",
    "      <section className=\"detail-grid\">",
    `${detailMain}        <dl className="detail-meta">${metaDivs}<div><dt>Last updated</dt><dd>{formatDate(${lower}.updatedAt)}</dd></div><div><dt>Owner ID</dt><dd><code>{${lower}.ownerId}</code></dd></div></dl>`,
    "      </section>",
    "    </>",
    "  );",
    "}",
    "",
    'const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });',
    "",
  ].join("\n");
}

/**
 * Plans the full API-side scaffold for one scalar-field CRUD resource on a
 * generated fullstack project: module files, Prisma model plus owner relation,
 * shared contracts, OpenAPI source additions, and typed-client additions.
 * A pure policy test ships with --with-tests, and the React CRUD pages wired
 * into the reference app ship with --with-crud-ui. Route-level integration
 * tests are deliberately deferred.
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

  const enumFields = fields.filter((field) => field.type === "enum");
  const hasRelation = new RegExp(`^[ \t]*${plural}[ \t]+${name}\\[\\]`, "m").test(schema);
  const hasModel = new RegExp(`^model ${name} \\{`, "m").test(schema);
  const markers = [
    hasRelation,
    hasModel,
    ...enumFields.map((field) => new RegExp(`^enum ${enumTypeName(name, field)} \\{`, "m").test(schema)),
  ];
  if (markers.some(Boolean) !== markers.every(Boolean)) {
    throw new AddResourceError(
      `${schemaRelative} contains a partial ${name} scaffold (relation, model, and enum types must all be present or all absent); refusing to guess.`,
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
    const payload = [renderPrismaModel(name, fields), ...renderPrismaEnumBlocks(name, fields)].join("\n\n");
    addChange(schemaRelative, schema, appendUnlessPresent(withRelation, `model ${name} {`, payload));
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
    ...(request.withTests ? [[`apps/api/tests/${lower}.policy.test.ts`, renderPolicyTest(name)] as [string, string]] : []),
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

  if (request.withCrudUi) {
    const pagesRelative = `apps/web/src/features/${plural}/${name}Pages.tsx`;
    const pagesContent = renderCrudUiPages(name, fields);
    const pagesPath = path.join(context.rootDir, pagesRelative);
    if (await fs.pathExists(pagesPath)) {
      const existingPages = await fs.readFile(pagesPath, "utf8");
      if (existingPages !== pagesContent) {
        throw new AddResourceError(
          `${pagesRelative} already exists with different content; refusing to guess whether it is this resource.`,
        );
      }
    } else {
      addChange(pagesRelative, null, pagesContent);
    }

    const webAppRelative = "apps/web/src/App.tsx";
    const webApp = await requireFile(webAppRelative);
    if (!webApp.includes(`./features/${plural}/${name}Pages`)) {
      requireAnchor(
        webApp,
        webAppRelative,
        /^import \{ ProjectsPage, ProjectDetailPage, ProjectFormPage \} from "\.\/features\/projects\/ProjectPages";$/m,
        "projects pages import anchor",
      );
      requireAnchor(
        webApp,
        webAppRelative,
        /^ {10}<Route path="projects\/:id\/edit" element=\{<ProjectFormPage \/>\} \/>$/m,
        "project routes anchor",
      );
      addChange(
        webAppRelative,
        webApp,
        webApp
          .replace(
            /^import \{ ProjectsPage, ProjectDetailPage, ProjectFormPage \} from "\.\/features\/projects\/ProjectPages";$/m,
            `import { ProjectsPage, ProjectDetailPage, ProjectFormPage } from "./features/projects/ProjectPages";\nimport { ${pascalName(plural)}Page, ${name}DetailPage, ${name}FormPage } from "./features/${plural}/${name}Pages";`,
          )
          .replace(
            /^ {10}<Route path="projects\/:id\/edit" element=\{<ProjectFormPage \/>\} \/>$/m,
            `          <Route path="projects/:id/edit" element={<ProjectFormPage />} />\n          <Route path="${plural}" element={<${pascalName(plural)}Page />} />\n          <Route path="${plural}/new" element={<${name}FormPage />} />\n          <Route path="${plural}/:id" element={<${name}DetailPage />} />\n          <Route path="${plural}/:id/edit" element={<${name}FormPage />} />`,
          ),
      );
    }

    const shellRelative = "apps/web/src/components/AppShell.tsx";
    const shell = await requireFile(shellRelative);
    if (!shell.includes(`to: "/${plural}"`)) {
      requireAnchor(
        shell,
        shellRelative,
        /^ {2}ShieldCheck,$/m,
        "AppShell icon import anchor",
      );
      requireAnchor(
        shell,
        shellRelative,
        /^ {2}\{ to: "\/projects", label: "Projects", icon: FolderKanban \},$/m,
        "AppShell projects nav entry anchor",
      );
      requireAnchor(
        shell,
        shellRelative,
        /^ {2}if \(pathname\.startsWith\("\/projects"\)\) return "Projects";$/m,
        "AppShell projects breadcrumb anchor",
      );
      const sectionLabel = humanizeLabel(plural);
      addChange(
        shellRelative,
        shell,
        shell
          .replace(/^ {2}ShieldCheck,$/m, "  ShieldCheck,\n  Table,")
          .replace(
            /^ {2}\{ to: "\/projects", label: "Projects", icon: FolderKanban \},$/m,
            `  { to: "/projects", label: "Projects", icon: FolderKanban },\n  { to: "/${plural}", label: "${sectionLabel}", icon: Table },`,
          )
          .replace(
            /^ {2}if \(pathname\.startsWith\("\/projects"\)\) return "Projects";$/m,
            `  if (pathname.startsWith("/projects")) return "Projects";\n  if (pathname.startsWith("/${plural}")) return "${sectionLabel}";`,
          ),
      );
    }
  }

  return changes;
}

function appendUnlessPresent(source: string, marker: string, block: string): string {
  if (source.includes(marker)) return source;
  return `${source.endsWith("\n") ? source : `${source}\n`}\n${block}\n`;
}
