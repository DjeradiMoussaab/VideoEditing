import { sceneLabel } from "../utils/scene-label";

export function SceneList({ scenes, selectedSceneId, onSelect }) {
  return (
    <aside className="panel scene-list">
      <h3>Scenes</h3>
      <ul>
        {scenes.map((scene) => (
          <li key={scene.scene_id}>
            <button
              className={Number(selectedSceneId) === Number(scene.scene_id) ? "active" : ""}
              onClick={() => onSelect(scene.scene_id)}
            >
              <span>{sceneLabel(scene)}</span>
              <small>{scene.type === "video" ? "Stock video" : "Image"}</small>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
