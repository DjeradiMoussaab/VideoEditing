import { SceneList } from "../components/SceneList";
import { SceneEditor } from "../components/SceneEditor";
import { FinalVideoPanel } from "../components/FinalVideoPanel";

export function EditorPage({
  project,
  scenes,
  selectedScene,
  selectedSceneId,
  busySceneId,
  status,
  progress,
  hasFinalVideo,
  finalNeedsRegeneration,
  onSelectScene,
  onTypeChange,
  onQuoteTextChange,
  onImageReplace,
  onVideoReplace,
  onInsertVideoAfter,
  onRefreshSuggestions,
  onChooseSuggestion,
  onUseReferenceImage,
  onImageAnimationStyleChange,
  onGenerateFinal
}) {
  const isSceneBusy = Number(busySceneId) === Number(selectedScene?.scene_id);
  const totalClips = scenes.length;
  const imageScenes = scenes.filter((scene) => scene.type === "image").length;
  const videoScenes = scenes.filter((scene) => scene.type === "video").length;
  const quoteScenes = scenes.filter((scene) => scene.type === "quote").length;

  return (
    <section className="editor-page">
      <section className="panel editor-summary">
        <h3>Scene Summary</h3>
        <div className="summary-grid">
          <div className="summary-card">
            <span className="label">Total clips</span>
            <strong>{totalClips}</strong>
          </div>
          <div className="summary-card">
            <span className="label">Image clips</span>
            <strong>{imageScenes}</strong>
          </div>
          <div className="summary-card">
            <span className="label">Video clips</span>
            <strong>{videoScenes}</strong>
          </div>
          <div className="summary-card">
            <span className="label">Quote clips</span>
            <strong>{quoteScenes}</strong>
          </div>
        </div>
      </section>

      <div className="editor-layout">
        <SceneList scenes={scenes} selectedSceneId={selectedSceneId} onSelect={onSelectScene} />
        <SceneEditor
          projectUpdatedAt={project?.updatedAt}
          animationStyles={project?.capabilities?.imageAnimationStyles || []}
          scene={selectedScene}
          busy={isSceneBusy}
          onTypeChange={onTypeChange}
          onQuoteTextChange={onQuoteTextChange}
          onImageAnimationStyleChange={onImageAnimationStyleChange}
          onImageReplace={onImageReplace}
          onVideoReplace={onVideoReplace}
          onInsertVideoAfter={onInsertVideoAfter}
          onRefreshSuggestions={onRefreshSuggestions}
          onChooseSuggestion={onChooseSuggestion}
          onUseReferenceImage={onUseReferenceImage}
        />
      </div>
      <FinalVideoPanel
        project={project}
        onGenerate={onGenerateFinal}
        disabled={!project || status === "final_running"}
        status={status}
        progress={progress}
        hasFinalVideo={hasFinalVideo}
        needsRegeneration={finalNeedsRegeneration}
      />
    </section>
  );
}
