import { describe, expect, it } from "vitest";
import preparedData from "../../public/skilllabel-data.json";
import {
  appendTrialProofEvidence,
  buildIntegrityAudit,
  buildIntegrityNarrative,
  buildAppliedEvidenceSample,
  buildProofImpact,
  buildProofRepairDraft,
  buildProofRepairTemplate,
  buildReadinessPlan,
  buildRepairArtifactPlan,
  buildRepairArtifactSample,
  buildTrialSubmissionSample,
  buildReviewMemo,
  compareLabels,
  evaluateTrialSubmission,
  evaluateLabel,
  rankRoleFits,
  scoreSkill,
  tokenize,
} from "./scoring";

const role = {
  id: "test",
  sector: "Infocomm Technology",
  track: "Strategy and Governance",
  role: "Business Analyst / Artificial Intelligence Translator",
  taskCount: 2,
  knowledgeCount: 4,
  abilityCount: 4,
  tasks: ["Identify opportunities where AI and analytics can address business and user needs"],
  skills: [
    {
      title: "Business Needs Analysis",
      updatedTitle: "Business Needs Analysis",
      previousTitle: "",
      level: "4",
      emerging: true,
      casl: true,
      description: "Identify and scope business requirements and priorities",
      knowledge: ["Business analysis methods"],
      ability: ["Scope business requirements and priorities"],
    },
    {
      title: "Software Testing",
      updatedTitle: "Software Testing",
      previousTitle: "",
      level: "3",
      emerging: false,
      casl: true,
      description: "Develop test plans and test cases",
      knowledge: ["Software testing methods"],
      ability: ["Develop test cases for system requirements"],
    },
    {
      title: "Big Data Analytics",
      updatedTitle: "Data Synthesis",
      previousTitle: "Big Data Analytics",
      level: "4",
      emerging: false,
      casl: true,
      description: "Analyse data to generate insights",
      knowledge: ["Data analysis methods"],
      ability: ["Synthesize data into insights"],
    },
  ],
};

const defaultDatasetRole =
  preparedData.roles.find((item) => item.id === preparedData.defaultRoleId) || preparedData.roles[0];

describe("tokenize", () => {
  it("normalizes text into useful unique tokens", () => {
    expect(tokenize("AI strategy and business-needs analysis")).toEqual(
      expect.arrayContaining(["ai", "strategy", "business", "need", "analysis"]),
    );
  });
});

describe("scoreSkill", () => {
  it("scores direct title and evidence matches", () => {
    const result = scoreSkill(role.skills[0], "This capstone covers business needs analysis and scope business requirements.");
    expect(result.covered).toBe(true);
    expect(result.abilityMatches.length).toBeGreaterThan(0);
  });

  it("keeps previous skill names as weak mapping evidence until artifact proof appears", () => {
    const result = scoreSkill(role.skills[2], "The course includes Big Data Analytics dashboards.");
    expect(result.covered).toBe(false);
    expect(result.exact).toBe(true);
    expect(result.titleOnly).toBe(true);
    expect(result.confidence).toBe("Low");
    expect(result.reasons).toContain("mapped skill title");
  });

  it("clears a mapped title when paired with ability evidence", () => {
    const result = scoreSkill(role.skills[2], "Big Data Analytics capstone where learners synthesize data into insights.");
    expect(result.covered).toBe(true);
    expect(result.mappedExact).toBe(true);
    expect(result.titleOnly).toBe(false);
    expect(result.abilityMatches.length).toBeGreaterThan(0);
  });

  it("does not clear a gate from vague title overlap alone", () => {
    const result = scoreSkill(role.skills[0], "The workshop mentions business analysis and general strategy.");
    expect(result.covered).toBe(false);
    expect(result.confidence).toBe("Low");
  });

  it("does not treat title words inside official snippets as artifact evidence", () => {
    const titleEchoSkill = {
      title: "Strategy Execution",
      updatedTitle: "Strategy Execution",
      previousTitle: "",
      level: "3",
      emerging: false,
      casl: true,
      description: "Strategy execution methods and strategy execution planning",
      knowledge: ["Strategy execution"],
      ability: ["Execute strategy execution plans"],
    };
    const result = scoreSkill(titleEchoSkill, "Strategy Execution.");
    expect(result.covered).toBe(false);
    expect(result.titleOnly).toBe(true);
    expect(result.knowledgeMatches).toHaveLength(0);
    expect(result.abilityMatches).toHaveLength(0);
  });

  it("requires enough snippet overlap before counting ability evidence", () => {
    const result = scoreSkill(role.skills[1], "Learners discuss test cases but never develop system requirements evidence.");
    expect(result.abilityMatches).toHaveLength(0);
    expect(result.covered).toBe(false);
  });
});

