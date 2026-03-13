import { useEffect, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";
import { VideoSuggestions } from "./VideoSuggestions";

function sortAnimationStyles(styles = []) {
  return [...styles].sort((a, b) => {
    const aEst = Number(a?.estimatedM1SecPer1SecClip || 0);
    const bEst = Number(b?.estimatedM1SecPer1SecClip || 0);
    return aEst - bEst;
  });
}

export function SceneEditor({
  projectUpdatedAt,
  animationStyles,
  scene,
  busy,
  onTypeChange,
  onQuoteTextChange,
  onImageAnimationStyleChange,
  onImageReplace,
  onVideoReplace,
  onInsertVideoAfter,
  onRefreshSuggestions,
  onChooseSuggestion,
  onUseReferenceImage
}) {
  if (!scene) {
    return (
      <section className="panel scene-editor empty">
        <p>Select a scene to edit.</p>
      </section>
    );
  }

  const assetUrl = toAbsoluteUrl(scene.assetUrl, { v: projectUpdatedAt });
  const sortedAnimationStyles = sortAnimationStyles(animationStyles || []);
  const selectedStyleId = scene.imageAnimationStyle || sortedAnimationStyles?.[0]?.id || "";
  const sceneDurationSec = Number(scene?.duration_sec || 0);
  const tech = scene?.technical || null;
  const topMatches = Array.isArray(tech?.topMatches) ? tech.topMatches : [];
  const selectedMatchId = String(tech?.selectedMatch?.id || "");
  const stockSearchQuery = String(scene?.stockSearchQuery || "").trim();
  const hasCaptionDetails = Boolean(tech?.captionMatchingEnabled) && topMatches.length > 0;
  const showImageTechnicalDetails = scene.type === "image" && hasCaptionDetails;
  const showVideoTechnicalDetails = scene.type === "video" && (hasCaptionDetails || stockSearchQuery);
  const showTechnicalDetails = showImageTechnicalDetails || showVideoTechnicalDetails;
  const [quoteDraft, setQuoteDraft] = useState(String(scene?.quoteText || scene?.narration || ""));

  useEffect(() => {
    setQuoteDraft(String(scene?.quoteText || scene?.narration || ""));
  }, [scene?.scene_id, scene?.quoteText, scene?.narration]);

  return (
    <section className="panel scene-editor">
      <header className="scene-editor-header">
        <h3>Scene {scene.scene_id}</h3>
        <select value={scene.type} onChange={(e) => onTypeChange(e.target.value)} disabled={busy}>
          <option value="image">Image</option>
          <option value="video">Stock video</option>
          <option value="quote">Quote</option>
        </select>
      </header>

      {scene.type === "image" ? (
        <label className="replace-input file-input-wrap">
          Replace image
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageReplace(file);
            }}
          />
        </label>
      ) : null}

      <p className="narration">{scene.narration}</p>

      {scene.type === "quote" ? (
        <label className="replace-input quote-text-input">
          Quote text
          <textarea
            rows={4}
            value={quoteDraft}
            disabled={busy}
            onChange={(e) => setQuoteDraft(e.target.value)}
            onBlur={() => onQuoteTextChange(quoteDraft)}
            placeholder="Enter the text to show on quote scene"
          />
        </label>
      ) : null}

      <label className="replace-input file-input-wrap">
        Insert video after this scene
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/*"
          disabled={busy || !scene?.canInsertAfter}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onInsertVideoAfter(file);
          }}
        />
        {!scene?.canInsertAfter ? (
          <small>
            Not eligible: this scene does not end at a sentence boundary.
          </small>
        ) : null}
      </label>

      {showTechnicalDetails ? (
        <details className="technical-details">
          <summary>Technical details</summary>
          <div className="technical-grid">
            {hasCaptionDetails ? (
              <div><span>Caption cache size</span><strong>{Number(tech?.captionCacheCount || 0)}</strong></div>
            ) : null}
            {scene.type === "video" ? (
              <div>
                <span>Stock search query</span>
                <strong>{stockSearchQuery || "-"}</strong>
              </div>
            ) : null}
            <div className="technical-blocked">
              <span>Top 10 matches</span>
              {hasCaptionDetails ? (
                <ul className="match-vertical-list">
                  {topMatches.map((m) => {
                    const chosen = selectedMatchId && String(m.id) === selectedMatchId;
                    const thumbUrl = toAbsoluteUrl(m?.url, { v: projectUpdatedAt });
                    return (
                      <li key={m.id}>
                        <div className="match-scene-item">
                          <div className="scene-thumb">
                            {thumbUrl ? <img src={thumbUrl} alt={m.filename} /> : <div className="scene-thumb-empty">No preview</div>}
                          </div>
                          <div className="scene-meta match-scene-meta">
                            <div className="match-topline">
                              <span className="scene-title match-file">{m.filename}</span>
                              <span className={`match-decision ${chosen ? "chosen" : "not-chosen"}`}>
                                {chosen ? "chosen" : "not chosen"}
                              </span>
                              <button
                                type="button"
                                className="match-use-btn"
                                disabled={busy || chosen}
                                onClick={() => onUseReferenceImage(m.id)}
                              >
                                {chosen ? "USING" : "USE IMAGE"}
                              </button>
                            </div>
                            <small className="match-caption">{m.caption || "-"}</small>
                            <small className="match-reason">{m.reason || "-"}</small>
                            <strong className="match-score">{Number(m.score || 0).toFixed(3)}</strong>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <strong>-</strong>
              )}
            </div>
          </div>
        </details>
      ) : null}

      {scene.type === "image" ? (
        <section className="animation-style-section">
          <h4>Image animation style</h4>
          <div className="animation-style-row">
            {sortedAnimationStyles.map((style) => {
              const isActive = selectedStyleId === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  className={`animation-style-card ${isActive ? "active" : ""}`}
                  onClick={() => onImageAnimationStyleChange(style.id)}
                  disabled={busy}
                >
                  <div className="animation-thumb" data-style={style.id}>
                    <div className="animation-thumb-bg" />
                    <div className="animation-thumb-frame" />
                  </div>
                  <div className="animation-style-meta">
                    <strong>{style.label}</strong>
                    <span>
                      {Number(style.estimatedM1SecPer1SecClip || 0).toFixed(2)}s/s
                      {" · "}
                      this scene {Number((Number(style.estimatedM1SecPer1SecClip || 0) * sceneDurationSec).toFixed(2))}s
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="preview-area">
        {!assetUrl ? (
          <div className="preview-empty">No preview available yet for this scene.</div>
        ) : scene.type === "image" ? (
          <img src={assetUrl} alt={`Scene ${scene.scene_id}`} />
        ) : (
          <video controls src={assetUrl} />
        )}
      </div>

      {scene.type === "image" || scene.type === "quote" ? (
        null
      ) : (
        <>
          <label className="replace-input file-input-wrap">
            Replace video
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/*"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onVideoReplace(file);
              }}
            />
          </label>
          <VideoSuggestions
            scene={scene}
            busy={busy}
            onRefresh={onRefreshSuggestions}
            onChoose={onChooseSuggestion}
          />
        </>
      )}
    </section>
  );
}
