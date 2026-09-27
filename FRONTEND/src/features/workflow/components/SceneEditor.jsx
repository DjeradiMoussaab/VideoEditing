import { RenderedScenePreview } from "./RenderedScenePreview";
import { AnimationPreview } from "./AnimationPreview";
import { QuoteEditor } from "./QuoteEditor";
import { ReferenceSuggestions } from "./ReferenceSuggestions";
import { useEffect, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";
import { detectSceneMediaType } from "./scene-media.mjs";
import { VideoSuggestions } from "./VideoSuggestions";

function sortAnimationStyles(styles = []) {
  return [...styles];
}

export function SceneEditor({
  projectId,
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

      {scene.selectionReason && <p className="scene-selection-reason">{scene.selectionReason}</p>}
      {scene.editorialNotes?.map(note => <p key={note} className="form-hint">{note}</p>)}

      {scene.type === "quote" ? <QuoteEditor
        key={scene.scene_id}
        projectId={projectId}
        projectUpdatedAt={projectUpdatedAt}
        scene={scene}
        busy={busy}
        onSave={onQuoteDesignChange}
        onRefreshSuggestions={onRefreshSuggestions}
        onChooseSuggestion={onChooseSuggestion}
        onUseReferenceImage={onUseReferenceImage}
      /> : <>
      {scene.type === "image" ? (
        <section className="animation-style-section">
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
                  <AnimationPreview key={`${style.id}:${assetUrl}`} styleId={style.id} assetUrl={assetUrl} />
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

      <ReferenceSuggestions scene={scene} projectUpdatedAt={projectUpdatedAt} busy={busy} onUseReferenceImage={onUseReferenceImage} />

      </div>
      <div className={`preview-area ${scene.type === "image" ? "preview-area--animated" : ""}`}>
        {!assetUrl ? (
          <div className="preview-empty">No preview available yet for this scene.</div>
        ) : scene.type === "image" ? (
          <RenderedScenePreview projectId={projectId} scene={scene} disabled={busy}>
            <img src={assetUrl} alt={`Scene ${scene.scene_id}`} />
          </RenderedScenePreview>
        ) : (
          <video key={`${assetUrl}:${scene.mediaOffsetSec || 0}`} controls muted={scene.source === "reference_clip"} playsInline src={assetUrl} onLoadedMetadata={event => {
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
