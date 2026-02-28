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
  onImageReplace,
  onVideoReplace,
  onRefreshSuggestions,
  onChooseSuggestion,
  onGenerateFinal
}) {
  const isSceneBusy = Number(busySceneId) === Number(selectedScene?.scene_id);

  return (
    <section className="editor-page">
      <div className="editor-layout">
        <SceneList scenes={scenes} selectedSceneId={selectedSceneId} onSelect={onSelectScene} />
        <SceneEditor
          projectUpdatedAt={project?.updatedAt}
          scene={selectedScene}
          busy={isSceneBusy}
          onTypeChange={onTypeChange}
          onImageReplace={onImageReplace}
          onVideoReplace={onVideoReplace}
          onRefreshSuggestions={onRefreshSuggestions}
          onChooseSuggestion={onChooseSuggestion}
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
