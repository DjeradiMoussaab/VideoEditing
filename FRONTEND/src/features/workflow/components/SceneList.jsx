import { useEffect, useRef } from "react";
import { SceneThumbnail } from "./SceneThumbnail";
export function SceneList({ scenes, selectedSceneId, onSelect }) {
  const listRef = useRef(null);
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector("button.active");
    if (!selected) return;
    const box = selected.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (box.top < viewport.top) list.scrollTop += box.top - viewport.top;
    else if (box.bottom > viewport.bottom) list.scrollTop += box.bottom - viewport.bottom;
  }, [selectedSceneId]);
  const fmt = (value) => {
    const sec = Math.max(0, Math.round(Number(value || 0)));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <aside id="scene-list" className="panel scene-list">
      <h3>Scenes</h3>
      <ul ref={listRef}>
        {scenes.map((scene) => {

          return (
          <li key={scene.scene_id}>
            <button
              className={[
                scene.type === "image"
                  ? "scene-card--image"
                  : scene.type === "quote"
                    ? "scene-card--quote"
                    : "scene-card--video",
                Number(selectedSceneId) === Number(scene.scene_id) ? "active" : ""
              ].join(" ").trim()}
              aria-pressed={Number(selectedSceneId) === Number(scene.scene_id)}
              onClick={() => onSelect(scene.scene_id)}
            >
              <div className="scene-thumb">
                <SceneThumbnail scene={scene} />
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