describe("evaluateLabel", () => {
  it("returns high risk for awareness-only input", () => {
    const label = evaluateLabel(role, "AI strategy overview and dashboards.");
    expect(label.claimRisk).toBe("High");
    expect(label.decision.status).toBe("Blocked");
    expect(label.decision.headline).toBe("Do not claim role alignment yet");
    expect(label.missingGates.length).toBeGreaterThan(0);
    expect(label.actionPlan[0].title).toBe(label.missingGates[0].skill.updatedTitle);
    expect(label.actionPlan[0].artifact).toContain("Identify opportunities");
    expect(label.proofDossier.title).toBe("Evidence packaging proof");
    expect(label.proofDossier.gates[0]).toMatchObject({
      title: label.missingGates[0].skill.updatedTitle,
      level: label.missingGates[0].skill.level,
      attachment: `Submitted artifact for ${label.missingGates[0].skill.updatedTitle} L${label.missingGates[0].skill.level}`,
    });
    expect(label.proofDossier.gates[0].trace).toContain("learner output");
    expect(label.auditWarnings).toContain("Ability evidence is thin");
  });

  it("calculates stronger coverage for applied evidence", () => {
    const label = evaluateLabel(
      role,
      "Completed artifact with source notes and acceptance criteria: Business Needs Analysis, scope business requirements from interview notes, approval delays, and dashboard pilot logs. Submitted test report with rubric result: Software Testing, develop test cases for failed handoffs and exception samples. Reviewer comments: Big Data Analytics, synthesize data into insights using revenue extracts and manual reconciliation notes.",
    );
    expect(label.coverage).toBeGreaterThanOrEqual(67);
    expect(label.casl.covered).toBeGreaterThanOrEqual(2);
    expect(label.evidenceQuality).toBe("Strong");
    expect(label.decision.status).toBe("Ready");
    expect(label.decision.primaryAction).toContain("Export");
  });

  it("returns a packaging action when no gates are missing", () => {
    const label = evaluateLabel(
      role,
      "Completed portfolio artifact: Business Needs Analysis scope business requirements from interview notes and approval delays. Submitted rubric result: Software Testing develop test cases for failed handoffs and exception samples. Reviewer comments: Big Data Analytics synthesize data into insights using revenue extracts and reconciliation notes.",
    );
    expect(label.actionPlan[0].id).toBe("package-ready-evidence");
  });

  it("returns a safe empty label for missing role data", () => {
    const label = evaluateLabel(null, "anything");
    expect(label.skillTotal).toBe(0);
    expect(label.claimRisk).toBe("High");
    expect(label.auditWarnings).toContain("No official skill rows loaded");
    expect(label.decision.status).toBe("Blocked");
  });

  it("caps ready claims when a course only promises future coverage", () => {
    const label = evaluateLabel(
      role,
      "Business Needs Analysis: learners will scope business requirements and priorities. Software Testing: students will develop test cases for system requirements. Big Data Analytics: participants will synthesize data into insights.",
      { mode: "course" },
    );
    const plan = buildReadinessPlan(label);

    expect(label.coverage).toBeGreaterThanOrEqual(67);
    expect(label.claimBasis.label).toBe("Course promise");
    expect(label.claimBasis.proofRequirements).toEqual(
      expect.arrayContaining(["Assessed assignment, capstone, or project output", "Learner submission evidence, not only learning outcomes"]),
    );
    expect(label.claimRisk).toBe("Medium");
    expect(label.decision.status).toBe("Repair");
    expect(label.decision.headline).toBe("Coverage is high, but proof is not");
    expect(label.proofDossier.title).toBe("Proof to attach before Ready");
    expect(label.proofDossier.gates[0].reviewerCheck).toBe(role.skills[0].ability[0]);
    expect(label.auditWarnings).toContain("Course promise needs assessed artifacts before Ready");
    expect(plan.ready).toBe(false);
    expect(plan.headline).toContain("Course promise still needs proof-bearing artifacts");
  });

  it("treats job ads as demand signals instead of learner proof", () => {
    const label = evaluateLabel(
      role,
      "Responsibilities: Business Needs Analysis, scope business requirements and priorities. Software Testing, develop test cases for system requirements. Big Data Analytics, synthesize data into insights.",
      { mode: "job" },
    );

    expect(label.coverage).toBeGreaterThanOrEqual(67);
    expect(label.claimBasis.label).toBe("Job requirement");
    expect(label.claimBasis.proofRequirements).toEqual(
      expect.arrayContaining(["Learner portfolio or resume evidence mapped against the job requirement"]),
    );
    expect(label.decision.status).toBe("Repair");
    expect(label.auditWarnings).toContain("Job ads show demand, not learner proof");
  });

  it("prioritizes actionable near-miss gaps before low-signal flagged gaps", () => {
    const rankingRole = {
      ...role,
      skills: [
        {
          title: "Technical Sales Support",
          updatedTitle: "Technical Sales Support",
          previousTitle: "",
          level: "4",
          emerging: false,
          casl: true,
          description: "Develop technical proposals for customer needs",
          knowledge: ["Technical proposal methods"],
          ability: ["Develop value demonstrations and proof-of-concept models"],
        },
        {
          title: "Process Improvement and Optimisation",
          updatedTitle: "Process Improvement and Optimisation",
          previousTitle: "",
          level: "4",
          emerging: true,
          casl: false,
          description: "Improve process performance and quality of operations",
          knowledge: ["Process improvement methods"],
          ability: ["Conduct pilot testing to determine effectiveness of process improvement initiatives"],
        },
      ],
    };
    const label = evaluateLabel(rankingRole, "The course mentions process improvement methods but lacks pilot testing.");
    expect(label.missingGates[0].skill.updatedTitle).toBe("Process Improvement and Optimisation");
    expect(label.actionPlan[0].priority).toContain("Near match");
  });

  it("does not clear coverage from a list of official skill titles", () => {
    const label = evaluateLabel(role, "Business Needs Analysis. Software Testing. Big Data Analytics.");
    expect(label.coverage).toBe(0);
    expect(label.claimRisk).toBe("High");
    expect(label.matchStats.titleOnlyMatchCount).toBe(3);
    expect(label.auditWarnings).toContain("Official titles found without artifact evidence");
  });

  it("blocks Ready when official ability rows are copied without completed artifact proof", () => {
    const officialEcho = [
      "Business Needs Analysis. Scope business requirements and priorities.",
      "Software Testing. Develop test cases for system requirements.",
      "Big Data Analytics. Synthesize data into insights.",
    ].join("\n");
    const label = evaluateLabel(role, officialEcho, { mode: "resume" });
    const plan = buildReadinessPlan(label);

    expect(label.coverage).toBeGreaterThanOrEqual(67);
    expect(label.abilityCoverage).toBeGreaterThanOrEqual(67);
    expect(label.claimBasis.label).toBe("Official row echo");
    expect(label.claimBasis.canClaimReady).toBe(false);
    expect(label.decision.status).toBe("Repair");
    expect(label.evidenceQuality).toBe("Thin");
    expect(label.matchStats.officialRowEchoCount).toBeGreaterThanOrEqual(2);
    expect(label.auditWarnings).toContain("Official rows echoed without completed artifact proof");
    expect(plan.ready).toBe(false);
  });

  it("still blocks copied official rows with a thin completion keyword", () => {
    const officialEcho = [
      "Completed portfolio update.",
      "Business Needs Analysis. Scope business requirements and priorities.",
      "Software Testing. Develop test cases for system requirements.",
      "Big Data Analytics. Synthesize data into insights.",
    ].join("\n");
    const label = evaluateLabel(role, officialEcho, { mode: "resume" });

    expect(label.claimBasis.label).toBe("Official row echo");
    expect(label.claimBasis.canClaimReady).toBe(false);
    expect(label.integrity.completedSignals).toBeGreaterThanOrEqual(1);
    expect(label.integrity.directProofSignals).toBeLessThan(3);
    expect(label.auditWarnings).toContain("Official rows echoed without completed artifact proof");
  });

  it("blocks copied official rows wrapped in proof phrases without artifact substance", () => {
    const proofWrapper = [
      "Completed artifact. Submitted artifact. Reviewer comments. Rubric result. Source notes. Acceptance criteria. Decision trail.",
      "Business Needs Analysis. Scope business requirements and priorities.",
      "Software Testing. Develop test cases for system requirements.",
      "Big Data Analytics. Synthesize data into insights.",
    ].join("\n");
    const label = evaluateLabel(role, proofWrapper, { mode: "resume" });

    expect(label.claimBasis.label).toBe("Proof phrase wrapper");
    expect(label.claimBasis.status).toBe("Needs artifact body");
    expect(label.claimBasis.canClaimReady).toBe(false);
    expect(label.integrity.directProofSignals).toBeGreaterThanOrEqual(3);
    expect(label.integrity.proofSubstanceTokenCount).toBeLessThan(label.integrity.proofSubstanceThreshold);
    expect(label.auditWarnings).toContain("Proof phrases found without artifact substance");
  });

  it("blocks global artifact details that are not tied to enough official gates", () => {
    const detachedProof = [
      "Completed artifact. Submitted artifact. Reviewer comments. Rubric result. Source notes. Acceptance criteria. Decision trail.",
      "Artifact body: reconciled invoice batches, triaged clinic queue screenshots, traced outage logs, compared vendor estimates, sampled payroll exceptions, and wrote escalation notes.",
      "Business Needs Analysis. Scope business requirements and priorities.",
      "Software Testing. Develop test cases for system requirements.",
      "Big Data Analytics. Synthesize data into insights.",
    ].join("\n");
    const label = evaluateLabel(role, detachedProof, { mode: "resume" });

    expect(label.claimBasis.label).toBe("Gate proof gap");
    expect(label.claimBasis.status).toBe("Needs gate-linked proof");
    expect(label.integrity.proofSubstanceTokenCount).toBeGreaterThanOrEqual(label.integrity.proofSubstanceThreshold);
    expect(label.integrity.gateLinkedProofCount).toBeLessThan(label.integrity.gateLinkedProofThreshold);
    expect(label.auditWarnings).toContain("Artifact details are not tied to enough official gates");
  });

  it("blocks copied official rows from the real default dataset role", () => {
    const officialEcho = [
      "Completed portfolio update.",
      ...defaultDatasetRole.skills.slice(0, 22).map((skill) => {
        const ability = skill.ability?.[0] || "";
        const knowledge = skill.knowledge?.[0] || "";
        return `${skill.updatedTitle}. ${ability}. ${knowledge}`;
      }),
    ].join("\n");
    const label = evaluateLabel(defaultDatasetRole, officialEcho, { mode: "resume" });

    expect(label.coverage).toBeGreaterThanOrEqual(80);
    expect(label.claimBasis.label).toBe("Official row echo");
    expect(label.decision.status).toBe("Repair");
    expect(label.matchStats.officialRowEchoCount).toBeGreaterThanOrEqual(20);
    expect(label.integrity.directProofSignals).toBeLessThan(3);
  });

  it("blocks proof-phrase wrappers against the real default dataset role", () => {
    const officialEcho = [
      "Completed artifact. Submitted artifact. Reviewer comments. Rubric result. Source notes. Acceptance criteria. Decision trail.",
      ...defaultDatasetRole.skills.slice(0, 22).map((skill) => {
        const ability = skill.ability?.[0] || "";
        const knowledge = skill.knowledge?.[0] || "";
        return `${skill.updatedTitle}. ${ability}. ${knowledge}`;
      }),
    ].join("\n");
    const label = evaluateLabel(defaultDatasetRole, officialEcho, { mode: "resume" });

    expect(label.coverage).toBeGreaterThanOrEqual(80);
    expect(label.claimBasis.label).toBe("Proof phrase wrapper");
    expect(label.decision.status).toBe("Repair");
    expect(label.matchStats.officialRowEchoCount).toBeGreaterThanOrEqual(20);
    expect(label.integrity.proofSubstanceTokenCount).toBeLessThan(label.integrity.proofSubstanceThreshold);
  });

  it("blocks detached artifact detail against the real default dataset role", () => {
    const officialEcho = [
      "Completed artifact. Submitted artifact. Reviewer comments. Rubric result. Source notes. Acceptance criteria. Decision trail.",
      "Artifact body: reconciled invoice batches, triaged clinic queue screenshots, traced outage logs, compared vendor estimates, sampled payroll exceptions, wrote escalation notes, and reviewed release incidents.",
      ...defaultDatasetRole.skills.slice(0, 22).map((skill) => {
        const ability = skill.ability?.[0] || "";
        const knowledge = skill.knowledge?.[0] || "";
        return `${skill.updatedTitle}. ${ability}. ${knowledge}`;
      }),
    ].join("\n");
    const label = evaluateLabel(defaultDatasetRole, officialEcho, { mode: "resume" });

    expect(label.coverage).toBeGreaterThanOrEqual(80);
    expect(label.claimBasis.label).toBe("Gate proof gap");
    expect(label.decision.status).toBe("Repair");
    expect(label.integrity.proofSubstanceTokenCount).toBeGreaterThanOrEqual(label.integrity.proofSubstanceThreshold);
    expect(label.integrity.gateLinkedProofCount).toBeLessThan(label.integrity.gateLinkedProofThreshold);
  });

  it("suppresses cross-skill generic knowledge matches in title-stuffed input", () => {
    const stuffingRole = {
      ...role,
      skills: [
        {
          title: "Strategy Execution",
          updatedTitle: "Strategy Execution",
          previousTitle: "",
          level: "3",
          emerging: false,
          casl: true,
          description: "Business analysis for strategy execution",
          knowledge: ["Business analysis"],
          ability: [],
        },
        role.skills[0],
        {
          title: "Data Strategy",
          updatedTitle: "Data Strategy",
          previousTitle: "",
          level: "4",
          emerging: true,
          casl: false,
          description: "Data strategy methods",
          knowledge: ["Data strategy"],
          ability: [],
        },
      ],
    };
    const label = evaluateLabel(stuffingRole, "Strategy Execution. Business Needs Analysis. Data Strategy.");
    expect(label.coverage).toBe(0);
    expect(label.matchStats.titleStuffingGuardCount).toBe(1);
    expect(label.auditWarnings).toContain("Title-stuffed input suppressed until artifact evidence is added");
  });
});

