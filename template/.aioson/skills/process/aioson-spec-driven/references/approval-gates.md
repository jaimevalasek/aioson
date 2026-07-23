# Streamlined Approval Gates

- **Product scope / Gate A:** `prd-{slug}.md` exists with required capabilities and explicit exclusions; `product_scope: approved`.
- **PRD readiness / Gate B:** the same PRD has concrete AC rows and `prd_ready: approved`.
- **Optional Sheldon review:** when explicitly invoked, the same PRD has `sheldon_review: approved`; this is not a Planner prerequisite.
- **Gate C / plan:** `implementation-plan-{slug}.md` has `status: approved` and covers every required CAP with exact paths and verification.
- **Gate D / delivery:** `qa-report-{slug}.md` has `verdict: pass`, AC evidence, and production-path evidence.

Gate letters A/B are compatibility names for product scope/PRD readiness. They do not require separate requirements or design documents.
