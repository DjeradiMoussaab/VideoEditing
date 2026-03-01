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
  onImageAnimationStyleChange,
  onImageReplace,
  onVideoReplace,
  onRefreshSuggestions,
  onChooseSuggestion
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

  return (
    <section className="panel scene-editor">
      <header className="scene-editor-header">
        <h3>Scene {scene.scene_id}</h3>
        <select value={scene.type} onChange={(e) => onTypeChange(e.target.value)} disabled={busy}>
          <option value="image">Image</option>
          <option value="video">Stock video</option>
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

      {scene.type === "image" ? (
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