describe("buildAppliedEvidenceSample", () => {
  it("builds a role-specific sample that scores as applied evidence", () => {
    const sample = buildAppliedEvidenceSample(role, 2);
    const label = evaluateLabel(role, sample);
    expect(sample).toContain("Completed applied evidence packet");
    expect(sample).toContain("Official task anchor");
    expect(label.coverage).toBeGreaterThanOrEqual(67);
    expect(label.matchStats.abilitySignalCount).toBeGreaterThan(0);
    expect(label.integrity.directProofSignals).toBeGreaterThanOrEqual(3);
    expect(label.integrity.gateLinkedProofCount).toBeGreaterThanOrEqual(label.integrity.gateLinkedProofThreshold);
    expect(label.claimBasis.label).not.toBe("Official row echo");
    expect(label.auditWarnings).not.toContain("Official rows echoed without completed artifact proof");
  });
});

describe("buildReadinessPlan", () => {
  it("calculates the exact remaining gates needed for Ready", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const plan = buildReadinessPlan(weak, 2);

    expect(plan.ready).toBe(false);
    expect(plan.target.coverageCount).toBe(2);
    expect(plan.target.abilityCount).toBe(2);
    expect(plan.remaining.coverageCount).toBe(2);
    expect(plan.remaining.abilityCount).toBe(2);
    expect(plan.headline).toContain("Need 2 official gates and 2 ability gates");
    expect(plan.nextBundle).toHaveLength(2);
    expect(plan.nextBundle[0].title).toBe(weak.missingGates[0].skill.updatedTitle);
  });

  it("marks applied evidence as Ready when both thresholds are met", () => {
    const ready = evaluateLabel(
      role,
      "Completed portfolio artifact: Business Needs Analysis scope business requirements from interview notes, approval delays, and dashboard pilot logs. Submitted test report: Software Testing develop test cases for system requirements using failed handoffs and exception samples. Reviewer comments: Big Data Analytics synthesize data into insights from revenue extracts and reconciliation notes.",
    );
    const plan = buildReadinessPlan(ready);

    expect(ready.decision.status).toBe("Ready");
    expect(plan.ready).toBe(true);
    expect(plan.remaining.coverageCount).toBe(0);
    expect(plan.remaining.abilityCount).toBe(0);
    expect(plan.primaryAction).toContain("Package the evidence");
  });
});

