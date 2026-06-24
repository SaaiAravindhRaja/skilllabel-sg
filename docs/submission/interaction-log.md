# SkillLabel SG Interaction Log

This document summarises the collaboration evidence for the PyConSG 2026 hackathon submission.

## AI-human collaboration

The project was built through an iterative human-in-the-loop workflow.

Representative human prompts and decisions:

- "I want to do Track 1 Job. Think outside the box ideas, not NPC ideas."
- "TrialShift SG: try the job before you buy the course. Build this. Isn't this what Forage does?"
- "Engineer the best UI possible."
- "Make the core logic more bullet proof."
- "Keep prompting yourself. Do not wait for my intervention."
- "Make the GitHub public."
- "Publish it to a Vercel link that doesn't require auth."
- "Test the flow. Does the flow make sense? Is it easy to navigate and edit?"
- "Remove the AI ahhh logo."

What was delegated to AI:

- Comparing possible Track 1 product ideas against the hackathon brief.
- Drafting the app architecture and UI flow.
- Implementing the React/Vite interface, Python data generator, deterministic scoring logic, proof guardrails, tests, and deployment setup.
- Running local checks, browser QA, Vercel deployment, and public repo hygiene.

What stayed human-judged:

- Rejecting generic career-pathfinder ideas.
- Choosing the "does this course really prepare me for this job?" framing.
- Pushing for a stronger desktop-first UI and a less generic visual identity.
- Deciding that proof and evidence guardrails mattered more than a simple skill-gap recommender.
- Approving the public GitHub and Vercel release.

## Human-human collaboration

This was primarily a solo build. No private stakeholder interviews were used.

Human inputs came from:

- The official PyConSG Track 1 hackathon brief.
- The SkillsFuture Jobs-Skills public dataset and Skills Framework framing.
- The builder's own experience as a learner evaluating whether courses and portfolios actually translate into job readiness.
- Public PyConSG programme material around lifelong learning, AI fluency, responsible use, and practical Python workflows.

## Build and review evidence

Key public artifacts:

- Live app: https://skilllabel-sg.vercel.app
- Source repo: https://github.com/SaaiAravindhRaja/skilllabel-sg
- Final idea document: https://github.com/SaaiAravindhRaja/skilllabel-sg/blob/main/docs/ideation/track1-final-idea.md
- Scoring tests: https://github.com/SaaiAravindhRaja/skilllabel-sg/blob/main/src/lib/scoring.test.js
- Data generator: https://github.com/SaaiAravindhRaja/skilllabel-sg/blob/main/scripts/build-skilllabel-data.py

Verification performed:

- `npm test -- --reporter=dot` passed with 50 tests.
- `npm run build` passed.
- `npm audit --audit-level=moderate` found 0 vulnerabilities.
- Browser QA confirmed the public Vercel app loads without authentication, has no console errors, and supports the core flow: paste/edit evidence, choose role, run proof demo, promote proof, and export reviewer packet.

