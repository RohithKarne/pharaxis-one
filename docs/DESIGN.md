# Design — Pharaxis One

Colours, fonts, components and the feel of both products. Written 2026-11-10 from the apps' own stylesheets, so it describes what is on screen today. When the code and this file disagree, the code is right and this file is fixed.

## The feel

```
 dense ── plain ── clinical ── square ── quiet
```

- **Work tools, not marketing pages.** Small type, lots on one screen, tables over cards.
- **Square corners** (2px), **no shadows** except on pop-ups, thin borders.
- **Colour means something:** green done, amber warning, red danger or overdue, blue information. Never decoration.
- **Numbers line up** (tabular figures) in tables and figures.
- **Plain words on screen.** One set of status words on every content screen. Show the server's error, never a vague "failed".
- **Times:** local time on screen with UTC on hover; exports and audit trails in UTC.

---

## CP Portal — admin panel

| Token | Value | Use |
|---|---|---|
| `--cp-primary` | `#1F4E8C` | Buttons, links, sidebar brand |
| `--cp-primary-dk` | `#163A69` | Hover |
| `--cp-primary-lt` | `#E1E8F2` | Selected rows, light fills |
| `--cp-brand` | `#E8593B` | The 3px brand bar, active menu edge, client chip |
| `--cp-brand-lt` | `#FDECE7` | Client chip fill |
| `--cp-success` / `-lt` | `#15803D` / `#DCFCE7` | Done, live |
| `--cp-warning` / `-lt` | `#B45309` / `#FEF3C7` | Needs attention |
| `--cp-danger` / `-lt` | `#B91C1C` / `#FEE2E2` | Errors, critical |
| `--cp-text` / `-muted` | `#111827` / `#4B5563` | Text |
| `--cp-border` | `#C3CBD5` | Lines |
| `--cp-bg` / `--cp-surface` | `#F3F4F6` / `#FFFFFF` | Page / panels |
| `--cp-sidebar-bg` / `-text` | `#E9EDF2` / `#1D3557` | Left menu |
| `--cp-panel-head` | `#DFE5EC` | Panel headers |
| `--cp-radius` | `2px` | Every corner |
| `--cp-shadow-md` | `0 2px 8px rgba(0,0,0,.2)` | Pop-ups only |

- **Font:** Arial, Helvetica, sans-serif, **13px**, line height 1.4.
- **Left menu:** 210px (64px compact). Active item: white, bold, 4px brand edge on the left. Each area opens to its screens.
- **Components:** `cp-btn`, `cp-btn-primary`, `cp-btn-outline`, `cp-btn-sm`; `cp-table`; `cp-kpi` figures; `cp-client-chip`; panels with a grey header.

## CP Portal — the public portal

The portal wears **the client's own brand**. A client admin sets it on Branding, from one of four ready themes or single colours under Advanced, with a live preview.

| Theme | Primary | Secondary | Accent | Text | Footer |
|---|---|---|---|---|---|
| Purple | `#6B3FA0` | `#4A2D7A` | `#9B6FCC` | `#1A1A2E` | `#1A1A2E` |
| Clinical blue | `#1D4ED8` | `#1E3A8A` | `#3B82F6` | `#0F172A` | `#0F172A` |
| Teal | `#0F766E` | `#134E4A` | `#14B8A6` | `#102A27` | `#134E4A` |
| Charcoal | `#374151` | `#1F2937` | `#B45309` | `#111827` | `#111827` |

Each theme sets 15 colours: primary, secondary, accent, background, surface, text (two), button (two), link, border, footer (two), header (two). Logo, fonts and portal name are set beside them.

- **Home:** "Guided Medical Self-Service" — search first, top tasks, quick links, latest updates, the live safety alert.
- **Safety always shows** and cannot be switched off. High and critical alerts ask "I have read this".
- **Every page in six languages.** Words on screen come from the translation list, never hard-coded.
- Checked on desktop; phone widths for Branding and Features are not checked.

## MIMS

| Token | Value | Use |
|---|---|---|
| `--primary` | `#1d3557` | Top bar, buttons, headings |
| `--primary-light` / `-dark` / `-tint` | `#2a4a73` / `#152840` / `#eef2f8` | Hover, pressed, light fills |
| `--accent` / `--mims-orange` | `#e8890c` | Active menu edge, highlights |
| `--success` | `#007a5a` | Done |
| `--warning` | `#ecb22e` | Due soon |
| `--danger` | `#e01e5a` | Overdue, errors |
| `--info` | `#1264a3` | Information |
| `--text-primary` / `-secondary` / `-muted` | `#1d1c1d` / `#616061` / `#6f7177` | Text |
| `--bg` / `--surface` / `--border` | `#f8f8f8` / `#ffffff` / `#e8e8e8` | Page / panels / lines |
| `--sidebar-bg` / `-text` | `#1d3557` / `#c4cede` | Left menu, 240px |
| `--font` | Arial, Helvetica, sans-serif | Everywhere |
| `--radius` | `2px` | Every corner |

- **Dark theme:** `data-theme="dark"` on the page, set from the platform theme. Page `#1a1d21`, panels `#222529`, text `#d1d2d3`.
- **Menu:** New Case at the top; Work · Knowledge · Reporting · Administration. Items a person cannot open are hidden, not greyed.
- **Status dots:** red, yellow, green, blue, none. The SLA badge: green over 48 hours, amber under, red breached.
- **Read-only cases** show a "Read only" label instead of Save, and locked fields.
- **Components:** `cm-btn`, `cm-btn-primary`, `cm-btn-secondary`, `cm-btn-danger`, `cm-btn-sm`; `cm-table`; `cm-modal` with title and footer.
- **Class prefixes:** `mims-` shared layout, `ac-` admin console, `cm-` content management, `cf-` case form, `tx-` transmissions, `bc-` browse content, `rl-` response log.
- **No error pop-ups.** Errors go to the console; the screen shows the message where the action was.

## Rules for any new screen

1. Use the tokens above; never a new hex value without adding it here.
2. Square corners, no shadows except pop-ups.
3. A list of allowed values on screen matches the server's list (RULES.md › Lessons, L-013).
4. Show the server's error message.
5. Every portal word goes through the translation list.
6. Check it on the real screen, including one path that should fail.
