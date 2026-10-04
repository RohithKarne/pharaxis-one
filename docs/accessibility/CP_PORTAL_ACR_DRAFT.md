# CP Portal — Accessibility Conformance Report (DRAFT, not for release)

**Status: draft. Not reviewed, not signed, not to be sent outside the team.**
Owner for review and sign-off: Saad Rahman (compliance). Engineering first pass: 3 October 2026.

This draft follows the shape of the ITI VPAT® 2.5 (WCAG edition) and reports against
**WCAG 2.2 Level A and AA** for both parts of CP Portal: the **public portal** that doctors and
patients use, and the **admin console**. It is written from an automated scan and a
keyboard-only walk on a local copy. **Nobody has yet tested CP Portal with a screen reader**
(NVDA, JAWS or VoiceOver), and most criteria below need a person to judge them.

## Product

| | |
|---|---|
| Product | CP Portal: public portal and admin console, web application |
| Version | `main` at fb8f540 (4 October 2026) plus the CPPM-98 and CPPM-105 changes; earlier pass on branch `claude/human-made-ui-tgmzn6` (CPPM-82, CPPM-83, CPPM-98, CPPM-99) |
| Browsers checked | Chromium only; desktop width (1400 × 900), and the portal at 375 px (CPPM-99) |
| Assistive technology checked | None |

## How this was evaluated

1. **Automated scan** with axe-core 4.x, WCAG 2.0/2.1/2.2 A and AA rules.
   - Portal, 14 screens with the local demo client: home, sign-in, submit, find an MSL,
     resources, documents, contact, FAQ, safety, search, and signed in: my submissions,
     profile, preferences, saved items. Before: 143 failures. After: 2 (below).
   - Admin console, 13 screens: sign-in, dashboard, clients, client overview, submissions,
     portal users, MSLs, forms, content, sync health, branding, features, audit trail.
     Before: 215 failures. After: 0.
   - **Re-run on 4 October 2026** against `main` (fb8f540): the earlier numbers no longer
     held. Admin console, 14 screens: 3 failures (two low-contrast texts, one unnamed
     dropdown). Portal, 16 screens including the open MSL meeting form and the signed-out
     sign-in page: 12 failures (seven unlabelled boxes and dropdowns on the request form,
     unnamed region dropdown, four low-contrast texts). All fixed under CPPM-98 and
     CPPM-105; the same scan now reports **0 failures** on both parts.
2. **Keyboard-only walk**: portal sign-in, the submit form, admin sign-in.

Screens not scanned (the remaining admin pages, every dialog, chat, events, training, news,
the portal at other client brandings) are **not evaluated**.

## Conformance terms

**Supports** — no failure found by the method named. **Partially supports** — some parts fail
or were not checked. **Does not support** — most of it fails. **Not evaluated** — nobody has
checked it yet. "Supports" here still needs a person's confirmation.