describe("rankRoleFits", () => {
  it("does not recommend all-zero alternate roles", () => {
    const result = rankRoleFits([role], "AI strategy overview and dashboards.", { mode: "course", currentRoleId: role.id });

    expect(result.top).toHaveLength(0);
    expect(result.totalWithSignal).toBe(0);
    expect(result.currentRank).toBe(0);
  });

  it("ranks roles by official skill and ability evidence", () => {
    const unrelatedRole = {
      ...role,
      id: "unrelated",
      role: "Unrelated Role",
      skills: [
        {
          title: "Customer Service",
          updatedTitle: "Customer Service",
          previousTitle: "",
          level: "3",
          emerging: false,
          casl: false,
          description: "Serve customers",
          knowledge: ["Customer service methods"],
          ability: ["Respond to customer queries"],
        },
      ],
    };
    const result = rankRoleFits(
      [unrelatedRole, role],
      "Business Needs Analysis scope business requirements and priorities. Software Testing develop test cases for system requirements.",
      { mode: "resume", currentRoleId: unrelatedRole.id },
    );

    expect(result.top[0]).toMatchObject({
      id: role.id,
      roleName: role.role,
    });
    expect(result.top).toHaveLength(1);
    expect(result.currentRank).toBe(0);
  });

  it("ignores weak token overlap when no official gate is covered", () => {
    const weakOverlapRole = {
      ...role,
      id: "weak",
      role: "Generic Data Role",
      skills: [
        {
          title: "Data Governance",
          updatedTitle: "Data Governance",
          previousTitle: "",
          level: "3",
          emerging: false,
          casl: false,
          description: "Manage policies and structures for enterprise data",
          knowledge: ["Data policy concepts"],
          ability: ["Maintain data governance documentation"],
        },
      ],
    };

    const result = rankRoleFits(
      [weakOverlapRole, role],
      "Data and business awareness workshop with general analytics examples.",
      { mode: "course", currentRoleId: weakOverlapRole.id },
    );

    expect(result.top).toHaveLength(0);
    expect(result.totalWithSignal).toBe(0);
    expect(result.currentRank).toBe(0);
  });
});

