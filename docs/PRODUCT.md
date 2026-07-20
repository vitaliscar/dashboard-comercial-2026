# Product

## Register

brand

## Users

**Sales & Operations Teams** across multiple roles and organizational levels:

- **Gerencia Nacional (National Management)**: Executive oversight of all sales channels, budgets, and performance across business units.
- **Gerentes Comerciales (Commercial Managers)**: Unit-level strategy and target tracking for their assigned business lines (Servicios, Repuestos, Lubricantes, Equipos).
- **Coordinadores (Coordinators)**: Branch-level execution and daily performance monitoring for their specific location.
- **Asesores (Advisors/Sales Representatives)**: Personal performance dashboards tracking individual targets, cumulative goals, and participation metrics.

**Context**: CCV is a commercial/industrial equipment and supplies company. Users access this dashboard during their workday—sometimes rushed (checking daily targets), sometimes exploratory (analyzing trend data). They need clarity and confidence in the numbers they're reporting and acting on.

## Product Purpose

**Dashboard Comercial 2026** is a role-based sales analysis and performance tracking platform for CCV. It provides real-time visibility into quotations, invoices, lost opportunities, and cumulative performance (presupuestos) across teams and individuals.

The dashboard unifies data across multiple business units (Services, Spare Parts, Lubricants, Equipment) and sucursales (branch offices), enabling managers to track targets, spot trends, and make informed decisions—and enabling individual sales advisors to understand their standing and contribution.

**Success looks like**: Teams trust the data. Managers make faster decisions. Advisors understand their metrics. The system is the single source of truth for CCV's commercial operations.

## Brand Personality

**Editorial. Refined. Expert.**

The dashboard reflects domain expertise and precision. Like a financial report or business journal, it prioritizes clarity and authority over decoration. Typography and spacing are intentional. Information hierarchy is strong. The interface does not shout; it informs with confidence.

**Voice**: Straightforward, specific, no jargon inflation. Numbers speak first. Labels are unambiguous. Copy is direct: "Sales This Month" not "Monthly Revenue Acceleration" or "Dynamic Income Stream."

**Emotional goal**: Confidence. Users should feel they're reading an authoritative source, not guessing at marketing language.

## Anti-references

**Explicitly avoid:**

- Generic SaaS templates (Stripe-ish blues, identical card grids, all-caps tracked eyebrows on every section).
- "Hero-metric" layouts (big number, small label, gradient accent, stats underneath).
- Rounded, playful, or overly decorative design (pastel cards, illustration overload, momentum-obsessed gradients).
- Dark dashboards or hacker aesthetic (terminal vibes, minimalism as an end in itself).
- Uniform, repetitive card designs that blur together.

**Do reference**: Publications and reports that combine readable typography with data clarity (financial reports, business news, editorial data viz). Authority without fussiness. Restrained color, strong hierarchy.

## Design Principles

1. **Role-based clarity**: Information and UI shift based on user level. A national manager sees aggregates and trends; a coordinator sees their branch; an advisor sees their own performance. The layout and visual hierarchy reflect their scope, not a one-size template.

2. **Data-first hierarchy**: Numbers come before decoration. Titles don't restate numbers. Labels are specific: "Cumplimiento PPTO" (not "Target Achievement")—users know their domain language.

3. **Restrained authority**: OKLCH-based neutral backgrounds, one accent color, strong typography scale. Confidence through precision, not flourish.

4. **Accessibility as default**: WCAG AA compliance. High contrast, semantic HTML, keyboard navigation. Color is never the only signal.

5. **Real-time trustworthiness**: The interface is updated live from Supabase. Users see fresh data, role-scoped by RLS policies. The technical precision should feel transparent in the UI.

## Accessibility & Inclusion

- **WCAG AA compliance** (standard web accessibility).
- **Dark and light themes** supported; themes do not shift meaning (color is not the sole indicator of status).
- **Reduced motion**: All animations are optional; non-motion defaults are accessible and readable.
- **Keyboard navigation**: Full support for users who navigate without a mouse.
- **Screen reader friendly**: Semantic HTML, proper heading hierarchy, aria labels where needed. Data tables and lists have clear row/column relationships.
- **Color contrast**: Body text and interactive elements meet or exceed 4.5:1 (WCAG AA) against their backgrounds.
