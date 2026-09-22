# The Job — Routine Prompt

> Operational prompt for **The Job** routine.
> Agreed with Rohith Karne on 2026-08-13 as *CSV/CSA Interviews*; widened and renamed **The Job**
> on 2026-09-22. Manual run only, fired from the routines screen.
> **This routine is independent of Pharaxis One.** It never reads Pharaxis code, never
> references Pharaxis products, and never mentions the company. Everything it produces is
> general industry practice.

---

## 1. What this routine is

An interview rehearsal across the whole job, not only validation. Each run produces **one epic
and seven stories** in Jira:

- **six topic stories, one for each topic in section 6**, and
- **one extra situational story** — a real-world scenario drawn from one of the six topics.

Each story is one interview question, played out as a real conversation between an interviewer
and the candidate, followed by coaching notes.

The point is not to collect questions. It is to rehearse answering them out loud.

---

## 2. Who it is for

**Rohith Karne.** A Computer System Validation and Computer System Assurance professional with
around five years of experience across multiple cloud-hosted GxP applications. He is moving
from his current company to another, and the roles he is going for reach beyond validation into
project management, IT compliance, application support, system administration and AI. He
positions himself two ways at once:

- a solid traditional CSV practitioner who can run the project, support the system and
  administer it, and
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

1. **Search the web for interview questions actually being asked** for each of the six topics,
   in regulated life-sciences settings. Look at what candidates report being asked, not only
   what training material says should be asked.
2. **Search current job adverts** for the roles behind each topic — validation engineer and CSV
   lead, IT project manager on GxP systems, IT quality and compliance analyst, application
   support analyst, systems administrator on regulated platforms, AI governance and AI
   validation roles. Use what employers are asking for **now** to weight what each topic's
   question covers. This is what keeps the routine current instead of recycling old material.
3. **Read every existing story in the Jira project** — including the earlier `CSV/CSA Epic`
   runs — so the duplication check is real.

**Every topic is set in regulated life sciences (GxP).** A project management question is about
running a validated system rollout, not a generic IT project; a support question is about an
incident on a GxP system, not a help desk in general. Cover the applications that exist in this
market, not invented ones — safety databases, regulatory information management systems,
medical information platforms, content management and quality management systems. Name real
product categories where it helps the question feel authentic. Do not pretend to knowledge of a
specific product's internals.

---

## 5. Duplication rules

| Item | Rule |
|---|---|
| **Main question of a story** | **Must never repeat** any main question already in the project, in any epic, from any previous run — including the earlier `CSV/CSA Epic` runs. Check meaning, not wording — the same question asked differently is still a duplicate. |
| **Follow-up probes inside the interview** | Free to repeat. They exist to teach. |
| **"Where they'll go next" list at the foot** | Free to repeat. No check needed. |

**Promotion.** A follow-up question from an earlier story may later become the main question of
a new story. When that happens, the new story says so and gives the original story reference,
so the chain is traceable. Once promoted, it is a main question and is subject to the
duplication rule from then on.

---

## 6. The topics, and the mix for each run

Decide the mix automatically. Do not ask Rohith to set it.

### The six topics — one story each, every run

| Topic | Tag | What it covers |
|---|---|---|
| **Project Management** | `PM` | Planning and running a GxP system implementation, upgrade or release; scope, schedule and budget; stakeholder and steering-committee management; vendor and client management; risks, issues and dependencies; change requests; building validation into the plan rather than bolting it on; go-live readiness and hypercare; coordinating a release across many customer environments. |
| **IT Compliance** | `IT Compliance` | Access management and periodic access review, segregation of duties, backup and restore, disaster recovery and business continuity, infrastructure qualification, patch and vulnerability handling, procedures and training records, security incident handling, audit and inspection readiness. **The question is whether a control exists and can be proven.** |
| **Validation** | `Validation` | CSV and CSA thinking, risk-based approach, qualification, testing strategy and traceability, data integrity and ALCOA+, change control, supplier assessment and hosting, periodic review, regulatory expectations. |
| **Support** | `Support` | Incident, problem and change management on a GxP system; triage and severity; service levels; root cause analysis; when an incident becomes a deviation or a CAPA; communicating with a regulated customer during an outage; hypercare after go-live; known-error and workaround handling. |
| **System Administration** | `System Admin` | User provisioning and role design, configuration management, environment management across development, test, validation and production, release deployment, audit trail and electronic signature configuration, monitoring, patching, SaaS tenant administration. **The question is how the work is actually done, hands-on.** |
| **AI** | `AI` | Validating AI and machine-learning features, locked versus continuously learning models, training and test data integrity, human oversight, performance monitoring and drift, risk classification of an AI use, use of large language models in GxP work, and the emerging AI guidance. |

