# SkillLabel SG

SkillLabel SG is a PyConSG Track 1 hackathon app that turns pasted course, job, or resume text into a SkillsFuture-backed alignment label for a target role. It also produces a targeted job-trial brief from the missing official gates, so a learner can try the work before buying the course and a provider can see what proof is still missing.

It uses three local SkillsFuture workbooks:

- `~/Downloads/jobsandskills-skillsfuture-unique-skills-list.xlsx`
- `~/Downloads/jobsandskills-skillsfuture-tsc-to-unique-skills-mapping.xlsx`
- `~/Downloads/jobsandskills-skillsfuture-skills-framework-dataset.xlsx`

## Run

```bash
npm install
python3 -m pip install -r requirements.txt
npm run data
npm run dev
```

The `data` script expects the three SkillsFuture workbooks above to exist in `~/Downloads`.

## Verify

```bash
npm test
npm run build
```

## What It Shows

- Official role alignment
- Explicit course buy/no-buy call tied to Ready threshold gaps
- Knowledge vs ability evidence
- Proficiency gates
- CASL and emerging skill coverage
- Updated skill-name warnings
- Missing gates
- Claim-basis detection for course promises, job requirements, job-trial plans, and proof-bearing evidence
- Gate-specific proof dossier showing which artifacts and reviewer checks must be attached before a claim is Ready
- Ready threshold math showing exact official and ability gates remaining
- Best-fit target shortlist that detects when another official role is a stronger match than the selected target
- Evidence packet and action checklist
- Targeted job-trial brief with a structured preview, primary deliverable, rubric, and submit checklist
- Submitted-artifact proof check that grades completed work against the generated job-trial rubric
- One-click proof demo that loads the job-trial brief and completed proof sample for fast judging
- Proof-impact delta showing score gains, newly cleared gates, and remaining Ready threshold gaps after promotion
- Export-ready reviewer packet that prints the label, proof impact, integrity audit, plain-English decision reason, official row trace, remaining gates, and source caveat
- Plan-copy guardrail: the generated job-trial brief itself cannot pass as submitted proof
- Official-row echo guardrail: copied Skills Framework ability rows cannot become Ready without a completed artifact, reviewer/rubric proof, and source trail
- Proof-phrase wrapper guardrail: reviewer/rubric/source words still fail when the artifact body lacks concrete role-specific detail
- Gate-linked proof guardrail: artifact details must sit beside enough claimed official skills, not only somewhere in the pasted packet
- Fill-in missing-proof format that tells users exactly what to paste for each blocked official gate
- One-click proof-draft loader that moves the missing-proof format into the evidence editor as a non-proof repair draft
- Cumulative promote-proof flow that appends reviewer-ready trial work into the primary proof-bearing portfolio
- Side-by-side evidence comparison with coverage, ability, knowledge, and confidence deltas
- Independent comparator evidence type for course, job ad, resume, or job-trial-plan scoring
- Comparison reasons and shared blockers
- Copyable reviewer memo with the decision, score, integrity audit, why-blocked narrative, missing-proof format, proof requirements, Ready threshold, gates, comparator note, warnings, and source files
- Anti-stuffing guardrails: official skill titles alone become near-matches, not cleared gates
- Proof guardrails: job-trial plans, job ads, copied official rows, proof-word wrappers, and detached artifact notes can be useful scans, but cannot become Ready without submitted or assessed evidence tied to the claimed gates

The app is deterministic and does not require API keys.
