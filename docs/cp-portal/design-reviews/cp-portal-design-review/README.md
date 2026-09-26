# CP Portal Design Review

Requested by: Rohith Karne  
Surface: CP Portal public screens + CP Portal Admin screens  
Date: 2026-07-08  
Output type: Local design review folder

## Evidence Captured

Screenshots are in `screenshots/`:

- `01-portal-home-desktop.png` - public portal home, desktop
- `02-portal-submit-inquiry.png` - public submit request entry screen
- `03-portal-documents.png` - documents route unauthenticated state
- `04-admin-dashboard.png` - admin dashboard
- `05-admin-client-overview.png` - admin client overview
- `06-admin-branding.png` - admin branding configuration
- `07-portal-home-mobile.png` - public portal home, mobile
- `08-admin-submissions.png` - admin submissions screen

Capture note: screenshots used mocked API responses so the local frontend could render realistic states without requiring the local database.

## Current UX Health By Step

1. Public portal home - usable, but too hero-heavy. Search and main actions are visible, but the page feels more like a landing page than a task workspace.
2. Submit inquiry entry - understandable, but too empty. Only one request card appears, leaving users without reassurance, process steps, or expected response details.
3. Documents route - weak unauthenticated experience. The page shows a sign-in card without explaining why documents require access or what the user can do next.
4. Admin dashboard - structurally useful, but low information density. The dashboard has health alerts and submissions, but the visual hierarchy does not clearly separate urgent work from general status.
5. Admin client overview - strong functional coverage, but crowded. Many setup cards compete equally, so the next best action is not obvious.
6. Admin branding - clear form structure, but visually heavy. Color fields are practical, yet preview/context could better show how changes affect the public portal.
7. Mobile portal home - works, but the task list becomes a long vertical stack. The chat button overlaps the first feature card, and the top navigation/search row is tight.
8. Admin submissions - operationally important, but table data and empty/default states need stronger clarity. Filters are present, but status and priority are not visually guided enough.

## Strengths

- The product already has a consistent token base: blue, teal, coral, neutral surfaces, 8px radius, Inter-style type.
- Public portal routes cover the right user jobs: search, submit inquiry, documents, safety, MSL, events, news.
- Admin navigation is grouped by real operational areas, which is the right information architecture starting point.
- Readiness score, content health alerts, review queue, and setup checklist are valuable admin concepts.

## UX Risks

- Public home overuses a large hero and repeated cards, which slows task completion for returning users.
- Safety alert is visually loud and may train users to dismiss it rather than read it.
- Submit flow lacks visible steps, time expectation, and trust reassurance.
- Documents route gives an access wall without enough context.
- Admin dashboard does not clearly answer: "What needs my attention first?"
- Client overview gives many equal configuration boxes instead of a prioritized setup path.
- Mobile layout is functional but not efficient; important tasks require too much scrolling.

## Accessibility Risks

- Some current states use emoji-like symbols for meaning; these should be replaced or paired with accessible labels and consistent icon components.
- Red safety and yellow warning states need contrast checks against text in all alert rows.
- Mobile floating chat overlaps content and should reserve safe spacing or dock outside important cards.
- Admin sidebar and grouped navigation need keyboard/focus review.
- Screenshot review cannot prove full WCAG compliance; keyboard navigation, screen reader labels, focus states, and zoom behavior still need runtime testing.

## Visual Design Options

### Option 1 - Guided Medical Self-Service

Best for the public CP Portal.

This direction turns the public home page into a task-first medical self-service workspace. It keeps search, safety, inquiry, documents, and MSL access visible in the first viewport. It reduces the marketing feel and improves returning-user speed.

Recommended for:
- public portal home
- documents/resources
- safety/news/events
- submit inquiry entry

### Option 2 - Operations Command Center

Best for the admin console.

This direction makes admin screens more operational: priority alerts, open submissions, review queue, setup blockers, and client health are visible together. It keeps the dense admin character but improves scanability and next-action clarity.

Recommended for:
- admin dashboard
- client overview
- review queue
- submissions
- setup/readiness workflows

### Option 3 - Unified Medical Workspace

Best as the long-term system design direction.

This direction creates a shared design language across public and admin screens. It treats CP Portal as one product with two audiences: external medical users and internal administrators. It is useful if we want one reusable design system instead of separate public/admin styling.

Recommended for:
- design system planning
- shared components
- future redesign roadmap
- cross-surface consistency

## Recommendation

Use Option 1 for the public portal and Option 2 for the admin console, with Option 3 as the design-system north star.

This is the most practical route because external users and admins have different jobs:

- Public users need fast, calm task completion.
- Admin users need dense, prioritized operational control.
- Both should still share tokens, components, status badges, alert rows, search, buttons, and spacing rules.

## Suggested Implementation Order

1. Redesign public portal home into a task-first layout.
2. Redesign admin dashboard into an operations command center.
3. Redesign client overview around readiness and next best actions.
4. Redesign submit inquiry entry with steps, expectations, and trust cues.
5. Normalize shared components: alert row, task card, status badge, search, table row, empty state.
6. Run desktop and mobile browser verification after each screen.

