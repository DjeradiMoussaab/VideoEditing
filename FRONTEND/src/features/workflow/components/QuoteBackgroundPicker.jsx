import { useEffect, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";

export function QuoteBackgroundPicker({ scene, busy, onRefreshSuggestions, onChooseSuggestion }) {
  const suggestions = (scene.stockSuggestions || []).slice(0, 24);
  const selectedId = scene.selectedSuggestionId ? String(scene.selectedSuggestionId) : null;
  const stockSearchQuery = String(scene?.stockSearchQuery || "").trim();
  const [customQuery, setCustomQuery] = useState(stockSearchQuery);

  useEffect(() => {
    setCustomQuery(stockSearchQuery);
  }, [scene?.scene_id, stockSearchQuery]);

  return (
    <details className="quote-background-suggestions">
      <summary>Browse stock footage <span className="reference-count">{suggestions.length} / 24</span></summary>
      <div className="quote-background-suggestions-body">
        <div className="inline-actions">
          <label className="custom-query-input">
            Custom stock query
            <input
              type="text"
              value={customQuery}
              placeholder="e.g. rainy city window"
              onChange={(e) => setCustomQuery(e.target.value)}
              disabled={busy}
            />
          </label>
          <button type="button" onClick={() => onRefreshSuggestions(customQuery)} disabled={busy}>Refresh</button>
        </div>
        {stockSearchQuery ? <p className="suggestion-query">Query: <code>{stockSearchQuery}</code></p> : null}
        <p className="suggestion-hint">The first result is the best match for this scene — pick any option below.</p>
        <div className="suggestions-grid">
          {suggestions.map((item, index) => (
            <article key={item.id} className={`suggestion-card ${selectedId === String(item.id) ? "selected" : ""}`}>
              {index === 0 && <span className="suggestion-recommended">Recommended</span>}
              <a className="suggestion-preview-link" href={toAbsoluteUrl(item.previewUrl)} target="_blank" rel="noreferrer">
                <img src={toAbsoluteUrl(item.thumbnail)} alt={`Suggestion ${item.id}`} />
              </a>
              <div className="suggestion-meta">
                <span>{Math.round(Number(item.duration || 0))}s</span>
                <a href={item.pexelsUrl} target="_blank" rel="noreferrer">Source</a>
              </div>
              <button type="button" onClick={() => onChooseSuggestion(item.id)} disabled={busy || selectedId === String(item.id)}>
                {selectedId === String(item.id) ? "Selected" : "Use this"}
              </button>
            </article>
          ))}
        </div>
        {!suggestions.length && <p className="reference-empty">No suggestions yet. Refresh to fetch stock options.</p>}
      </div>
    </details>
  );
}
