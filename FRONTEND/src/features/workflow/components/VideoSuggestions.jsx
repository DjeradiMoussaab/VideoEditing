import { toAbsoluteUrl } from "../../../services/api-client";

export function VideoSuggestions({ scene, onRefresh, onChoose, busy }) {
  const suggestions = scene.stockSuggestions || [];
  const selectedId = scene.selectedSuggestionId ? String(scene.selectedSuggestionId) : null;
  const stockSearchQuery = String(scene?.stockSearchQuery || "").trim();

  return (
    <section className="suggestions-section">
      <div className="inline-actions">
        <h4>Stock suggestions</h4>
        <button onClick={onRefresh} disabled={busy}>Refresh</button>
      </div>
      <p className="suggestion-hint">Pick one option. The main preview above updates after selection.</p>
      {stockSearchQuery ? (
        <p className="suggestion-query">
          Query: <code>{stockSearchQuery}</code>
        </p>
      ) : null}
      <div className="suggestions-grid">
        {suggestions.map((item) => (
          <article
            key={item.id}
            className={`suggestion-card ${selectedId === String(item.id) ? "selected" : ""}`}
          >
            <a className="suggestion-preview-link" href={toAbsoluteUrl(item.previewUrl)} target="_blank" rel="noreferrer">
              <img src={toAbsoluteUrl(item.thumbnail)} alt={`Suggestion ${item.id}`} />
            </a>
            <div className="suggestion-meta">
              <span>{Math.round(Number(item.duration || 0))}s</span>
              <a href={item.pexelsUrl} target="_blank" rel="noreferrer">Source</a>
            </div>
            <button onClick={() => onChoose(item.id)} disabled={busy || selectedId === String(item.id)}>
              {selectedId === String(item.id) ? "Selected" : "Use this"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
