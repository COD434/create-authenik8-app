import { z } from "zod";

/**
 * Adaptive Presentation Engine: the canonical contract for structured
 * assistant output (PresentationBlock discriminated union + response
 * envelope).
 *
 * Studio ships unbundled classic scripts, so the browser cannot run Zod.
 * `public/app-presentation.js` carries a structural mirror of this file and
 * `tests/presentation.test.ts` feeds identical fixtures to both definitions
 * so they cannot drift. When you add or change a block type here, change the
 * mirror and the parity fixtures in the same commit.
 */

const headingBlock = z.object({
  type: z.literal("heading"),
  level: z.number().int().min(1).max(6),
  text: z.string(),
});

const proseBlock = z.object({
  type: z.literal("prose"),
  content: z.string(),
});

const comparisonColumn = z.object({
  label: z.string().min(1),
  items: z.array(z.string()).min(1),
});

const comparisonBlock = z.object({
  type: z.literal("comparison"),
  title: z.string().optional(),
  columns: z.array(comparisonColumn).min(2).max(4),
});

const tableBlock = z.object({
  type: z.literal("table"),
  caption: z.string().optional(),
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
});

const chartSeries = z.object({
  name: z.string(),
  values: z.array(z.number()),
});

const chartBlock = z.object({
  type: z.literal("chart"),
  title: z.string().optional(),
  kind: z.enum(["bar", "line", "area"]),
  labels: z.array(z.string()).optional(),
  series: z.array(chartSeries).min(1),
});

const stepItem = z.object({
  title: z.string().optional(),
  body: z.string(),
});

const stepsBlock = z.object({
  type: z.literal("steps"),
  items: z.array(stepItem).min(1),
});

const diagramBlock = z.object({
  type: z.literal("diagram"),
  format: z.enum(["mermaid", "ascii"]),
  source: z.string(),
});

const galleryImage = z.object({
  src: z.string().min(1),
  alt: z.string(),
  caption: z.string().optional(),
});

const galleryBlock = z.object({
  type: z.literal("gallery"),
  items: z.array(galleryImage).min(1),
});

const calloutBlock = z.object({
  type: z.literal("callout"),
  tone: z.enum(["note", "tip", "warning", "danger"]),
  title: z.string().optional(),
  content: z.string(),
});

const citationItem = z.object({
  label: z.string().min(1),
  url: z.string().optional(),
});

const citationBlock = z.object({
  type: z.literal("citation"),
  title: z.string().optional(),
  items: z.array(citationItem).min(1),
});

const codeBlock = z.object({
  type: z.literal("code"),
  language: z.string(),
  code: z.string(),
  filename: z.string().optional(),
});

const interactiveBlock = z.object({
  type: z.literal("interactive"),
  kind: z.string().min(1),
  label: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const presentationBlockSchema = z.discriminatedUnion("type", [
  headingBlock,
  proseBlock,
  comparisonBlock,
  tableBlock,
  chartBlock,
  stepsBlock,
  diagramBlock,
  galleryBlock,
  calloutBlock,
  citationBlock,
  codeBlock,
  interactiveBlock,
]);

export const presentationEnvelopeSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["markdown", "structured"]),
  blocks: z.array(presentationBlockSchema),
  partial: z.boolean().optional(),
});

export type PresentationBlock = z.infer<typeof presentationBlockSchema>;
export type PresentationEnvelope = z.infer<typeof presentationEnvelopeSchema>;
