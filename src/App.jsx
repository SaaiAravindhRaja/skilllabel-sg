import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Database,
  Download,
  FileText,
  Gauge,
  GitCompareArrows,
  Map,
  Pin,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { EvidencePanel } from "./components/EvidencePanel.jsx";
import { FixRecipe } from "./components/FixRecipe.jsx";
import { InputWorkspace } from "./components/InputWorkspace.jsx";
import { RolePicker } from "./components/RolePicker.jsx";
import { SkillLabel } from "./components/SkillLabel.jsx";
import {
  appendTrialProofEvidence,
  buildIntegrityAudit,
  buildIntegrityNarrative,
  buildProofImpact,
  buildProofRepairDraft,
  buildProofRepairTemplate,
  buildReadinessPlan,
  buildRepairArtifactPlan,
  buildReviewMemo,
  buildTrialSubmissionSample,
  compareLabels,
  evaluateLabel,
  evaluateTrialSubmission,
  rankRoleFits,
} from "./lib/scoring.js";

const COMPARE_MODES = [
  { id: "course", label: "Course" },
  { id: "job", label: "Job ad" },
  { id: "resume", label: "Resume" },
  { id: "repair", label: "Trial plan" },
];

function verdictCopy(risk) {
  if (risk === "Low") {
    return {
      eyebrow: "Audit stance",
      title: "Ready to export",
      body: "The pasted material contains enough official skill and ability evidence for a defensible review packet.",
      icon: CheckCircle2,
    };
  }
  if (risk === "Medium") {
    return {
      eyebrow: "Audit stance",
      title: "Needs stronger evidence",
      body: "Some official requirements are visible, but ability evidence needs a stronger artifact or assessment trail.",
      icon: AlertTriangle,
    };
  }
  return {
    eyebrow: "Audit stance",
    title: "High-risk evidence",
    body: "Major official role gaps remain. Use the decision brief and locked gates before exporting this as aligned.",
    icon: AlertTriangle,
  };
}