## WCAG 2.2 Level A and AA

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 1.1.1 Non-text content | A | Not evaluated | The scan found no unlabelled images on the screens checked; client logos and document thumbnails not reviewed by a person. |
| 1.2.1 – 1.2.5 Time-based media | A/AA | Not evaluated | Training and event pages not checked. |
| 1.3.1 Info and relationships | A | Partially supports | Many admin forms show a label beside a field without linking the two. Fixed on the screens scanned; the same pattern likely remains on unscanned admin pages. The portal's sign-in, request and MSL meeting forms link every label to its box and read help text with the field (CPPM-105, 4 October 2026). |
| 1.3.2 Meaningful sequence | A | Not evaluated | |
| 1.3.3 Sensory characteristics | A | Not evaluated | |
| 1.3.4 Orientation | AA | Not evaluated | |
| 1.3.5 Identify input purpose | AA | Not evaluated | |
| 1.4.1 Use of colour | A | Partially supports | Submission statuses show a word as well as a colour; other screens not reviewed. |
| 1.4.2 Audio control | A | Not evaluated | |
| 1.4.3 Contrast (minimum) | AA | Partially supports | 196 low-contrast texts, now 0 on the screens scanned (the last six, on the home page hints, the pager, the "approved" badge and the MSL initials, fixed 4 October 2026). Grey, green, amber and red text was darkened across both parts. **The portal's colours come from each client's branding**, and the branding screen does not warn about contrast, so another client's colours can fail where the demo client's now pass. |
| 1.4.4 Resize text | AA | Not evaluated | |
| 1.4.5 Images of text | AA | Not evaluated | |
| 1.4.10 Reflow | AA | Partially supports | The portal at 375 px wide: see CPPM-99 for what was checked. Admin console is built for desktop. |
| 1.4.11 Non-text contrast | AA | Not evaluated | |
| 1.4.12 Text spacing | AA | Not evaluated | |
| 1.4.13 Content on hover or focus | AA | Not evaluated | |
| 2.1.1 Keyboard | A | Partially supports | Portal sign-in and submit-form choices, and admin sign-in, work by keyboard. Chat and dialogs not walked. |
| 2.1.2 No keyboard trap | A | Supports | No trap met on the walk. |
| 2.1.4 Character key shortcuts | A | Not evaluated | |
| 2.2.1 Timing adjustable | A | Not evaluated | |
| 2.2.2 Pause, stop, hide | A | Not evaluated | |
| 2.3.1 Three flashes | A | Not evaluated | |
| 2.4.1 Bypass blocks | A | Partially supports | The portal has "Skip to content" as its first Tab stop. The admin console has none. |
| 2.4.2 Page titled | A | Not evaluated | |
| 2.4.3 Focus order | A | Not evaluated | |
| 2.4.4 Link purpose (in context) | A | Not evaluated | |
| 2.4.5 Multiple ways | AA | Not evaluated | |
| 2.4.6 Headings and labels | AA | Not evaluated | |
| 2.4.7 Focus visible | AA | Partially supports | Every stop on the walk showed a focus ring; screens off the walk not checked. |
| 2.4.11 Focus not obscured (minimum) | AA | Not evaluated | |
| 2.5.1 – 2.5.4 Pointer and motion | A | Not evaluated | |
| 2.5.7 Dragging movements | AA | Not evaluated | |
| 2.5.8 Target size (minimum) | AA | Partially supports | Small row buttons, row dropdowns and the "Show password" button are now at least 24 px tall; other screens not measured. |
| 3.1.1 Language of page | A | Not evaluated | |
| 3.1.2 Language of parts | AA | Not evaluated | |
| 3.2.1 – 3.2.4 Predictable | A/AA | Not evaluated | |
| 3.2.6 Consistent help | A | Not evaluated | |
| 3.3.1 Error identification | A | Partially supports | Failed loads and saves now say so in words (CPPM-83); form field errors not reviewed. |
| 3.3.2 Labels or instructions | A | Partially supports | As 1.3.1. |
| 3.3.3 Error suggestion | AA | Not evaluated | |
| 3.3.4 Error prevention (legal, financial, data) | AA | Not evaluated | Adverse-event submission should be reviewed against this. |
| 3.3.7 Redundant entry | A | Not evaluated | |
| 3.3.8 Accessible authentication (minimum) | AA | Not evaluated | |
| 4.1.2 Name, role, value | A | Partially supports | 111 unnamed dropdowns and 26 unnamed fields and switches were named on the screens scanned. |
| 4.1.3 Status messages | AA | Not evaluated | |

## Known gaps, in the order to fix

1. **Client branding can undo contrast.** The branding screen accepts any colour. Either warn
   when a chosen text colour is below 4.5 : 1, or limit the choice.
2. **Screen reader test** of the portal home, sign-in, submit an inquiry, report an adverse
   event and my submissions, by a person.
3. "Skip to content" in the admin console.
4. Scan the screens listed as not scanned.

## Before this is released

- A person tests with at least one screen reader and updates every "Not evaluated" row they cover.
- Saad reviews the wording and signs.
- Nothing in this report describes any company as a customer or user.

---

References: local scan results (axe-core, WCAG 2.2 A/AA tags), 3 October 2026 · keyboard walk
script in the session scratchpad · tickets CPPM-83, CPPM-98, CPPM-99 · ITI VPAT 2.5 format,
https://www.itic.org/policy/accessibility/vpat · WCAG 2.2, https://www.w3.org/TR/WCAG22/
