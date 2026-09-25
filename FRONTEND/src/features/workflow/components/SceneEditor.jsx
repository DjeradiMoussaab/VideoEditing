import { QuoteEditor } from "./QuoteEditor";
import { useEffect, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";
import { detectSceneMediaType } from "./scene-media.mjs";
import { VideoSuggestions } from "./VideoSuggestions";

function sortAnimationStyles(styles = []) {
  return [...styles];
}

export function SceneEditor({
  projectUpdatedAt,
  animationStyles,
  scene,
  busy,
  onTypeChange,
  onQuoteDesignChange,
  onImageAnimationStyleChange,
  onImageReplace,
  onVideoReplace,
  onRefreshSuggestions,
  onChooseSuggestion,
  onUseReferenceImage
}) {
  const assetUrl = toAbsoluteUrl(scene?.assetUrl, { v: projectUpdatedAt });
  const sortedAnimationStyles = sortAnimationStyles(animationStyles || []);
  const selectedStyleId = scene?.imageAnimationStyle || sortedAnimationStyles?.[0]?.id || "";
  const referenceSuggestions = [...(scene?.referenceMatches || [])]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    setUploadError("");
  }, [scene?.scene_id, scene?.quoteText, scene?.narration, scene?.quoteAuthor]);

  if (!scene) {
    return (
      <section className="panel scene-editor empty">
        <p>Select a scene to edit.</p>
      </section>
    );
  }


  return (
    <section className="panel scene-editor">
      <header className="scene-editor-header">
        <h3>Scene {scene.scene_id}</h3>
        <div className="scene-media-controls">
          <select aria-label="Scene type" value={scene.type} onChange={(e) => onTypeChange(e.target.value)} disabled={busy}>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="quote">Quote</option>
          </select>
          {scene.type !== "quote" && (
            <label className={`scene-replace-control ${busy ? "disabled" : ""}`}>
              <span aria-hidden="true">↥</span> Replace
              <input
                type="file"
                aria-label="Replace scene with an image or video"
                accept="image/*,video/*,.mkv,.m4v,.avi"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  const type = detectSceneMediaType(file);
                  if (!type) {
                    setUploadError("Choose an image or video file.");
                    return;
                  }
                  setUploadError("");
                  if (type === "video") onVideoReplace(file);
                  else onImageReplace(file);
                }}
              />
            </label>
          )}
        </div>
        {uploadError && scene.type !== "quote" && <p className="scene-upload-error" role="alert">{uploadError}</p>}
      </header>

      {scene.type === "quote" ? <QuoteEditor key={scene.scene_id} scene={scene} busy={busy} onSave={onQuoteDesignChange} /> : <>
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
                  title={`${style.label}: ${style.description || "Smooth storytelling motion."}`}
                  aria-pressed={isActive}
                  onClick={() => onImageAnimationStyleChange(style.id)}
                  disabled={busy}
                >
                  <div className="animation-thumb" data-style={style.id}>
                    <div className="animation-thumb-bg" style={assetUrl ? { backgroundImage: `url("${assetUrl}")` } : undefined} />
                    <div className="animation-thumb-frame">{assetUrl && <img src={assetUrl} alt="" loading="lazy" onLoad={event => {
                      const image = event.currentTarget;
                      image.closest('.animation-thumb').style.setProperty('--image-ratio', image.naturalWidth / image.naturalHeight);
                    }} />}</div>
                  </div>
                  <div className="animation-style-meta">
                    <strong>{style.label}</strong>
                    <span>{style.description || "Smooth storytelling motion."}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="form-note">60 fps final output · Hover over a style for a motion illustration. Final rendering uses the full-resolution image.</p>
        </section>
      ) : null}


      <div className="scene-editor-columns">
      <div className={`scene-editor-settings scene-editor-settings--${scene.type}`}>

      <section className="reference-suggestions" aria-label="Reference image suggestions">
        <header className="reference-suggestions-header">
          <span className="reference-suggestions-title">Suggestions <span className="reference-count">{referenceSuggestions.length}</span></span>
          <span className="reference-summary-note">Reference images · Best matches first</span>
        </header>
        <div className="reference-suggestions-body">
          <p className="reference-hint">Choose an image to use in this scene{scene.type !== "image" ? " and switch it to an image scene" : ""}.</p>
          {referenceSuggestions.length ? (
            <div className="reference-grid-scroll">
              <div className="reference-grid">
                {referenceSuggestions.map((match, index) => {
                  const chosen = scene.type === "image" && scene.assetUrl === match.url;
                  const score = Number.isFinite(Number(match.score)) ? Number(match.score).toFixed(2) : "—";
                  return (
                    <button
                      key={match.id}
                      type="button"
                      className={`reference-card ${chosen ? "selected" : ""}`}
                      disabled={busy || chosen}
                      aria-pressed={chosen}
                      aria-label={`${chosen ? "Selected" : "Use"} ${match.filename}, relevance score ${score}`}
                      title={`${match.filename} · Relevance ${score}`}
                      onClick={() => onUseReferenceImage(match.id)}
                    >
                      <span className="reference-image">
                        <img src={toAbsoluteUrl(match.url, { v: projectUpdatedAt })} alt={match.filename} loading="lazy" />
                        <span className="reference-rank">{index + 1}</span>
                        {chosen && <span className="reference-selected-mark" aria-hidden="true">✓</span>}
                      </span>
                      <span className="reference-card-footer"><span>{chosen ? "Selected" : "Match"}</span><strong>{score}</strong></span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : <p className="reference-empty">No reference images yet. Add reference images when creating a project to see suggestions here.</p>}
        </div>
      </section>


      </div>
      <div className="preview-area">
        {!assetUrl ? (
          <div className="preview-empty">No preview available yet for this scene.</div>
        ) : scene.type === "image" ? (
          <img src={assetUrl} alt={`Scene ${scene.scene_id}`} />
        ) : (
          <video key={`${assetUrl}:${scene.mediaOffsetSec || 0}`} controls src={assetUrl} onLoadedMetadata={event => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Number(scene.mediaOffsetSec || 0) % video.duration;
          }} />
        )}
      </div>

      </div>

      {scene.type === "image" || scene.type === "quote" ? (
        null
      ) : (
        <>
          <VideoSuggestions
            scene={scene}
            busy={busy}
            onRefresh={onRefreshSuggestions}
            onChoose={onChooseSuggestion}
          />
        </>
      )}
      </>}
    </section>
  );
}
