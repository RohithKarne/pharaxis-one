# CSV/CSA Interviews — Routine Prompt

> Operational prompt for the **CSV/CSA Interviews** routine.
> Agreed with Rohith Karne on 2026-08-13. Manual run only, fired from the routines screen.
> **This routine is independent of Pharaxis One.** It never reads Pharaxis code, never
> references Pharaxis products, and never mentions the company. Everything it produces is
> general industry practice.

---

## 1. What this routine is

An interview rehearsal. Each run produces **one epic and five stories** in Jira. Each story is
one interview question, played out as a real conversation between an interviewer and the
candidate, followed by coaching notes.

The point is not to collect questions. It is to rehearse answering them out loud.

---

## 2. Who it is for

**Rohith Karne.** A Computer System Validation and Computer System Assurance professional with
around five years of experience across multiple cloud-hosted GxP applications. He is moving
from his current company to another, and positions himself two ways at once:

- a solid traditional CSV practitioner, and
- someone comfortable with AI-enabled systems and the assurance thinking that goes with them.

His background is **vendor and service side** — SaaS release validation, upgrades across
customer environments, UAT, qualification, change and incident management, and integrations
across safety, regulatory information, medical information and content management systems.

**Read his CV for context if it is available, but do not narrow the questions to it.** It is
reference, not a boundary. Questions must cover the wider market, including work he has not
personally done, because interviews do.

---

## 3. When it runs

**Manual only.** Rohith fires it from the routines screen when he wants an epic. He may fire it
several times in a day. There is no schedule and no automatic trigger.

---

## 4. Before writing anything — research first

Every run begins with research. Do not generate questions from memory alone.

1. **Search the web for interview questions actually being asked** in computer system
   validation, computer software assurance, data integrity and GxP systems. Look at what
   candidates report being asked, not only what training material says should be asked.
2. **Search current job adverts** for validation roles — validation engineer, validation
   consultant, CSV lead, quality systems analyst, systems administrator on regulated
   platforms. Use what employers are asking for **now** to weight which topics come up.
   This is what keeps the routine current instead of recycling 2018 material.
3. **Read every existing story in the Jira project** so the duplication check is real.

Cover the applications that exist in this market, not invented ones — safety databases,
regulatory information management systems, medical information platforms, content management
and quality management systems. Name real product categories where it helps the question feel
authentic. Do not pretend to knowledge of a specific product's internals.

---

## 5. Duplication rules

| Item | Rule |
|---|---|
| **Main question of a story** | **Must never repeat** any main question already in the project, in any epic, from any previous run. Check meaning, not wording — the same question asked differently is still a duplicate. |
| **Follow-up probes inside the interview** | Free to repeat. They exist to teach. |
| **"Where they'll go next" list at the foot** | Free to repeat. No check needed. |

**Promotion.** A follow-up question from an earlier story may later become the main question of
a new story. When that happens, the new story says so and gives the original story reference,
so the chain is traceable. Once promoted, it is a main question and is subject to the
duplication rule from then on.

---

## 6. The mix for each run

Decide the mix automatically. Do not ask Rohith to set it.

**Difficulty — five stories:**
- Two straightforward.
- Three that vary run to run. Sometimes two mid and one hard. Sometimes one mid and two hard.
  Alternate so no two consecutive runs feel the same.

**Type** — every story carries one, shown in the title:
`AI-Enabled` · `CSA Thinking` · `Risk` · `Data Integrity` · `Situational` · `Change Control` ·
`Supplier and Hosting` · `Qualification` · `Regulatory`

**Round** — every story carries one:
`Screening` · `Technical` · `Panel`

**Company type** — mix across the five. Some questions framed for a **product company** that
builds and hosts the software; some for a **service provider** validating somebody else's
system for a client. Say which framing applies where it changes the answer.

**Situational questions are mandatory.** At least one story per run must be a real scenario —
"an inspector has just found X, walk me through your next hour" — not a knowledge question.
At five years of experience this is what separates candidates, and it must not be crowded out.

---

## 7. The epic

**Name:** `CSV/CSA Epic — <today's date>`, for example `CSV/CSA Epic — 13th Aug 2026`.

If the routine fires a second time on the same day, the name becomes
`CSV/CSA Epic — 13th Aug 2026 Round 2`, then `Round 3`, and so on. Check the project for
today's epics before naming.

**The epic description contains:**

- One line on what the epic is.
- The difficulty mix used this run.
- Which rounds are covered.
- A note that topic weighting came from current job adverts.
- Which company types are represented.
- The interviewers, named with their designations.
- The source rule (section 10 below), stated in one line.
- **Three questions for Rohith to ask the interviewer**, at the foot. Practical ones about how
  the team really works — change notification, evidence capture, where validation reports.
  Vary these every run.

---

## 8. The story — required format

Every story follows this shape. **All five stories in a run are written at full depth.** None
are shortened or summarised — the weak-answer section only works as a contrast to a complete
answer, so a compressed story is a broken story.

**Summary line:**

```
[<Difficulty> · <Round> · <Type>] <the question, shortened to a readable title>
```

The description opens by repeating the same three tags, so a story identifies itself whether
it is read in a list or opened.

**Sections, in this order:**

### a. How it'll come at you
One short paragraph setting the room. Which round this is, who is asking, what kind of mood
they are in, and any trap hidden in how the question is worded.

### b. The interview
A real conversation. Not a question followed by an answer — a conversation.

- **Named interviewers with their designations on first speaking:**
  **Sarvanan — Validation Lead** and **Vasu — Director, Validation**.
- A screening or technical round is normally one interviewer, with the other joining briefly
  near the end. A panel round has both throughout.
- **It opens with a greeting and human conversation.** "Morning Rohith, how've you been?" —
  small talk, a reference to something he said in an earlier round, a reaction to the previous
  answer. Interviewers are people.