describe("buildRepairArtifactSample", () => {
  it("builds a structured repair plan from the current missing gates", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const plan = buildRepairArtifactPlan(role, weak, 3);

    expect(plan.roleName).toBe(role.role);
    expect(plan.scenario).toBe(role.tasks[0]);
    expect(plan.primaryDeliverable).toContain(weak.missingGates[0].skill.updatedTitle);
    expect(plan.submitItems).toHaveLength(3);
    expect(plan.submitItems[0]).toMatchObject({
      title: weak.missingGates[0].skill.updatedTitle,
      level: weak.missingGates[0].skill.level,
      reason: weak.missingGates[0].priorityReason,
    });
    expect(plan.rubric).toHaveLength(3);
    expect(plan.rubric[0].check).toContain("Reviewer can verify");
    expect(plan.rubric[0].reason).toBe(weak.missingGates[0].priorityReason);
    expect(plan.checklist).toEqual(
      expect.arrayContaining(["final artifact and one-page skill map", "before/after decision trail and reviewer comments"]),
    );
    expect(plan.text).toContain("Submit this:");
    expect(plan.text).toContain("Rubric:");
  });

  it("keeps the structured repair plan non-empty when role data is missing", () => {
    const plan = buildRepairArtifactPlan(null, null, 3);

    expect(plan.roleName).toBe("selected role");
    expect(plan.submitItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Role evidence pack",
          reason: "No official skill rows loaded",
        }),
      ]),
    );
    expect(plan.rubric).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Official role evidence",
          reason: "Fallback review gate",
        }),
      ]),
    );
    expect(plan.text).toContain("Role evidence pack");
    expect(plan.text).toContain("Fallback review gate");
  });

  it("builds a realistic job trial brief from the current missing gates", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const sample = buildRepairArtifactSample(role, weak, 3);
    const repaired = evaluateLabel(role, sample);

    expect(sample).toContain("Job trial brief");
    expect(sample).toContain("Primary deliverable:");
    expect(sample).toContain("Submit this:");
    expect(sample).toContain("Rubric:");
    expect(sample).toContain("Submit checklist:");
    expect(sample).toContain(weak.missingGates[0].skill.updatedTitle);
    expect(repaired.coverage).toBeGreaterThan(weak.coverage);
    expect(repaired.matchStats.abilitySignalCount).toBeGreaterThan(weak.matchStats.abilitySignalCount);
  });

  it("marks generated job trial briefs as plans that still need submitted proof", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const repaired = evaluateLabel(role, buildRepairArtifactSample(role, weak, 3), { mode: "repair" });

    expect(repaired.claimBasis.label).toBe("Job trial plan");
    expect(repaired.claimBasis.status).toBe("Needs submitted proof");
    expect(repaired.claimBasis.proofRequirements).toEqual(
      expect.arrayContaining(["Completed learner artifact matching the job trial brief", "Assessment rubric or reviewer notes for the submitted work"]),
    );
    expect(repaired.auditWarnings).toContain("Job trial brief is a plan, not completed evidence");
  });

  it("moves a broader weak role profile into repair territory without becoming ready", () => {
    const broaderRole = {
      ...role,
      skills: [
        ...role.skills,
        {
          title: "Data Strategy",
          updatedTitle: "Data Strategy",
          previousTitle: "",
          level: "4",
          emerging: true,
          casl: false,
          description: "Data management structures and processes",
          knowledge: ["Data management structures"],
          ability: ["Define data management structures to align and streamline processes"],
        },
        {
          title: "Stakeholder Management",
          updatedTitle: "Stakeholder Management",
          previousTitle: "",
          level: "4",
          emerging: false,
          casl: false,
          description: "Manage stakeholder interests and concerns",
          knowledge: ["Stakeholder engagement methods"],
          ability: ["Assess stakeholder needs and impact on the organisation"],
        },
        {
          title: "Business Innovation",
          updatedTitle: "Business Innovation",
          previousTitle: "",
          level: "4",
          emerging: true,
          casl: false,
          description: "Compare business models",
          knowledge: ["Business model innovation"],
          ability: ["Compare current business model for the organisation with other business models in the industry"],
        },
        {
          title: "Business Environment Analysis",
          updatedTitle: "Business Environment Analysis",
          previousTitle: "",
          level: "3",
          emerging: true,
          casl: false,
          description: "Analyse external market factors",
          knowledge: ["Market analysis methods"],
          ability: ["Analyse impact of external factors on business operations"],
        },
        {
          title: "Network Performance Management",
          updatedTitle: "Network Performance Management",
          previousTitle: "",
          level: "4",
          emerging: false,
          casl: false,
          description: "Assess network performance",
          knowledge: ["Network performance metrics"],
          ability: ["Assess network, software and system health check results"],
        },
        ...Array.from({ length: 16 }, (_, index) => ({
          title: `Supporting Skill ${index + 1}`,
          updatedTitle: `Supporting Skill ${index + 1}`,
          previousTitle: "",
          level: "1",
          emerging: false,
          casl: false,
          description: `Supporting skill ${index + 1} description`,
          knowledge: [`Supporting skill ${index + 1} knowledge`],
          ability: [`Perform supporting skill ${index + 1} tasks`],
        })),
      ],
    };
    const weak = evaluateLabel(broaderRole, "AI strategy overview and dashboards.");
    const repaired = evaluateLabel(broaderRole, buildRepairArtifactSample(broaderRole, weak));
    expect(repaired.decision.status).toBe("Repair");
    expect(repaired.claimRisk).toBe("High");
  });
});

