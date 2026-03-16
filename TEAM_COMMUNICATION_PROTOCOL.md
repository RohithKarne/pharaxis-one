# MIMS Project — Team Communication Protocol
> Rohith must see ALL communication — intra-team, cross-team, and any member reaching Rohith directly.
> This is non-negotiable. Any AI system must read and follow this before doing any work.

---

## What "full communication" means

### Level 1 — Intra-team (within each team)
Show the conversation happening INSIDE each team:

**Dev team example:**
```
Rajeev → Varun
"Here's what we need to build. Break it down and assign."

Varun → Bhavya, Vivek
"Bhavya — take the DB schema and backend route. Vivek — take the frontend component."

Bhavya → Varun
"Understood. One question — should the table be indexed on source only or source + date?"

Varun → Bhavya
"Both — Rajeev said queries will filter on both frequently."
```

**QA team example:**
```
Narasimha → Bindu
"New feature ready. Plan the test coverage."

Bindu → Krishnapriya
"Design the test cases. Ramya will execute manual. Tharun supports."

Krishnapriya → Ramya
"Here are the 6 test cases for Service Log. Run these first..."

Ramya → Krishnapriya
"On it. I'll report back once the first pass is done."
```

**Product team example:**
```
Vanaja → Priya
"Rohith wants us to review the Service Log requirements. Check if we need anything additional."

Priya → Vanaja
"Looking at it now. I'd suggest we also capture the user who triggered a manual test — audit trail perspective."
```

---

### Level 2 — Cross-team (between Dev, QA, Product)
Show handoffs and collaboration across teams:

```
Rajeev → Narasimha
"Feature X is built and deployed. Here's what QA needs to cover..."

Narasimha → Rajeev
"Received. One gap I noticed — we need to handle the empty state. Is that expected behaviour or a bug?"

Rajeev → Narasimha
"Expected. Document it as known behaviour."

Vanaja → Rajeev
"Product perspective — users will expect a refresh button on the Service Log. Should we add it?"

Rajeev → Vanaja
"Good point. I'll raise it with Rohith."
```

---

### Level 3 — Any member reaching Rohith directly
Any team member (not just leads) can reach Rohith directly in chat:

```
Srikar → Rohith
"Quick question — for the date filter, should 'From' and 'To' be inclusive on both ends?"

Ramya → Rohith
"Test result update — 5 of 6 cases passed. One issue found in the pagination..."

Priya → Rohith
"From a BA perspective, I'd recommend we also log which user triggered the test. Useful for audit."
```

---

## When to show communication

| Scenario | Communication required |
|---|---|
| Requirement received from Rohith | Rajeev relays to dev team + notifies Narasimha + Vanaja |
| Discussion before building | Dev team discusses internally, visible in chat |
| Feature built | Rajeev → Varun (review) → Narasimha (QA handoff) → Vanaja (product update) |
| QA test planning | Narasimha → Bindu → Krishnapriya → Ramya/Tharun, all visible |
| Bug found | Ramya/Tharun → Krishnapriya → Bindu → Narasimha → Rajeev |
| Product suggestion | Vanaja/Priya/Ananya/Meera can speak, Vanaja surfaces to Rohith |
| Clarification needed | Any member → Rohith directly |
| Fix delivered | Same as feature built pattern |
| Decision needed | Relevant leads discuss, then surface to Rohith if needed |

---

## What NEVER to skip

1. Intra-team conversations — don't just show the final output, show the team discussing how to get there
2. QA internal assignment — Narasimha must always cascade to Bindu → Krishnapriya → Ramya/Tharun
3. Product team input — Vanaja and BAs must weigh in on every feature, not just be notified
4. Replies — when someone is told something, they must acknowledge or respond
5. Cross-team questions — if Dev has a question for QA or Product, show that conversation

---

## Format rule

Every communication block must be:
```
**[Sender Name] → [Recipient Name(s)]**
[Message — specific, in their voice, at their experience level]
```

Separate each person's message with a blank line. Group by team when intra-team, then cross-team, then any direct-to-Rohith.
