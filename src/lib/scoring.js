const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "that",
  "their",
  "this",
  "to",
  "with",
  "your",
  "course",
  "module",
  "overview",
  "introduction",
  "general",
]);

const COVERAGE_THRESHOLD = 0.46;
const WEAK_MATCH_THRESHOLD = 0.3;
const READY_COVERAGE_PCT = 60;
const READY_ABILITY_PCT = 45;
const ROLE_FIT_CANDIDATE_LIMIT = 160;
const ROLE_FIT_INDEX = new WeakMap();

function normalizeText(text = "") {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

function normalizeToken(token) {
  let value = normalizeText(token);
  if (value.length > 4 && value.endsWith("ies")) value = `${value.slice(0, -3)}y`;
  if (value.length > 4 && value.endsWith("ments")) value = value.slice(0, -1);
  if (
    value.length > 4 &&
    value.endsWith("s") &&
    !value.endsWith("ss") &&
    !value.endsWith("sis") &&
    !value.endsWith("ics")
  ) {
    value = value.slice(0, -1);
  }
  return value;
}

export function tokenize(text = "") {
  const matches = normalizeText(text).match(/[a-z0-9+#]{2,}/g) || [];
  const tokens = [];
  const seen = new Set();

  for (const match of matches) {
    const token = normalizeToken(match);
    if (!token || STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function rawTokens(text = "") {
  return (normalizeText(text).match(/[a-z0-9+#]{2,}/g) || [])
    .map(normalizeToken)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function countPhraseHits(text, phrases = []) {
  const normalized = normalizeText(text);
  return phrases.filter((phrase) => normalized.includes(normalizeText(phrase))).length;
}

function overlap(tokens, tokenSet) {
  return tokens.filter((token) => tokenSet.has(token));
}

function overlapCount(tokens, tokenSet) {
  let count = 0;
  for (const token of tokens) {
    if (tokenSet.has(token)) count += 1;
  }
  return count;
}

function withoutTitleTokens(tokens, titleTokenSet) {
  return tokens.filter((token) => !titleTokenSet.has(token));
}

function containsTokenSequence(haystackTokens, needleTokens) {
  if (!needleTokens.length || needleTokens.length > haystackTokens.length) return false;
  for (let start = 0; start <= haystackTokens.length - needleTokens.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needleTokens.length; offset += 1) {
      if (haystackTokens[start + offset] !== needleTokens[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function phraseHit(inputText, phrase) {
  const phraseTokens = rawTokens(phrase);
  return phraseTokens.length > 0 && containsTokenSequence(rawTokens(inputText), phraseTokens);
}

function aliasStats(skill, inputText, tokenSet) {
  return unique([skill.updatedTitle, skill.title, skill.previousTitle]).map((alias) => {
    const tokens = tokenize(alias);
    const matches = overlap(tokens, tokenSet);
    return {
      alias,
      tokens,
      matches,
      exact: phraseHit(inputText, alias),
      coverage: tokens.length ? matches.length / tokens.length : 0,
      mapped: Boolean(skill.previousTitle && alias === skill.previousTitle),
    };
  });
}

function hasNegatedAnchor(inputText, snippet) {
  const snippetTokens = rawTokens(snippet);
  const input = rawTokens(inputText);
  const negators = new Set(["no", "not", "never", "without", "lack", "lacks", "missing"]);
  const anchor = snippetTokens.find((token) => !STOP_WORDS.has(token));
  if (!anchor) return false;

  return input.some((token, index) => {
    if (token !== anchor) return false;
    const windowStart = Math.max(0, index - 3);
    return input.slice(windowStart, index).some((previous) => negators.has(previous));
  });
}

function snippetMatch(snippet, tokenSet, inputText, options = {}) {
  const tokens = tokenize(snippet);
  if (!tokens.length) {
    return { hit: false, ratio: 0, matches: [] };
  }

  const matches = overlap(tokens, tokenSet);
  const ratio = matches.length / tokens.length;
  const required = tokens.length <= 3 ? tokens.length : Math.max(3, Math.ceil(tokens.length * 0.55));

  return {
    hit: matches.length >= required && !(options.negationSensitive && hasNegatedAnchor(inputText, snippet)),
    ratio,
    matches,
  };
}

function confidenceFor(score, covered, exact, abilityMatches, titleCoverage, titleOnly) {
  if (titleOnly && !covered) return "Low";
  if (covered && (score >= 0.72 || (exact && abilityMatches.length))) return "High";
  if (covered || score >= COVERAGE_THRESHOLD) return "Medium";
  if (score >= WEAK_MATCH_THRESHOLD || titleCoverage >= 0.5) return "Low";
  return "None";
}

function matchReasons({ exact, mappedExact, titleCoverage, descMatches, knowledgeMatches, abilityMatches }) {
  const reasons = [];
  if (mappedExact) reasons.push("mapped skill title");
  else if (exact) reasons.push("official skill title");
  if (abilityMatches.length) reasons.push("ability evidence");
  if (knowledgeMatches.length) reasons.push("knowledge evidence");
  if (titleCoverage >= 0.66 && !exact) reasons.push("strong title overlap");
  if (descMatches.length >= 3) reasons.push("role description overlap");
  if (!reasons.length) reasons.push("weak overlap");
  return reasons;
}

export function scoreSkill(skill, inputText) {
  const safeSkill = skill || {};
  const tokenSet = new Set(tokenize(inputText));
  const aliases = aliasStats(safeSkill, inputText, tokenSet);
  const titleTokenSet = new Set(unique(aliases.flatMap((item) => item.tokens)));
  const bestAlias = aliases.reduce((best, item) => (item.coverage > best.coverage ? item : best), {
    coverage: 0,
    matches: [],
    exact: false,
    mapped: false,
  });
  const exact = aliases.some((item) => item.exact);
  const mappedExact = aliases.some((item) => item.exact && item.mapped);
  const titleMatches = unique(aliases.flatMap((item) => item.matches));
  const titleCoverage = bestAlias.coverage || 0;

  const descTokens = tokenize(`${safeSkill.description || ""} ${safeSkill.levelDescription || ""}`);
  const descMatches = withoutTitleTokens(overlap(descTokens, tokenSet), titleTokenSet);
  const descRatio = descTokens.length ? descMatches.length / descTokens.length : 0;

  const knowledgeMatches = (safeSkill.knowledge || []).filter((item) => {
    const match = snippetMatch(item, tokenSet, inputText);
    return match.hit && withoutTitleTokens(match.matches, titleTokenSet).length > 0;
  });
  const abilityMatches = (safeSkill.ability || []).filter((item) => {
    const match = snippetMatch(item, tokenSet, inputText, { negationSensitive: true });
    return match.hit && withoutTitleTokens(match.matches, titleTokenSet).length > 0;
  });

  const exactScore = exact ? 0.42 : 0;
  const titleScore = Math.min(titleCoverage * 0.34, 0.34);
  const descScore = Math.min(descRatio * 0.2, 0.2);
  const knowledgeScore = Math.min(knowledgeMatches.length * 0.12, 0.24);
  const abilityScore = Math.min(abilityMatches.length * 0.22, 0.38);
  const score = Math.min(1, exactScore + titleScore + descScore + knowledgeScore + abilityScore);
  const hasNonTitleEvidence = abilityMatches.length > 0 || knowledgeMatches.length > 0 || descMatches.length >= 3;
  const hasHardEvidence = abilityMatches.length > 0 || knowledgeMatches.length >= 2;
  const titleOnly = exact && !hasNonTitleEvidence;
  const covered =
    !titleOnly && (score >= COVERAGE_THRESHOLD || (titleCoverage >= 0.78 && hasHardEvidence));
  const confidence = confidenceFor(score, covered, exact, abilityMatches, titleCoverage, titleOnly);
  const reasons = matchReasons({ exact, mappedExact, titleCoverage, descMatches, knowledgeMatches, abilityMatches });
  if (titleOnly) reasons.unshift("title-only match");

  return {
    skill: safeSkill,
    score,
    covered,
    confidence,
    reasons,
    exact,
    mappedExact,
    titleMatches,
    descMatches,
    knowledgeMatches,
    abilityMatches,
    titleOnly,
  };
}

function levelRank(level) {
  const number = Number.parseInt(level, 10);
  if (Number.isFinite(number)) return number;
  if (String(level).toLowerCase() === "advanced") return 6;
  if (String(level).toLowerCase() === "intermediate") return 3;
  return 1;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function assessClaimBasis(inputText = "", mode = "evidence") {
  const trialPlanCopy = looksLikeTrialPlanCopy(inputText);
  const repairSignals = countPhraseHits(inputText, [
    "job trial brief",
    "trial brief",
    "proof sprint",
    "portfolio repair brief",
    "repair brief",
    "primary deliverable",
    "submit this",
    "submit checklist",
  ]);
  const jobSignals =
    mode === "job"
      ? 1
      : countPhraseHits(inputText, ["job description", "role responsibilities", "must have", "we are looking", "candidate will"]);
  const plannedSignals = countPhraseHits(inputText, [
    "learners will",
    "participants will",
    "students will",
    "will learn",
    "will develop",
    "will be able",
    "course covers",
    "module covers",
    "workshop covers",
    "introduction to",
    "overview",
  ]);
  const assessedSignals = countPhraseHits(inputText, [
    "assessment",
    "assessed",
    "rubric",
    "graded",
    "capstone",
    "portfolio",
    "project",
    "case study",
    "submitted",
    "deliverable",
    "artifact",
    "acceptance criteria",
    "reviewer",
    "evidence pack",
  ]);
  const completedSignals = countPhraseHits(inputText, [
    "built",
    "implemented",
    "delivered",
    "created",
    "analysed",
    "analyzed",
    "developed",
    "tested",
    "designed",
    "deployed",
    "completed",
    "produced",
  ]);
  const proofBearingSignals = assessedSignals + completedSignals;

  if (mode === "repair" || trialPlanCopy || (repairSignals > 0 && proofBearingSignals < 2)) {
    return {
      mode,
      label: "Job trial plan",
      status: "Needs submitted proof",
      canClaimReady: false,
      warning: "Job trial brief is a plan, not completed evidence",
      proofRequirements: [
        "Completed learner artifact matching the job trial brief",
        "Assessment rubric or reviewer notes for the submitted work",
        "Source data, assumptions, and acceptance criteria used in the artifact",
      ],
      signals: { repair: repairSignals, trialPlanCopy: Number(trialPlanCopy), planned: plannedSignals, assessed: assessedSignals, completed: completedSignals },
    };
  }

  if (jobSignals > 0) {
    return {
      mode,
      label: "Job requirement",
      status: "Demand signal",
      canClaimReady: false,
      warning: "Job ads show demand, not learner proof",
      proofRequirements: [
        "Learner portfolio or resume evidence mapped against the job requirement",
        "Completed work examples for the strongest official gates",
        "Separate gap comparison between job demand and learner proof",
      ],
      signals: { job: jobSignals, planned: plannedSignals, assessed: assessedSignals, completed: completedSignals },
    };
  }

  if (mode === "course" && plannedSignals > 0 && assessedSignals + completedSignals < 2) {
    return {
      mode,
      label: "Course promise",
      status: "Needs assessed work",
      canClaimReady: false,
      warning: "Course promise needs assessed artifacts before Ready",
      proofRequirements: [
        "Assessed assignment, capstone, or project output",
        "Rubric mapping the submitted work to official ability rows",
        "Learner submission evidence, not only learning outcomes",
      ],
      signals: { planned: plannedSignals, assessed: assessedSignals, completed: completedSignals },
    };
  }

  if (assessedSignals + completedSignals >= 2 || mode === "resume") {
    return {
      mode,
      label: mode === "resume" ? "Profile evidence" : "Artifact evidence",
      status: "Ready-eligible",
      canClaimReady: true,
      warning: "",
      proofRequirements: [],
      signals: { planned: plannedSignals, assessed: assessedSignals, completed: completedSignals },
    };
  }

  return {
    mode,
    label: mode === "course" ? "Course outline" : "Evidence text",
    status: "Ready-eligible",
    canClaimReady: true,
    warning: "",
    proofRequirements: [],
    signals: { planned: plannedSignals, assessed: assessedSignals, completed: completedSignals },
  };
}

function claimRisk(coverage, abilityCoverage, claimBasis = {}) {
  if (coverage < 35 || abilityCoverage < 25) return "High";
  if (claimBasis.canClaimReady === false) return "Medium";
  if (coverage < READY_COVERAGE_PCT || abilityCoverage < READY_ABILITY_PCT) return "Medium";
  return "Low";
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function recipeFor(role, missing) {
  const roleName = role.role || "the selected role";
  const first = missing[0]?.skill;
  if (!first) {
    return {
      title: "Package the evidence",
      body: `Turn the strongest ${roleName} evidence into a short packet with task examples, assessment evidence, and source rows.`,
    };
  }
  const task = role.tasks?.[0] || `show applied ${first.updatedTitle || first.title} evidence`;
  return {
    title: `Close ${first.updatedTitle || first.title}`,
    body: `Add a real artifact where the learner must ${task.charAt(0).toLowerCase()}${task.slice(1)}. Judge it against ${first.updatedTitle || first.title} at level ${first.level}.`,
  };
}

function actionForMissingGate(role, gate, index) {
  const skill = gate.skill;
  const title = skill.updatedTitle || skill.title;
  const ability = skill.ability?.[0];
  const knowledge = skill.knowledge?.[0];
  const tasks = role.tasks || [];
  const task = tasks[index % Math.max(tasks.length, 1)] || tasks[0];

  return {
    id: `${skill.code || title}-${skill.level || "na"}`,
    title,
    level: skill.level,
    flags: [skill.casl ? "CASL" : "", skill.emerging ? "Emerging" : ""].filter(Boolean),
    priority: gate.priorityReason || "Highest-impact locked gate",
    artifact: task || `Produce a work sample that demonstrates ${title}.`,
    check: ability || knowledge || skill.description || `Show applied evidence for ${title}.`,
  };
}

function actionPlanFor(role, missing) {
  const roleName = role.role || "the selected role";
  if (!missing.length) {
    return [
      {
        id: "package-ready-evidence",
        title: "Prepare review packet",
        level: "",
        flags: [],
        artifact: `Bundle the strongest ${roleName} artifacts with the matching official skills.`,
        check: "Include enough context for a reviewer to see the task, output, and evidence source without extra explanation.",
      },
    ];
  }

  return missing.slice(0, 4).map((gate, index) => actionForMissingGate(role, gate, index));
}

function proofDossierFor(role, missing, claimBasis = {}, covered = []) {
  const roleName = role.role || "the selected role";
  const tasks = role.tasks || [];
  const sourceGates = missing.length ? missing : claimBasis.canClaimReady === false ? covered.slice(0, 4) : [];
  const gates = sourceGates.map((gate, index) => {
    const skill = gate.skill;
    const title = skill.updatedTitle || skill.title || "Official skill";
    const level = skill.level || "";
    const task = tasks[index % Math.max(tasks.length, 1)] || `Complete a role-relevant work sample for ${title}.`;
    const reviewerCheck = skill.ability?.[0] || skill.knowledge?.[0] || skill.description || `Show applied evidence for ${title}`;

    return {
      id: `${skill.code || title}-${level || "na"}-proof`,
      title,
      level,
      flags: [skill.casl ? "CASL" : "", skill.emerging ? "Emerging" : ""].filter(Boolean),
      priority: gate.priorityReason || (gate.covered ? "Matched gate still needs proof" : "Locked official gate"),
      attachment: `Submitted artifact for ${title}${level ? ` L${level}` : ""}`,
      workSample: task,
      reviewerCheck,
      trace: "task brief, learner output, rubric result, reviewer note, and source row",
    };
  });

  return {
    title: claimBasis.canClaimReady === false ? "Proof to attach before Ready" : "Evidence packaging proof",
    basis: claimBasis.label || "Evidence text",
    summary: gates.length
      ? `Attach gate-specific proof for ${plural(gates.length, claimBasis.canClaimReady === false && !missing.length ? "matched gate" : "locked gate")} before exporting ${roleName}.`
      : `Package the final ${roleName} evidence with source rows and reviewer notes.`,
    requirements: claimBasis.proofRequirements || [],
    gates,
  };
}

function sampleEvidenceLine(skill) {
  const title = skill.updatedTitle || skill.title;
  const evidence = skill.ability?.[0] || skill.knowledge?.[0] || skill.description || `Show applied evidence for ${title}`;
  return `- ${title} L${skill.level}: ${evidence}. Artifact detail for ${title}: traced source notes, exception samples, acceptance decisions, and reviewer follow-up for this gate.`;
}

function lowerFirst(text = "") {
  if (!text) return "";
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function uniqueSkillItems(items = []) {
  const seen = new Set();
  const skillItems = [];
  for (const item of items) {
    const skill = item.skill || item;
    const id = skillKey(skill);
    if (seen.has(id)) continue;
    seen.add(id);
    skillItems.push({ ...item, skill });
  }
  return skillItems;
}

function repairGatePool(role, label, limit) {
  const missing = label?.allMissingGates?.length ? label.allMissingGates : label?.missingGates || [];
  const fallback = [...(role.skills || [])].sort((a, b) => {
    const flagDelta = Number(b.casl || b.emerging) - Number(a.casl || a.emerging);
    if (flagDelta) return flagDelta;
    return levelRank(b.level) - levelRank(a.level);
  });
  const fallbackItems = fallback.map((skill) => ({
    skill,
    score: 0,
    priorityReason: priorityReason({ skill, score: 0 }),
  }));
  return uniqueSkillItems(missing.length ? missing : fallbackItems).slice(0, limit);
}

function repairDeliverable(skill, index) {
  const title = skill.updatedTitle || skill.title || "Skill evidence";
  const ability = skill.ability?.[0] || skill.knowledge?.[0] || skill.description || `demonstrates ${title}`;
  const artifacts = ["decision memo", "evidence appendix", "review deck", "implementation note"];
  return `${artifacts[index % artifacts.length]}: ${lowerFirst(ability)}.`;
}

export function buildRepairArtifactPlan(role, label = null, limit = 8) {
  const safeRole = role || {};
  const selectedItems = repairGatePool(safeRole, label, limit);
  const selected = selectedItems.map((item) => item.skill);
  const roleName = safeRole.role || "selected role";
  const scenario = safeRole.tasks?.[0] || `perform realistic ${roleName} work`;
  const deliverableGates = selectedItems.slice(0, 4);
  const submitItems = deliverableGates.length
    ? deliverableGates.map((item, index) => {
        const skill = item.skill;
        const title = skill.updatedTitle || skill.title;
        return {
          title,
          level: skill.level,
          reason: item.priorityReason || priorityReason(item),
          body: repairDeliverable(skill, index),
        };
      })
    : [
        {
          title: "Role evidence pack",
          level: "",
          reason: "No official skill rows loaded",
          body: `bundle the strongest ${roleName} artifacts with the matching official skills.`,
        },
      ];
  const rubric = selectedItems.length
    ? selectedItems.map((item) => {
        const skill = item.skill;
        const title = skill.updatedTitle || skill.title;
        const check = skill.ability?.[0] || skill.knowledge?.[0] || skill.description || `Show evidence for ${title}`;
        return {
          title,
          level: skill.level,
          reason: item.priorityReason || priorityReason(item),
          check: `Reviewer can verify that the learner can ${lowerFirst(check)}.`,
        };
      })
    : [
        {
          title: "Official role evidence",
          level: "",
          reason: "Fallback review gate",
          check: "Reviewer can verify the task, output, evidence source, and acceptance criteria.",
        },
      ];
  const gateLine = selected.map((skill) => `${skill.updatedTitle || skill.title} L${skill.level}`).join("; ");
  const primaryDeliverable = gateLine
    ? `one ${roleName} evidence pack that closes these gates: ${gateLine}.`
    : `one ${roleName} evidence pack with reviewer-verifiable artifacts.`;
  const artifactContext = "include assumptions, source data, stakeholder constraints, acceptance criteria, and tradeoff notes.";
  const checklist = [
    "final artifact and one-page skill map",
    "source notes, assumptions, and data samples used",
    "before/after decision trail and reviewer comments",
  ];
  const submitLines = submitItems.map((item, index) => {
    const level = item.level ? ` L${item.level}` : "";
    return `${index + 1}. ${item.title}${level}: ${item.body} Priority: ${item.reason}.`;
  });
  const rubricLines = rubric.map((item) => {
    const level = item.level ? ` L${item.level}` : "";
    return `- ${item.title}${level}: ${item.check} Priority: ${item.reason}.`;
  });
  const text = [
    `Job trial brief for ${roleName}`,
    `Scenario: ${scenario}.`,
    `Primary deliverable: ${primaryDeliverable}`,
    `Artifact context: ${artifactContext}`,
    "",
    "Submit this:",
    ...submitLines,
    "",
    "Rubric:",
    ...rubricLines,
    "",
    "Submit checklist:",
    ...checklist.map((item) => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    roleName,
    scenario,
    primaryDeliverable,
    artifactContext,
    submitItems,
    rubric,
    checklist,
    text,
  };
}

export function buildRepairArtifactSample(role, label = null, limit = 8) {
  return buildRepairArtifactPlan(role, label, limit).text;
}

const TRIAL_PROOF_SIGNALS = [
  "completed",
  "submitted",
  "built",
  "produced",
  "attached",
  "final artifact",
  "source data",
  "assumptions",
  "acceptance criteria",
  "reviewer comments",
  "rubric result",
  "decision trail",
  "evidence appendix",
  "review deck",
  "implementation note",
];

const TRIAL_COMPLETION_SIGNALS = [
  "completed",
  "submitted",
  "built",
  "produced",
  "attached",
  "final artifact",
  "reviewer comments",
  "rubric result",
  "decision trail",
];

function looksLikeTrialPlanCopy(text = "") {
  return countPhraseHits(text, ["job trial brief", "primary deliverable:", "submit this:", "rubric:"]) >= 3;
}

function trialGateProof(gate = {}, submissionText = "", proofSignalCount = 0, completionSignalCount = 0, planCopy = false) {
  const tokenSet = new Set(tokenize(submissionText));
  const titleTokens = tokenize(gate.title || "");
  const titleMatches = overlap(titleTokens, tokenSet);
  const titleHit =
    phraseHit(submissionText, gate.title || "") ||
    (titleTokens.length > 0 && titleMatches.length >= Math.max(1, Math.ceil(titleTokens.length * 0.66)));
  const checkMatch = snippetMatch(gate.check || "", tokenSet, submissionText, { negationSensitive: true });
  const checkScore = checkMatch.hit ? 48 : Math.min(Math.round(checkMatch.ratio * 34), 34);
  const signalScore = Math.min((proofSignalCount + completionSignalCount) * 4, 24);
  const score = Math.min(100, (titleHit ? 28 : 0) + checkScore + signalScore);
  const passed = !planCopy && titleHit && checkMatch.hit && proofSignalCount >= 3 && completionSignalCount >= 2;
  const missing = [
    planCopy ? "completed artifact, not the trial brief" : "",
    titleHit ? "" : "official skill title",
    checkMatch.hit ? "" : "rubric ability evidence",
    proofSignalCount >= 3 ? "" : "artifact proof trail",
    completionSignalCount >= 2 ? "" : "completion evidence",
  ].filter(Boolean);

  return {
    title: gate.title || "Official gate",
    level: gate.level || "",
    check: gate.check || "",
    reason: gate.reason || "",
    score,
    passed,
    titleHit,
    checkHit: checkMatch.hit,
    proofSignalCount,
    completionSignalCount,
    planCopy,
    missing,
  };
}

function readableGateCheck(check = "") {
  return String(check || "")
    .replace(/^Reviewer can verify that the learner can\s+/i, "")
    .replace(/^Reviewer can verify\s+/i, "")
    .replace(/[.]+$/g, "")
    .trim();
}

function trialProofNextActions(gates = [], planCopy = false) {
  if (planCopy) {
    return [
      {
        id: "replace-plan-copy",
        title: "Replace the brief with completed work",
        body: "Paste the learner output, source notes, rubric result, and reviewer comments instead of the generated job-trial instructions.",
      },
    ];
  }

  const failed = gates.filter((gate) => !gate.passed);
  if (!failed.length) return [];

  const missingTypes = new Set(failed.flatMap((gate) => gate.missing || []));
  const actions = [];

  if (missingTypes.has("artifact proof trail")) {
    actions.push({
      id: "artifact-proof-trail",
      title: "Attach the proof trail",
      body: "Add source data, assumptions, acceptance criteria, reviewer comments, and a decision trail for the submitted artifact.",
    });
  }

  if (missingTypes.has("completion evidence")) {
    actions.push({
      id: "completion-evidence",
      title: "Show the work was completed",
      body: "Say what was completed, submitted, built, or produced, and reference the final artifact instead of future learning intent.",
    });
  }

  const missingCheckGate = failed.find((gate) => gate.missing?.includes("rubric ability evidence"));
  if (missingCheckGate) {
    const level = missingCheckGate.level ? ` L${missingCheckGate.level}` : "";
    actions.push({
      id: `ability-evidence-${missingCheckGate.title}-${missingCheckGate.level || "na"}`,
      title: `Add ability evidence for ${missingCheckGate.title}${level}`,
      body: `Include an artifact excerpt proving the learner can ${readableGateCheck(missingCheckGate.check) || "perform the reviewer check"}.`,
    });
  }

  const missingTitleGate = failed.find((gate) => gate.missing?.includes("official skill title"));
  if (missingTitleGate) {
    const level = missingTitleGate.level ? ` L${missingTitleGate.level}` : "";
    actions.push({
      id: `official-title-${missingTitleGate.title}-${missingTitleGate.level || "na"}`,
      title: `Name ${missingTitleGate.title}${level}`,
      body: "Use the official skill title in the artifact map so a reviewer can trace the submission back to the Skills Framework row.",
    });
  }

  return actions.slice(0, 4);
}

export function evaluateTrialSubmission(plan = {}, submissionText = "") {
  const text = String(submissionText || "");
  const inputTokens = tokenize(text);
  const rubric = plan?.rubric || [];
  const checklist = plan?.checklist || [];
  const proofSignalCount = countPhraseHits(text, TRIAL_PROOF_SIGNALS);
  const completionSignalCount = countPhraseHits(text, TRIAL_COMPLETION_SIGNALS);
  const planCopy = looksLikeTrialPlanCopy(text);
  const gates = rubric.map((gate) => trialGateProof(gate, text, proofSignalCount, completionSignalCount, planCopy));
  const passedCount = gates.filter((gate) => gate.passed).length;
  const checklistHits = checklist.filter((item) => snippetMatch(item, new Set(inputTokens), text).hit || countPhraseHits(text, [item]) > 0).length;
  const total = gates.length;
  const gateScore = pct(passedCount, total);
  const checklistScore = pct(checklistHits, checklist.length);
  const score = Math.round(gateScore * 0.8 + checklistScore * 0.2);
  const ready = !planCopy && total > 0 && passedCount === total && checklistHits >= Math.min(2, checklist.length);
  const submitted = inputTokens.length >= 24;
  const partial = submitted && passedCount > 0;
  const status = planCopy
    ? "Trial brief pasted, not proof"
    : !submitted
      ? "Not submitted"
      : ready
        ? "Reviewer-ready trial proof"
        : partial
          ? "Partial proof"
          : "Needs stronger artifact";
  const headline = planCopy
    ? "Paste completed work output, not the generated trial instructions."
    : !submitted
    ? "Paste the completed work sample to check it against the trial rubric."
    : ready
      ? "Submission satisfies the generated trial rubric."
      : partial
        ? `${passedCount}/${total} rubric gates pass; close the remaining proof gaps.`
        : "The submission does not yet prove the trial gates.";
  const nextActions = trialProofNextActions(gates, planCopy);

  return {
    status,
    headline,
    ready,
    submitted,
    score,
    passedCount,
    total,
    checklistHits,
    checklistTotal: checklist.length,
    proofSignalCount,
    completionSignalCount,
    planCopy,
    gates,
    missingGates: gates.filter((gate) => !gate.passed),
    nextActions,
  };
}

export function buildTrialSubmissionSample(plan = {}, limit = 8) {
  const roleName = plan.roleName || "selected role";
  const gates = (plan.rubric || []).slice(0, limit);
  const submitItems = plan.submitItems || [];
  const proofLines = gates.map((gate, index) => {
    const level = gate.level ? ` L${gate.level}` : "";
    const submit = submitItems[index % Math.max(submitItems.length, 1)];
    const artifact = submit?.body || "completed a reviewer-verifiable work artifact";
    return `${index + 1}. ${gate.title}${level}: Completed ${artifact} Rubric result: ${gate.check}`;
  });

  return [
    `Completed job trial submission for ${roleName}`,
    `Final artifact: ${plan.primaryDeliverable || "role evidence pack with official skill mapping"}`,
    `Scenario handled: ${plan.scenario || "realistic role work"}.`,
    "Source data: interview notes, operating metrics, raw examples, and data samples used.",
    "Assumptions: scope, constraints, stakeholder needs, and known data limitations are documented.",
    "Acceptance criteria: each recommendation maps to an official rubric gate and has a reviewer check.",
    "Reviewer comments: rubric result, decision trail, and before/after evidence notes are attached.",
    "",
    "Gate proof:",
    ...proofLines,
    "",
    "Submit checklist:",
    ...((plan.checklist || []).map((item) => `- ${item}`)),
  ]
    .filter(Boolean)
    .join("\n");
}

export function appendTrialProofEvidence(currentText = "", proofText = "") {
  const current = String(currentText || "").trim();
  const proof = String(proofText || "").trim();
  if (!proof) return current;
  if (current.includes(proof)) return current;

  const packetNumber = (current.match(/Promoted trial proof packet/g) || []).length + 1;
  const proofBlock = [`Promoted trial proof packet ${packetNumber}:`, proof].join("\n");
  return current ? `${current}\n\n${proofBlock}` : proofBlock;
}

const PROMOTED_PROOF_BLOCK_RE = /(?:^|\n{2})Promoted trial proof packet \d+:\n[\s\S]*?(?=\n{2}Promoted trial proof packet \d+:\n|$)/g;

export function promotedProofPacketCount(text = "") {
  return (String(text || "").match(/^Promoted trial proof packet \d+:/gm) || []).length;
}

export function stripPromotedProofEvidence(text = "") {
  return String(text || "").replace(PROMOTED_PROOF_BLOCK_RE, "").trim();
}

export function buildAppliedEvidenceSample(role, limit = 6) {
  const safeRole = role || {};
  const skills = safeRole.skills || [];
  const selected = [...skills]
    .sort((a, b) => {
      const flagDelta = Number(b.casl || b.emerging) - Number(a.casl || a.emerging);
      if (flagDelta) return flagDelta;
      return levelRank(b.level) - levelRank(a.level);
    })
    .slice(0, limit);
  const taskAnchor = safeRole.tasks?.[0] ? [`Official task anchor: ${safeRole.tasks[0]}`] : [];
  const lines = selected.map(sampleEvidenceLine);

  return [
    `Completed applied evidence packet for ${safeRole.role || "selected role"}`,
    "Submitted artifact: reviewer-checked work sample with source notes, assumptions, acceptance criteria, and rubric result.",
    "Artifact excerpt: built a traceability matrix from interview notes, prioritised two workflow exceptions, and logged test decisions for a dashboard pilot.",
    ...taskAnchor,
    ...lines,
    "Reviewer comments: completed artifact evidence maps the submitted work to the official skill rows above.",
  ]
    .filter(Boolean)
    .join("\n");
}

function evidenceQuality(coverage, abilityCoverage, confidenceScore) {
  if (coverage >= 60 && abilityCoverage >= 45 && confidenceScore >= 65) return "Strong";
  if (coverage >= 35 && abilityCoverage >= 25) return "Moderate";
  if (coverage > 0) return "Thin";
  return "None";
}

function officialRowEchoThreshold(skills = []) {
  if (!skills.length) return 4;
  return Math.max(2, Math.min(4, Math.ceil(skills.length * 0.25)));
}

const PROOF_WRAPPER_TOKENS = new Set(
  tokenize(
    [
      "completed",
      "submitted",
      "final",
      "artifact",
      "work sample",
      "learner output",
      "portfolio",
      "reviewer",
      "reviewer checked",
      "reviewer comments",
      "reviewer notes",
      "rubric",
      "rubric result",
      "assessment rubric",
      "source notes",
      "source data",
      "assumptions",
      "acceptance criteria",
      "decision trail",
      "evidence appendix",
      "review deck",
      "proof trail",
      "official skill rows",
      "maps submitted work",
    ].join(" "),
  ),
);

function frameworkTokenSetFor(role = {}, skills = []) {
  const performance = Array.isArray(role.performance) ? role.performance : role.performance ? [role.performance] : [];
  const roleText = [
    role.role,
    role.description,
    ...(role.tasks || []),
    ...performance,
  ].join(" ");
  const skillText = skills
    .map((skill) =>
      [
        skill.title,
        skill.updatedTitle,
        skill.previousTitle,
        skill.description,
        skill.levelDescription,
        ...(skill.knowledge || []),
        ...(skill.ability || []),
      ].join(" "),
    )
    .join(" ");
  return new Set(tokenize(`${roleText} ${skillText}`));
}

function proofSubstanceTokens(inputText = "", role = {}, skills = []) {
  const frameworkTokens = frameworkTokenSetFor(role, skills);
  return tokenize(inputText).filter(
    (token) => token.length > 2 && !frameworkTokens.has(token) && !PROOF_WRAPPER_TOKENS.has(token),
  );
}

function proofSubstanceThreshold(officialRowEchoCount = 0) {
  if (!officialRowEchoCount) return 0;
  return Math.max(6, Math.min(16, Math.ceil(officialRowEchoCount * 0.65)));
}

function gateLinkedProofThreshold(skills = [], officialRowEchoCount = 0) {
  if (!officialRowEchoCount) return 0;
  return Math.min(officialRowEchoCount, officialRowEchoThreshold(skills));
}

function evidenceSegments(inputText = "") {
  return String(inputText || "")
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?]+[.!?]*/g) || [])
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function skillSegmentHit(segment = "", skill = {}) {
  const phrases = unique([
    skill.updatedTitle,
    skill.title,
    skill.previousTitle,
    ...(skill.ability || []),
    ...(skill.knowledge || []),
  ]);
  return phrases.some((phrase) => phraseHit(segment, phrase));
}

function gateLinkedProofDetails({ inputText = "", role = {}, skills = [], scored = [] }) {
  const segments = evidenceSegments(inputText);
  const echoRows = scored.filter((item) => item.covered && item.exact && item.abilityMatches.length > 0);
  const linkedRows = echoRows
    .map((item) => {
      const best = segments.reduce(
        (currentBest, segment, index) => {
          if (!skillSegmentHit(segment, item.skill)) return currentBest;
          const context = segments.slice(Math.max(0, index - 1), Math.min(segments.length, index + 2)).join(" ");
          const substance = proofSubstanceTokens(context, role, skills);
          return substance.length > currentBest.substance.length ? { item, substance, context } : currentBest;
        },
        { item, substance: [], context: "" },
      );
      return best.substance.length >= 2 ? best : null;
    })
    .filter(Boolean);

  return {
    count: linkedRows.length,
    threshold: gateLinkedProofThreshold(skills, echoRows.length),
    sample: linkedRows.slice(0, 4).map((row) => ({
      title: row.item.skill.updatedTitle || row.item.skill.title,
      tokens: row.substance.slice(0, 6),
    })),
  };
}

function assessEvidenceIntegrity({ role = {}, skills = [], scored = [], inputText = "", claimBasis = {} }) {
  const officialRowEchoCount = scored.filter(
    (item) => item.covered && item.exact && item.abilityMatches.length > 0,
  ).length;
  const threshold = officialRowEchoThreshold(skills);
  const completedSignals = claimBasis.signals?.completed || 0;
  const assessedSignals = claimBasis.signals?.assessed || 0;
  const directProofSignals = countPhraseHits(inputText, [
    "completed artifact",
    "submitted artifact",
    "final artifact",
    "portfolio artifact",
    "submitted test report",
    "learner output",
    "reviewer comments",
    "reviewer notes",
    "reviewer-checked",
    "rubric result",
    "assessment rubric",
    "source notes",
    "source data",
    "acceptance criteria",
    "decision trail",
    "evidence appendix",
    "review deck",
  ]);
  const substanceTokens = proofSubstanceTokens(inputText, role, skills);
  const requiredSubstanceTokens = proofSubstanceThreshold(officialRowEchoCount);
  const hasProofPhrases = completedSignals >= 1 && directProofSignals >= 3;
  const gateLinkedProof = gateLinkedProofDetails({ inputText, role, skills, scored });
  const thinProofWrapper =
    officialRowEchoCount >= threshold && hasProofPhrases && substanceTokens.length < requiredSubstanceTokens;
  const unlinkedGateProof =
    officialRowEchoCount >= threshold &&
    hasProofPhrases &&
    !thinProofWrapper &&
    gateLinkedProof.count < gateLinkedProof.threshold;
  const hasCompletedArtifactProof = hasProofPhrases && !thinProofWrapper && !unlinkedGateProof;
  const officialRowEcho = officialRowEchoCount >= threshold;
  const weakOfficialEcho = officialRowEcho && !hasCompletedArtifactProof;
  const blocksReady = weakOfficialEcho && claimBasis.canClaimReady !== false;
  const warnings = weakOfficialEcho
    ? [
        thinProofWrapper
          ? "Proof phrases found without artifact substance"
          : unlinkedGateProof
            ? "Artifact details are not tied to enough official gates"
            : "Official rows echoed without completed artifact proof",
      ]
    : [];

  return {
    officialRowEcho,
    weakOfficialEcho,
    thinProofWrapper,
    unlinkedGateProof,
    officialRowEchoCount,
    completedSignals,
    assessedSignals,
    directProofSignals,
    proofSubstanceTokenCount: substanceTokens.length,
    proofSubstanceThreshold: requiredSubstanceTokens,
    proofSubstanceTokens: substanceTokens.slice(0, 12),
    gateLinkedProofCount: gateLinkedProof.count,
    gateLinkedProofThreshold: gateLinkedProof.threshold,
    gateLinkedProofSample: gateLinkedProof.sample,
    blocksReady,
    warnings,
  };
}

function integrityClaimBasis(claimBasis = {}, integrity = {}) {
  if (!integrity.blocksReady) return claimBasis;
  if (integrity.thinProofWrapper) {
    return {
      ...claimBasis,
      label: "Proof phrase wrapper",
      status: "Needs artifact body",
      canClaimReady: false,
      warning: "Proof phrases were present, but artifact substance was too thin",
      proofRequirements: [
        "Concrete artifact excerpts, not only proof checklist words",
        "Reviewer comments tied to visible decisions, data, or outputs",
        "Source notes, assumptions, and acceptance criteria with role-specific details",
      ],
      integrity,
    };
  }
  if (integrity.unlinkedGateProof) {
    return {
      ...claimBasis,
      label: "Gate proof gap",
      status: "Needs gate-linked proof",
      canClaimReady: false,
      warning: "Artifact details were not tied to enough official gates",
      proofRequirements: [
        "Artifact excerpts placed beside the specific official skills they claim",
        "Reviewer notes that reference each cleared gate, not only the whole packet",
        "Source data, assumptions, and acceptance criteria tied to the claimed gate",
      ],
      integrity,
    };
  }
  return {
    ...claimBasis,
    label: "Official row echo",
    status: "Needs artifact proof",
    canClaimReady: false,
    warning: "Official skill rows were echoed without completed artifact proof",
    proofRequirements: [
      "Completed learner artifact, not only official skill-row wording",
      "Reviewer comments, rubric result, or assessment evidence",
      "Source data, assumptions, acceptance criteria, and decision trail",
    ],
    integrity,
  };
}

function auditWarnings({ skills, inputTokens, coverage, abilityCoverage, titleOnlyMatchCount, titleStuffingGuardCount, claimBasis, integrity }) {
  const warnings = [];
  if (!skills.length) warnings.push("No official skill rows loaded");
  if (inputTokens.length < 18) warnings.push("Evidence text is short");
  if (coverage === 0) warnings.push("No official skill evidence found");
  if (abilityCoverage < 25) warnings.push("Ability evidence is thin");
  if (titleOnlyMatchCount > 0) warnings.push("Official titles found without artifact evidence");
  if (titleStuffingGuardCount > 0) warnings.push("Title-stuffed input suppressed until artifact evidence is added");
  if (integrity?.warnings?.length) warnings.push(...integrity.warnings);
  if (claimBasis?.warning) warnings.push(claimBasis.warning);
  return warnings;
}

function missingPriority(item) {
  return (
    item.score * 100 +
    levelRank(item.skill.level) * 3 +
    Number(item.skill.emerging) * 8 +
    Number(item.skill.casl) * 6 +
    Number(Boolean(item.skill.ability?.length)) * 2
  );
}

function priorityReason(item) {
  if (item.score >= 0.3) return "Near match: easiest useful gap to close";
  if (item.skill.emerging) return "Emerging skill gate";
  if (item.skill.casl) return "CASL skill gate";
  return "High-level official gate";
}

function skillKey(skill = {}) {
  return `${skill.code || skill.updatedTitle || skill.title || "skill"}-${skill.level || "na"}`;
}

function skillDisplay(skill = {}) {
  const title = skill.updatedTitle || skill.title || "Untitled skill";
  return `${title}${skill.level ? ` L${skill.level}` : ""}`;
}

function collectCovered(label = {}) {
  return new Map((label.allCoveredSkills || label.coveredSkills || []).map((item) => [skillKey(item.skill), item]));
}

function collectMissing(label = {}) {
  return new Map((label.allMissingGates || label.missingGates || []).map((item) => [skillKey(item.skill), item]));
}

function readinessGate(item = {}) {
  const skill = item.skill || {};
  const title = skill.updatedTitle || skill.title || "Official skill gate";
  const ability = skill.ability?.[0] || skill.knowledge?.[0] || skill.description || `Show applied evidence for ${title}`;
  return {
    id: skillKey(skill),
    title,
    level: skill.level || "",
    reason: item.priorityReason || priorityReason(item),
    check: ability,
    hasAbility: Boolean(skill.ability?.length),
  };
}

export function buildReadinessPlan(label = {}, limit = 5) {
  const skillTotal = label.skillTotal || 0;
  const currentCovered = label.coveredSkillCount ?? label.coveredSkills?.length ?? Math.round(((label.coverage || 0) / 100) * skillTotal);
  const currentAbility = label.abilitySkillCount ?? Math.round(((label.abilityCoverage || 0) / 100) * skillTotal);
  const coverageTarget = skillTotal ? Math.ceil((READY_COVERAGE_PCT / 100) * skillTotal) : 0;
  const abilityTarget = skillTotal ? Math.ceil((READY_ABILITY_PCT / 100) * skillTotal) : 0;
  const coverageRemaining = Math.max(coverageTarget - currentCovered, 0);
  const abilityRemaining = Math.max(abilityTarget - currentAbility, 0);
  const candidates = label.allMissingGates || label.missingGates || [];
  const abilityCandidates = candidates.filter((item) => item.skill?.ability?.length);
  const selected = uniqueSkillItems([
    ...abilityCandidates.slice(0, Math.min(abilityRemaining || limit, limit)),
    ...candidates,
  ])
    .slice(0, limit)
    .map(readinessGate);
  const thresholdMet = skillTotal > 0 && coverageRemaining === 0 && abilityRemaining === 0;
  const proofBlocked = thresholdMet && label.claimBasis?.canClaimReady === false;
  const ready = thresholdMet && !proofBlocked;
  const firstGate = selected[0];

  return {
    ready,
    status: ready ? "Ready" : label.decision?.status || "Blocked",
    target: {
      coveragePct: READY_COVERAGE_PCT,
      abilityPct: READY_ABILITY_PCT,
      coverageCount: coverageTarget,
      abilityCount: abilityTarget,
    },
    current: {
      coveredCount: currentCovered,
      abilityCount: currentAbility,
      skillTotal,
    },
    remaining: {
      coverageCount: coverageRemaining,
      abilityCount: abilityRemaining,
    },
    headline: skillTotal
      ? ready
        ? "Ready threshold met"
        : proofBlocked
          ? `${label.claimBasis.label} still needs proof-bearing artifacts`
        : `Need ${plural(coverageRemaining, "official gate")} and ${plural(abilityRemaining, "ability gate")} for Ready`
      : "No official role gates loaded",
    primaryAction: ready
      ? "Package the evidence with source rows and reviewer notes."
      : proofBlocked
        ? label.claimBasis.warning
      : firstGate
        ? `Add assessed evidence for ${firstGate.title}${firstGate.level ? ` L${firstGate.level}` : ""}.`
        : "Load a role with official skills before claiming alignment.",
    nextBundle: selected,
  };
}

function roleFitScore(label = {}) {
  const coveredSkillCount = Math.min(label.coveredSkillCount || 0, 8);
  const abilitySkillCount = Math.min(label.abilitySkillCount || 0, 8);
  const knowledgeSkillCount = Math.min(label.knowledgeSkillCount || 0, 8);
  const directTitleMatches = Math.min(label.matchStats?.directTitleMatches || 0, 5);
  return Math.round(
    (label.coverage || 0) * 0.44 +
      (label.abilityCoverage || 0) * 0.3 +
      (label.knowledgeCoverage || 0) * 0.1 +
      (label.confidenceScore || 0) * 0.1 +
      coveredSkillCount * 4 +
      abilitySkillCount * 6 +
      knowledgeSkillCount * 3 +
      directTitleMatches,
  );
}

function hasRoleFitSignal(label = {}) {
  const covered = label.coveredSkillCount || 0;
  const ability = label.abilitySkillCount || 0;
  const knowledge = label.knowledgeSkillCount || 0;
  return covered > 0 || ability > 0 || knowledge > 0;
}

function roleFitIndex(role = {}) {
  if (ROLE_FIT_INDEX.has(role)) return ROLE_FIT_INDEX.get(role);

  const skillTexts = (role.skills || []).flatMap((skill) => [
    skill.updatedTitle,
    skill.title,
    skill.previousTitle,
    skill.description,
    skill.levelDescription,
    ...(skill.knowledge || []),
    ...(skill.ability || []),
  ]);
  const titleText = (role.skills || [])
    .flatMap((skill) => [skill.updatedTitle, skill.title, skill.previousTitle])
    .join(" ");
  const roleText = [role.role, role.sector, role.track].join(" ");
  const index = {
    roleTokens: new Set(tokenize(roleText)),
    titleTokens: new Set(tokenize(titleText)),
    evidenceTokens: new Set(tokenize(skillTexts.join(" "))),
  };

  ROLE_FIT_INDEX.set(role, index);
  return index;
}

function roughRoleFitScore(role = {}, inputTokens = []) {
  const index = roleFitIndex(role);
  const roleHits = overlapCount(inputTokens, index.roleTokens);
  const titleHits = overlapCount(inputTokens, index.titleTokens);
  const evidenceHits = overlapCount(inputTokens, index.evidenceTokens);
  return evidenceHits * 2 + titleHits * 2 + roleHits;
}

function roleFitCandidates(roles = [], inputText = "", currentRoleId = "", limit = ROLE_FIT_CANDIDATE_LIMIT) {
  const inputTokens = tokenize(inputText);
  if (inputTokens.length < 3) return [];

  const ranked = roles
    .map((role) => ({
      role,
      roughScore: roughRoleFitScore(role, inputTokens),
    }))
    .filter((item) => item.roughScore > 0 || item.role.id === currentRoleId)
    .sort((a, b) => {
      const scoreDelta = b.roughScore - a.roughScore;
      if (scoreDelta) return scoreDelta;
      return String(a.role.role || "").localeCompare(String(b.role.role || ""));
    });
  const selected = ranked.slice(0, Math.min(limit, ranked.length)).map((item) => item.role);

  if (currentRoleId && !selected.some((role) => role.id === currentRoleId)) {
    const currentRole = roles.find((role) => role.id === currentRoleId);
    if (currentRole) selected.push(currentRole);
  }

  return selected;
}

export function rankRoleFits(roles = [], inputText = "", options = {}) {
  const mode = options.mode || "evidence";
  const limit = options.limit || 5;
  const currentRoleId = options.currentRoleId || "";
  const candidateRoles = roleFitCandidates(roles, inputText, currentRoleId, options.candidateLimit || ROLE_FIT_CANDIDATE_LIMIT);
  const ranked = candidateRoles
    .map((role) => {
      const label = evaluateLabel(role, inputText, { mode });
      return {
        id: role.id,
        roleName: role.role,
        sector: role.sector,
        track: role.track,
        selected: role.id === currentRoleId,
        coverage: label.coverage,
        abilityCoverage: label.abilityCoverage,
        knowledgeCoverage: label.knowledgeCoverage,
        confidenceScore: label.confidenceScore,
        decisionStatus: label.decision?.status || "Blocked",
        claimBasis: label.claimBasis?.label || "Evidence text",
        fitScore: roleFitScore(label),
        coveredSkillCount: label.coveredSkillCount,
        abilitySkillCount: label.abilitySkillCount,
        knowledgeSkillCount: label.knowledgeSkillCount,
        skillTotal: label.skillTotal,
        matchedGates: (label.coveredSkills || []).slice(0, 3).map((item) => skillDisplay(item.skill)),
        hasSignal: hasRoleFitSignal(label),
      };
    })
    .filter((item) => item.hasSignal)
    .sort((a, b) => {
      const scoreDelta = b.fitScore - a.fitScore;
      if (scoreDelta) return scoreDelta;
      const abilityDelta = b.abilityCoverage - a.abilityCoverage;
      if (abilityDelta) return abilityDelta;
      const coverageDelta = b.coverage - a.coverage;
      if (coverageDelta) return coverageDelta;
      return a.roleName.localeCompare(b.roleName);
    });

  const currentRank = currentRoleId ? ranked.findIndex((item) => item.id === currentRoleId) + 1 : 0;
  const top = ranked.slice(0, limit);
  return {
    top,
    currentRank,
    current: currentRoleId ? ranked.find((item) => item.id === currentRoleId) || null : null,
    best: top[0] || null,
    totalWithSignal: ranked.length,
  };
}

function comparisonStrength(label = {}) {
  const decisionBonus = { Ready: 12, Repair: 5, Blocked: 0 }[label.decision?.status] || 0;
  return Math.round(
    (label.coverage || 0) * 0.42 +
      (label.abilityCoverage || 0) * 0.34 +
      (label.knowledgeCoverage || 0) * 0.12 +
      (label.confidenceScore || 0) * 0.12 +
      decisionBonus,
  );
}

function skillSummary(item) {
  return {
    id: skillKey(item.skill),
    title: skillDisplay(item.skill),
    score: Math.round((item.score || 0) * 100),
    reason: item.priorityReason || item.reasons?.[0] || "Official skill evidence",
  };
}

function formatDelta(delta) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function comparisonPurpose(left = {}, right = {}) {
  const labels = [left.claimBasis?.label, right.claimBasis?.label];
  if (labels.includes("Job requirement")) return "demand";
  if (labels.includes("Job trial plan") || labels.includes("Repair plan")) return "repair";
  if (left.claimBasis?.canClaimReady === false || right.claimBasis?.canClaimReady === false) return "non-proof";
  return "proof";
}

function sideWithBasis(left = {}, right = {}, basis) {
  if (right.claimBasis?.label === basis) return "right";
  if (left.claimBasis?.label === basis) return "left";
  return "";
}

function sideName(side, leftName, rightName) {
  return side === "right" ? rightName : leftName;
}

function contextualComparisonReason({ purpose, left, right, leftName, rightName }) {
  if (purpose === "demand") {
    const demandSide = sideWithBasis(left, right, "Job requirement");
    const name = sideName(demandSide, leftName, rightName);
    return {
      title: "Demand only",
      body: `${name} describes employer demand, so use it as a gap benchmark instead of learner proof.`,
    };
  }
  if (purpose === "repair") {
    const repairSide = sideWithBasis(left, right, "Job trial plan") || sideWithBasis(left, right, "Repair plan");
    const name = sideName(repairSide, leftName, rightName);
    return {
      title: "Plan only",
      body: `${name} is a build plan; it becomes proof only after submitted artifacts and review notes exist.`,
    };
  }
  if (purpose === "non-proof") {
    return {
      title: "Proof blocker",
      body: "At least one side is not proof-bearing yet, so compare alignment but do not claim Ready from this alone.",
    };
  }
  return null;
}

function buildComparisonReasons({ winner, leftName, rightName, deltas, leftOnlyCovered, rightOnlyCovered, sharedMissing, purpose, left, right }) {
  if (winner === "tie") {
    const contextReason = contextualComparisonReason({ purpose, left, right, leftName, rightName });
    return [
      contextReason,
      {
        title: "No decisive lead",
        body: "The official coverage and ability evidence are close enough that a human should inspect the artifacts.",
      },
      sharedMissing.length
        ? {
            title: "Same blocker",
            body: `Both options still miss ${sharedMissing[0].title}.`,
          }
        : {
            title: "Check artifact quality",
            body: "Use the source rows and assessments as the tie-breaker.",
          },
    ].filter(Boolean);
  }

  const winnerName = winner === "right" ? rightName : leftName;
  const uniqueGates = winner === "right" ? rightOnlyCovered : leftOnlyCovered;
  const abilityLead = winner === "right" ? deltas.ability : -deltas.ability;
  const coverageLead = winner === "right" ? deltas.coverage : -deltas.coverage;
  const reasons = [
    contextualComparisonReason({ purpose, left, right, leftName, rightName }),
  ].filter(Boolean);
  const abilityTitle =
    purpose === "demand" ? "More ability demand" : purpose === "proof" ? "More ability proof" : "More ability alignment";
  const abilityBody =
    purpose === "demand"
      ? `${winnerName} contains ${abilityLead} points more official ability demand.`
      : purpose === "proof"
        ? `${winnerName} has ${abilityLead} points more assessed ability evidence.`
        : `${winnerName} maps ${abilityLead} points more official ability evidence.`;
  const coverageTitle =
    purpose === "demand" ? "More demand coverage" : purpose === "proof" ? "More official coverage" : "More official alignment";
  const coverageBody =
    purpose === "demand"
      ? `${winnerName} asks for ${coverageLead} points more official skill coverage.`
      : purpose === "proof"
        ? `${winnerName} clears ${coverageLead} points more official skill coverage.`
        : `${winnerName} maps ${coverageLead} points more official skill alignment.`;

  if (abilityLead > 0) {
    reasons.push({
      title: abilityTitle,
      body: abilityBody,
    });
  }
  if (coverageLead > 0) {
    reasons.push({
      title: coverageTitle,
      body: coverageBody,
    });
  }
  if (uniqueGates.length) {
    reasons.push({
      title: purpose === "proof" ? "Unique cleared gate" : "Unique matched gate",
      body:
        purpose === "proof"
          ? `${winnerName} uniquely clears ${uniqueGates[0].title}.`
          : `${winnerName} uniquely maps ${uniqueGates[0].title}.`,
    });
  }
  if (sharedMissing.length) {
    reasons.push({
      title: "Remaining blocker",
      body: `Both still need stronger evidence for ${sharedMissing[0].title}.`,
    });
  }

  return reasons.slice(0, 3);
}

function comparisonHeadline({ purpose, winner, winnerName, loserName, strengthDelta, left, right, leftName, rightName }) {
  if (purpose === "demand") {
    const demandSide = sideWithBasis(left, right, "Job requirement");
    return `${sideName(demandSide, leftName, rightName)} is a demand benchmark, not learner proof`;
  }
  if (purpose === "repair") {
    const repairSide = sideWithBasis(left, right, "Job trial plan") || sideWithBasis(left, right, "Repair plan");
    return `${sideName(repairSide, leftName, rightName)} is a job trial plan, not submitted evidence`;
  }
  if (purpose === "non-proof") {
    if (winner === "tie") return "Neither option is proof-ready yet";
    return `${winnerName} has stronger alignment, but still needs proof`;
  }
  if (winner === "tie") return "Too close to prefer without human review";
  return `${winnerName} is safer than ${loserName} by ${Math.abs(strengthDelta)} decision points`;
}

function comparisonRecommendation({ purpose, winner, leftName, rightName, deltas, left, right }) {
  if (purpose === "demand") {
    const demandSide = sideWithBasis(left, right, "Job requirement");
    const demandName = sideName(demandSide, leftName, rightName);
    return `Use ${demandName} to surface market-required gates: ${formatDelta(Math.abs(deltas.coverage))} coverage and ${formatDelta(Math.abs(deltas.ability))} ability demand. Do not treat it as Ready evidence.`;
  }
  if (purpose === "repair") {
    const repairSide = sideWithBasis(left, right, "Job trial plan") || sideWithBasis(left, right, "Repair plan");
    const repairName = sideName(repairSide, leftName, rightName);
    return `Use ${repairName} as the next job-trial queue; promote it only after completed artifacts, rubric results, and reviewer notes exist.`;
  }
  if (purpose === "non-proof") {
    if (winner === "tie") return "Use the clearer next-action plan, then attach submitted artifacts before claiming role readiness.";
    const winnerName = winner === "right" ? rightName : leftName;
    return `${winnerName} is the stronger alignment target, but it still needs proof-bearing artifacts before a Ready claim.`;
  }
  if (winner === "tie") return "Inspect the unique cleared gates and choose the option with stronger assessed artifacts.";
  return winner === "right"
    ? `Prefer ${rightName}; it adds ${formatDelta(deltas.coverage)} coverage and ${formatDelta(deltas.ability)} ability evidence versus ${leftName}.`
    : `Keep ${leftName}; the comparator loses ${Math.abs(deltas.coverage)} coverage and ${Math.abs(deltas.ability)} ability evidence.`;
}

export function compareLabels(leftLabel, rightLabel, options = {}) {
  const leftName = options.leftName || "Current";
  const rightName = options.rightName || "Comparator";
  const left = leftLabel || {};
  const right = rightLabel || {};
  const leftCovered = collectCovered(left);
  const rightCovered = collectCovered(right);
  const leftMissing = collectMissing(left);
  const rightMissing = collectMissing(right);
  const rightOnlyCovered = [...rightCovered.entries()]
    .filter(([id]) => !leftCovered.has(id))
    .map(([, item]) => skillSummary(item))
    .slice(0, 5);
  const leftOnlyCovered = [...leftCovered.entries()]
    .filter(([id]) => !rightCovered.has(id))
    .map(([, item]) => skillSummary(item))
    .slice(0, 5);
  const sharedMissing = [...leftMissing.entries()]
    .filter(([id]) => rightMissing.has(id))
    .map(([, item]) => skillSummary(item))
    .slice(0, 5);
  const deltas = {
    coverage: Math.round((right.coverage || 0) - (left.coverage || 0)),
    ability: Math.round((right.abilityCoverage || 0) - (left.abilityCoverage || 0)),
    knowledge: Math.round((right.knowledgeCoverage || 0) - (left.knowledgeCoverage || 0)),
    confidence: Math.round((right.confidenceScore || 0) - (left.confidenceScore || 0)),
  };
  const leftStrength = comparisonStrength(left);
  const rightStrength = comparisonStrength(right);
  const strengthDelta = rightStrength - leftStrength;
  const decisiveDelta =
    Math.abs(strengthDelta) >= 5 ||
    Math.abs(deltas.coverage) >= 15 ||
    Math.abs(deltas.ability) >= 15 ||
    left.decision?.status !== right.decision?.status;
  const winner = decisiveDelta ? (strengthDelta > 0 ? "right" : "left") : "tie";
  const winnerName = winner === "right" ? rightName : leftName;
  const loserName = winner === "right" ? leftName : rightName;
  const purpose = comparisonPurpose(left, right);
  const headline = comparisonHeadline({ purpose, winner, winnerName, loserName, strengthDelta, left, right, leftName, rightName });
  const recommendation = comparisonRecommendation({ purpose, winner, leftName, rightName, deltas, left, right });
  const reasons = buildComparisonReasons({
    winner,
    leftName,
    rightName,
    deltas,
    leftOnlyCovered,
    rightOnlyCovered,
    sharedMissing,
    purpose,
    left,
    right,
  });

  return {
    leftName,
    rightName,
    winner,
    headline,
    recommendation,
    purpose,
    leftStrength,
    rightStrength,
    strengthDelta,
    deltas,
    reasons,
    leftOnlyCovered,
    rightOnlyCovered,
    sharedMissing,
  };
}

function proofImpactGateSummary(item = {}) {
  const reason = item.abilityMatches?.length
    ? "ability evidence"
    : item.knowledgeMatches?.length
      ? "knowledge evidence"
      : item.priorityReason || item.reasons?.find((entry) => entry !== "official skill title") || item.reasons?.[0] || "Promoted proof evidence";
  return {
    id: skillKey(item.skill),
    title: skillDisplay(item.skill),
    score: Math.round((item.score || 0) * 100),
    reason,
  };
}

export function buildProofImpact({ role = null, evidenceText = "", currentLabel = null, mode = "resume" } = {}) {
  const packetCount = promotedProofPacketCount(evidenceText);
  if (!packetCount || !role) return null;

  const baselineText = stripPromotedProofEvidence(evidenceText);
  const baseline = evaluateLabel(role, baselineText, { mode });
  const current = currentLabel || evaluateLabel(role, evidenceText, { mode });
  const baselineCovered = collectCovered(baseline);
  const addedGates = (current.allCoveredSkills || current.coveredSkills || [])
    .filter((item) => !baselineCovered.has(skillKey(item.skill)))
    .map(proofImpactGateSummary)
    .slice(0, 5);
  const readiness = buildReadinessPlan(current, 4);
  const deltas = {
    coverage: Math.round((current.coverage || 0) - (baseline.coverage || 0)),
    ability: Math.round((current.abilityCoverage || 0) - (baseline.abilityCoverage || 0)),
    knowledge: Math.round((current.knowledgeCoverage || 0) - (baseline.knowledgeCoverage || 0)),
    confidence: Math.round((current.confidenceScore || 0) - (baseline.confidenceScore || 0)),
    officialGates: (current.coveredSkillCount || 0) - (baseline.coveredSkillCount || 0),
    abilityGates: (current.abilitySkillCount || 0) - (baseline.abilitySkillCount || 0),
  };
  const remainingCopy = `${plural(readiness.remaining.coverageCount, "official gate")} and ${plural(readiness.remaining.abilityCount, "ability gate")} still missing`;

  return {
    packetCount,
    baseline: {
      coverage: baseline.coverage,
      abilityCoverage: baseline.abilityCoverage,
      knowledgeCoverage: baseline.knowledgeCoverage,
      confidenceScore: baseline.confidenceScore,
      coveredSkillCount: baseline.coveredSkillCount,
      abilitySkillCount: baseline.abilitySkillCount,
    },
    current: {
      coverage: current.coverage,
      abilityCoverage: current.abilityCoverage,
      knowledgeCoverage: current.knowledgeCoverage,
      confidenceScore: current.confidenceScore,
      coveredSkillCount: current.coveredSkillCount,
      abilitySkillCount: current.abilitySkillCount,
      decisionStatus: current.decision?.status || "Unknown",
    },
    deltas,
    addedGates,
    ready: readiness.ready,
    remaining: readiness.remaining,
    target: readiness.target,
    headline: readiness.ready
      ? "Promoted proof clears the Ready threshold"
      : `Promoted proof improved the packet; ${remainingCopy}.`,
    primaryAction: readiness.ready ? "Export the proof-bearing review packet with source rows and reviewer notes." : readiness.primaryAction,
  };
}

function memoMetricLine(label = {}) {
  const covered = (label.allCoveredSkills || label.coveredSkills || []).length;
  return [
    `Official coverage: ${covered}/${label.skillTotal || 0} skills (${label.coverage || 0}%)`,
    `Ability evidence: ${label.abilityCoverage || 0}%`,
    `Knowledge evidence: ${label.knowledgeCoverage || 0}%`,
    `Confidence: ${label.confidenceScore || 0}%`,
    `Claim risk: ${label.claimRisk || "Unknown"}`,
    `Claim basis: ${label.claimBasis?.label || "Unknown"} - ${label.claimBasis?.status || "Unknown"}`,
  ];
}

function memoReadinessLines(label = {}) {
  const plan = buildReadinessPlan(label, 3);
  return [
    `Official gates: ${plan.current.coveredCount}/${plan.target.coverageCount} (${plan.remaining.coverageCount} remaining)`,
    `Ability gates: ${plan.current.abilityCount}/${plan.target.abilityCount} (${plan.remaining.abilityCount} remaining)`,
    `Next bundle: ${plan.nextBundle.length ? plan.nextBundle.map((gate) => `${gate.title}${gate.level ? ` L${gate.level}` : ""}`).join("; ") : "No locked gates"}`,
  ];
}

function memoProofImpactLines(impact = null) {
  if (!impact) return [];
  const lines = [
    `Promoted packets: ${impact.packetCount}`,
    `Coverage delta: ${formatDelta(impact.deltas.coverage)} points (${impact.baseline.coverage}% -> ${impact.current.coverage}%)`,
    `Ability delta: ${formatDelta(impact.deltas.ability)} points (${impact.baseline.abilityCoverage}% -> ${impact.current.abilityCoverage}%)`,
    `Official gates added: ${formatDelta(impact.deltas.officialGates)}`,
    impact.ready
      ? "Ready result: threshold cleared"
      : `Ready result: ${impact.remaining.coverageCount} official gates and ${impact.remaining.abilityCount} ability gates still missing`,
    `Next action: ${impact.primaryAction}`,
  ];
  if (impact.addedGates.length) {
    lines.push(...impact.addedGates.slice(0, 4).map((gate) => `- ${gate.title}: ${gate.reason}`));
  }
  return lines;
}

export function buildIntegrityAudit(label = {}) {
  const integrity = label.integrity || {};
  const basis = label.claimBasis?.label || "Unknown";
  const status = label.claimBasis?.status || "Unknown";
  const warning = label.claimBasis?.warning || label.auditWarnings?.[0] || "";
  const proofDetailThreshold = integrity.proofSubstanceThreshold || 0;
  const gateProofThreshold = integrity.gateLinkedProofThreshold || 0;

  return [
    { label: "Basis", value: `${basis} / ${status}` },
    {
      label: "Integrity status",
      value: label.claimBasis?.canClaimReady === false ? warning || "Proof-basis blocker active" : "No proof-basis blocker detected",
    },
    { label: "Row echoes", value: String(integrity.officialRowEchoCount || 0) },
    { label: "Proof detail", value: `${integrity.proofSubstanceTokenCount || 0}/${proofDetailThreshold}` },
    { label: "Gate proof", value: `${integrity.gateLinkedProofCount || 0}/${gateProofThreshold}` },
  ];
}

export function buildIntegrityNarrative(label = {}) {
  const integrity = label.integrity || {};
  const basis = label.claimBasis?.label || "Evidence text";
  const plan = buildReadinessPlan(label, 3);
  const rowEchoes = integrity.officialRowEchoCount || 0;
  const proofDetail = `${integrity.proofSubstanceTokenCount || 0}/${integrity.proofSubstanceThreshold || 0}`;
  const gateProof = `${integrity.gateLinkedProofCount || 0}/${integrity.gateLinkedProofThreshold || 0}`;

  if (basis === "Gate proof gap" || integrity.unlinkedGateProof) {
    return {
      tone: "blocked",
      title: "Why blocked: proof is detached from the gates",
      body: `The packet echoes ${rowEchoes} official rows and has artifact detail (${proofDetail}), but only ${gateProof} claimed gates have nearby artifact detail.`,
      action: "Move artifact excerpts beside the specific official skills they claim, or promote a completed trial proof packet.",
      facts: [`row echoes ${rowEchoes}`, `proof detail ${proofDetail}`, `gate proof ${gateProof}`],
    };
  }

  if (basis === "Proof phrase wrapper" || integrity.thinProofWrapper) {
    return {
      tone: "blocked",
      title: "Why blocked: proof words are not an artifact",
      body: `The packet uses reviewer, rubric, and source wording, but the concrete artifact detail is only ${proofDetail}.`,
      action: "Add source-specific excerpts, decisions, data samples, and reviewer notes beside the claimed skill rows.",
      facts: [`row echoes ${rowEchoes}`, `proof detail ${proofDetail}`, `gate proof ${gateProof}`],
    };
  }

  if (basis === "Official row echo" || integrity.officialRowEcho) {
    return {
      tone: label.claimBasis?.canClaimReady === false ? "blocked" : "watch",
      title: label.claimBasis?.canClaimReady === false ? "Why blocked: official rows were copied" : "Why inspect: official rows were echoed",
      body: `The packet matches ${rowEchoes} official rows. It needs completed artifact proof before those rows can support a Ready claim.`,
      action: "Attach completed learner output, reviewer comments, rubric result, and source trail for the claimed gates.",
      facts: [`row echoes ${rowEchoes}`, `proof detail ${proofDetail}`, `gate proof ${gateProof}`],
    };
  }

  if (label.claimBasis?.canClaimReady === false) {
    return {
      tone: "blocked",
      title: `Why blocked: ${basis} is not proof yet`,
      body: label.claimBasis.warning || "The current source is useful context, but it is not enough proof for a Ready claim.",
      action: label.decision?.primaryAction || "Attach proof-bearing artifacts before export.",
      facts: [`proof status ${label.claimBasis?.status || "Unknown"}`, `risk ${label.claimRisk || "Unknown"}`],
    };
  }

  if (plan.ready) {
    return {
      tone: "ready",
      title: "Why exportable: thresholds are met",
      body: `The packet clears ${plan.current.coveredCount}/${plan.target.coverageCount} official gates and ${plan.current.abilityCount}/${plan.target.abilityCount} ability gates.`,
      action: "Export with source rows, reviewer notes, and the integrity audit attached.",
      facts: [`official gates ${plan.current.coveredCount}/${plan.target.coverageCount}`, `ability gates ${plan.current.abilityCount}/${plan.target.abilityCount}`],
    };
  }

  return {
    tone: "repair",
    title: "Why not Ready: gaps remain",
    body: `The packet still needs ${plural(plan.remaining.coverageCount, "official gate")} and ${plural(plan.remaining.abilityCount, "ability gate")} before Ready.`,
    action: plan.primaryAction || label.decision?.primaryAction || "Add the next assessed artifact.",
    facts: [`official gates ${plan.current.coveredCount}/${plan.target.coverageCount}`, `ability gates ${plan.current.abilityCount}/${plan.target.abilityCount}`],
  };
}

function memoIntegrityLines(label = {}) {
  const lines = buildIntegrityAudit(label).map((item) => `- ${item.label}: ${item.value}`);
  const samples = label.integrity?.gateLinkedProofSample || [];
  if (samples.length) {
    lines.push(
      ...samples.map((sample) => `- Gate-linked sample: ${sample.title} (${sample.tokens.join(", ") || "no detail tokens"})`),
    );
  }
  return lines;
}

function memoIntegrityNarrativeLines(label = {}) {
  const narrative = buildIntegrityNarrative(label);
  return [
    `Title: ${narrative.title}`,
    `Reason: ${narrative.body}`,
    `Next action: ${narrative.action}`,
    ...narrative.facts.map((fact) => `- ${fact}`),
  ];
}

function proofTemplateGateLine(gate = {}, index = 0) {
  const title = `${gate.title || "Official gate"}${gate.level ? ` L${gate.level}` : ""}`;
  const reviewerCheck = gate.reviewerCheck || gate.check || gate.artifact || "show the reviewer-verifiable skill evidence";
  return [
    `${index + 1}. ${title}`,
    `   Artifact excerpt: [paste the completed output for ${title}; include the decision, source data, edge case, or before/after result]`,
    `   Reviewer check: ${reviewerCheck}`,
    "   Source trail: [source note + assumption + acceptance criteria + rubric result + reviewer comment]",
  ].join("\n");
}

export function buildProofRepairTemplate(label = {}, limit = 3) {
  const safeLabel = label || {};
  const proofGates = safeLabel.proofDossier?.gates || [];
  const fallbackGates = (safeLabel.actionPlan || []).map((item) => ({
    title: item.title,
    level: item.level,
    reviewerCheck: item.check || item.artifact,
  }));
  const gates = (proofGates.length ? proofGates : fallbackGates).slice(0, limit);
  const blocked = safeLabel.claimBasis?.canClaimReady === false || safeLabel.decision?.status !== "Ready";
  const title = blocked ? "Paste this missing proof format" : "Attach this proof format before final review";
  const summary = blocked
    ? "Fill one block per claimed official gate, then paste it back into the evidence box or attach it to the reviewer packet."
    : "Use this as the final reviewer trace so every claimed gate has artifact proof.";
  const gateLines = gates.map(proofTemplateGateLine);
  const text = [title, summary, ...gateLines].join("\n\n");

  return {
    title,
    summary,
    gates,
    text,
  };
}

export function buildProofRepairDraft(label = {}, limit = 3) {
  const template = buildProofRepairTemplate(label, limit);
  if (!template.gates.length) return "";

  return [
    "Proof repair draft - not completed evidence yet",
    "Replace every bracketed field with real learner output before claiming Ready.",
    "Keep the official gate title beside the artifact excerpt so the reviewer can trace the claim.",
    "",
    template.text,
  ].join("\n");
}

function memoProofLines(label = {}) {
  const requirements = label.claimBasis?.proofRequirements || [];
  if (!requirements.length) return ["- No proof-basis blocker detected."];
  return requirements.map((item) => `- ${item}`);
}

function memoProofDossierLines(label = {}) {
  const gates = label.proofDossier?.gates || [];
  if (!gates.length) return ["- No locked gate proof rows required."];
  return gates.slice(0, 4).map((gate) => {
    const title = `${gate.title}${gate.level ? ` L${gate.level}` : ""}`;
    return `- ${title}: attach ${gate.attachment}; reviewer checks ${gate.reviewerCheck}; trace ${gate.trace}.`;
  });
}

function memoProofRepairTemplateLines(label = {}) {
  const template = buildProofRepairTemplate(label, 3);
  if (!template.gates.length) return ["- No proof template available."];
  return template.text.split("\n").map((line) => (line ? line : ""));
}

function memoSourceTraceLines(label = {}) {
  const covered = (label.coveredSkills || []).slice(0, 3).map((item) => {
    const skill = item.skill || {};
    return `- Cleared: ${skillDisplay(skill)} / ${skill.code || "no code"} / ${skill.type?.toUpperCase() || "TSC"} / ${Math.round((item.score || 0) * 100)}%`;
  });
  const locked = (label.missingGates || []).slice(0, 3).map((item) => {
    const skill = item.skill || {};
    return `- Locked: ${skillDisplay(skill)} / ${skill.code || "no code"} / ${skill.type?.toUpperCase() || "TSC"} / ${item.priorityReason || "Needs evidence"}`;
  });
  return [...covered, ...locked].length ? [...covered, ...locked] : ["- No official source rows available."];
}

function memoSkillLines(items = [], fallback) {
  if (!items.length) return [`- ${fallback}`];
  return items.slice(0, 4).map((item) => {
    const skill = item.skill || item;
    const title = skillDisplay(skill);
    const score = typeof item.score === "number" ? ` (${Math.round(item.score * 100)}% match)` : "";
    const reason = item.priorityReason || item.reason || item.reasons?.[0] || "";
    return `- ${title}${score}${reason ? ` - ${reason}` : ""}`;
  });
}

function memoActionLines(actions = []) {
  if (!actions.length) return ["- No next action generated."];
  return actions.slice(0, 4).map((item) => {
    const title = `${item.title}${item.level ? ` L${item.level}` : ""}`;
    return `- ${title}: ${item.artifact}`;
  });
}

function evidenceTitle(inputText = "") {
  const firstLine = String(inputText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

export function buildReviewMemo({ label, comparison = null, proofImpact = null, sourceFiles = [], evidenceText = "" }) {
  const safeLabel = label || {};
  const title = evidenceTitle(evidenceText);
  const lines = [
    "SkillLabel SG reviewer memo",
    `Role: ${safeLabel.roleName || "No role selected"}`,
    `Sector / track: ${safeLabel.sector || "Unknown"} / ${safeLabel.track || "Unknown"}`,
    title ? `Evidence reviewed: ${title}` : "",
    "",
    `Decision: ${safeLabel.decision?.status || "Unknown"} - ${safeLabel.decision?.headline || "No decision"}`,
    `Primary action: ${safeLabel.decision?.primaryAction || "Inspect evidence manually."}`,
    "",
    "Evidence score",
    ...memoMetricLine(safeLabel),
    "",
    "Integrity audit",
    ...memoIntegrityLines(safeLabel),
    "",
    "Why this decision",
    ...memoIntegrityNarrativeLines(safeLabel),
    "",
    "Ready threshold",
    ...memoReadinessLines(safeLabel),
  ];

  if (proofImpact) {
    lines.push("", "Proof impact", ...memoProofImpactLines(proofImpact));
  }

  lines.push(
    "",
    "Proof required",
    ...memoProofLines(safeLabel),
    "",
    "Missing proof format",
    ...memoProofRepairTemplateLines(safeLabel),
    "",
    "Gate proof dossier",
    ...memoProofDossierLines(safeLabel),
    "",
    "Official source trace",
    ...memoSourceTraceLines(safeLabel),
    "",
    "Cleared evidence",
    ...memoSkillLines(safeLabel.coveredSkills, "No official skill evidence cleared."),
    "",
    "Next gates",
    ...memoActionLines(safeLabel.actionPlan),
  );

  if (comparison) {
    lines.push(
      "",
      "Comparator note",
      comparison.headline,
      comparison.recommendation,
      ...comparison.reasons.map((reason) => `- ${reason.title}: ${reason.body}`),
    );
  }

  if (safeLabel.auditWarnings?.length) {
    lines.push("", "Warnings", ...safeLabel.auditWarnings.map((warning) => `- ${warning}`));
  }

  if (sourceFiles.length) {
    lines.push("", `Sources: ${sourceFiles.join(", ")}`);
  }

  lines.push("", "Note: deterministic evidence match, not an accreditation decision.");
  return lines.join("\n");
}

function decisionFor({ role, coverage, abilityCoverage, missing, evidenceQuality, claimBasis }) {
  const roleName = role.role || "this role";
  const firstGate = missing[0]?.skill;
  const firstGateTitle = firstGate ? `${firstGate.updatedTitle || firstGate.title} L${firstGate.level}` : "";

  if (coverage >= 60 && abilityCoverage >= 45) {
    if (claimBasis?.canClaimReady === false) {
      return {
        status: "Repair",
        headline: "Coverage is high, but proof is not",
        primaryAction: claimBasis.label === "Job requirement" ? "Compare this job demand against a learner profile or portfolio." : "Attach completed artifacts or assessed work before claiming Ready.",
        learner: `${claimBasis.label} is useful context for ${roleName}, but it is not enough proof of role readiness.`,
        provider: "Do not market this as Ready until assessed artifacts or completed learner evidence are attached.",
        coach: "Use the matched gates as a checklist, then request proof-bearing work samples.",
        reasons: [`${coverage}% official coverage`, `${abilityCoverage}% ability evidence`, claimBasis.warning || `${claimBasis.label} is not proof-bearing`],
      };
    }
    return {
      status: "Ready",
      headline: "Use this as a review packet",
      primaryAction: "Export the label and attach the supporting evidence rows.",
      learner: `Reasonable role-alignment evidence for ${roleName}; still inspect the listed source rows before relying on it.`,
      provider: "Package the matched ability evidence, assessment rubric, and official rows for review.",
      coach: "Use the label to explain why the artifact is defensible and what edge gaps remain.",
      reasons: [`${coverage}% official coverage`, `${abilityCoverage}% ability evidence`, `${evidenceQuality} evidence quality`],
    };
  }

  if (coverage >= 35 || abilityCoverage >= 25) {
    return {
      status: "Repair",
      headline: "Use only after targeted repair",
      primaryAction: firstGateTitle ? `Add one assessed artifact for ${firstGateTitle}.` : "Add assessed ability evidence before export.",
      learner: `Treat this as partial preparation for ${roleName}, not role-ready proof yet.`,
      provider: "Add the locked-gate artifacts before marketing the course as aligned.",
      coach: "Use the gap list to assign the next practical work sample.",
      reasons: [`${coverage}% official coverage`, `${abilityCoverage}% ability evidence`, firstGateTitle ? `${firstGateTitle} is the next gate` : "No next gate loaded"],
    };
  }

  return {
    status: "Blocked",
    headline: "Do not claim role alignment yet",
    primaryAction: firstGateTitle ? `Start with evidence for ${firstGateTitle}.` : "Paste real course, job, or portfolio evidence first.",
    learner: `Do not treat this as enough preparation for ${roleName}; it is missing official role evidence.`,
    provider: "Do not use this label in marketing until locked gates have real assessed artifacts.",
    coach: "Use this as a diagnostic: the next step is evidence collection, not recommendation.",
    reasons: [`${coverage}% official coverage`, `${abilityCoverage}% ability evidence`, firstGateTitle ? `${firstGateTitle} is blocked` : "No official match found"],
  };
}

export function evaluateLabel(role, inputText, options = {}) {
  const safeRole = role || {};
  const skills = safeRole.skills || [];
  const inputTokens = tokenize(inputText);
  const initialClaimBasis = assessClaimBasis(inputText, options.mode || "evidence");
  const rawScored = skills.map((skill) => scoreSkill(skill, inputText));
  const rawTitleOnlyMatchCount = rawScored.filter((item) => item.titleOnly).length;
  const rawExactMatchCount = rawScored.filter((item) => item.exact).length;
  const rawAbilitySignalCount = rawScored.reduce((count, item) => count + item.abilityMatches.length, 0);
  const looksTitleStuffed =
    rawExactMatchCount >= 3 &&
    rawAbilitySignalCount === 0 &&
    inputTokens.length <= rawExactMatchCount * 4 + 8;
  const scored = rawScored.map((item) => {
    if (!looksTitleStuffed || !item.exact || item.abilityMatches.length) return item;
    return {
      ...item,
      covered: false,
      confidence: item.titleOnly ? item.confidence : "Low",
      titleStuffingSuppressed: item.covered,
      reasons: item.reasons.includes("title-stuffing guard")
        ? item.reasons
        : ["title-stuffing guard", ...item.reasons],
    };
  });
  const covered = scored.filter((item) => item.covered);
  const sortedCovered = covered.sort((a, b) => b.score - a.score);
  const coveredEmerging = covered.filter((item) => item.skill.emerging);
  const coveredCasl = covered.filter((item) => item.skill.casl);
  const emergingTotal = skills.filter((skill) => skill.emerging).length;
  const caslTotal = skills.filter((skill) => skill.casl).length;
  const knowledgeCovered = scored.filter((item) => item.covered && item.knowledgeMatches.length > 0);
  const abilityCovered = scored.filter((item) => item.covered && item.abilityMatches.length > 0);
  const rankedMissing = scored
    .filter((item) => !item.covered)
    .map((item) => ({
      ...item,
      priorityScore: missingPriority(item),
      priorityReason: priorityReason(item),
    }))
    .sort((a, b) => {
      const priorityDelta = b.priorityScore - a.priorityScore;
      if (priorityDelta) return priorityDelta;
      return levelRank(b.skill.level) - levelRank(a.skill.level);
    });
  const missing = rankedMissing.slice(0, 6);

  const coverage = pct(covered.length, skills.length);
  const knowledgeCoverage = pct(knowledgeCovered.length, skills.length);
  const abilityCoverage = pct(abilityCovered.length, skills.length);
  const directTitleMatches = scored.filter((item) => item.exact).length;
  const abilitySignalCount = scored.reduce((count, item) => count + item.abilityMatches.length, 0);
  const knowledgeSignalCount = scored.reduce((count, item) => count + item.knowledgeMatches.length, 0);
  const weakSignalCount = scored.filter((item) => !item.covered && item.score >= WEAK_MATCH_THRESHOLD).length;
  const titleOnlyMatchCount = scored.filter((item) => item.titleOnly).length;
  const titleStuffingGuardCount = scored.filter((item) => item.titleStuffingSuppressed).length;
  const confidenceScore = Math.min(
    100,
    Math.round(
      coverage * 0.42 +
        abilityCoverage * 0.36 +
        knowledgeCoverage * 0.12 +
        pct(Math.min(inputTokens.length, 160), 160) * 0.1,
    ),
  );

  const integrity = assessEvidenceIntegrity({ role: safeRole, skills, scored, inputText, claimBasis: initialClaimBasis });
  const claimBasis = integrityClaimBasis(initialClaimBasis, integrity);
  const mappingWarnings = scored
    .filter((item) => item.mappedExact)
    .slice(0, 4)
    .map((item) => ({
      previousTitle: item.skill.previousTitle,
      updatedTitle: item.skill.updatedTitle,
    }));
  const quality = integrity.blocksReady ? "Thin" : evidenceQuality(coverage, abilityCoverage, confidenceScore);

  return {
    roleId: safeRole.id || "",
    roleName: safeRole.role || "No role selected",
    sector: safeRole.sector || "",
    track: safeRole.track || "",
    skillTotal: skills.length,
    taskTotal: safeRole.taskCount || 0,
    knowledgeItemTotal: safeRole.knowledgeCount || 0,
    abilityItemTotal: safeRole.abilityCount || 0,
    coveredSkillCount: covered.length,
    knowledgeSkillCount: knowledgeCovered.length,
    abilitySkillCount: abilityCovered.length,
    coverage,
    knowledgeCoverage,
    abilityCoverage,
    claimRisk: claimRisk(coverage, abilityCoverage, claimBasis),
    evidenceQuality: quality,
    confidenceScore,
    claimBasis,
    auditWarnings: auditWarnings({ skills, inputTokens, coverage, abilityCoverage, titleOnlyMatchCount, titleStuffingGuardCount, claimBasis, integrity }),
    matchStats: {
      inputTokens: inputTokens.length,
      directTitleMatches,
      abilitySignalCount,
      knowledgeSignalCount,
      weakSignalCount,
      titleOnlyMatchCount,
      titleStuffingGuardCount,
      officialRowEchoCount: integrity.officialRowEchoCount,
    },
    integrity,
    emerging: { covered: coveredEmerging.length, total: emergingTotal },
    casl: { covered: coveredCasl.length, total: caslTotal },
    coveredSkills: sortedCovered.slice(0, 8),
    allCoveredSkills: sortedCovered,
    missingGates: missing,
    allMissingGates: rankedMissing,
    mappingWarnings,
    recipe: recipeFor(safeRole, missing),
    actionPlan: actionPlanFor(safeRole, missing),
    proofDossier: proofDossierFor(safeRole, missing, claimBasis, sortedCovered),
    decision: decisionFor({ role: safeRole, coverage, abilityCoverage, missing, evidenceQuality: quality, claimBasis }),
  };
}
