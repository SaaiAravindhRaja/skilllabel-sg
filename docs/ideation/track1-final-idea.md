# PyConSG Track 1 Final Idea

## SkillLabel SG

Tagline: a nutrition label for upskilling.

Build a product that turns any course outline, job ad, or learner profile into
an official SkillsFuture-backed label. It shows what the thing actually teaches
or proves, what role it really prepares someone for, which skills are missing,
and what one practical job-trial artifact would close the gap before someone
buys or markets the course.

This is not a course recommender. It is not a career pathfinder. It is a
truth-in-labelling layer for lifelong learning.

## Why This Wins

Everyone says "learn AI", "job-ready", "industry-aligned", "career switch".
Nobody shows a clean receipt.

SkillLabel SG gives the receipt:

- official role alignment
- a plain buy/no-buy call for the course
- skills covered
- proficiency level coverage
- knowledge vs ability coverage
- CASL and emerging-skill tags
- missing gates
- outdated skill-name warnings
- one job-trial brief

The demo is visual, practical, and instantly understandable. Judges do not need
a long explanation. Paste a course outline, choose a target role, and the app
prints a label that exposes whether the course actually covers the official
skills needed for that role.

## The 90-Second Demo

Target role:

```text
Infocomm Technology
Business Analyst / Artificial Intelligence Translator
```

Dataset evidence for that role:

- 25 official skills
- 27 role-skill rows
- proficiency levels 3 and 4
- 30 key tasks
- 312 knowledge/ability items
- 8 emerging skill overlaps by title
- 5 CASL skill overlaps by title

Paste a course outline:

```text
AI for Business Leaders
- prompt engineering
- dashboards
- AI strategy
- use cases
- ethics overview
```

SkillLabel generates:

```text
SKILLLABEL SG

Target Role: Business Analyst / Artificial Intelligence Translator
Official Coverage: 34%
Ability Coverage: 18%
Knowledge Coverage: 51%
Emerging Skill Coverage: 3 / 8
CASL Skill Coverage: 1 / 5

Label Verdict:
Good awareness course.
Not job-ready for this role.

Missing Gates:
1. Business Needs Analysis L4
2. Data Strategy L4
3. Test Planning L3
4. Software Testing L3
5. Business Requirements Mapping L4

Job-Trial Brief:
Build one capstone where the learner converts an AI use case into requirements,
test cases, stakeholder risks, and a dashboard acceptance memo before buying
deeper training.
```

Then click "evidence":

- official skill title
- proficiency level
- official key task
- knowledge item
- ability item
- claim basis: course promise, job requirement, job-trial plan, or proof-bearing evidence
- best-fit official target roles when the selected role is weaker than another role
- gate-specific proof dossier for the exact artifacts and reviewer checks still needed
- exact gates still needed to cross the Ready threshold
- unique skill mapping
- CASL/emerging status where available

Then compare a job-trial brief:

- current course vs generated job-trial artifact
- independent comparator type: course, job ad, resume, or job-trial plan
- signed coverage, ability, knowledge, and confidence deltas
- unique gates the better packet clears
- shared blockers that still need evidence
- judge-readable reasons for the winner
- structured job-trial preview with one primary deliverable, rubric, and submit checklist tied to the current missing gates
- submitted-artifact proof check that grades completed work against the job-trial rubric
- one-click proof demo that loads the generated trial and a completed proof sample
- proof-impact delta showing what promotion improved and which Ready gates remain
- export-ready reviewer packet with label, proof impact, integrity audit, why-blocked narrative, official row trace, remaining gates, and source caveat
- plan-copy guardrail so the generated brief itself cannot pass as proof
- official-row echo guardrail so copied Skills Framework ability rows still need completed artifact proof, reviewer/rubric notes, and source trail
- proof-phrase wrapper guardrail so empty "reviewer/rubric/source" wording still fails without concrete artifact detail
- gate-linked proof guardrail so artifact details must attach to enough claimed official skills
- fill-in missing-proof format for each blocked official gate
- one-click proof-draft loader that sends the format into the evidence editor as a repair draft
- cumulative promote-proof flow that appends reviewer-ready trial work into the primary evidence label
- proof guardrail showing the job-trial brief is a plan until submitted artifacts exist

Then copy the reviewer memo:

- decision status and primary action
- official score summary
- Ready threshold counts
- claim-basis warning when the source is a promise, job ad, or plan
- proof requirements to attach before claim-ready export
- integrity audit with row echoes, proof-detail ratio, and gate-proof ratio
- plain-English reason the packet is blocked or exportable, plus the next repair move
- paste-ready missing-proof format for the blocked gates
- cleared evidence and next gates
- comparison note and remaining blockers
- source workbook list and accreditation caveat

## Winning Visual Surface

The main output is a literal label. Think nutrition facts, not dashboard.

