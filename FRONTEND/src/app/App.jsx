import { useCallback } from "react";
import { UploadForm } from "../features/workflow/components/UploadForm";
import { SceneEditor } from "../features/workflow/components/SceneEditor";
import { SceneList } from "../features/workflow/components/SceneList";
import { FinalVideoPanel } from "../features/workflow/components/FinalVideoPanel";
import { ProgressPanel } from "../features/workflow/components/ProgressPanel";
import { useProjectWorkflow } from "../features/workflow/hooks/use-project-workflow";
import { StatusPill } from "../shared/StatusPill";

export function App() {
  const workflow = useProjectWorkflow();

  const submit = useCallback(
    async (payload) => {
      try {
        await workflow.generateScenes(payload);
      } catch (error) {
        workflow.fail(error);
      }
    },
    [workflow]
  );

  const selectedScene = workflow.selectedScene;
  const isSceneBusy = Number(workflow.busySceneId) === Number(selectedScene?.scene_id);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Video Pipeline Studio</h1>
          <p>Draft scenes, edit quickly, and generate final video.</p>
        </div>
        <StatusPill status={workflow.status} />
      </header>

      {workflow.message ? <p className="error-banner">{workflow.message}</p> : null}
      <ProgressPanel progress={workflow.progress} />

      <section className="grid-main">
        <UploadForm onSubmit={submit} disabled={workflow.status === "draft_running" || workflow.status === "final_running"} />

        <div className="editor-layout">
          <SceneList
            scenes={workflow.scenes}
            selectedSceneId={workflow.selectedSceneId}
            onSelect={workflow.setSelectedSceneId}
          />
          <SceneEditor
            projectUpdatedAt={workflow.project?.updatedAt}
            scene={selectedScene}
            busy={isSceneBusy}
            onTypeChange={(type) => workflow.changeSceneType(selectedScene.scene_id, type).catch(workflow.fail)}
            onImageReplace={(file) => workflow.replaceSceneImage(selectedScene.scene_id, file).catch(workflow.fail)}
            onRefreshSuggestions={() => workflow.refreshSuggestions(selectedScene.scene_id).catch(workflow.fail)}
            onChooseSuggestion={(suggestionId) =>
              workflow.chooseSuggestion(selectedScene.scene_id, suggestionId).catch(workflow.fail)
            }
          />
        </div>
      </section>

      <FinalVideoPanel
        project={workflow.project}
        onGenerate={() => workflow.generateFinalVideo().catch(workflow.fail)}
        disabled={!workflow.project || workflow.status === "final_running"}
      />
    </main>
  );
}