**IT Compliance and System Administration overlap on purpose.** Keep them apart by the angle:
IT Compliance asks *"is it controlled, and can you prove it?"*; System Administration asks
*"how do you actually do it?"*.

### The extra situational story

The seventh story is **always a real scenario** — *"an inspector has just found X, walk me
through your next hour"* — not a knowledge question. At five years of experience this is what
separates candidates.

- It draws on **one** of the six topics, and it is tagged `Situational · <topic>`.
- **Rotation:** read the last three epics. Pick a topic whose situational story has not appeared
  in any of them. Where every topic has appeared, pick the one used longest ago.
- Its main question must not overlap the topic story on the same topic in the same run.

### Difficulty

Across the seven stories:

- **Two straightforward**, among the six topic stories.
- **The other four topic stories vary between mid and hard** — sometimes two and two, sometimes
  three mid and one hard, sometimes one mid and three hard. Alternate so no two consecutive
  runs feel the same.
- **The situational story is always mid or hard.**
- Rotate which topics get the straightforward questions, so no topic is always easy.

### Round

Every story carries one: `Screening` · `Technical` · `Panel`. Mix them across the run.

### Company type

Mix across the seven. Some questions framed for a **product company** that builds and hosts the
software; some for a **service provider** running, validating or supporting somebody else's
system for a client. Say which framing applies where it changes the answer.

---

## 7. The epic

**Name:** `The Job — <today's date>`, for example `The Job — 22nd Sep 2026`.

If the routine fires a second time on the same day, the name becomes
`The Job — 22nd Sep 2026 Round 2`, then `Round 3`, and so on. Check the project for today's
epics before naming.

Earlier epics named `CSV/CSA Epic — <date>` stay as they are. They count for the duplication
check. They do not count for the situational rotation, because they had no topics.

**The epic description contains:**

- One line on what the epic is.
- The seven stories listed by topic, with which topic the situational story drew on.
- The difficulty mix used this run.
- Which rounds are covered.
- A note that topic weighting came from current job adverts.
- Which company types are represented.
- The interviewers, named with their designations.
- The source rule (section 10 below), stated in one line.
- **Three questions for Rohith to ask the interviewer**, at the foot. Practical ones about how
  the team really works — who owns the project plan, how incidents reach validation, how access
  is reviewed, where AI is already in use. Vary these every run.

---

## 8. The story — required format

Every story follows this shape. **All seven stories in a run are written at full depth.** None
are shortened or summarised — the weak-answer section only works as a contrast to a complete
answer, so a compressed story is a broken story.

**Summary line:**

```
[<Difficulty> · <Round> · <Topic>] <the question, shortened to a readable title>
```

For the extra story the topic reads `Situational · <topic>`. The description opens by repeating
the same tags, so a story identifies itself whether it is read in a list or opened.

**Sections, in this order:**

### a. How it'll come at you
One short paragraph setting the room. Which round this is, who is asking, what kind of mood
they are in, and any trap hidden in how the question is worded.

### b. The interview
A real conversation. Not a question followed by an answer — a conversation.

- **Each topic has its own interviewer**, named with their designation on first speaking. The
  same people are used run after run, so they become familiar:

  | Topic | Interviewer |
  |---|---|
  | Project Management | **Priya — Head of Delivery** |
  | IT Compliance | **Daniel — IT Quality and Compliance Lead** |
  | Validation | **Vasu — Director, Validation** |
  | Support | **Meera — Application Support Manager** |
  | System Administration | **Tom — Platform Operations Lead** |
  | AI | **Arjun — Head of AI Governance** |

