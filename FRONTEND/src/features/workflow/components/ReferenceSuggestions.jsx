import { toAbsoluteUrl } from "../../../services/api-client";
import { useEffect, useState } from 'react';

export function ReferenceSuggestions({ scene, busy, onUseReferenceImage }) {
  const [mediaFilter,setMediaFilter]=useState('image');
  useEffect(()=>setMediaFilter('image'),[scene?.scene_id]);
  const referenceSuggestions = [...(scene?.referenceMatches || [])]
    .filter(match=>mediaFilter==='video'?match.type==='video':match.type!=='video')
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  return (
    <section className="reference-suggestions" aria-label="Reference image and clip suggestions">
      <header className="reference-suggestions-header">
        <h4>Suggestions</h4>
        <div className="reference-media-filters" role="group" aria-label="Suggestion media type">
          <button type="button" aria-pressed={mediaFilter==='image'} onClick={()=>setMediaFilter('image')}>Images</button>
          <button type="button" aria-pressed={mediaFilter==='video'} onClick={()=>setMediaFilter('video')}>Clips</button>
        </div>
      </header>
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
        ) : <p className="reference-empty">{mediaFilter==='image'?'No image suggestions for this scene.':'No clip suggestions for this scene.'}</p>}
      </div>
    </section>
  );
}
