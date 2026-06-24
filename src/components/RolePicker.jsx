import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { tokenize } from "../lib/scoring.js";

function acronyms(text) {
  const words = (String(text || "").match(/[A-Za-z]+/g) || []).filter(
    (word) => !["and", "of", "the", "for"].includes(word.toLowerCase()),
  );
  const values = new Set();
  for (let start = 0; start < words.length; start += 1) {
    let acronym = "";
    for (let end = start; end < Math.min(words.length, start + 4); end += 1) {
      acronym += words[end][0].toLowerCase();
      if (acronym.length >= 2) values.add(acronym);
    }
  }
  return values;
}

function roleSearchIndex(role) {
  const text = `${role.sector} ${role.track} ${role.role}`;
  return {
    text: text.toLowerCase(),
    tokens: new Set(tokenize(text)),
    acronyms: acronyms(text),
  };
}

function rankRole(role, query) {
  const terms = tokenize(query);
  if (!terms.length) return 0;

  const index = roleSearchIndex(role);
  let score = index.text.includes(query.trim().toLowerCase()) ? 30 : 0;

  for (const term of terms) {
    if (index.tokens.has(term)) score += 10;
    else if (index.acronyms.has(term)) score += 9;
    else if ([...index.tokens].some((token) => token.startsWith(term))) score += 5;
    else return 0;
  }

  if (role.role.toLowerCase().startsWith(query.trim().toLowerCase())) score += 12;
  return score;
}

export function RolePicker({ roles, value, onChange }) {
  const [query, setQuery] = useState("");
  const selectedRole = roles.find((role) => role.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return roles
        .filter((role) =>
          [
            "Business Analyst / Artificial Intelligence Translator",
            "Data Analyst",
            "Marketing Executive",
            "Sustainability / Environment, Social and Governance Analyst",
          ].includes(role.role),
        )
        .slice(0, 10);
    }
    return roles
      .map((role) => ({ role, score: rankRole(role, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.role.role.localeCompare(b.role.role))
      .map((item) => item.role)
      .slice(0, 24);
  }, [roles, query]);

  return (
    <section className="role-picker">
      <div className="section-header">
        <div>
          <h2>Official target role</h2>
          <p>Select the Skills Framework role used as the audit baseline.</p>
        </div>
      </div>

      {selectedRole ? (
        <div className="selected-role" aria-label="Selected role">
          <span>Auditing against</span>
          <strong>{selectedRole.role}</strong>
          <small>
            {selectedRole.sector} / {selectedRole.track}
          </small>
        </div>
      ) : null}

      <label className="search-box">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search roles, sectors, AI, ESG"
        />
      </label>

      <div className="role-list">
        {matches.length ? (
          matches.map((role) => (
            <button
              type="button"
              key={role.id}
              className={role.id === value ? "selected" : ""}
              onClick={() => onChange(role.id)}
            >
              <span>{role.role}</span>
              <small>
                {role.sector} / {role.track}
              </small>
            </button>
          ))
        ) : (
          <div className="empty-search">
            <strong>No official role found</strong>
            <span>Try a sector, job family, or shorter role title.</span>
          </div>
        )}
      </div>
    </section>
  );
}