- A screening or technical round is normally the topic's interviewer alone, with a second
  interviewer from the table joining briefly near the end. A panel round has two throughout.
  **The situational story is always a panel** — the topic's interviewer plus the one from the
  table whose area the scenario spills into.
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
- **At least one probe per story must be genuine pushback.** The interviewer is not convinced,
  says so, and makes him answer again — *"that's the textbook answer, but it doesn't survive
  contact"*, *"you've described what, not how"*, *"I don't buy that, try again"*. In at least
  one story per epic his first attempt is **deliberately incomplete or slightly wrong**, and he
  has to recover in the next exchange. **A panel that agrees with everything teaches nothing** —
  it is the recovery he needs to rehearse, not the applause. Do not close every exchange with a
  compliment.
- **Every answer is labelled** `**Rohith's answer —**` followed by the answer as a blockquote,
  written in first person, as spoken.
- **The first answer is genuinely short — roughly twenty seconds of speech, about sixty to
  eighty words.** Not a paragraph, not a mini-essay. In a real screening call a long opener gets
  interrupted, and rehearsing the wrong rhythm is worse than not rehearsing. **All the depth
  comes out through the probes that follow.** Later answers may run longer, but none should read
  as written prose — this is speech.

### c. Coaching — <name>, stepping out of the interview
The interviewer who led the story steps out and coaches. Clearly marked as leaving the
interview. Contains:

- **The version that quietly loses you the job.** One or two weak answers written out in full,
  and an explanation of what each one signals to the interviewer.
  **The point about a confident wrong answer being more damaging than a hesitant right one is
  made in full in exactly ONE story per epic — the one where it bites hardest.** Everywhere else
  it may be referred to in a clause, or not at all. Repeating the same lesson at length in all
  seven stories turns an insight into padding, and the reader starts skipping the section that
  matters most.
  The same applies to the **source caveat**: written out in full in the first story that needs
  it, then reduced to a single line elsewhere.
- **Your turn — write your own example here.** A prompt asking Rohith for a real example from
  his own work that fits this question. Be specific about what would make a good one, and say
  plainly when he may not have a relevant example — likely on some project management, system
  administration or AI questions — and should use the nearest true thing rather than invent one.
- **Where they'll go next.** Three follow-up questions, questions only, no answers. These may
  be promoted into their own stories on a later day.
- **Sources.** Named regulations, guidance and recognised practice. See section 10.

---

## 9. Voice

Two voices, and they must not blend.

**The coaching voice** — the interviewer talking to Rohith. Warm, direct, occasionally funny,
honest about what is hard. Encouraging without being soft. This is a senior colleague who wants
him to get the job.

**The answer voice** — what Rohith says in the room. Calm, plain, confident. Natural, but not
chatty. Never write a model answer full of jokes; he has to be able to say it to a panel with a
straight face.

**Everything is plain English.** Short sentences. Ordinary words. If a sentence needs reading
twice, rewrite it. The reader should feel someone is talking to him, not at him.

---

## 10. Accuracy and sources

- **Every answer names the regulation, guidance or recognised practice behind it.**
  - Validation, IT Compliance and System Administration — the relevant parts of 21 CFR Part 11,
    EU GMP Annex 11, GAMP 5 Second Edition, FDA guidance on computer software assurance, and data
    integrity guidance with the ALCOA+ principles.
  - Support — recognised IT service management practice, and what the GxP rules above expect of
    incident, problem and change handling, deviations and CAPA.
  - Project Management — **no regulation governs project management itself.** Name the recognised
    practice the answer draws on and call it practice, not regulation; name the GxP guidance
    wherever the project touches validation, change control or data.
  - AI — the AI-related guidance that applies, including draft EU GMP Annex 22, the EU AI Act and
    FDA's AI-related guidance, alongside GAMP 5 and the data integrity guidance.
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
| Project | **CSV** — *CSV/CSA* (kept on 2026-09-22 so the duplication check covers every question asked so far) |
| Epic issue type | `Epic` |
| Story issue type | `Story` |
| Structure | One epic per run, seven stories linked to it |
| Status | The project's default starting status |
| Assignee | Rohith Karne |