function VerdictPanel({ label }) {
  const copy = verdictCopy(label.claimRisk);
  const Icon = copy.icon;

  return (
    <section className={`verdict-panel ${label.claimRisk.toLowerCase()}`} aria-live="polite">
      <div className="verdict-copy">
        <span>{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <div className="verdict-score">
        <Icon aria-hidden="true" />
        <strong>{label.claimRisk}</strong>
        <span>risk</span>
      </div>
    </section>
  );
}

function buyCallFor(label, plan) {
  const basis = label.claimBasis?.label || "Evidence text";
  const remainingOfficial = plan?.remaining?.coverageCount ?? 0;
  const remainingAbility = plan?.remaining?.abilityCount ?? 0;
  const remainingCopy =
    remainingOfficial || remainingAbility
      ? `${remainingOfficial} official gates and ${remainingAbility} ability gates still missing.`
      : "Ready threshold is met.";

  if (basis === "Job requirement") {
    return {
      tone: "benchmark",
      kicker: "Market benchmark",
      title: "Use this job ad to define the trial, not to prove readiness",
      body: `${remainingCopy} Compare it against a learner profile or course before making a buy decision.`,
      cta: "Build job trial",
    };
  }

  if (basis === "Job trial plan") {
    return {
      tone: "trial",
      kicker: "Try before buying",
      title: "Do the work sample before claiming the course is enough",
      body: "This plan targets official missing gates, but it only becomes proof after the artifact, rubric result, and reviewer notes exist.",
      cta: remainingOfficial || remainingAbility ? "Refresh trial" : "",
    };
  }

  if (basis === "Profile evidence" || basis === "Artifact evidence") {
    return {
      tone: plan?.ready ? "ready" : "trial",
      kicker: "Proof packet",
      title: plan?.ready ? "Use this as review evidence" : "Evidence exists, but the packet is not review-ready yet",
      body: plan?.ready ? "The packet clears the Ready threshold. Export it with source rows and reviewer notes." : `${remainingCopy} Build one targeted trial artifact to close the strongest gaps.`,
      cta: plan?.ready ? "" : "Build job trial",
    };
  }

  if (basis === "Course promise") {
    return {
      tone: "stop",
      kicker: "Course buy call",
      title: "Do not buy this for role readiness yet",
      body: `${remainingCopy} The course copy promises learning, but it does not provide assessed learner proof.`,
      cta: "Build job trial",
    };
  }

  if (basis === "Official row echo") {
    return {
      tone: "stop",
      kicker: "Integrity check",
      title: "Copied official rows are not proof",
      body: "The text matches Skills Framework ability rows, but it still needs a completed artifact, reviewer notes, and source trail before any Ready claim.",
      cta: "Build job trial",
    };
  }

  if (basis === "Proof phrase wrapper") {
    return {
      tone: "stop",
      kicker: "Integrity check",
      title: "Proof phrases are not proof",
      body: "Reviewer, rubric, and source words are present, but the artifact body is too thin to support a Ready claim.",
      cta: "Build job trial",
    };
  }

  if (basis === "Gate proof gap") {
    return {
      tone: "stop",
      kicker: "Integrity check",
      title: "Proof must attach to the gates",
      body: "The artifact details exist, but not beside enough official skills to support the cleared-gate claim.",
      cta: "Build job trial",
    };
  }

  return {
    tone: label.claimRisk === "Low" ? "ready" : "stop",
    kicker: "Course buy call",
    title: label.claimRisk === "Low" ? "Shortlist, then ask for assessment proof" : "Do not treat this as role-ready training yet",
    body: label.claimRisk === "Low" ? "Coverage is strong enough to inspect as a candidate, but source rows and assessed work still decide the claim." : `${remainingCopy} Try the missing work before paying for more training.`,
    cta: label.claimRisk === "Low" ? "" : "Build job trial",
  };
}

function targetMismatchCall(label, fit) {
  const best = fit?.best;
  const current = fit?.current;
  const currentScore = current?.fitScore || 0;
  if (!best || best.id === label.roleId || best.fitScore <= currentScore + 2) return null;

  return {
    tone: "target",
    kicker: "Target check",
    title: "Switch target role before judging this",
    body: `${best.roleName} is the stronger official match: ${best.coverage}% coverage, ${best.abilityCoverage}% ability evidence, and ${best.coveredSkillCount}/${best.skillTotal} gates covered.`,
    cta: "Switch target",
    targetRoleId: best.id,
  };
}

function BuyCallPanel({ label, plan, roleFit, onBuildTrial, onSelectRole }) {
  const targetCopy = targetMismatchCall(label, roleFit);
  const copy = targetCopy || buyCallFor(label, plan);
  const Icon = targetCopy ? Target : ClipboardCheck;
  const handleClick = targetCopy ? () => onSelectRole(targetCopy.targetRoleId) : onBuildTrial;

  return (
    <section className={`buy-call-panel ${copy.tone}`} aria-label="Course buy decision">
      <div>
        <span>{copy.kicker}</span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      {copy.cta ? (
        <button type="button" onClick={handleClick}>
          <Icon aria-hidden="true" />
          {copy.cta}
        </button>
      ) : (
        <strong>Review-ready</strong>
      )}
    </section>
  );
}

function ProofImpactPanel({ impact }) {
  if (!impact) return null;
  const metrics = [
    { label: "Coverage", value: `${impact.baseline.coverage}% -> ${impact.current.coverage}%`, delta: impact.deltas.coverage },
    { label: "Ability", value: `${impact.baseline.abilityCoverage}% -> ${impact.current.abilityCoverage}%`, delta: impact.deltas.ability },
    { label: "Official gates", value: `${impact.current.coveredSkillCount}/${impact.target.coverageCount}`, delta: impact.deltas.officialGates },
    { label: "Ability gates", value: `${impact.current.abilitySkillCount}/${impact.target.abilityCount}`, delta: impact.deltas.abilityGates },
  ];

  return (
    <section className={`proof-impact-panel ${impact.ready ? "ready" : ""}`} aria-label="Promoted proof impact">
      <div className="panel-heading">
        <BadgeCheck aria-hidden="true" />
        Proof impact
      </div>
      <div className="proof-impact-summary">
        <strong>{impact.headline}</strong>
        <span>{impact.primaryAction}</span>
      </div>
      <div className="proof-impact-grid">
        {metrics.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <em>{deltaCopy(item.delta)}</em>
          </div>
        ))}
      </div>
      {impact.addedGates.length ? (
        <div className="proof-impact-gates">
          <span>{impact.packetCount} promoted packet{impact.packetCount === 1 ? "" : "s"} cleared</span>
          {impact.addedGates.slice(0, 3).map((gate) => (
            <article key={gate.id}>
              <strong>{gate.title}</strong>
              <small>
                {gate.score}% match / {gate.reason}
              </small>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DecisionBrief({ label }) {
  const items = [
    ["Learner", label.decision.learner],
    ["Provider", label.decision.provider],
    ["Coach", label.decision.coach],
  ];

  return (
    <section className={`decision-brief ${label.decision.status.toLowerCase()}`}>
      <div className="decision-heading">
        <div>
          <span>Decision brief</span>
          <h2>{label.decision.headline}</h2>
        </div>
        <strong>{label.decision.status}</strong>
      </div>
      <p>{label.decision.primaryAction}</p>
      <div className="decision-audience">
        {items.map(([name, copy]) => (
          <article key={name}>
            <span>{name}</span>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReadyMeter({ item }) {
  const denominator = Math.max(item.target, 1);
  const width = Math.min(100, Math.round((item.current / denominator) * 100));

  return (
    <div>
      <span>{item.label}</span>
      <strong>
        {item.current}/{item.target}
      </strong>
      <em>{item.remaining ? `${item.remaining} remaining` : "met"}</em>
      <div className="ready-meter" aria-hidden="true">
        <i style={{ width: `${Math.max(4, width)}%` }} />
      </div>
    </div>
  );
}

function ReadinessPanel({ plan }) {
  if (!plan) return null;
  const meters = [
    {
      label: "Official gates",
      current: plan.current.coveredCount,
      target: plan.target.coverageCount,
      remaining: plan.remaining.coverageCount,
    },
    {
      label: "Ability gates",
      current: plan.current.abilityCount,
      target: plan.target.abilityCount,
      remaining: plan.remaining.abilityCount,
    },
  ];
  const nextBundle = plan.nextBundle.slice(0, 3);

  return (
    <section className={`readiness-panel ${plan.ready ? "ready" : ""}`} aria-label="Ready threshold">
      <div className="panel-heading">
        <Target aria-hidden="true" />
        Ready threshold
      </div>
      <div className="readiness-summary">
        <strong>{plan.headline}</strong>
        <span>{plan.primaryAction}</span>
      </div>
      <div className="readiness-meters">
        {meters.map((item) => (
          <ReadyMeter key={item.label} item={item} />
        ))}
      </div>
      <div className="readiness-bundle">
        <span>{plan.ready ? "Review packet" : "Next evidence bundle"}</span>
        {nextBundle.length ? (
          <ol>
            {nextBundle.map((gate) => (
              <li key={gate.id}>
                <strong>
                  {gate.title}
                  {gate.level ? ` L${gate.level}` : ""}
                </strong>
                <small>{gate.reason}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p>No locked gates in this threshold view.</p>
        )}
      </div>
    </section>
  );
}

function ProductRail({ activeItem, onNavigate }) {
  const items = [
    { label: "Review", icon: ClipboardCheck, href: "#review" },
    { label: "Compare", icon: GitCompareArrows, href: "#compare" },
    { label: "Evidence", icon: BookOpen, href: "#evidence" },
    { label: "Dataset", icon: Database, href: "#dataset" },
    { label: "Export", icon: Download, href: "#export" },
  ];

  return (
    <aside className="app-rail" aria-label="SkillLabel navigation">
      <div className="brand-lockup">
        <div className="brand-mark">SL</div>
        <div>
          <strong>SkillLabel</strong>
          <span>Evidence audit</span>
        </div>
      </div>

      <nav className="rail-nav" aria-label="Primary">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeItem === item.label;
          return (
            <a
              key={item.label}
              href={item.href}
              className={active ? "active" : ""}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.label)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="rail-footer">
        <span>Source</span>
        <strong>Q2 SkillsFuture</strong>
      </div>
    </aside>
  );
}

function CommandBar({ data, label, onReset, onRunProofDemo, onOpenCommand }) {
  return (
    <header className="command-bar">
      <div className="command-title">
        <span>Evidence Audit</span>
        <strong>{label.roleName}</strong>
      </div>

      <button type="button" className="command-launcher" onClick={onOpenCommand}>
        <Search aria-hidden="true" />
        <span>Find role, compare, export</span>
        <kbd>Cmd K</kbd>
      </button>

      <div className="command-data" aria-label="Dataset summary">
        <span>{data.metadata.sectors} sectors</span>
        <span>{data.metadata.roleRows.toLocaleString()} roles</span>
        <span>{data.metadata.knowledgeAbilityRows.toLocaleString()} evidence rows</span>
      </div>

      <div className="command-actions">
        <button type="button" className="ghost-button" onClick={onReset}>
          <RefreshCw aria-hidden="true" />
          Reset
        </button>
        <button type="button" className="solid-button" onClick={onRunProofDemo}>
          <BadgeCheck aria-hidden="true" />
          Proof demo
        </button>
        <button type="button" className="ghost-button" onClick={() => window.print()}>
          <Download aria-hidden="true" />
          Export
        </button>
      </div>
    </header>
  );
}

function CommandPalette({ open, query, onQueryChange, actions, onClose }) {
  const visibleActions = actions.filter((action) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${action.label} ${action.description}`.toLowerCase().includes(needle);
  });

  if (!open) return null;

  return (
    <div className="command-overlay" role="presentation" onMouseDown={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-search">
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Type an action or section"
            autoFocus
          />
          <button type="button" onClick={onClose} aria-label="Close command palette">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="palette-results">
          {visibleActions.length ? (
            visibleActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  className={action.featured ? "featured" : ""}
                  onClick={() => {
                    if (action.disabled) return;
                    action.run();
                    onClose();
                  }}
                  disabled={action.disabled}
                >
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              );
            })
          ) : (
            <div className="palette-empty">
              <strong>No matching action</strong>
              <span>Try export, evidence, dataset, role, or packet.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SourcePanel({ role }) {
  return (
    <section className="source-panel" id="dataset">
      <div className="panel-heading">
        <ShieldCheck aria-hidden="true" />
        Dataset anchor
      </div>
      <dl>
        <div>
          <dt>Sector</dt>
          <dd>{role.sector}</dd>
        </div>
        <div>
          <dt>Track</dt>
          <dd>{role.track}</dd>
        </div>
        <div>
          <dt>Skills</dt>
          <dd>{role.skillCount}</dd>
        </div>
        <div>
          <dt>Tasks</dt>
          <dd>{role.taskCount}</dd>
        </div>
        <div>
          <dt>K/A items</dt>
          <dd>{(role.knowledgeCount + role.abilityCount).toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}

function SourceAuditPanel({ data, role, label }) {
  const metadata = data.metadata;
  const cleared = label.coveredSkills.slice(0, 3);
  const locked = label.missingGates.slice(0, 2);

  return (
    <section className="source-audit-panel" aria-label="Official source audit">
      <div className="panel-heading">
        <Database aria-hidden="true" />
        Source audit
      </div>
      <div className="source-audit-scope">
        <span>Official dataset scope</span>
        <div>
          <strong>{metadata.roleRows.toLocaleString()}</strong>
          <small>roles</small>
        </div>
        <div>
          <strong>{metadata.roleSkillRows.toLocaleString()}</strong>
          <small>role-skill rows</small>
        </div>
        <div>
          <strong>{metadata.knowledgeAbilityRows.toLocaleString()}</strong>
          <small>K/A rows</small>
        </div>
      </div>
      <dl className="source-audit-role">
        <div>
          <dt>Role row</dt>
          <dd>{role.id}</dd>
        </div>
        <div>
          <dt>Source files</dt>
          <dd>{metadata.sourceFiles.join(", ")}</dd>
        </div>
      </dl>
      <div className="source-audit-rows">
        <span>Trace rows</span>
        {[...cleared, ...locked].slice(0, 5).map((item) => {
          const skill = item.skill;
          const clearedRow = Boolean(item.covered);
          return (
            <article key={`${skill.code}-${skill.level}-${clearedRow ? "cleared" : "locked"}`} className={clearedRow ? "cleared" : "locked"}>
              <strong>{skill.updatedTitle || skill.title}</strong>
              <small>
                {skill.code} / L{skill.level} / {skill.type?.toUpperCase() || "TSC"}
              </small>
              <em>{clearedRow ? item.reasons?.join(" · ") || "Cleared by evidence" : item.priorityReason || "Still locked"}</em>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReliabilityPanel({ label, pending }) {
  const stats = [
    { label: "Quality", value: label.evidenceQuality },
    { label: "Confidence", value: `${label.confidenceScore}%` },
    { label: "Basis", value: label.claimBasis?.label || "Unknown" },
    { label: "Proof", value: label.claimBasis?.status || "Unknown" },
    { label: "Tokens", value: label.matchStats.inputTokens.toLocaleString() },
    { label: "Ability rows", value: label.matchStats.abilitySignalCount.toLocaleString() },
    { label: "Row echoes", value: label.matchStats.officialRowEchoCount.toLocaleString() },
    {
      label: "Proof detail",
      value: `${label.integrity?.proofSubstanceTokenCount || 0}/${label.integrity?.proofSubstanceThreshold || 0}`,
    },
    {
      label: "Gate proof",
      value: `${label.integrity?.gateLinkedProofCount || 0}/${label.integrity?.gateLinkedProofThreshold || 0}`,
    },
    { label: "Title-only", value: label.matchStats.titleOnlyMatchCount.toLocaleString() },
  ];
  const proofRequirements = label.claimBasis?.proofRequirements || [];

  return (
    <section className={`reliability-panel ${pending ? "pending" : ""}`} aria-live="polite">
      <div className="panel-heading">
        <Gauge aria-hidden="true" />
        Match reliability
      </div>
      <div className="reliability-grid">
        {stats.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="reliability-notes">
        {pending ? <span>Scoring latest edits...</span> : null}
        {label.auditWarnings.length ? label.auditWarnings.map((warning) => <span key={warning}>{warning}</span>) : <span>No scoring warnings</span>}
      </div>
      {proofRequirements.length ? (
        <div className="proof-requirements">
          <span>Proof required</span>
          <ul>
            {proofRequirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RoleFitPanel({ fit, currentRoleId, onSelectRole }) {
  const top = fit?.top || [];
  const best = fit?.best;
  const currentIsBest = Boolean(best?.id && best.id === currentRoleId);
  const headline = !top.length
    ? "No alternate role signal yet"
    : currentIsBest
      ? "Selected role is the strongest match"
      : "Check a stronger target role";
  const subcopy = !top.length
    ? "Paste more concrete skills, tasks, or proof to compare against official roles."
    : currentIsBest
      ? `${best.coverage}% coverage and ${best.abilityCoverage}% ability evidence for the current target.`
      : `${best.roleName} has the strongest official evidence match.`;

  return (
    <section className="role-fit-panel" aria-label="Best target role fit">
      <div className="panel-heading">
        <Target aria-hidden="true" />
        Target fit
      </div>
      <div className="role-fit-summary">
        <strong>{headline}</strong>
        <span>{subcopy}</span>
      </div>
      {top.length ? (
        <div className="role-fit-list">
          {top.slice(0, 4).map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={item.id === currentRoleId ? "active" : ""}
              onClick={() => onSelectRole(item.id)}
              disabled={item.id === currentRoleId}
            >
              <span>{index + 1}</span>
              <strong>{item.roleName}</strong>
              <small>
                {item.sector} / {item.track}
              </small>
              <em>
                {item.coverage}% coverage / {item.abilityCoverage}% ability
              </em>
              {item.matchedGates?.length ? <small className="role-fit-gates">Matched: {item.matchedGates.join(", ")}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function deltaCopy(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function planLevelPrefix(level) {
  return level ? `L${level} / ` : "";
}

function RepairPlanPreview({ plan }) {
  if (!plan) return null;
  const submitItems = plan.submitItems.slice(0, 2);
  const rubric = plan.rubric.slice(0, 2);

  return (
    <div className="repair-preview" aria-label="Job trial brief preview">
      <div className="repair-preview-header">
        <span>Job trial brief</span>
        <strong>{plan.roleName} evidence pack</strong>
        <small>{plan.rubric.length} official gates targeted from current missing evidence</small>
      </div>
      <div className="repair-preview-grid">
        <article>
          <span>Submit</span>
          <ul>
            {submitItems.map((item) => (
              <li key={`${item.title}-${item.level}`}>
                <strong>{item.title}</strong>
                <span>
                  <small>
                    {planLevelPrefix(item.level)}
                    {item.body}
                  </small>
                  <em>{item.reason}</em>
                </span>
              </li>
            ))}
          </ul>
          {plan.submitItems.length > submitItems.length ? (
            <small className="repair-more">+{plan.submitItems.length - submitItems.length} more submit rows in brief</small>
          ) : null}
        </article>
        <article>
          <span>Rubric gates</span>
          <ul>
            {rubric.map((item) => (
              <li key={`${item.title}-${item.level}`}>
                <strong>{item.title}</strong>
                <span>
                  <small>
                    {planLevelPrefix(item.level)}
                    {item.check}
                  </small>
                  <em>{item.reason}</em>
                </span>
              </li>
            ))}
          </ul>
          {plan.rubric.length > rubric.length ? (
            <small className="repair-more">+{plan.rubric.length - rubric.length} more rubric gates in brief</small>
          ) : null}
        </article>
      </div>
      <div className="repair-checklist" aria-label="Submit checklist">
        {plan.checklist.slice(0, 3).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function TrialProofPanel({ proof, submissionText, onSubmissionTextChange, onLoadSample, onPromoteProof, onClear }) {
  if (!proof) return null;
  const gates = proof.gates.slice(0, 4);
  const nextActions = proof.nextActions || [];

  return (
    <div className={`trial-proof-panel ${proof.ready ? "ready" : proof.submitted ? "partial" : "empty"}`} aria-label="Submitted trial proof check">
      <div className="trial-proof-header">
        <div>
          <span>Submitted proof check</span>
          <strong>{proof.status}</strong>
          <small>{proof.headline}</small>
        </div>
        <div className="trial-proof-score">
          <strong>{proof.score}%</strong>
          <span>
            {proof.passedCount}/{proof.total || 0} gates
          </span>
        </div>
      </div>

      <div className="trial-proof-metrics" aria-label="Trial proof metrics">
        <div>
          <span>Checklist</span>
          <strong>
            {proof.checklistHits}/{proof.checklistTotal}
          </strong>
        </div>
        <div>
          <span>Proof trail</span>
          <strong>{proof.proofSignalCount}</strong>
        </div>
        <div>
          <span>Completion</span>
          <strong>{proof.completionSignalCount}</strong>
        </div>
      </div>

      {nextActions.length ? (
        <div className="trial-proof-next" aria-label="Proof repair queue">
          <span>Next proof moves</span>
          {nextActions.map((item) => (
            <article key={item.id}>
              <strong>{item.title}</strong>
              <small>{item.body}</small>
            </article>
          ))}
        </div>
      ) : null}

      <div className="trial-proof-actions" aria-label="Trial proof controls">
        <button type="button" onClick={onLoadSample}>
          Load proof sample
        </button>
        <button type="button" onClick={onPromoteProof} disabled={!proof.ready}>
          Promote proof
        </button>
        <button type="button" onClick={onClear} disabled={!submissionText.trim()}>
          Clear proof
        </button>
      </div>

      <label className="trial-proof-textarea">
        <span>Completed artifact</span>
        <textarea
          value={submissionText}
          onChange={(event) => onSubmissionTextChange(event.target.value)}
          spellCheck="true"
          aria-label="Completed trial artifact text"
          placeholder="Paste the completed work sample, source notes, assumptions, acceptance criteria, rubric result, and reviewer comments..."
        />
      </label>

      {gates.length ? (
        <div className="trial-proof-gates" aria-label="Trial rubric gate results">
          {gates.map((gate) => (
            <article key={`${gate.title}-${gate.level}`} className={gate.passed ? "passed" : ""}>
              <strong>
                {gate.title}
                {gate.level ? ` L${gate.level}` : ""}
              </strong>
              <span>{gate.passed ? "Pass" : `Missing ${gate.missing.join(", ")}`}</span>
              <small>{gate.score}% rubric match</small>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ComparePanel({
  comparison,
  comparisonLabel,
  compareText,
  compareMode,
  repairPlan,
  trialProof,
  trialSubmissionText,
  onCompareTextChange,
  onCompareModeChange,
  onLoadComparator,
  onPromoteComparator,
  onTrialSubmissionTextChange,
  onLoadTrialProof,
  onPromoteTrialProof,
  onClearTrialProof,
  onClear,
  pending,
}) {
  const hasComparator = compareText.trim().length > 0;
  const isRepairComparator = Boolean(repairPlan?.text && compareText.trim() === repairPlan.text.trim());
  const metrics = [
    ["Coverage", comparison.deltas.coverage],
    ["Ability", comparison.deltas.ability],
    ["Knowledge", comparison.deltas.knowledge],
    ["Confidence", comparison.deltas.confidence],
  ];
  const advantageTitle =
    comparison.winner === "right"
      ? "Comparator gains"
      : comparison.winner === "left"
        ? "Current still wins"
        : "Unique cleared gates";
  const advantageItems =
    comparison.winner === "left"
      ? comparison.leftOnlyCovered
      : comparison.winner === "right"
        ? comparison.rightOnlyCovered
        : [...comparison.rightOnlyCovered, ...comparison.leftOnlyCovered];

  return (
    <section className={`compare-panel ${comparison.winner}`} id="compare" aria-live="polite">
      <div className="panel-heading">
        <GitCompareArrows aria-hidden="true" />
        Evidence comparator
      </div>

      <div className="comparison-verdict">
        <strong>{hasComparator ? comparison.headline : "Paste a comparator to judge the better option"}</strong>
        <span>
          {hasComparator
            ? comparison.recommendation
            : "Use this for course-vs-course, portfolio-vs-course, or job-ad-vs-profile decisions against the same official role."}
        </span>
      </div>

      <div className="compare-mode-control" aria-label="Comparator evidence type">
        {COMPARE_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={compareMode === mode.id ? "active" : ""}
            onClick={() => onCompareModeChange(mode.id)}
            aria-pressed={compareMode === mode.id}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {hasComparator ? (
        <div className="compare-basis" aria-label="Comparator proof basis">
          <span>{comparisonLabel.claimBasis?.label || "Unknown basis"}</span>
          <strong>{comparisonLabel.claimBasis?.status || "Unknown proof status"}</strong>
        </div>
      ) : null}

      {hasComparator ? (
        <>
          <div className="comparison-metrics" aria-label="Comparator deltas against current evidence">
            {metrics.map(([label, value]) => (
              <div key={label} className={value > 0 ? "positive" : value < 0 ? "negative" : ""}>
                <span>{label}</span>
                <strong>{deltaCopy(value)}</strong>
              </div>
            ))}
          </div>
          <div className="comparison-reasons" aria-label="Comparison reasons">
            {comparison.reasons.map((reason) => (
              <article key={reason.title}>
                <strong>{reason.title}</strong>
                <span>{reason.body}</span>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="compare-empty-state">Comparator score appears after evidence is pasted.</div>
      )}

      {isRepairComparator ? (
        <>
          <RepairPlanPreview plan={repairPlan} />
          <TrialProofPanel
            proof={trialProof}
            submissionText={trialSubmissionText}
            onSubmissionTextChange={onTrialSubmissionTextChange}
            onLoadSample={onLoadTrialProof}
            onPromoteProof={onPromoteTrialProof}
            onClear={onClearTrialProof}
          />
        </>
      ) : null}

      <div className="compare-actions" aria-label="Comparator controls">
        <button type="button" onClick={onLoadComparator}>
          Trial comparator
        </button>
        <button type="button" onClick={onPromoteComparator} disabled={!hasComparator}>
          Promote
        </button>
        <button type="button" onClick={onClear} disabled={!hasComparator}>
          Clear compare
        </button>
      </div>

      <label className="compare-textarea">
        <span>Comparator evidence</span>
        <textarea
          value={compareText}
          onChange={(event) => onCompareTextChange(event.target.value)}
          spellCheck="true"
          aria-label="Comparator evidence text"
          placeholder="Paste a second course, role, or portfolio packet to compare against the current evidence..."
        />
      </label>

      {hasComparator ? (
        <div className="comparison-lists">
        <article>
          <span>{advantageTitle}</span>
          {advantageItems.length ? (
            <ul>
              {advantageItems.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <small>{item.score}% match</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No unique cleared gates.</p>
          )}
        </article>
        <article>
          <span>Shared blockers</span>
          {comparison.sharedMissing.length ? (
            <ul>
              {comparison.sharedMissing.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <small>{item.reason}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No shared locked gates in the top review set.</p>
          )}
        </article>
        </div>
      ) : null}

      {pending ? <div className="compare-pending">Refreshing comparator score...</div> : null}
    </section>
  );
}

function GateRoute({ label }) {
  const coveredTotal = Math.round((label.coverage / 100) * label.skillTotal);
  const lockedTotal = Math.max(label.skillTotal - coveredTotal, 0);
  const cleared = label.coveredSkills.slice(0, 4).map((item) => ({
    id: `${item.skill.code}-${item.skill.level}-covered`,
    title: item.skill.updatedTitle || item.skill.title,
    level: item.skill.level,
    status: "cleared",
    meta: `${Math.round(item.score * 100)}% match`,
  }));
  const locked = label.missingGates.slice(0, 5).map(({ skill }) => ({
    id: `${skill.code}-${skill.level}-missing`,
    title: skill.updatedTitle || skill.title,
    level: skill.level,
    status: "locked",
    meta: [skill.casl ? "CASL" : "", skill.emerging ? "Emerging" : ""].filter(Boolean).join(" / ") || "Needs artifact",
  }));
  const stops = [...cleared, ...locked].slice(0, 9);
  const abilityCleared = Math.round((label.abilityCoverage / 100) * label.skillTotal);

  return (
    <section className="gate-route" aria-label="Skill gate route">
      <div className="panel-heading">
        <Map aria-hidden="true" />
        Skill gate route
      </div>
      <div className="route-stats">
        <div>
          <span>Cleared</span>
          <strong>{coveredTotal}</strong>
        </div>
        <div>
          <span>Locked</span>
          <strong>{lockedTotal}</strong>
        </div>
        <div>
          <span>Ability</span>
          <strong>
            {abilityCleared}/{label.skillTotal}
          </strong>
        </div>
      </div>
      <div className="route-line">
        {stops.map((stop, index) => (
          <article key={stop.id} className={stop.status}>
            <div className="route-node">
              <span>{index + 1}</span>
            </div>
            <div>
              <strong>{stop.title}</strong>
              <small>
                L{stop.level} · {stop.meta}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PacketDock({ label, onClear, onLoadProofDraft }) {
  const proofGates = label.proofDossier?.gates?.slice(0, 4) || [];
  const repairTemplate = buildProofRepairTemplate(label, 3);

  return (
    <section className="packet-dock" id="packet">
      <div className="packet-dock-header">
        <div>
          <span>Action packet</span>
          <strong>Reviewer-ready next steps</strong>
        </div>
        <button type="button" onClick={onClear} aria-label="Unpin action packet">
          <X aria-hidden="true" />
        </button>
      </div>
      <ol>
        {(proofGates.length ? proofGates : label.actionPlan.slice(0, 4)).map((item) => (
          <li key={item.id}>
            <strong>
              {item.title}
              {item.level ? ` L${item.level}` : ""}
            </strong>
            <span>{item.attachment ? `Attach: ${item.attachment}` : item.artifact}</span>
            {item.reviewerCheck ? <small>Check: {item.reviewerCheck}</small> : null}
          </li>
        ))}
      </ol>
      {repairTemplate.gates.length ? (
        <div className="packet-proof-template">
          <div className="proof-template-header">
            <span>Paste this proof format</span>
            <button type="button" onClick={onLoadProofDraft}>
              Load draft
            </button>
          </div>
          <pre>{repairTemplate.text}</pre>
        </div>
      ) : null}
    </section>
  );
}

function ReviewMemoPanel({ memo, status, onCopy }) {
  return (
    <section className="memo-panel" aria-label="Reviewer memo">
      <div className="memo-panel-header">
        <div>
          <span>Reviewer memo</span>
          <strong>Sendable decision note</strong>
        </div>
        <button type="button" onClick={onCopy}>
          <Copy aria-hidden="true" />
          {status || "Copy"}
        </button>
      </div>
      <textarea className="memo-textarea" value={memo} readOnly aria-label="Reviewer memo text" />
    </section>
  );
}

function ExportBrief({ label, plan, proofImpact, sourceFiles, onLoadProofDraft }) {
  const integrityRows = buildIntegrityAudit(label);
  const integrityNarrative = buildIntegrityNarrative(label);
  const repairTemplate = buildProofRepairTemplate(label, 3);
  const proofRows = proofImpact
    ? [
        { label: "Coverage", value: `${proofImpact.baseline.coverage}% -> ${proofImpact.current.coverage}%`, delta: deltaCopy(proofImpact.deltas.coverage) },
        { label: "Ability", value: `${proofImpact.baseline.abilityCoverage}% -> ${proofImpact.current.abilityCoverage}%`, delta: deltaCopy(proofImpact.deltas.ability) },
        { label: "Official gates", value: `${proofImpact.current.coveredSkillCount}/${proofImpact.target.coverageCount}`, delta: deltaCopy(proofImpact.deltas.officialGates) },
      ]
    : [];
  const nextGates = plan?.nextBundle?.slice(0, 3) || [];
  const sourceRows = [
    ...label.coveredSkills.slice(0, 2).map((item) => ({ item, status: "Cleared" })),
    ...label.missingGates.slice(0, 2).map((item) => ({ item, status: "Locked" })),
  ];

  return (
    <section className="export-brief" aria-label="Export decision brief">
      <div className="export-brief-header">
        <span>Reviewer packet</span>
        <strong>{label.decision.status}: {label.decision.headline}</strong>
        <small>{label.claimBasis?.label || "Evidence text"} / {label.claimBasis?.status || "Unknown proof status"}</small>
      </div>

      {proofImpact ? (
        <div className="export-proof-impact">
          <span>Promoted proof impact</span>
          <strong>{proofImpact.headline}</strong>
          <div>
            {proofRows.map((item) => (
              <article key={item.label}>
                <small>{item.label}</small>
                <em>{item.value}</em>
                <b>{item.delta}</b>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="export-proof-impact empty">
          <span>Promoted proof impact</span>
          <strong>No promoted proof packets attached yet.</strong>
        </div>
      )}

      <div className="export-integrity-audit">
        <span>Integrity audit</span>
        <div>
          {integrityRows.map((item) => (
            <article key={item.label}>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className={`export-decision-story ${integrityNarrative.tone}`}>
        <span>Why this decision</span>
        <strong>{integrityNarrative.title}</strong>
        <p>{integrityNarrative.body}</p>
        <small>{integrityNarrative.action}</small>
      </div>

      {repairTemplate.gates.length ? (
        <div className="export-proof-template">
          <div className="proof-template-header">
            <span>Missing proof format</span>
            <button type="button" onClick={onLoadProofDraft}>
              Load draft
            </button>
          </div>
          <strong>{repairTemplate.title}</strong>
          <p>{repairTemplate.summary}</p>
          <pre>{repairTemplate.text}</pre>
        </div>
      ) : null}

      <div className="export-next-gates">
        <span>{plan?.ready ? "Ready packet" : "Still needed before Ready"}</span>
        {plan?.ready ? (
          <p>Ready threshold met. Export with source rows and reviewer notes.</p>
        ) : (
          <ol>
            {nextGates.map((gate) => (
              <li key={gate.id}>
                <strong>{gate.title}{gate.level ? ` L${gate.level}` : ""}</strong>
                <small>{gate.reason}</small>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="export-source-trace">
        <span>Official row trace</span>
        {sourceRows.map(({ item, status }) => {
          const skill = item.skill;
          return (
            <article key={`${status}-${skill.code}-${skill.level}`}>
              <strong>{status}: {skill.updatedTitle || skill.title}</strong>
              <small>{skill.code} / L{skill.level} / {skill.type?.toUpperCase() || "TSC"}</small>
            </article>
          );
        })}
      </div>

      <div className="export-sources">
        <span>Sources</span>
        <small>{sourceFiles.join(", ")}. Official row trace uses Skills Framework skill codes. Deterministic evidence match, not an accreditation decision.</small>
      </div>
    </section>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [targetRoleId, setTargetRoleId] = useState("");
  const [inputText, setInputText] = useState("");
  const [inputMode, setInputMode] = useState("course");
  const [activeNav, setActiveNav] = useState("Review");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [packetPinned, setPacketPinned] = useState(false);
  const [compareText, setCompareText] = useState("");
  const [compareMode, setCompareMode] = useState("repair");
  const [compareFollowsRole, setCompareFollowsRole] = useState(true);
  const [trialSubmissionText, setTrialSubmissionText] = useState("");
  const [memoStatus, setMemoStatus] = useState("");
  const deferredInputText = useDeferredValue(inputText);
  const deferredCompareText = useDeferredValue(compareText);
  const deferredTrialSubmissionText = useDeferredValue(trialSubmissionText);
  const scorePending = deferredInputText !== inputText;
  const comparePending = deferredCompareText !== compareText;

  useEffect(() => {
    fetch("/skilllabel-data.json")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load SkillLabel data");
        return response.json();
      })
      .then((payload) => {
        setData(payload);
        setTargetRoleId(payload.defaultRoleId);
        setInputText(payload.sampleInput);
      })
      .catch(() => setLoadError("SkillLabel could not load the SkillsFuture dataset."));
  }, []);

  const targetRole = useMemo(() => {
    if (!data) return null;
    return data.roles.find((role) => role.id === targetRoleId) || data.roles[0];
  }, [data, targetRoleId]);

  const label = useMemo(() => {
    if (!targetRole) return null;
    return evaluateLabel(targetRole, deferredInputText, { mode: inputMode });
  }, [targetRole, deferredInputText, inputMode]);
  const readinessPlan = useMemo(() => {
    if (!label) return null;
    return buildReadinessPlan(label, 5);
  }, [label]);
  const repairPlan = useMemo(() => {
    if (!targetRole || !label) return null;
    return buildRepairArtifactPlan(targetRole, label, 8);
  }, [targetRole, label]);
  const repairSample = repairPlan?.text || "";
  const trialProof = useMemo(() => {
    if (!repairPlan) return null;
    return evaluateTrialSubmission(repairPlan, deferredTrialSubmissionText);
  }, [repairPlan, deferredTrialSubmissionText]);
  const comparisonLabel = useMemo(() => {
    if (!targetRole) return null;
    return evaluateLabel(targetRole, deferredCompareText, { mode: compareMode });
  }, [targetRole, deferredCompareText, compareMode]);
  const comparison = useMemo(() => {
    if (!label || !comparisonLabel) return null;
    return compareLabels(label, comparisonLabel, { leftName: "Current", rightName: "Comparator" });
  }, [label, comparisonLabel]);
  const roleFit = useMemo(() => {
    if (!data || !targetRole) return null;
    return rankRoleFits(data.roles, deferredInputText, { mode: inputMode, currentRoleId: targetRole.id, limit: 4 });
  }, [data, targetRole, deferredInputText, inputMode]);
  const proofImpact = useMemo(() => {
    if (!targetRole || !label) return null;
    return buildProofImpact({ role: targetRole, evidenceText: deferredInputText, currentLabel: label, mode: inputMode });
  }, [targetRole, deferredInputText, label, inputMode]);
  const reviewMemo = useMemo(() => {
    if (!data || !label) return "";
    return buildReviewMemo({
      label,
      comparison: compareText.trim() && comparison ? comparison : null,
      proofImpact,
      evidenceText: inputText,
      sourceFiles: data.metadata.sourceFiles,
    });
  }, [compareText, comparison, data, inputText, label, proofImpact]);

  useEffect(() => {
    if (repairSample && compareFollowsRole) {
      setCompareText(repairSample);
      setCompareMode("repair");
    }
  }, [repairSample, compareFollowsRole]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const pinEvidencePacket = () => {
    setPacketPinned(true);
    setActiveNav("Export");
    window.setTimeout(() => document.querySelector("#packet")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };

  const resetSample = () => {
    setInputText(data.sampleInput);
    setCommandQuery("");
    setPacketPinned(false);
  };

  const loadRepairSample = () => {
    setInputText(repairSample);
    setInputMode("repair");
    setPacketPinned(false);
    setActiveNav("Review");
  };

  const loadProofRepairDraft = () => {
    if (!label) return;
    const draft = buildProofRepairDraft(label, 3);
    if (!draft.trim()) return;
    setInputText(draft);
    setInputMode("repair");
    setActiveNav("Review");
    window.setTimeout(() => {
      const editor = document.querySelector('textarea[aria-label="Evidence text"]');
      if (!editor) return;
      editor.scrollTop = 0;
      editor.setSelectionRange(0, 0);
      editor?.scrollIntoView({ behavior: "smooth", block: "center" });
      editor?.focus({ preventScroll: true });
    }, 160);
  };

  const loadRepairComparator = () => {
    setCompareText(repairSample);
    setCompareMode("repair");
    setCompareFollowsRole(true);
    setTrialSubmissionText("");
    setActiveNav("Compare");
    window.setTimeout(() => document.querySelector("#compare")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };

  const promoteComparator = () => {
    setInputText(compareText);
    setInputMode(compareMode);
    setPacketPinned(false);
    setCompareFollowsRole(false);
    setActiveNav("Review");
  };

  const updateComparatorText = (text) => {
    setCompareText(text);
    setCompareFollowsRole(false);
    if (text.trim() !== repairSample.trim()) setTrialSubmissionText("");
  };

  const updateComparatorMode = (mode) => {
    setCompareMode(mode);
    if (mode === "repair") {
      setCompareText(repairSample);
      setCompareFollowsRole(true);
    } else {
      setCompareFollowsRole(false);
      setTrialSubmissionText("");
    }
  };

  const clearComparator = () => {
    setCompareText("");
    setCompareFollowsRole(false);
    setTrialSubmissionText("");
  };

  const loadTrialProofSample = () => {
    if (!repairPlan) return;
    setTrialSubmissionText(buildTrialSubmissionSample(repairPlan));
  };

  const runProofDemo = () => {
    if (!repairPlan) return;
    setCompareText(repairPlan.text);
    setCompareMode("repair");
    setCompareFollowsRole(true);
    setTrialSubmissionText(buildTrialSubmissionSample(repairPlan));
    setActiveNav("Compare");
    window.setTimeout(() => document.querySelector(".trial-proof-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };

  const promoteTrialProof = () => {
    if (!trialProof?.ready || !trialSubmissionText.trim()) return;
    setInputText((current) => appendTrialProofEvidence(current, trialSubmissionText));
    setInputMode("resume");
    setCompareText("");
    setCompareFollowsRole(false);
    setTrialSubmissionText("");
    setPacketPinned(false);
    setActiveNav("Review");
    window.setTimeout(() => document.querySelector("#review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };

  const clearTrialProof = () => {
    setTrialSubmissionText("");
  };

  const copyReviewMemo = async () => {
    if (!reviewMemo) return;
    try {
      await navigator.clipboard.writeText(reviewMemo);
      setMemoStatus("Copied");
    } catch {
      setMemoStatus("Select text");
    }
    window.setTimeout(() => setMemoStatus(""), 1600);
  };

  const navigateTo = (labelName, selector) => {
    setActiveNav(labelName);
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const commandActions = [
    {
      id: "packet",
      label: packetPinned ? "Action packet pinned" : "Pin action packet",
      description: packetPinned ? "The reviewer checklist is already pinned beside the label." : "Create a checklist from missing official gates without changing the score.",
      icon: Pin,
      run: pinEvidencePacket,
      disabled: packetPinned,
      featured: true,
    },
    {
      id: "export",
      label: "Export label",
      description: "Open the print/export flow for the alignment label.",
      icon: Download,
      run: () => window.print(),
    },
    {
      id: "copy-memo",
      label: "Copy reviewer memo",
      description: "Copy the role decision, evidence score, gates, and comparator note.",
      icon: Copy,
      run: copyReviewMemo,
      disabled: !reviewMemo,
    },
    {
      id: "reset",
      label: "Restore starter evidence",
      description: "Return to the original course outline and clear pinned packets.",
      icon: RefreshCw,
      run: resetSample,
    },
    {
      id: "repair",
      label: "Load job trial brief",
      description: "Paste a realistic work-sample brief built from the current missing gates.",
      icon: CheckCircle2,
      run: loadRepairSample,
    },
    {
      id: "proof-draft",
      label: "Load proof draft",
      description: "Paste the missing proof format into the evidence editor as a draft to fill.",
      icon: ClipboardCheck,
      run: loadProofRepairDraft,
      disabled: !label || !buildProofRepairTemplate(label, 1).gates.length,
    },
    {
      id: "compare",
      label: "Load trial comparator",
      description: "Compare the current evidence with a targeted job-trial brief.",
      icon: GitCompareArrows,
      run: loadRepairComparator,
    },
    {
      id: "proof-demo",
      label: "Run proof demo",
      description: "Job-trial brief plus completed proof sample for the current missing gates.",
      icon: BadgeCheck,
      run: runProofDemo,
      disabled: !repairPlan,
      featured: true,
    },
    {
      id: "promote-comparator",
      label: "Promote comparator",
      description: "Move the comparator packet into the main evidence editor for export or trial review.",
      icon: ArrowRight,
      run: promoteComparator,
      disabled: !compareText.trim(),
    },
    {
      id: "review",
      label: "Go to evidence editor",
      description: "Jump to the input workspace and evidence type controls.",
      icon: ClipboardCheck,
      run: () => navigateTo("Review", "#review"),
    },
    {
      id: "evidence",
      label: "Open evidence ledger",
      description: "Review covered and missing official skill evidence.",
      icon: BookOpen,
      run: () => navigateTo("Evidence", "#evidence"),
    },
    {
      id: "dataset",
      label: "Inspect dataset source",
      description: "Jump to official role evidence and source metadata.",
      icon: Database,
      run: () => navigateTo("Dataset", "#dataset"),
    },
    {
      id: "role",
      label: "Find another role",
      description: "Focus the official role search input.",
      icon: Search,
      run: () => {
        navigateTo("Review", "#review");
        window.setTimeout(() => document.querySelector(".search-box input")?.focus(), 180);
      },
    },
  ];

  if (loadError) {
    return (
      <main className="loading-shell error-shell">
        <div className="loading-mark">SL</div>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!data || !label || !comparison || !targetRole) {
    return (
      <main className="loading-shell">
        <div className="loading-mark">SL</div>
        <p>Loading SkillsFuture evidence...</p>
      </main>
    );
  }

  return (
    <main className="product-shell">
      <ProductRail activeItem={activeNav} onNavigate={setActiveNav} />

      <section className="app-main">
        <CommandBar data={data} label={label} onReset={resetSample} onRunProofDemo={runProofDemo} onOpenCommand={() => setCommandOpen(true)} />

        <section className="review-layout">
          <section className="workbench-column" id="review" aria-label="Evidence workspace">
            <VerdictPanel label={label} />
            <BuyCallPanel
              label={label}
              plan={readinessPlan}
              roleFit={roleFit}
              onBuildTrial={inputMode === "repair" ? loadRepairSample : loadRepairComparator}
              onSelectRole={setTargetRoleId}
            />
            <ProofImpactPanel impact={proofImpact} />
            <DecisionBrief label={label} />
            <ReadinessPanel plan={readinessPlan} />
            <InputWorkspace
              inputMode={inputMode}
              onModeChange={setInputMode}
              inputText={inputText}
              onInputTextChange={setInputText}
              onClear={() => setInputText("")}
              onLoadStarter={resetSample}
              onLoadRepair={loadRepairSample}
            />
            <RolePicker roles={data.roles} value={targetRoleId} onChange={setTargetRoleId} />
          </section>

          <aside className="inspector-stack" aria-label="Review inspector">
            <SourcePanel role={targetRole} />
            <SourceAuditPanel data={data} role={targetRole} label={label} />
            <ReliabilityPanel label={label} pending={scorePending} />
            <RoleFitPanel fit={roleFit} currentRoleId={targetRole.id} onSelectRole={setTargetRoleId} />
            <ComparePanel
              comparison={comparison}
              comparisonLabel={comparisonLabel}
              compareText={compareText}
              compareMode={compareMode}
              repairPlan={repairPlan}
              trialProof={trialProof}
              trialSubmissionText={trialSubmissionText}
              onCompareTextChange={updateComparatorText}
              onCompareModeChange={updateComparatorMode}
              onLoadComparator={loadRepairComparator}
              onPromoteComparator={promoteComparator}
              onTrialSubmissionTextChange={setTrialSubmissionText}
              onLoadTrialProof={loadTrialProofSample}
              onPromoteTrialProof={promoteTrialProof}
              onClearTrialProof={clearTrialProof}
              onClear={clearComparator}
              pending={comparePending}
            />
            <GateRoute label={label} />
            <FixRecipe label={label} onPinPacket={pinEvidencePacket} pinned={packetPinned} />
            <div id="evidence">
              <EvidencePanel label={label} />
            </div>
          </aside>

          <section className="preview-stack" id="export" aria-label="Export preview">
            <div className="preview-header">
              <div>
                <span>Evidence label</span>
                <strong>Official SkillsFuture Alignment</strong>
              </div>
              <BadgeCheck aria-hidden="true" />
            </div>
            {packetPinned ? <PacketDock label={label} onClear={() => setPacketPinned(false)} onLoadProofDraft={loadProofRepairDraft} /> : null}
            <SkillLabel label={label} />
            <ExportBrief label={label} plan={readinessPlan} proofImpact={proofImpact} sourceFiles={data.metadata.sourceFiles} onLoadProofDraft={loadProofRepairDraft} />
            <ReviewMemoPanel memo={reviewMemo} status={memoStatus} onCopy={copyReviewMemo} />
          </section>
        </section>

        <footer className="source-footer">
          <FileText aria-hidden="true" />
          <span>
            Source files: {data.metadata.sourceFiles.join(", ")}. Official row trace uses Skills Framework skill codes. Scores are deterministic evidence matches, not accreditation decisions.
          </span>
        </footer>
      </section>

      <CommandPalette
        open={commandOpen}
        query={commandQuery}
        onQueryChange={setCommandQuery}
        actions={commandActions}
        onClose={() => {
          setCommandOpen(false);
          setCommandQuery("");
        }}
      />
    </main>
  );
}
