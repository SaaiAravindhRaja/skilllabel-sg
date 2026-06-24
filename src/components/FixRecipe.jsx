import { ClipboardList, Pin } from "lucide-react";

export function FixRecipe({ label, onPinPacket, pinned }) {
  const proofGates = label.proofDossier?.gates?.slice(0, 3) || [];

  return (
    <section className="fix-recipe">
      <div className="panel-heading">
        <ClipboardList aria-hidden="true" />
        Evidence packet
      </div>
      <h3>{label.recipe.title}</h3>
      <p>{label.recipe.body}</p>
      <div className="recipe-meta">
        <span>{label.skillTotal} target skills</span>
        <span>{label.taskTotal} official tasks</span>
      </div>
      <ol className="packet-list">
        {label.actionPlan.slice(0, 3).map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <em>{item.priority}</em>
            <span>{item.check}</span>
          </li>
        ))}
      </ol>
      {proofGates.length ? (
        <div className="gate-proof-dossier">
          <span>{label.proofDossier.title}</span>
          <ol>
            {proofGates.map((gate) => (
              <li key={gate.id}>
                <strong>
                  {gate.title}
                  {gate.level ? ` L${gate.level}` : ""}
                </strong>
                <em>Attach: {gate.attachment}</em>
                <small>Check: {gate.reviewerCheck}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <button type="button" className="recipe-action" onClick={onPinPacket} disabled={pinned}>
        <Pin aria-hidden="true" />
        {pinned ? "Packet pinned" : "Pin action packet"}
      </button>
    </section>
  );
}