describe("evaluateTrialSubmission", () => {
  it("keeps empty trial submissions out of proof-ready status", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const plan = buildRepairArtifactPlan(role, weak, 3);
    const proof = evaluateTrialSubmission(plan, "");

    expect(proof.status).toBe("Not submitted");
    expect(proof.ready).toBe(false);
    expect(proof.passedCount).toBe(0);
    expect(proof.gates[0].missing).toEqual(expect.arrayContaining(["official skill title", "rubric ability evidence"]));
    expect(proof.nextActions.map((item) => item.title)).toEqual(
      expect.arrayContaining(["Attach the proof trail", "Show the work was completed"]),
    );
  });

  it("rejects title-stuffed trial submissions without artifact proof", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const plan = buildRepairArtifactPlan(role, weak, 3);
    const proof = evaluateTrialSubmission(plan, "Business Needs Analysis. Software Testing. Data Synthesis.");

    expect(proof.ready).toBe(false);
    expect(proof.passedCount).toBe(0);
    expect(proof.status).toBe("Not submitted");
    expect(proof.nextActions.map((item) => item.title)).toEqual(
      expect.arrayContaining(["Attach the proof trail", "Show the work was completed"]),
    );
    expect(proof.nextActions.some((item) => item.title.includes("Business Needs Analysis"))).toBe(true);
  });

  it("rejects the generated trial brief when pasted as submitted proof", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const plan = buildRepairArtifactPlan(role, weak, 3);
    const proof = evaluateTrialSubmission(plan, plan.text);

    expect(proof.ready).toBe(false);
    expect(proof.planCopy).toBe(true);
    expect(proof.status).toBe("Trial brief pasted, not proof");
    expect(proof.passedCount).toBe(0);
    expect(proof.gates[0].missing).toContain("completed artifact, not the trial brief");
    expect(proof.nextActions).toEqual([
      expect.objectContaining({
        id: "replace-plan-copy",
        title: "Replace the brief with completed work",
      }),
    ]);
  });

  it("passes completed trial submissions that satisfy every generated rubric gate", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const plan = buildRepairArtifactPlan(role, weak, 3);
    const sample = buildTrialSubmissionSample(plan, 3);
    const proof = evaluateTrialSubmission(plan, sample);

    expect(sample).toContain("Completed job trial submission");
    expect(proof.ready).toBe(true);
    expect(proof.status).toBe("Reviewer-ready trial proof");
    expect(proof.passedCount).toBe(proof.total);
    expect(proof.checklistHits).toBeGreaterThanOrEqual(2);
    expect(proof.nextActions).toHaveLength(0);
  });

  it("lets promoted completed trial proof become profile evidence", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const plan = buildRepairArtifactPlan(role, weak, 3);
    const proofLabel = evaluateLabel(role, buildTrialSubmissionSample(plan, 3), { mode: "resume" });
    const planLabel = evaluateLabel(role, plan.text, { mode: "resume" });

    expect(proofLabel.claimBasis.label).toBe("Profile evidence");
    expect(proofLabel.claimBasis.canClaimReady).toBe(true);
    expect(planLabel.claimBasis.label).toBe("Job trial plan");
    expect(planLabel.claimBasis.canClaimReady).toBe(false);
  });

  it("appends promoted trial proof packets without losing previous evidence", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const firstPlan = buildRepairArtifactPlan(role, weak, 2);
    const firstPacket = appendTrialProofEvidence("AI strategy overview and dashboards.", buildTrialSubmissionSample(firstPlan, 2));
    const firstLabel = evaluateLabel(role, firstPacket, { mode: "resume" });
    const secondPlan = buildRepairArtifactPlan(role, firstLabel, 2);
    const secondPacket = appendTrialProofEvidence(firstPacket, buildTrialSubmissionSample(secondPlan, 2));
    const secondLabel = evaluateLabel(role, secondPacket, { mode: "resume" });

    expect(firstPacket).toContain("Promoted trial proof packet 1");
    expect(secondPacket).toContain("Promoted trial proof packet 2");
    expect(secondLabel.coveredSkillCount).toBeGreaterThan(firstLabel.coveredSkillCount);
    expect(appendTrialProofEvidence(secondPacket, buildTrialSubmissionSample(secondPlan, 2))).toBe(secondPacket);
  });

  it("summarizes promoted proof impact and remaining Ready gap", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.", { mode: "course" });
    const plan = buildRepairArtifactPlan(role, weak, 1);
    const packet = appendTrialProofEvidence("AI strategy overview and dashboards.", buildTrialSubmissionSample(plan, 1));
    const label = evaluateLabel(role, packet, { mode: "resume" });
    const impact = buildProofImpact({ role, evidenceText: packet, currentLabel: label, mode: "resume" });

    expect(impact.packetCount).toBe(1);
    expect(impact.deltas.coverage).toBeGreaterThan(0);
    expect(impact.deltas.ability).toBeGreaterThan(0);
    expect(impact.addedGates[0].title).toContain("Business Needs Analysis");
    expect(impact.ready).toBe(false);
    expect(impact.remaining.coverageCount).toBeGreaterThan(0);
    expect(impact.headline).toContain("still missing");
  });
});

