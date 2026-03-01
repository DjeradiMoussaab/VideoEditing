import { useCallback } from "react";
import { EditorPage } from "../features/workflow/pages/EditorPage";
import { SetupPage } from "../features/workflow/pages/SetupPage";
import { useProjectWorkflow } from "../features/workflow/hooks/use-project-workflow";
import { StatusPill } from "../shared/StatusPill";

export function App() {
  const workflow = useProjectWorkflow();

  const submit = useCallback(
    async (payload) => {
      await workflow.generateScenes(payload);
    },
    [workflow]
  );

  const selectedScene = workflow.selectedScene;

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
      {workflow.currentPage === "setup" ? (
        <SetupPage
          status={workflow.status}
          progress={workflow.progress}
          onSubmit={submit}
          onError={workflow.fail}
        />
      ) : (
        <EditorPage
          project={workflow.project}
          scenes={workflow.scenes}
          selectedScene={selectedScene}
          selectedSceneId={workflow.selectedSceneId}
          busySceneId={workflow.busySceneId}
          status={workflow.status}
          progress={workflow.progress}
          hasFinalVideo={workflow.hasFinalVideo}
          finalNeedsRegeneration={workflow.finalNeedsRegeneration}
          onSelectScene={workflow.setSelectedSceneId}
          onTypeChange={(type) => {
            if (!selectedScene) return;
            workflow.changeSceneType(selectedScene.scene_id, type).catch(workflow.fail);
          }}
          onImageReplace={(file) => {
            if (!selectedScene) return;
            workflow.replaceSceneImage(selectedScene.scene_id, file).catch(workflow.fail);
          }}
          onVideoReplace={(file) => {
            if (!selectedScene) return;
            workflow.replaceSceneVideo(selectedScene.scene_id, file).catch(workflow.fail);
          }}
          onRefreshSuggestions={() => {
            if (!selectedScene) return;
            workflow.refreshSuggestions(selectedScene.scene_id).catch(workflow.fail);
          }}
          onChooseSuggestion={(suggestionId) =>
            selectedScene
              ? workflow.chooseSuggestion(selectedScene.scene_id, suggestionId).catch(workflow.fail)
              : null
          }
          onImageAnimationStyleChange={(styleId) => {
            if (!selectedScene) return;
            workflow.changeSceneImageAnimationStyle(selectedScene.scene_id, styleId).catch(workflow.fail);
          }}
          onGenerateFinal={() => workflow.generateFinalVideo().catch(workflow.fail)}
        />
      )}
    </main>
  );
}
