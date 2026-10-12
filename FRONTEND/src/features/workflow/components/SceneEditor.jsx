import {splitStyle} from '../../../../../SHARED/split-screens.mjs';
import {SplitCanvasEditor} from './SplitCanvasEditor';
import {SplitPreview} from './SplitPreview';
import { isTextScene } from '../../../../../SHARED/quote-styles.mjs';
import {MediaFrame} from './MediaFrame';
import { ClipPortionEditor } from './ClipPortionEditor';
import { RenderedScenePreview } from "./RenderedScenePreview";
import { AnimationPreview } from "./AnimationPreview";
import { QuoteEditor } from "./QuoteEditor";
import { ReferenceSuggestions } from "./ReferenceSuggestions";
import { useEffect, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";
import { detectSceneMediaType } from "./scene-media.mjs";
import { VideoSuggestions } from "./VideoSuggestions";

const ANIMATION_CATEGORIES = ['Simple', 'Split', 'Modern'];
const MODERN_ANIMATION_IDS = new Set(['documentary_echo', 'archive_stack', 'history_slideshow']);
const animationCategory = id => splitStyle(id) ? 'Split' : MODERN_ANIMATION_IDS.has(id) ? 'Modern' : 'Simple';

export function SceneEditor({
  projectId,
  projectUpdatedAt,
  animationStyles,
  scene,
  busy,
  onTypeChange,
  onQuoteDesignChange,
  onImageAnimationStyleChange,
  onAddSuggestionMedia,
  onSplitImagesChange,
  onSplitImageUpload,
  onImageReplace,
  onVideoReplace,
  onClipPortionChange,
  onMediaFramingChange,
  onRefreshSuggestions,
  onChooseSuggestion,
  onUseReferenceImage
}) {
  const assetUrl = toAbsoluteUrl(scene?.assetUrl, { v: projectUpdatedAt });
  const styles = animationStyles || [];
  const selectedStyleId = scene?.imageAnimationStyle || styles[0]?.id || "";
  const split = scene?.type==='image' ? splitStyle(selectedStyleId) : null;
  const [category, setCategory] = useState(() => animationCategory(selectedStyleId));
  const visibleStyles = styles.filter(style => animationCategory(style.id) === category);
  const [selectedSplitSlot,setSelectedSplitSlot]=useState(0);
  useEffect(()=>setSelectedSplitSlot(0),[projectId,scene?.scene_id,selectedStyleId]);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    setCategory(animationCategory(selectedStyleId));
  }, [projectId, scene?.scene_id, scene?.type, selectedStyleId]);

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


  const framePreview = (media) => <MediaFrame key={`${projectId}:${scene.scene_id}:${scene.assetUrl}`} scene={scene} updatedAt={projectUpdatedAt} busy={busy} onSave={onMediaFramingChange}>{media}</MediaFrame>;
  return (
    <section className="panel scene-editor">
      <header className="scene-editor-header">
        <h3>Scene {scene.scene_id}</h3>
        <div className="scene-media-controls">
          <select aria-label="Scene type" value={scene.type} onChange={(e) => onTypeChange(e.target.value)} disabled={busy}>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="quote">Quote</option>
            <option value="opener">Openers</option>
          </select>
          {!isTextScene(scene.type) && (
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
        {uploadError && !isTextScene(scene.type) && <p className="scene-upload-error" role="alert">{uploadError}</p>}
      </header>

      {isTextScene(scene.type) ? <QuoteEditor
        key={`${scene.scene_id}:${scene.type}`}
        projectId={projectId}
        scene={scene}
        busy={busy}
        onSave={onQuoteDesignChange}
        onRefreshSuggestions={onRefreshSuggestions}
        onChooseSuggestion={onChooseSuggestion}
        onAddSuggestionMedia={onAddSuggestionMedia}
        onUseReferenceImage={onUseReferenceImage}
      /> : <>
      {scene.type === "image" ? (
        <section className="animation-style-section">
          <div>
            <div className="reference-media-filters" role="group" aria-label="Image animation category">
              {ANIMATION_CATEGORIES.map(name => (
                <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>
              ))}
            </div>
          </div>
          {visibleStyles.length ? <div className={`animation-style-row ${category==='Split'?'animation-style-row--split':''}`}>
            {visibleStyles.map((style) => {
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
                  {splitStyle(style.id)?<SplitPreview styleId={style.id} images={scene.splitImages} assetUrl={assetUrl}/>:<AnimationPreview key={`${style.id}:${assetUrl}:${scene.duration_sec}`} styleId={style.id} assetUrl={assetUrl} durationSec={scene.duration_sec} />}
                  <div className="animation-style-meta">
                    <strong>{style.label}</strong>
                    <span>{style.description || "Smooth storytelling motion."}</span>
                  </div>
                </button>
              );
            })}
          </div> : <p className="reference-empty" role="status">No {category.toLowerCase()} animations yet.</p>}
          <p className="form-note">{category==='Split'?'60 fps final output · Select and frame each image directly in the preview.':'60 fps final output · Hover over a style for a motion illustration. Final rendering uses the full-resolution image.'}</p>
        </section>
      ) : null}


      <div className="scene-editor-columns">
      <div className={`scene-editor-settings scene-editor-settings--${scene.type}`}>

      <ReferenceSuggestions imagesOnly={!!split} onAddSuggestionMedia={split?file=>onSplitImageUpload(selectedSplitSlot,file):onAddSuggestionMedia} scene={split?{...scene,assetUrl:scene.splitImages?.[selectedSplitSlot]?.url||scene.assetUrl}:scene} busy={busy} onUseReferenceImage={split?matchId=>onSplitImagesChange({slot:selectedSplitSlot,matchId}):onUseReferenceImage} />

      </div>
      <div className={`preview-area ${scene.type === "image" ? "preview-area--animated" : "preview-area--clip"}`}>
        {split ? <SplitCanvasEditor key={`${projectId}:${scene.scene_id}:${selectedStyleId}`} projectId={projectId} scene={scene} assetUrl={assetUrl} busy={busy} onSave={onSplitImagesChange} selectedSlot={selectedSplitSlot} onSelectSlot={setSelectedSplitSlot}/> : !assetUrl ? (
          <div className="preview-empty">No preview available yet for this scene.</div>
        ) : scene.type === "image" ? (
          <RenderedScenePreview projectId={projectId} scene={scene} disabled={busy} draft={{unframed:true}} renderMedia={media=>framePreview(media)}>
            <img src={assetUrl} alt={`Scene ${scene.scene_id}`} />
          </RenderedScenePreview>
        ) : (
          <ClipPortionEditor key={`${projectId}:${scene.scene_id}:${scene.assetUrl}`} projectId={projectId} scene={scene}
            updatedAt={projectUpdatedAt} busy={busy} onSave={onClipPortionChange} renderPreview={framePreview} />
        )}
      </div>

      </div>

      {scene.type === "image" || isTextScene(scene.type) ? (
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
