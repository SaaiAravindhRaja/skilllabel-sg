function Bar({ value }) {
  return (
    <div className="bar" aria-hidden="true">
      <span style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
    </div>
  );
}

function Dots({ covered, total, className }) {
  const count = Math.max(total, covered, 1);
  return (
    <div className={`dots ${className || ""}`} aria-label={`${covered} of ${total}`}>
      {Array.from({ length: Math.min(count, 10) }).map((_, index) => (
        <span key={index} className={index < covered ? "filled" : ""} />
      ))}
      {count > 10 ? <em>+{count - 10}</em> : null}
    </div>
  );
}

export function SkillLabel({ label }) {
  const riskClass = label.claimRisk.toLowerCase();
  const coveredCount = Math.round((label.coverage / 100) * label.skillTotal);
  const nextAction = label.actionPlan[0];

  return (
    <article className="skill-label" aria-label="SkillLabel result">
      <div className="label-topline">
        <span>Official SkillsFuture alignment</span>
        <strong>SkillLabel SG</strong>
      </div>

      <div className="label-title">
        <p>Target Role</p>
        <h2>{label.roleName}</h2>
        <span>
          {label.sector} / {label.track}
        </span>
      </div>

      <div className="label-verdict-line">
        <span>Coverage</span>
        <strong>
          {coveredCount}/{label.skillTotal}
        </strong>
        <em>official skills evidenced</em>
      </div>

      <div className="label-metrics">
        <div>
          <span>Official coverage</span>
          <strong>{label.coverage}%</strong>
          <Bar value={label.coverage} />
        </div>
        <div>
          <span>Ability evidence</span>
          <strong>{label.abilityCoverage}%</strong>
          <Bar value={label.abilityCoverage} />
        </div>
        <div>
          <span>Knowledge evidence</span>
          <strong>{label.knowledgeCoverage}%</strong>
          <Bar value={label.knowledgeCoverage} />
        </div>
      </div>

      <div className="label-flags">
        <div>
          <span>Emerging skills</span>
          <Dots covered={label.emerging.covered} total={label.emerging.total} className="emerging" />
          <strong>
            {label.emerging.covered}/{label.emerging.total || 0}
          </strong>
        </div>
        <div>
          <span>CASL skills</span>
          <Dots covered={label.casl.covered} total={label.casl.total} className="casl" />
          <strong>
            {label.casl.covered}/{label.casl.total || 0}
          </strong>
        </div>
      </div>

      <div className={`risk-stamp ${riskClass}`}>
        <span>Claim risk</span>
        <strong>{label.claimRisk}</strong>
      </div>

      <section className="missing-gates">
        <h3>Locked gates</h3>
        {label.missingGates.length ? (
          label.missingGates.slice(0, 5).map(({ skill }) => (
            <div key={`${skill.code}-${skill.level}`}>
              <span>{skill.updatedTitle || skill.title}</span>
              <strong>L{skill.level}</strong>
            </div>
          ))
        ) : (
          <p>No critical missing gates detected.</p>
        )}
      </section>

      {nextAction ? (
        <section className="label-next-gate">
          <h3>Next evidence gate</h3>
          <strong>{nextAction.title}</strong>
          <p>{nextAction.check}</p>
        </section>
      ) : null}
    </article>
  );
}
