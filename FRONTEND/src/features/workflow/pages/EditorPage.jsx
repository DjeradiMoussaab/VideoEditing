import { TransitionEditor } from '../components/TransitionEditor';
import { boundaryTransition } from '../../../../../SHARED/transitions.mjs';
import { useEffect, useState } from "react";
import { SceneList } from "../components/SceneList";
import { SceneEditor } from "../components/SceneEditor";
import { FinalVideoPanel } from "../components/FinalVideoPanel";
import { SceneTimeline } from "../components/SceneTimeline";
import { ProjectTitle } from '../components/ProjectTitle';

export function EditorPage({
  project,
  onRenameProject,
  controlBusy,
  onProcessingControl,
  onUploadVoiceover,
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
  onQuoteDesignChange,
  onAddSuggestionMedia,
  onImageReplace,
  onVideoReplace,
  onRefreshSuggestions,
  onChooseSuggestion,
  onUseReferenceImage,
  onImageAnimationStyleChange,
  onSceneBoundaryChange,
  onTransitionChange,
  onSplitScene,
  onDeleteScene,
  onGenerateFinal,
  onGoHome
}) {
  const [showScenes, setShowScenes] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState(null);
  const [timelineScenes, setTimelineScenes] = useState(scenes);
  const topology = scenes.map(scene => scene.scene_id).join(',');
  useEffect(() => { setSelectedTransition(null); }, [project?.id, topology]);
  const transitionIndex = timelineScenes.findIndex(scene => scene.scene_id === selectedTransition);
  const transition = boundaryTransition(timelineScenes, transitionIndex);
  const selectScene = id => { setSelectedTransition(null); onSelectScene(id); };
  const processing = /_(RUNNING|PAUSED|STOPPING)$/.test(project?.status || "");
  const isSceneBusy = busySceneId !== null || processing || controlBusy;
  const incompleteDraft = project?.status?.startsWith("DRAFT_") && project.status !== "DRAFT_READY";
  const totalClips = scenes.length;
  const imageScenes = scenes.filter((scene) => scene.type === "image").length;
  const videoScenes = scenes.filter((scene) => scene.type === "video").length;
  const quoteScenes = scenes.filter((scene) => scene.type === "quote").length;

  return (
    <section className="editor-page">
      <nav className="editor-navigation" aria-label="Editor navigation">
        <button type="button" className="editor-home-button" onClick={onGoHome}
          disabled={busySceneId !== null || controlBusy}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18" /></svg>
          Back to home
        </button>
      </nav>
      <ProjectTitle project={project} onRename={onRenameProject}/>
      {!scenes.length && <section className="panel"><h3>Preparing your scenes</h3><p>Scenes will appear here when the scene plan is ready. You can leave this page and reopen the project from History.</p></section>}
      {project?.referenceClips?.length > 0 && <details className="panel editor-summary">
        <summary><span>Reference clips</span><span>{project.referenceClips.filter(clip => clip.status === 'ready').length}/{project.referenceClips.length} analysed</span></summary>
        <ul className="pending-files-list">{project.referenceClips.map(clip => <li key={clip.id}>
          <span>{clip.filename}{clip.duration ? ` · ${clip.duration.toFixed(1)}s` : ''}</span>
          <span title={clip.error || ''}>{clip.status === 'ready' ? 'Ready' : clip.status === 'failed' ? `Analysis failed: ${clip.error || 'Regenerate the draft to retry.'}` : 'Not analysed'}</span>
        </li>)}</ul>
      </details>}
      <SceneTimeline
        key={project?.id}
        audioUrl={project?.voiceoverUrl}
        showScenes={showScenes}
        onToggleScenes={() => setShowScenes(value => !value)}
        scenes={scenes}
        selectedSceneId={selectedTransition === null ? selectedSceneId : null}
        onSelectScene={selectScene}
        onBoundaryChange={onSceneBoundaryChange}
        onTransitionChange={onTransitionChange}
        selectedTransition={selectedTransition}
        onSelectTransition={setSelectedTransition}
        onDraftScenesChange={setTimelineScenes}
        onSplitScene={onSplitScene}
        onDeleteScene={onDeleteScene}
        editDisabled={isSceneBusy || incompleteDraft}
      />

      <div className={`editor-layout ${showScenes ? "" : "editor-layout--expanded"}`}>
        {showScenes && <SceneList scenes={scenes} selectedSceneId={selectedTransition === null ? selectedSceneId : null} onSelect={selectScene} />}
        {transition && selectedTransition !== null ? <TransitionEditor
          key={`${project?.id}-${selectedTransition}`}
          leftScene={timelineScenes[transitionIndex]}
          rightScene={timelineScenes[transitionIndex + 1]}
          transition={transition}
          busy={isSceneBusy || incompleteDraft}
          onChange={value => onTransitionChange(selectedTransition, value)}
          onClose={() => selectScene(selectedTransition)}
        /> : <SceneEditor
          projectId={project?.id}
          projectUpdatedAt={project?.updatedAt}
          animationStyles={project?.capabilities?.imageAnimationStyles || []}
          scene={selectedScene}
          busy={isSceneBusy || incompleteDraft}
          onTypeChange={onTypeChange}
          onQuoteTextChange={onQuoteTextChange}
          onQuoteDesignChange={onQuoteDesignChange}
          onImageAnimationStyleChange={onImageAnimationStyleChange}
          onAddSuggestionMedia={onAddSuggestionMedia}
          onImageReplace={onImageReplace}
          onVideoReplace={onVideoReplace}
          onRefreshSuggestions={onRefreshSuggestions}
          onChooseSuggestion={onChooseSuggestion}
          onUseReferenceImage={onUseReferenceImage}
        />}
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
        onRenameProject={onRenameProject}
        project={project}
        onGenerate={onGenerateFinal}
        onProcessingControl={onProcessingControl}
        onUploadVoiceover={onUploadVoiceover}
        controlBusy={controlBusy || busySceneId !== null}
        disabled={!project || !scenes.length || isSceneBusy || incompleteDraft}
        status={status}
        progress={progress}
        hasFinalVideo={hasFinalVideo}
        needsRegeneration={finalNeedsRegeneration}
      />
    </section>
  );
}
