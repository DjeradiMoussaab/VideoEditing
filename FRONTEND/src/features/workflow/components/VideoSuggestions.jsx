import { toAbsoluteUrl } from "../../../services/api-client";

export function VideoSuggestions({ scene, onRefresh, onChoose, busy }) {
  const suggestions = scene.stockSuggestions || [];

  return (
    <section>
      <div className="inline-actions">
        <h4>Stock suggestions</h4>
        <button onClick={onRefresh} disabled={busy}>Refresh</button>
      </div>
      <div className="suggestions-grid">
        {suggestions.map((item) => (
          <article key={item.id} className="suggestion-card">
            <video controls preload="metadata" src={toAbsoluteUrl(item.previewUrl)} />
            <button onClick={() => onChoose(item.id)} disabled={busy}>Use this video</button>
          </article>
        ))}
      </div>
    </section>
  );
}
