# Authenik8 Pro templates

Curated starting points for the planned Pro tier. Each template pins a tested
configuration of an existing generator preset and adds a launch guide. The Pro
pack does not fork the full-stack template or create a second identity stack.

Current templates:

- `saas-starter`: React and Express with password auth, a dashboard, owned
  projects, account settings, admin, audit, and three demo projects.

Each folder contains:

- `template.json`: the catalog entry and generator configuration.
- `README.md`: copied into generated projects as `PRO_TEMPLATE.md`.

The studio exposes the same entry in its template picker. The generator copies
the guide only when the full-stack preset is generated with `--demo`.
