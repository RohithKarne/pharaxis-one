# MIMS — Accessibility Conformance Report (DRAFT, not for release)

**Status: draft. Not reviewed, not signed, not to be sent outside the team.**
Owner for review and sign-off: Saad Rahman (compliance). Engineering first pass: 3 October 2026.

This draft follows the shape of the ITI VPAT® 2.5 (WCAG edition) and reports against
**WCAG 2.2 Level A and AA**. It is written from an automated scan and a keyboard-only walk on a
local copy of MIMS. **Nobody has yet tested MIMS with a screen reader** (NVDA, JAWS or
VoiceOver), and most criteria below need a person to judge them. Until that is done, no row may
be read as a promise.

## Product

| | |
|---|---|
| Product | MIMS (medical information case handling), web application |
| Version | `main` plus branch `claude/human-made-ui-tgmzn6` (tickets MIPM-118, MIPM-119, MIPM-120, MIPM-123) |
| Browsers checked | Chromium only, desktop width (1400 × 900) |
| Assistive technology checked | None |

## How this was evaluated

1. **Automated scan** with axe-core 4.x, WCAG 2.0/2.1/2.2 A and AA rules, signed in as a
   platform administrator, on 15 screens: sign-in, Overview, Inbox, Case Query, Case Management
   list, a case form, Transmissions, Response Log, Response Error Log, Content Management,
   Browse Content, Reports, Session Management, Admin Console dashboard, MIMS Admin.
   Before fixes: 220 failures. After: 54, all on the Case Management list (below).
2. **Keyboard-only walk**: sign in, open a new case with `n`, move through the form, save a case
   with Ctrl+S, use "Skip to content".

Screens not scanned (most of MIMS Admin, every dialog, Reports' builders, the case tabs for MI,
AE and PC, Templates, Modular Documents) are **not evaluated**.

## Conformance terms

**Supports** — no failure found by the method named. **Partially supports** — some parts fail
or were not checked. **Does not support** — most of it fails. **Not evaluated** — nobody has
checked it yet. "Supports" here still needs a person's confirmation.

## WCAG 2.2 Level A and AA

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 1.1.1 Non-text content | A | Not evaluated | The scan found no unlabelled images on the 15 screens; icons beside text were not reviewed by a person. |
| 1.2.1 – 1.2.5 Time-based media | A/AA | Not evaluated | No audio or video seen on the screens checked. |
| 1.3.1 Info and relationships | A | Partially supports | Several forms place a visible label next to a field without linking the two. Fixed on the screens scanned except the Case Management list. |
| 1.3.2 Meaningful sequence | A | Not evaluated | |
| 1.3.3 Sensory characteristics | A | Not evaluated | |
| 1.3.4 Orientation | AA | Not evaluated | |
| 1.3.5 Identify input purpose | AA | Not evaluated | |
| 1.4.1 Use of colour | A | Partially supports | Transmission statuses show a word as well as a colour; other screens not reviewed. |
| 1.4.2 Audio control | A | Not evaluated | |
| 1.4.3 Contrast (minimum) | AA | Partially supports | 124 low-contrast texts on the 15 screens, now 0. The theme's muted grey was darkened, and the orange New Case button now uses a darker orange. The alternative "warm" theme was not checked. |
| 1.4.4 Resize text | AA | Not evaluated | |
| 1.4.5 Images of text | AA | Not evaluated | |
| 1.4.10 Reflow | AA | Not evaluated | MIMS is built for desktop width. |
| 1.4.11 Non-text contrast | AA | Not evaluated | Field borders and focus rings were not measured. |
| 1.4.12 Text spacing | AA | Not evaluated | |
| 1.4.13 Content on hover or focus | AA | Not evaluated | |
| 2.1.1 Keyboard | A | Partially supports | Sign-in, case save and the main menus work by keyboard. The New Case dialog does not take focus when it opens and does not close with Escape. |
| 2.1.2 No keyboard trap | A | Supports | No trap met on the walk. |
| 2.1.4 Character key shortcuts | A | Partially supports | `/` and `n` act only when focus is not in a field; they cannot yet be turned off or remapped. |
| 2.2.1 Timing adjustable | A | Not evaluated | Session time-out warning not reviewed. |
| 2.2.2 Pause, stop, hide | A | Not evaluated | |
| 2.3.1 Three flashes | A | Not evaluated | |
| 2.4.1 Bypass blocks | A | Supports | "Skip to content" is the first Tab stop on every signed-in screen. |
| 2.4.2 Page titled | A | Not evaluated | |
| 2.4.3 Focus order | A | Partially supports | Focus leaves the New Case dialog for the page behind it. |
| 2.4.4 Link purpose (in context) | A | Not evaluated | |
| 2.4.5 Multiple ways | AA | Not evaluated | |
| 2.4.6 Headings and labels | AA | Not evaluated | |
| 2.4.7 Focus visible | AA | Partially supports | Every stop on the walk showed a focus ring; screens off the walk not checked. |
| 2.4.11 Focus not obscured (minimum) | AA | Not evaluated | |
| 2.5.1 – 2.5.4 Pointer and motion | A | Not evaluated | |
| 2.5.7 Dragging movements | AA | Not evaluated | |
| 2.5.8 Target size (minimum) | AA | Partially supports | Help buttons enlarged to 24 px; other screens not measured. |
| 3.1.1 Language of page | A | Not evaluated | |
| 3.1.2 Language of parts | AA | Not evaluated | |
| 3.2.1 – 3.2.4 Predictable | A/AA | Not evaluated | |
| 3.2.6 Consistent help | A | Not evaluated | |
| 3.3.1 Error identification | A | Partially supports | Failed loads and saves now say so in words (MIPM-119); field-level errors not reviewed. |
| 3.3.2 Labels or instructions | A | Partially supports | As 1.3.1. |
| 3.3.3 Error suggestion | AA | Not evaluated | |
| 3.3.4 Error prevention (legal, financial, data) | AA | Not evaluated | |
| 3.3.7 Redundant entry | A | Not evaluated | |
| 3.3.8 Accessible authentication (minimum) | AA | Not evaluated | |
| 4.1.2 Name, role, value | A | Partially supports | 15 unnamed dropdowns and 21 unnamed checkboxes were named. The Case Management list still has 51 unnamed checkboxes and 3 unnamed dropdowns. |
| 4.1.3 Status messages | AA | Not evaluated | Notices use toasts; whether screen readers announce them is untested. |

## Known gaps, in the order to fix

1. **Case Management list**: row checkboxes and column filters have no names; the New Case
   dialog does not take focus or close with Escape. This screen is being changed in another
   piece of work, so it was left alone here.
2. **Screen reader test** of sign-in, Inbox, a case and Case Query, by a person.
3. Scan the screens listed as not scanned.

## Before this is released

- A person tests with at least one screen reader and updates every "Not evaluated" row they cover.
- Saad reviews the wording and signs.
- Nothing in this report describes any company as a customer or user.

---

References: local scan results (axe-core, WCAG 2.2 A/AA tags), 3 October 2026 · keyboard walk
script and screenshots in the session scratchpad · tickets MIPM-119, MIPM-120, MIPM-123 ·
ITI VPAT 2.5 format, https://www.itic.org/policy/accessibility/vpat · WCAG 2.2,
https://www.w3.org/TR/WCAG22/