describe("compareLabels", () => {
  it("uses a job trial brief as a build queue instead of proof", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const applied = evaluateLabel(role, buildRepairArtifactSample(role, weak, 3));
    const comparison = compareLabels(weak, applied, { leftName: "Current", rightName: "Job trial brief" });

    expect(comparison.winner).toBe("right");
    expect(comparison.purpose).toBe("repair");
    expect(comparison.deltas.coverage).toBeGreaterThan(0);
    expect(comparison.rightOnlyCovered.length).toBeGreaterThan(0);
    expect(comparison.headline).toContain("job trial plan");
    expect(comparison.reasons[0].title).toBe("Plan only");
    expect(comparison.reasons.map((reason) => reason.body).join(" ")).not.toContain("clears");
    expect(comparison.recommendation).toContain("Use Job trial brief as the next job-trial queue");
  });

  it("treats job comparators as demand benchmarks instead of options to prefer", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.", { mode: "course" });
    const job = evaluateLabel(
      role,
      "Responsibilities: Business Needs Analysis, scope business requirements and priorities. Software Testing, develop test cases for system requirements. Big Data Analytics, synthesize data into insights.",
      { mode: "job" },
    );
    const comparison = compareLabels(weak, job, { leftName: "Current", rightName: "Job ad" });

    expect(comparison.winner).toBe("right");
    expect(comparison.purpose).toBe("demand");
    expect(comparison.headline).toBe("Job ad is a demand benchmark, not learner proof");
    expect(comparison.reasons[0].title).toBe("Demand only");
    expect(comparison.recommendation).toContain("Do not treat it as Ready evidence");
    expect(comparison.recommendation).not.toContain("Prefer Job ad");
  });

  it("returns a tie for equivalent evidence packets", () => {
    const label = evaluateLabel(role, buildAppliedEvidenceSample(role, 3));
    const comparison = compareLabels(label, label);

    expect(comparison.winner).toBe("tie");
    expect(comparison.strengthDelta).toBe(0);
    expect(comparison.headline).toContain("Too close");
    expect(comparison.reasons[0].title).toBe("No decisive lead");
  });

  it("prefers ability evidence over title-stuffed evidence", () => {
    const titleOnly = evaluateLabel(role, "Business Needs Analysis. Software Testing. Big Data Analytics.");
    const applied = evaluateLabel(
      role,
      "Business Needs Analysis scope business requirements. Software Testing develop test cases for system requirements. Big Data Analytics synthesize data into insights.",
    );
    const comparison = compareLabels(titleOnly, applied);

    expect(titleOnly.coverage).toBeLessThan(applied.coverage);
    expect(comparison.winner).toBe("right");
    expect(comparison.deltas.coverage).toBeGreaterThan(0);
    expect(comparison.deltas.ability).toBeGreaterThan(0);
  });
});