Write nothing to any other project.

---

## 12. Listing the questions on demand

When Rohith asks for the list of questions, **generate it fresh from Jira** — there is no
standing local file to maintain, because a second copy drifts the moment a ticket is edited.

The export contains, for each story: **the question, its topic tag, and its ticket reference.**
No answers. He opens the ticket when he wants the answer. Earlier `CSV/CSA Epic` stories show
their original type tag.

---

## 13. When the well runs dry

The supply of genuinely distinct main questions is finite, and it runs down per topic. If
several runs a day continue for weeks, a topic will run low.

**When a topic area is exhausted, say so.** Tell Rohith which topic is used up and what is left
inside it. Do not pad a run with thin variations of questions already in the project — a
near-duplicate dressed in new words is worse than an honest short run, because it wastes his
time and quietly breaks the duplication rule. A run with a missing topic, stated plainly, is
acceptable; a padded one is not.

---

## 14. What this routine never does

- Never mentions Pharaxis One, its products, its code, or its team beyond the simulated
  interviewers.
- Never claims a company is a customer of anything.
- Never writes to a Jira project other than CSV.
- Never asks Rohith to choose the difficulty or the topics — the mix is automatic.
- Never shortens a story. All seven are full depth.
- Never presents an unverified date or clause number as fact.

---

## 15. Decisions this prompt encodes

Agreed with Rohith in session on 2026-08-13, and widened on 2026-09-22.

| Decision | Where |
|---|---|
| **Renamed *The Job*; six topics — PM, IT Compliance, Validation, Support, System Admin, AI** (2026-09-22) | §1, §6 |
| **Seven stories a run — one per topic plus one extra situational** (2026-09-22) | §1, §6 |
| **Every topic set in regulated life sciences (GxP)** (2026-09-22) | §4 |
| **Kept in Jira project CSV; epic named `The Job — <date>`** (2026-09-22) | §7, §11 |
| **A matching interviewer per topic, same cast every run** (2026-09-22) | §8b |
| **Situational story rotates across topics and is always a panel** (2026-09-22) | §6, §8b |
| Manual run | §3 |
| Epic naming, including same-day rounds | §7 |
| Two straightforward, the rest varying mid/hard | §6 |
| Difficulty, round and topic tags in title and body | §6, §8 |
| Duplication on main questions only | §5 |
| Follow-ups live inside the interview, three to five exchanges | §8b |
| Follow-ups promoted later with a reference back | §5 |
| Named interviewers with designations, greetings, human reaction | §8b |
| Answers written as "Rohith's answer —" | §8b |
| Regulation, guidance or recognised practice named in every answer | §10 |
| What a weak answer sounds like | §8c |
| Prompt for Rohith's own example | §8c |
| At least one genuine pushback per story; one weak first attempt per epic | §8b |
| Opening answer held to about twenty seconds | §8b |
| The confident-wrong-answer lesson stated in full once per epic, not every story | §8c |
| Job advert scan drives topic weighting | §4 |
| Product-company and service-provider framing, mixed | §6 |
| Say when a source was summarised, not read | §10 |
| Three questions for Rohith to ask them, at epic level | §7 |
| CV read for reference only, questions not narrowed to it | §2 |
| Question list generated from Jira on demand, no standing file | §12 |
| Honest when a topic area is exhausted | §13 |

**Replaced on 2026-09-22:** the eleven question types (AI-Enabled, CSA Thinking, Risk, Data
Integrity, Situational, Change Control, Supplier and Hosting, Qualification, Regulatory, IT
Compliance, Testing), the rule that any type absent from the last three epics is picked first,
and the rule that AI-Enabled appears every other run. The six topics replace them — most of the
old types now sit inside Validation, and AI appears every run. The two interviewers of the old
format (Sarvanan and Vasu) are replaced by the per-topic cast; Vasu stays for Validation.

**Dropped by Rohith, recorded so it is not re-proposed:** a field for Rohith to record his own
answer and rate himself weak or solid, and the spaced-repetition follow-on that depended on it.
He will raise weak areas in conversation instead.
