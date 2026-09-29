import { toAbsoluteUrl } from "../../../services/api-client";

export function ReferenceSuggestions({ scene, busy, onUseReferenceImage }) {
  const referenceSuggestions = [...(scene?.referenceMatches || [])]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  return (
    <section className="reference-suggestions" aria-label="Reference image and clip suggestions">
      <div className="reference-suggestions-body">
        {referenceSuggestions.length ? (
          <div className="reference-grid-scroll">
            <div className="reference-grid">
              {referenceSuggestions.map((match, index) => {
                const chosen = scene.assetUrl === match.url;
                const isClip = match.type === 'video';
                const unavailable = isClip && (match.status === 'failed' || match.status === 'pending');
                const score = Number.isFinite(Number(match.score)) ? Number(match.score).toFixed(2) : "—";
                return (
                  <button
                    key={match.id}
                    type="button"
                    className={`reference-card ${chosen ? "selected" : ""}`}
                    disabled={busy || chosen || unavailable}
                    aria-pressed={chosen}
                    aria-label={`${chosen ? "Selected" : "Use"} ${match.filename}, relevance score ${score}`}
                    title={`${match.filename} · Relevance ${score}${isClip ? " · Loops to fill the scene" : ""}${match.error ? ` · ${match.error}` : ""}${match.reason ? ` · ${match.reason}` : ""}`}
                    onClick={() => onUseReferenceImage(match.id)}
                  >
                    <span className="reference-image">
                      {isClip ? (match.thumbnailUrl
                        ? <img src={toAbsoluteUrl(match.thumbnailUrl)} alt={match.filename} loading="lazy" />
                        : <span>Video clip</span>)
                        : <img src={toAbsoluteUrl(match.url)} alt={match.filename} loading="lazy" />}
                      {isClip && <span className="reference-clip-badge">▶ {Number(match.duration || 0).toFixed(1)}s</span>}
                      <span className="reference-rank">{index + 1}</span>
                      {chosen && <span className="reference-selected-mark" aria-hidden="true">✓</span>}
                    </span>
                    <span className="reference-card-footer"><span>{chosen ? "Selected" : unavailable ? "Unavailable" : isClip ? "Use clip" : "Match"}</span><strong>{score}</strong></span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : <p className="reference-empty">No references yet. Add reference images or clips when creating a project to see suggestions here.</p>}
      </div>
    </section>
  );
}
