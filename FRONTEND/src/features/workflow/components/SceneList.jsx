import { toAbsoluteUrl } from "../../../services/api-client";

function findSelectedSuggestion(scene) {
  const suggestions = scene.stockSuggestions || [];
  if (!suggestions.length) return null;
  if (!scene.selectedSuggestionId) return suggestions[0] || null;
  return (
    suggestions.find((item) => String(item.id) === String(scene.selectedSuggestionId)) ||
    suggestions[0] ||
    null
  );
}

export function SceneList({ scenes, selectedSceneId, onSelect }) {
  const fmt = (value) => {
    const sec = Math.max(0, Math.round(Number(value || 0)));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <aside className="panel scene-list">
      <h3>Scenes</h3>
      <ul>
        {scenes.map((scene) => {
          const selectedSuggestion = findSelectedSuggestion(scene);
          const imageThumb = scene.type === "image" ? toAbsoluteUrl(scene.assetUrl) : null;
          const videoThumb = scene.type === "video" ? toAbsoluteUrl(selectedSuggestion?.thumbnail) : null;
          const videoAsset = scene.type === "video" || scene.type === "quote" ? toAbsoluteUrl(scene.assetUrl) : null;

          return (
          <li key={scene.scene_id}>
            <button
              className={Number(selectedSceneId) === Number(scene.scene_id) ? "active" : ""}
              onClick={() => onSelect(scene.scene_id)}
            >
              <div className="scene-thumb">
                {imageThumb ? (
                  <img src={imageThumb} alt={`Scene ${scene.scene_id}`} />
                ) : videoThumb ? (
                  <img src={videoThumb} alt={`Scene ${scene.scene_id}`} />
                ) : videoAsset ? (
                  <video src={videoAsset} muted playsInline preload="metadata" />
                ) : (
                  <div className="scene-thumb-empty">No preview</div>
                )}
              </div>
              <div className="scene-meta">
                <span className="scene-title">Scene {scene.scene_id}</span>
                <small className="scene-time">
                  {fmt(scene.start_sec)} - {fmt(scene.end_sec)} ({fmt(scene.duration_sec)})
                </small>
                <small>
                  {scene.type === "video" ? "Stock video" : scene.type === "quote" ? "Quote" : "Image"}
                </small>
              </div>
            </button>
          </li>
        )})}
      </ul>
    </aside>
  );
}
