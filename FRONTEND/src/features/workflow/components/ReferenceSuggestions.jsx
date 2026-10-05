import { toAbsoluteUrl } from "../../../services/api-client";
import { useEffect, useState } from 'react';

export function ReferenceSuggestions({ scene, busy, onUseReferenceImage }) {
  const [mediaFilter,setMediaFilter]=useState('image');
  useEffect(() => {
    const selected = scene?.referenceMatches?.find(item => item.url === scene.assetUrl);
    setMediaFilter(selected?.type === 'video' || scene?.type === 'video' ? 'video' : 'image');
  }, [scene?.scene_id, scene?.assetUrl, scene?.type]);
  const referenceSuggestions = [...(scene?.referenceMatches || [])]
    .filter(match=>mediaFilter==='video'?match.type==='video':match.type!=='video')
    .sort((a, b) => Number(b.source === 'upload') - Number(a.source === 'upload') || Number(b.score || 0) - Number(a.score || 0));

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
                const uploaded = match.source === 'upload';
                const score = Number.isFinite(Number(match.score)) ? Number(match.score).toFixed(2) : "—";
                return (
                  <button
                    key={match.id}
                    type="button"
                    className={`reference-card ${chosen ? "selected" : ""}`}
                    disabled={busy || chosen || unavailable}
                    aria-pressed={chosen}
                    aria-label={`${chosen ? "Selected" : "Use"} ${match.filename}${uploaded ? ", uploaded media" : `, relevance score ${score}`}`}
                    title={`${match.filename} · ${uploaded ? "Uploaded" : `Relevance ${score}`}${isClip ? " · Loops to fill the scene" : ""}${match.error ? ` · ${match.error}` : ""}${match.reason ? ` · ${match.reason}` : ""}`}
                    onClick={() => onUseReferenceImage(match.id)}
                  >
                    <span className="reference-image">
                      {isClip ? (match.thumbnailUrl
                        ? <img src={toAbsoluteUrl(match.thumbnailUrl)} alt={match.filename} loading="lazy" />
                        : <video src={toAbsoluteUrl(match.url)} muted playsInline preload="metadata" onLoadedMetadata={event => { event.currentTarget.currentTime = Math.min(.1, event.currentTarget.duration / 2); }} />)
                        : <img src={toAbsoluteUrl(match.url)} alt={match.filename} loading="lazy" />}
                      {isClip && <span className="reference-clip-badge">▶ {match.duration ? `${Number(match.duration).toFixed(1)}s` : "Clip"}</span>}
                      <span className="reference-rank">{index + 1}</span>
                      {chosen && <span className="reference-selected-mark" aria-hidden="true">✓</span>}
                    </span>
                    <span className="reference-card-footer"><span>{chosen ? "Selected" : unavailable ? "Unavailable" : isClip ? "Use clip" : "Match"}</span><strong>{uploaded ? "Uploaded" : score}</strong></span>
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