```text
------------------------------------------------
 SKILLLABEL SG
 Official SkillsFuture Alignment
------------------------------------------------
 Target Role        AI Business Analyst
 Coverage           34%   ███████░░░░░░░░░
 Ability Evidence   18%   ████░░░░░░░░░░░░
 Knowledge Evidence 51%   ██████████░░░░░░
 Emerging Skills    3/8   ✦ ✦ ✦ ○ ○ ○ ○ ○
 CASL Skills        1/5   ● ○ ○ ○ ○
------------------------------------------------
 Claim Risk: HIGH
 This course is awareness-heavy, not job-ready.
------------------------------------------------
 Missing Gates
 [ ] Business Needs Analysis L4
 [ ] Data Strategy L4
 [ ] Test Planning L3
 [ ] Software Testing L3
------------------------------------------------
 Job-Trial Brief
 Build an AI requirements + test plan capstone.
------------------------------------------------
```

It should feel like scanning a barcode and seeing the real ingredients.

## Why It Is Practical

For learners:

- avoid paying for courses that do not match the role they want
- understand whether a course teaches knowledge, ability, or both
- get one concrete job-trial artifact to build before paying for more training

For course providers:

- map syllabus modules to updated Unique Skills
- see CASL/emerging skill coverage
- find missing ability evidence before submitting or marketing a course
- export a tagging packet for review

For career coaches:

- compare learner profile, course outline, and target role in one view
- explain gaps using official rows instead of vibes

## What The Data Supports

The three Excel files are enough for this:

1. Skills Framework Dataset
   - role descriptions
   - role tasks
   - role-skill links
   - proficiency levels
   - knowledge and ability items

2. Unique Skills List
   - updated unique skill titles
   - skill descriptions
   - emerging skill flags
   - CASL flags

3. TSC to Unique Skills Mapping
   - old-to-new skill mapping
   - updated skill names
   - proficiency descriptions
   - status flags

The strongest hidden feature is the knowledge/ability split. Most products can
say "this course mentions Data Analytics." SkillLabel can say:

- official skill titles alone do not clear gates
- title-stuffed inputs are treated as near-matches that still need artifacts
- copied official ability rows are flagged as "Official row echo" unless a real proof trail is attached
- proof phrases without artifact detail are flagged before they can inflate a Ready claim
- detached artifact notes are rejected unless they are linked beside the official gates being claimed
- ability evidence carries more weight than awareness copy

```text
The course explains the concept, but does not give evidence of the ability.
```

That is much sharper.

## Real Dataset Anchors

The files contain:

- 39 sectors
- 250 sector-track combinations
- 2,030 role rows
- 40,373 role-task rows
- 44,527 role-skill rows
- 12,007 skill-code rows
- 150,264 knowledge/ability rows
- 2,316 unique skill titles
- 201 emerging skills
- 1,582 mapping rows where previous and updated unique skill names differ

Example role label target:

`Financial Services / Digital and Data Analytics / Data Analyst`

- 13 official skills
- 16 key tasks
- 163 knowledge/ability rows
- 4 emerging skill overlaps by title
- 2 CASL skill overlaps by title

Example outdated-name warning:

```text
Course says: Big Data Analytics
Updated Unique Skill: Data Analytics
Status: SFS true
```

## Why This Beats The Previous Ideas

Killed:

- TrialShift: too close to Forage-style job simulation.
- SkillCourt: memorable, but negative and visually narrow.
- SkillMRT: visual, but still basically a career pathway map.
- Job ad prosecutor: fun, but easy to dismiss as a gimmick.
- Generic skill gap mapper: organizer-example NPC idea.
- Course recommender: commodity.

Survived:

**SkillLabel SG**, because it is a practical trust layer over the entire
learning market. It can score courses, jobs, resumes, and pathways using the
same official evidence model.

## Incumbent Collision Check

Closest categories:

- resume/job keyword matchers
- course recommendation engines
- career explorers
- labor-market pathway products
- SkillsFuture role/skill browsing tools

Why SkillLabel is different:

- it creates a label, not a recommendation list
- it checks knowledge vs ability evidence
- it uses CASL and emerging-skill flags
- it detects outdated skill names using the mapping file
- it produces a job-trial brief, not just a score
- it works on course outlines, job ads, resumes, and target roles using one
  official evidence model

## MVP

Backend:

- ingest all three Excel files
- build a role -> skill -> proficiency -> knowledge/ability graph
- normalize skill names through the mapping file
- flag CASL and emerging skills
- extract skill claims from pasted text
- score coverage against a selected target role

Frontend:

- paste box for course/job/resume text
- target role picker
- generated SkillLabel
- evidence drawer
- job-trial brief panel
- export as PNG/PDF

AI use:

- extract claims from messy text
- map text to likely official skills
- explain missing gates in plain language
- draft the job-trial capstone

Hard rule:

AI cannot invent official skills, proficiency levels, CASL flags, emerging
flags, or role requirements. It can only explain retrieved rows.

## Final Pitch

**SkillLabel SG gives every upskilling promise a SkillsFuture-backed nutrition
label, so learners can see what a course, job, or resume really covers before
they spend money or time on the wrong path.**
