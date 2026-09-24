import { useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";

export function SceneThumbnail({ scene, version }) {
  const url = toAbsoluteUrl(scene.assetUrl, { v: version });
  return <ThumbnailMedia key={`${url}:${scene.type}`} scene={scene} url={url} />;
}

function ThumbnailMedia({ scene, url }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const isImage = scene.type === "image" || /\.(png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(url || "");
  return (
    <span className={`scene-thumbnail-media ${scene.type === "quote" ? "is-quote" : ""}`}>
      {url && !failed && (isImage
        ? <img src={url} alt="" onLoad={() => setReady(true)} onError={() => setFailed(true)} />
        : <video src={url} muted playsInline preload="auto" onError={() => setFailed(true)}
            onLoadedMetadata={event => {
              const video = event.currentTarget;
              if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
            }} onLoadedData={() => setReady(true)} />)}
      {(!url || failed || !ready) && <span className="thumbnail-status">{failed ? "Preview unavailable" : url ? "Loading…" : "No media"}</span>}
      {scene.type === "quote" && <span className="thumbnail-quote">“{scene.quoteText || scene.narration || ""}”{scene.quoteAuthor && <small>{scene.quoteAuthor}</small>}</span>}
    </span>
  );
}
