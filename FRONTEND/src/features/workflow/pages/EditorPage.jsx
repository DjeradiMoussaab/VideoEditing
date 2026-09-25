import { useState } from "react";
import { SceneList } from "../components/SceneList";
import { SceneEditor } from "../components/SceneEditor";
import { FinalVideoPanel } from "../components/FinalVideoPanel";
import { SceneTimeline } from "../components/SceneTimeline";

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
  onRefreshSuggestions,
  onChooseSuggestion,
  onUseReferenceImage,
  onImageAnimationStyleChange,
  onSceneBoundaryChange,
  onSplitScene,
  onGenerateFinal
}) {
  const [showScenes, setShowScenes] = useState(false);
  const isSceneBusy = busySceneId !== null || status === "final_running";
  const totalClips = scenes.length;
  const imageScenes = scenes.filter((scene) => scene.type === "image").length;
  const videoScenes = scenes.filter((scene) => scene.type === "video").length;
  const quoteScenes = scenes.filter((scene) => scene.type === "quote").length;

  return (
    <section className="editor-page">
      <SceneTimeline
        key={project?.id}
        audioUrl={project?.voiceoverUrl}
        projectUpdatedAt={project?.updatedAt}
        showScenes={showScenes}
        onToggleScenes={() => setShowScenes(value => !value)}
        scenes={scenes}
        selectedSceneId={selectedSceneId}
        onSelectScene={onSelectScene}
        onBoundaryChange={onSceneBoundaryChange}
        onSplitScene={onSplitScene}
        editDisabled={busySceneId !== null || status === "final_running"}
      />

      <div className={`editor-layout ${showScenes ? "" : "editor-layout--expanded"}`}>
        {showScenes && <SceneList projectUpdatedAt={project?.updatedAt} scenes={scenes} selectedSceneId={selectedSceneId} onSelect={onSelectScene} />}
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
          onRefreshSuggestions={onRefreshSuggestions}
          onChooseSuggestion={onChooseSuggestion}
          onUseReferenceImage={onUseReferenceImage}
        />
      </div>
      <details className="panel editor-summary">
        <summary><span>Scene Summary</span><span className="summary-total">{totalClips} scenes</span><span className="summary-chevron" aria-hidden="true">⌄</span></summary>
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
      </details>

      <FinalVideoPanel
        project={project}
        onGenerate={onGenerateFinal}
        disabled={!project || busySceneId !== null || status === "final_running"}
        status={status}
        progress={progress}
        hasFinalVideo={hasFinalVideo}
        needsRegeneration={finalNeedsRegeneration}
      />
    </section>
  );
}
