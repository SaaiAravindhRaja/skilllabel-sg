const MODES = [
  { id: "course", label: "Course" },
  { id: "job", label: "Job ad" },
  { id: "resume", label: "Resume" },
  { id: "repair", label: "Trial plan" },
];

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function InputWorkspace({
  inputMode,
  onModeChange,
  inputText,
  onInputTextChange,
  onClear,
  onLoadStarter,
  onLoadRepair,
}) {
  const words = countWords(inputText);
  const characters = inputText.length;

  return (
    <section className="input-workspace">
      <div className="section-header">
        <div>
          <h2>Evidence intake</h2>
          <p>Paste the actual course, role, or profile text. Scores only move when the evidence is present here.</p>
        </div>
      </div>

      <div className="segmented-control" role="tablist" aria-label="Evidence type">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={inputMode === mode.id ? "active" : ""}
            onClick={() => onModeChange(mode.id)}
            role="tab"
            aria-selected={inputMode === mode.id}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="sample-actions" aria-label="Sample evidence controls">
        <button type="button" onClick={onLoadStarter}>
          Starter sample
        </button>
        <button type="button" onClick={onLoadRepair}>
          Job trial brief
        </button>
      </div>

      <label className="textarea-shell">
        <span>{MODES.find((mode) => mode.id === inputMode)?.label} evidence</span>
        <textarea
          value={inputText}
          onChange={(event) => onInputTextChange(event.target.value)}
          spellCheck="true"
          aria-label="Evidence text"
          placeholder="Paste learning outcomes, assignments, role responsibilities, assessment rubrics, or project evidence..."
        />
      </label>

      <div className="input-status">
        <span>{words.toLocaleString()} words</span>
        <span>{characters.toLocaleString()} characters</span>
        <button type="button" onClick={onClear} disabled={!inputText.trim()}>
          Clear
        </button>
      </div>
    </section>
  );
}
