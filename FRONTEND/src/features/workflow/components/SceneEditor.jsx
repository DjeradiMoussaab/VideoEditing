import { toAbsoluteUrl } from "../../../services/api-client";
import { VideoSuggestions } from "./VideoSuggestions";

export function SceneEditor({
  projectUpdatedAt,
  scene,
  busy,
  onTypeChange,
  onImageReplace,
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

  return (
    <section className="panel scene-editor">
      <header className="scene-editor-header">
        <h3>Scene {scene.scene_id}</h3>
        <select value={scene.type} onChange={(e) => onTypeChange(e.target.value)} disabled={busy}>
          <option value="image">Image</option>
          <option value="video">Stock video</option>
        </select>
      </header>

      <p className="narration">{scene.narration}</p>

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
      ) : (
        <VideoSuggestions
          scene={scene}
          busy={busy}
          onRefresh={onRefreshSuggestions}
          onChoose={onChooseSuggestion}
        />
      )}
    </section>
  );
}
