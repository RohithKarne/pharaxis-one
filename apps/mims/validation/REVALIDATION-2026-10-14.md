# Revalidation pass — 14 Oct 2026

**What this is.** One pass over every round flagged for revalidation in the change log between 10 and 14 Oct 2026: each round's own walk was run again on the local copy, on the real screens, with the code as it stands after the access review follow-ups. It is evidence for Saad Rahman (compliance owner) to judge; it is **not** the formal IQ/OQ/PQ run, which a second person still has to do.

**How.** 75 walk batches, run one after another (MIMS on port 3000, the built app at /mims, CP Portal on 4000/5174, local mail sink and virus scanner). Every step either shows what a person sees on screen or reads it back from the database, and records PASS or FAIL with what was seen. Screenshots and raw output are kept with the session's working files, not in the repository. Where a batch failed, the cause was found before anything else: a defect was fixed and the batch rerun; a walk that could not repeat itself (an account it expects fresh, a label renamed by a later round) is marked as such.

## Result by round

| Round (change log) | Batches | Checks passed | Not passed | Why not passed |
|---|---|---|---|---|
| MIMS sign-in Tier 1 (12 Oct) | AA | 6 / 6 | — | |
| MIMS sign-in Tier 2 (12 Oct) | AD | 4 / 4 | — | |
| CP Portal sign-in Tiers 1 and 2 (12 Oct) | AB, AC | 14 / 15 | 1 | The password-history step can run only once per test account: its "strong" password is now in the history. In this pass a common password was refused and the recently used one was refused, which is the rule. |
| Case form Day 0 and PR 2 (13 Oct) | AH, AI | 11 / 11 | — | AH6 first failed: a defect, fixed (below). |
| Case form PRs 3–6 (13 Oct) | AJ–AM | 39 / 39 | — | AM2 first failed on a test field another walk leaves behind; removed, rerun passed. |
| Case form follow-ups (13 Oct) | AN | 7 / 7 | — | |
| Case form pending items (13 Oct) | AO–AS | 20 / 20 | — | |
| Found in the MI and PC review (13 Oct) | AU | 4 / 5 | 1 | AU4 sends an MI answer without "Who asked"; the MI response review (14 Oct) made that required, so the send is refused. Rule working; walk older than the rule. |
| MI and PC field review (13 Oct) | AV–AZ | 17 / 17 | — | |
| MI response and hand-off review (14 Oct) | BA, BB, RF | 16 / 16 | — | |
| Content management review (14 Oct) | CA–CJ | 45 / 45 | — | |
| Content management in-depth review and follow-up (14 Oct) | DA–DK | 37 / 39 | 2 | DC and DI first failed because a defect had turned the content author into an agent; fixed, both pass. DB3 now refuses the letter preview with "You do not have access to Cases" before the folder rule: stricter, from the access review. DE: Content Settings is now hidden from a content author without Configure content (access review follow-up), so the walk cannot open it. |
| Main menu (14 Oct) | MO, MP, MQ | 15 / 17 | 2 | MO is the research walk from before the menu was built ("greyed" items); the menu now hides them, and MP checks that, 9 / 9. |
| Reports review (14 Oct) | RA–RL | 43 / 45 | 2 | RK6–7 take Reports away by editing a stored row that no longer exists (only differences from the role are stored since the access review), so the recipient kept Reports and the email was right to go. RD looks for the old report name "Daily Case Openings" (renamed Cases Received by the same round); RK covers creating a schedule and passes. |
| Access and permissions review and follow-ups (14 Oct) | AC1–AC9, P4, P7 | 46 / 46 | — | AC1c first failed: a defect, fixed (below). |
| Support-access rule withdrawn (10 Oct) | Y | by API, 1 / 1 | walk 0 / 4 | The walk signs in as the platform admin without two-step (required since 12 Oct) and uses a one-time password already spent. Checked by API instead: the platform admin, with two-step, reads cases with no grant and opening one writes one audit row; the organisation's own administrator still signs in and opens cases. |

Also run this session: the CP Portal to MIMS bridge (submission, field mapping, virus refusal, follow-up, follow-up with MIMS down, close-back, erasure) — every path works; the in-app regression suite — 150 of 178, the 28 others expect behaviour later rounds changed on purpose; backend tests 213 / 213; frontend tests 18 / 18; frontend lint 0.

## Defects found by this pass, all fixed and rerun

1. **Another organisation's case answered "not allowed" instead of "not found"**, which confirmed that the case number exists elsewhere (since the access review's case check). Now not found.
2. **Saving Edit User turned a person into an agent** when their security group sets no role: the save of their organisations fell back to "agent". Their user record still said content manager, so content changes were refused. The person's own role is now kept.
3. **A read-only person (auditor) saw "Save Additional Fields"** on a case with admin-configured fields; the rest of the page was read only. The block now follows the page.
4. **The in-app regression suite left settings changed**: two-step sign-in switched on for the whole organisation, and a template group's permissions replaced. Both checks now put things back.

## Not checked

- The formal run by a second person; this pass is one person's walk.
- The support-access round on screen (checked by API).
- CP Portal password history from a fresh account (the rule was seen working, not the full sequence).
- Anything on production data or a production-like environment.

## Changes if

Saad's call that the case form, MI/PC, content, reports, menu and access rounds can rely on this pass changes if the second-person run finds a step that fails for a reason other than those above, or if any of the four defects reappears.
