/**
 * Prompt fragments shared by the Studio runtime and by the OpenCode agent
 * definitions. Keep them short: the full canon lives in `canon/`, and these
 * fragments are the non-negotiable subset every builder must carry in context.
 *
 * Rule IDs are stable. If a rule ID changes, update the canon, the skills, and
 * the tests together.
 */

export const CANON_BUILD_PROMPT = [
  "Engineering canon (normative; full text in packages/engineering-canon/canon/CANON.md):",
  "Architecture before convenience. Prefer deep modules: a small interface over a substantial implementation.",
  "Hide storage, transport, and vendor details behind the boundary. Pull complexity downward; callers must not orchestrate internals.",
  "Readability is a feature. Name for intent, keep units small and single-purpose, flatten nesting with guard clauses, and comment why and invariants, not syntax.",
  "Design twice before changing a boundary, data model, or auth flow. Record the choice and its consequences in an ADR.",
  "Validate untrusted input at the boundary. Keep secrets server-side. Authorize every object and action on the server. Never store tokens in browser storage.",
  "Use strict TypeScript: no any, no ts-ignore, no unsafe casts. Make illegal states unrepresentable. Handle every error; never swallow one silently.",
  "Keep data invariants in the schema and in transactions. Parameterize SQL. Index real access paths.",
  "Add tests at the lowest useful level. Pin behavior before changing legacy code. Run typecheck and tests before claiming done.",
  "In reviews, cite rule IDs (for example A8-ARCH-02) and report only verified findings with file and line.",
].join(" ");

export const CANON_REVIEW_PROMPT = [
  "Review against the Authenik8 engineering canon (packages/engineering-canon/canon/CANON.md).",
  "Order findings by severity: critical, high, medium, low.",
  "Check in this order: security and data loss; correctness and authorization; architecture and coupling; readability and naming; tests and operability.",
  "For each finding give the rule ID, file and line, evidence, impact, and the smallest safe fix.",
  "Do not report style preferences as defects. Do not claim a finding you did not verify.",
  "If clean, say 'No findings' and list what you checked. Use plain punctuation, no em dashes.",
].join(" ");

export const CANON_AUDIT_PROMPT = [
  "Run the mechanical canon audit before a hand review: it catches import cycles, unsafe types, swallowed errors, secret literals, browser token storage, injection sinks, unsafe SQL, and oversized units.",
  "Treat its output as leads, not verdicts. Verify each finding in context, then continue with the relevant review skill.",
].join(" ");
