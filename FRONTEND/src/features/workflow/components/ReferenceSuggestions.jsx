import { toAbsoluteUrl } from "../../../services/api-client";
import { detectSceneMediaType } from './scene-media.mjs';
import { useEffect, useRef, useState } from 'react';

export function ReferenceSuggestions({ scene, busy, onUseReferenceImage, onAddSuggestionMedia }) {
  const uploadInput = useRef(null);
  const uploadingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [mediaFilter,setMediaFilter]=useState('image');
  useEffect(() => {
    const selected = scene?.referenceMatches?.find(item => item.url === scene.assetUrl);
    setMediaFilter(selected?.type === 'video' || scene?.type === 'video' ? 'video' : 'image');
  }, [scene?.scene_id, scene?.assetUrl, scene?.type]);
  const referenceSuggestions = [...(scene?.referenceMatches || [])]
    .filter(match=>mediaFilter==='video'?match.type==='video':match.type!=='video')
    .sort((a, b) => Number(b.source === 'upload') - Number(a.source === 'upload') || Number(b.score || 0) - Number(a.score || 0));

  async function addMedia(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || uploadingRef.current) return;
    setUploadError('');
    const type = detectSceneMediaType(file);
    if (!type) { setUploadError('Choose an image or video file.'); return; }
    if (file.size > 200 * 1024 * 1024) { setUploadError('Choose a file smaller than 200 MB.'); return; }
    uploadingRef.current = true;
    setUploading(true);
    try {
      await onAddSuggestionMedia(file);
      setMediaFilter(type);
    } catch (error) {
      setUploadError(error.message || 'Upload failed. Please try again.');
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  return (
    <section className="reference-suggestions" aria-label="Reference image and clip suggestions">
      <header className="reference-suggestions-header">
        <h4>Suggestions</h4>
        <div className="reference-suggestion-actions">
        <div className="reference-media-filters" role="group" aria-label="Suggestion media type">
          <button type="button" aria-pressed={mediaFilter==='image'} onClick={()=>setMediaFilter('image')}>Images</button>
          <button type="button" aria-pressed={mediaFilter==='video'} onClick={()=>setMediaFilter('video')}>Clips</button>
        </div>
        <button type="button" className="reference-add-button" disabled={busy || uploading}
          aria-label="Add an image or clip to suggestions" onClick={() => uploadInput.current?.click()}>
          {uploading ? 'Adding…' : 'ADD'}
        </button>
        <input ref={uploadInput} type="file" hidden accept="image/*,video/*,.mkv,.m4v,.avi"
          aria-label="Upload an image or clip to suggestions" disabled={busy || uploading} onChange={addMedia} />
        </div>
      </header>
      <div className="reference-suggestions-body" aria-busy={uploading}>
        {uploadError && <p className="scene-upload-error" role="alert">{uploadError}</p>}
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