describe("buildReviewMemo", () => {
  it("builds a sendable reviewer memo from the current label", () => {
    const label = evaluateLabel(role, "AI strategy overview and dashboards.", { mode: "course" });
    const memo = buildReviewMemo({ label, evidenceText: "AI strategy overview and dashboards.", sourceFiles: ["skills-framework.xlsx"] });

    expect(memo).toContain("SkillLabel SG reviewer memo");
    expect(memo).toContain("Role: Business Analyst / Artificial Intelligence Translator");
    expect(memo).toContain("Evidence reviewed: AI strategy overview and dashboards.");
    expect(memo).toContain("Decision: Blocked - Do not claim role alignment yet");
    expect(memo).toContain("Claim basis: Course promise - Needs assessed work");
    expect(memo).toContain("Integrity audit");
    expect(memo).toContain("Row echoes: 0");
    expect(memo).toContain("Gate proof: 0/0");
    expect(memo).toContain("Ready threshold");
    expect(memo).toContain("Official gates: 0/2 (2 remaining)");
    expect(memo).toContain("Ability gates: 0/2 (2 remaining)");
    expect(memo).toContain("Proof required");
    expect(memo).toContain("Assessed assignment, capstone, or project output");
    expect(memo).toContain("Gate proof dossier");
    expect(memo).toContain("Submitted artifact for Business Needs Analysis L4");
    expect(memo).toContain("reviewer checks Scope business requirements and priorities");
    expect(memo).toContain("Official source trace");
    expect(memo).toContain("Locked: Business Needs Analysis L4");
    expect(memo).toContain("TSC");
    expect(memo).toContain("Next gates");
    expect(memo).toContain("Sources: skills-framework.xlsx");
    expect(memo).toContain("not an accreditation decision");
  });

  it("includes comparator reasoning when a comparison is supplied", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.");
    const applied = evaluateLabel(role, buildRepairArtifactSample(role, weak, 3));
    const comparison = compareLabels(weak, applied, { leftName: "Current", rightName: "Job trial brief" });
    const memo = buildReviewMemo({ label: weak, comparison });

    expect(memo).toContain("Comparator note");
    expect(memo).toContain("Job trial brief is a job trial plan, not submitted evidence");
    expect(memo).toContain("Plan only");
  });

  it("includes promoted proof impact when supplied", () => {
    const weak = evaluateLabel(role, "AI strategy overview and dashboards.", { mode: "course" });
    const plan = buildRepairArtifactPlan(role, weak, 1);
    const packet = appendTrialProofEvidence("AI strategy overview and dashboards.", buildTrialSubmissionSample(plan, 1));
    const label = evaluateLabel(role, packet, { mode: "resume" });
    const proofImpact = buildProofImpact({ role, evidenceText: packet, currentLabel: label, mode: "resume" });
    const memo = buildReviewMemo({ label, proofImpact, evidenceText: packet });

    expect(memo).toContain("Proof impact");
    expect(memo).toContain("Promoted packets: 1");
    expect(memo).toContain("Coverage delta: +");
    expect(memo).toContain("Ready result:");
    expect(memo).toContain("Business Needs Analysis");
  });

  it("carries integrity blockers into the copied reviewer memo", () => {
    const detachedProof = [
      "Completed artifact. Submitted artifact. Reviewer comments. Rubric result. Source notes. Acceptance criteria. Decision trail.",
      "Artifact body: reconciled invoice batches, triaged clinic queue screenshots, traced outage logs, compared vendor estimates, sampled payroll exceptions, and wrote escalation notes.",
      "Business Needs Analysis. Scope business requirements and priorities.",
      "Software Testing. Develop test cases for system requirements.",
      "Big Data Analytics. Synthesize data into insights.",
    ].join("\n");
    const label = evaluateLabel(role, detachedProof, { mode: "resume" });
    const audit = buildIntegrityAudit(label);
    const narrative = buildIntegrityNarrative(label);
    const template = buildProofRepairTemplate(label, 2);
    const draft = buildProofRepairDraft(label, 2);
    const draftLabel = evaluateLabel(role, draft, { mode: "repair" });
    const memo = buildReviewMemo({ label, evidenceText: detachedProof });

    expect(audit.find((item) => item.label === "Basis")?.value).toBe("Gate proof gap / Needs gate-linked proof");
    expect(audit.find((item) => item.label === "Gate proof")?.value).toBe(
      `${label.integrity.gateLinkedProofCount}/${label.integrity.gateLinkedProofThreshold}`,
    );
    expect(memo).toContain("Integrity audit");
    expect(memo).toContain("Basis: Gate proof gap / Needs gate-linked proof");
    expect(memo).toContain("Integrity status: Artifact details were not tied to enough official gates");
    expect(memo).toContain(`Row echoes: ${label.integrity.officialRowEchoCount}`);
    expect(memo).toContain(`Proof detail: ${label.integrity.proofSubstanceTokenCount}/${label.integrity.proofSubstanceThreshold}`);
    expect(memo).toContain(`Gate proof: ${label.integrity.gateLinkedProofCount}/${label.integrity.gateLinkedProofThreshold}`);
    expect(narrative.title).toBe("Why blocked: proof is detached from the gates");
    expect(narrative.body).toContain("only");
    expect(narrative.action).toContain("Move artifact excerpts beside the specific official skills");
    expect(template.title).toBe("Paste this missing proof format");
    expect(template.text).toContain("Artifact excerpt: [paste the completed output for Business Needs Analysis L4");
    expect(template.text).toContain("Reviewer check: Scope business requirements and priorities");
    expect(template.text).toContain("Source trail: [source note + assumption + acceptance criteria + rubric result + reviewer comment]");
    expect(draft).toContain("Proof repair draft - not completed evidence yet");
    expect(draft).toContain("Replace every bracketed field with real learner output before claiming Ready.");
    expect(draftLabel.claimBasis.label).toBe("Job trial plan");
    expect(draftLabel.claimBasis.canClaimReady).toBe(false);
    expect(memo).toContain("Why this decision");
    expect(memo).toContain("Title: Why blocked: proof is detached from the gates");
    expect(memo).toContain("Next action: Move artifact excerpts beside the specific official skills");
    expect(memo).toContain("Missing proof format");
    expect(memo).toContain("Paste this missing proof format");
    expect(memo).toContain("Reviewer check: Scope business requirements and priorities");
  });

  it("does not crash while proof repair data is still loading", () => {
    expect(buildProofRepairTemplate(null, 2)).toMatchObject({
      gates: [],
      title: "Paste this missing proof format",
    });
    expect(buildProofRepairDraft(null, 2)).toBe("");
  });
});
