---
name: management-home-widgets
description: Management systems (CRM, ERP, cockpit, admin, back office) open on a home with a few decision-driving widgets — KPIs with context, charts from real data, attention indicators
priority: 10
version: 1.0.0
load_tier: trigger
task_types: [dashboard, crud, admin]
triggers: [dashboard, CRM, ERP, cockpit, admin panel, back office, painel, gestão, overview, home screen, KPI, widget, chart, indicador, tela inicial, painel de indicadores]
aliases: [painel, indicadores, visão geral]
entities: [Dashboard, Widget, KPI, Chart, Indicator, Home]
retrieval_intents: [implementation, feature, planning]
modes: [planning, executing]
guard_surfaces: [ui]
---

# Management Home: Decision-Driving Widgets

If the product manages quantifiable work — CRM, ERP, cockpit, admin panel, back office, any management surface, even a simple one — its home/entry screen opens with widgets that generate decisions, not a bare menu, an empty table, or a logo splash. This is where the system proves its value to the user every day.

## Rule

- Each widget answers one of two user questions: "how are we doing" (a KPI with unit, period, and trend or comparison — a number without context is decoration) or "what needs me now" (an attention indicator — overdue items, pending approvals, stuck stages — linking to the filtered work list).
- Charts render from the system's real or seeded data, with labeled axes and a one-line non-chart summary; never a decorative placeholder chart.
- Keep the set small and prioritized: 3–6 widgets ordered by the domain's primary decision, with one dominant focal widget — not an equal-weight tile wall (see brain node vq-004).
- Every widget drills down: clicking it lands on the underlying records, pre-filtered to what the widget showed.
- Value test: remove the widget — if no user decision gets harder, it is decoration; replace it with one that changes what the user does next.

## Applies to

- @briefing: a briefing for a management surface records which decisions the home must serve, as promises or classified open questions.
- @refiner / @benchmark: a management-domain prototype or benchmark build without a value-bearing home is a blocking finding; widgets must be fed by the seeded mock state.
- @dev: widgets query live data; a hardcoded number that never changes is a defect.
- @product: the PRD for a management surface names the home widgets and the decision each one serves.
- @qa: verification changes the underlying data and confirms each widget reflects it; a widget frozen on its seed value is a FAIL.
