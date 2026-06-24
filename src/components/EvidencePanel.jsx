import { useState } from "react";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "covered", label: "Covered" },
  { id: "missing", label: "Missing" },
];

function TraceBlock({ rows }) {
  const visibleRows = rows.filter((row) => row.value);
  if (!visibleRows.length) return null;

  return (
    <dl className="match-trace">
      {visibleRows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EvidencePanel({ label }) {
  const [filter, setFilter] = useState("all");
  const showCovered = filter === "all" || filter === "covered";
  const showMissing = filter === "all" || filter === "missing";

  return (
    <section className="evidence-panel">
      <div className="section-header">
        <div>
          <h2>Evidence ledger</h2>
          <p>Official rows that were cleared or blocked by the pasted evidence.</p>
        </div>
      </div>

      <div className="evidence-tabs" role="tablist" aria-label="Evidence filter">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
            role="tab"
            aria-selected={filter === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="evidence-columns">
        {showCovered ? (
          <div>
            <h3>Cleared evidence</h3>
            {label.coveredSkills.length ? (
              label.coveredSkills.map(({ skill, score, titleMatches, knowledgeMatches, abilityMatches, confidence, reasons }) => (
                <article key={`${skill.code}-${skill.level}`} className="evidence-row covered">
                  <div>
                    <strong>{skill.updatedTitle || skill.title}</strong>
                    <span>
                      L{skill.level} / {Math.round(score * 100)}% / {confidence}
                    </span>
                  </div>
                  <p>
                    {abilityMatches[0] || knowledgeMatches[0] || skill.description || "Evidence matched from pasted text."}
                  </p>
                  <TraceBlock
                    rows={[
                      { label: "Skill row", value: [skill.code, skill.type?.toUpperCase(), `L${skill.level}`].filter(Boolean).join(" / ") },
                      { label: "K/A rows", value: `${skill.knowledgeCount || skill.knowledge?.length || 0} knowledge / ${skill.abilityCount || skill.ability?.length || 0} ability` },
                      { label: "Ability row", value: abilityMatches.slice(0, 2).join(" | ") },
                      { label: "Knowledge row", value: knowledgeMatches.slice(0, 2).join(" | ") },
                      { label: "Title tokens", value: titleMatches.slice(0, 5).join(", ") },
                    ]}
                  />
                  <small>{reasons.join(" · ")}</small>
                </article>
              ))
            ) : (
              <p className="empty-note">No official skill evidence found yet.</p>
            )}
          </div>
        ) : null}

        {showMissing ? (
          <div>
            <h3>Locked gates</h3>
            {label.missingGates.length ? (
              label.missingGates.slice(0, 6).map(({ skill, score, priorityReason, titleMatches, reasons }) => (
                <article key={`${skill.code}-${skill.level}`} className="evidence-row missing">
                  <div>
                    <strong>{skill.updatedTitle || skill.title}</strong>
                    <span>
                      L{skill.level} {skill.casl ? "/ CASL" : ""} {skill.emerging ? "/ Emerging" : ""}
                    </span>
                  </div>
                  <p>
                    {skill.ability?.[0] ||
                      skill.knowledge?.[0] ||
                      skill.description ||
                      "No matching evidence in pasted text."}
                  </p>
                  <TraceBlock
                    rows={[
                      { label: "Skill row", value: [skill.code, skill.type?.toUpperCase(), `L${skill.level}`].filter(Boolean).join(" / ") },
                      { label: "K/A rows", value: `${skill.knowledgeCount || skill.knowledge?.length || 0} knowledge / ${skill.abilityCount || skill.ability?.length || 0} ability` },
                      { label: "Gap priority", value: priorityReason },
                      { label: "Weak match", value: score ? `${Math.round(score * 100)}% score` : "" },
                      { label: "Title tokens", value: titleMatches.slice(0, 5).join(", ") },
                      { label: "Reason", value: reasons?.join(" · ") },
                    ]}
                  />
                </article>
              ))
            ) : (
              <p className="empty-note">No missing gates in the visible official skill set.</p>
            )}
          </div>
        ) : null}
      </div>

      {label.mappingWarnings.length ? (
        <div className="mapping-warning">
          <strong>Updated skill names detected</strong>
          {label.mappingWarnings.map((warning) => (
            <span key={`${warning.previousTitle}-${warning.updatedTitle}`}>
              {warning.previousTitle}
              {" -> "}
              {warning.updatedTitle}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