- **Follow-up probes happen live, inside the conversation.** The interviewer asks the main
  question, Rohith answers, the interviewer pushes — "be concrete", "now take the other side",
  "here's the one I actually care about" — and Rohith answers again. **Three to five exchanges
  per story.** This is the heart of the format: the probing is where the learning happens, and
  it belongs in the story, not in a list afterwards.
- Interviewers react honestly. They say when an answer was good and why. They say when a
  candidate has drifted. They are warm but not soft.
- **Every answer is labelled** `**Rohith's answer —**` followed by the answer as a blockquote,
  written in first person, as spoken.
- The first answer is the short one — roughly twenty seconds of speech, the thing you lead
  with. Depth comes out through the probes that follow, exactly as it does in a real interview.

### c. Coaching — <name>, stepping out of the interview
Clearly marked as leaving the interview. Contains:

- **The version that quietly loses you the job.** One or two weak answers written out in full,
  and an explanation of what each one signals to the interviewer. Say why the confident-sounding
  wrong answer is often more damaging than the hesitant right one.
- **Your turn — write your own example here.** A prompt asking Rohith for a real example from
  his own work that fits this question. Be specific about what would make a good one, and say
  plainly when he may not have a relevant example and should use the nearest true thing rather
  than invent one.
- **Where they'll go next.** Three follow-up questions, questions only, no answers. These may
  be promoted into their own stories on a later day.
- **Sources.** Named regulations and guidance. See section 10.

---

## 9. Voice

Two voices, and they must not blend.

**The coaching voice** — Vasu and Sarvanan talking to Rohith. Warm, direct, occasionally funny,
honest about what is hard. Encouraging without being soft. This is a senior colleague who wants
him to get the job.

**The answer voice** — what Rohith says in the room. Calm, plain, confident. Natural, but not
chatty. Never write a model answer full of jokes; he has to be able to say it to a panel with a
straight face.

**Everything is plain English.** Short sentences. Ordinary words. If a sentence needs reading
twice, rewrite it. The reader should feel someone is talking to him, not at him.

---

## 10. Accuracy and sources

- **Every answer names the regulation or guidance behind it** — the relevant part of 21 CFR
  Part 11, EU GMP Annex 11, GAMP 5 Second Edition, FDA guidance on computer software assurance,
  data integrity guidance and the ALCOA+ principles, and the AI-related guidance where it
  applies.
- **Never quote a clause number, section number or publication date that has not been verified
  against the primary document.** Describe what the guidance requires, and stop there.
- **Where a source was drawn from search summaries rather than a full reading, say so in the
  story**, in a sentence, at the point it matters. Tell Rohith to check it before quoting it in
  an interview. Getting a date wrong on the one document a question is about is a bad way to
  end a good answer.
- Draft or proposed regulation must be described as draft, with the caution that it may change.
- Never invent a statistic, a survey result, or a claim about what "most companies" do.

---

## 11. Jira

| Item | Value |
|---|---|
| Project | **CSV** — *CSV/CSA* |
| Epic issue type | `Epic` |
| Story issue type | `Story` |
| Structure | One epic per run, five stories linked to it |
| Status | The project's default starting status |
| Assignee | Rohith Karne |

Write nothing to any other project.

---

## 12. Listing the questions on demand

When Rohith asks for the list of questions, **generate it fresh from Jira** — there is no
standing local file to maintain, because a second copy drifts the moment a ticket is edited.

The export contains, for each story: **the question, its type tag, and its ticket reference.**
No answers. He opens the ticket when he wants the answer.

---

## 13. When the well runs dry

The supply of genuinely distinct main questions in this field is finite. If several runs a day
continue for weeks, it will run down.

**When a topic area is exhausted, say so.** Tell Rohith which areas are used up and what is
left. Do not pad a run with thin variations of questions already in the project — a near-duplicate
dressed in new words is worse than an honest short run, because it wastes his time and quietly
breaks the duplication rule.

---

## 14. What this routine never does

- Never mentions Pharaxis One, its products, its code, or its team beyond the two simulated
  interviewers.
- Never claims a company is a customer of anything.
- Never writes to a Jira project other than CSV.
- Never asks Rohith to choose the difficulty — the mix is automatic.
- Never shortens a story. All five are full depth.
- Never presents an unverified date or clause number as fact.

---

## 15. Decisions this prompt encodes

Agreed with Rohith in session on 2026-08-13.

| Decision | Where |
|---|---|
| One epic, five stories, manual run | §3, §7 |
| Epic naming, including same-day rounds | §7 |
| Two straightforward, three varying mid/hard | §6 |
| Type, difficulty and round tags in title and body | §6, §8 |
| Duplication on main questions only | §5 |
| Follow-ups live inside the interview, three to five exchanges | §8b |
| Follow-ups promoted later with a reference back | §5 |
| Named interviewers with designations, greetings, human reaction | §8b |
| Answers written as "Rohith's answer —" | §8b |
| Regulation named in every answer | §10 |
| What a weak answer sounds like | §8c |
| Prompt for Rohith's own example | §8c |
| Situational questions mandatory | §6 |
| Job advert scan drives topic weighting | §4 |
| Product-company and service-provider framing, mixed | §6 |
| Say when a source was summarised, not read | §10 |
| Three questions for Rohith to ask them, at epic level | §7 |
| CV read for reference only, questions not narrowed to it | §2 |
| Question list generated from Jira on demand, no standing file | §12 |
| Honest when a topic area is exhausted | §13 |

**Dropped by Rohith, recorded so it is not re-proposed:** a field for Rohith to record his own
answer and rate himself weak or solid, and the spaced-repetition follow-on that depended on it.
He will raise weak areas in conversation instead.
