import { useCallback, useEffect, useState } from "react";
import { EditorPage } from "../features/workflow/pages/EditorPage";
import { HistoryPage } from "../features/history/pages/HistoryPage";
import { SetupPage } from "../features/workflow/pages/SetupPage";
import { useProjectWorkflow } from "../features/workflow/hooks/use-project-workflow";
import { projectApi } from "../services/project-api";

function hasScoringSavings(stats) {
  if (!stats) return false;
  return [
    "scoringTokenBaseline",
    "scoringTokenActual",
    "scoringTokenSaved",
    "scoringInputTokenSaved",
    "scoringOutputTokenSaved",
    "scoringScenesScoped",
    "scoringFromCache",
    "scoringRescored"
  ].some((k) => stats[k] !== undefined && stats[k] !== null);
}

function fmtInt(v) {
  return Number(v || 0).toLocaleString();
}

export function App() {
  const workflow = useProjectWorkflow();
  const [developerMode, setDeveloperMode] = useState(false);
  const [activeView, setActiveView] = useState("studio");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("vp_theme");
    if (saved === "dark" || saved === "light") return saved;
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("vp_theme", theme);
  }, [theme]);

  const submit = useCallback(
    async (payload) => {
      await workflow.generateScenes(payload);
    },
    [workflow]
  );

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await projectApi.listHistory();
      setHistory(data.history || []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView !== "history") return;
    let active = true;
    let timer;
    async function poll() {
      try {
        const data = await projectApi.listHistory();
        if (active) setHistory(data.history || []);
      } catch { /* Keep the last history visible while reconnecting. */ }
      if (active) timer = setTimeout(poll, 2500);
    }
    timer = setTimeout(poll, 2500);
    return () => { active = false; clearTimeout(timer); };
  }, [activeView]);

  const openHistory = useCallback(() => {
    setActiveView("history");
    refreshHistory();
  }, [refreshHistory]);

  const openHistoryProject = useCallback(
    async (projectId) => {
      await workflow.openExistingProject(projectId);
      setActiveView("studio");
      setHistoryError("");
    },
    [workflow]
  );

  const selectedScene = workflow.selectedScene;
  const progressStats = workflow.progress?.stats || null;
  const showScoringSavings = developerMode && activeView === "studio" && hasScoringSavings(progressStats);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Video Pipeline Studio</h1>
          <p>Draft scenes, edit quickly, and generate final video.</p>
        </div>
        <div className="topbar-actions">
          <div className="view-switch">
            <button
              type="button"
              className={activeView === "studio" ? "active" : ""}
              onClick={() => setActiveView("studio")}
            >
              Studio
            </button>
            <button
              type="button"
              className={activeView === "history" ? "active" : ""}
              onClick={openHistory}
            >
              History
            </button>
          </div>
          <div className="display-controls">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            type="button"
            className="developer-toggle"
            role="switch"
            aria-checked={developerMode}
            aria-label="Developer mode"
            title={`Developer mode: ${developerMode ? "on" : "off"}`}
            onClick={() => setDeveloperMode((enabled) => !enabled)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />
            </svg>
            <span className="developer-switch-icon" aria-hidden="true" />
          </button>
          </div>
        </div>
      </header>

      {showScoringSavings ? (
        <details className="panel scoring-savings-panel">
          <summary>OpenAI scoring savings (estimated)</summary>
          <div className="scoring-savings-grid">
            <div><span>Scoped scenes</span><strong>{fmtInt(progressStats.scoringScenesScoped)}</strong></div>
            <div><span>From cache</span><strong>{fmtInt(progressStats.scoringFromCache)}</strong></div>
            <div><span>Rescored</span><strong>{fmtInt(progressStats.scoringRescored)}</strong></div>
            <div><span>Baseline tokens</span><strong>{fmtInt(progressStats.scoringTokenBaseline)}</strong></div>
            <div><span>Actual tokens</span><strong>{fmtInt(progressStats.scoringTokenActual)}</strong></div>
            <div><span>Saved tokens</span><strong>{fmtInt(progressStats.scoringTokenSaved)}</strong></div>
            <div><span>Saved input tokens</span><strong>{fmtInt(progressStats.scoringInputTokenSaved)}</strong></div>
            <div><span>Saved output tokens</span><strong>{fmtInt(progressStats.scoringOutputTokenSaved)}</strong></div>
          </div>
        </details>
      ) : null}

      {workflow.message ? <p className="error-banner">{workflow.message}</p> : null}
      {activeView === "history" ? (
        <HistoryPage
          onRenameProject={async(id,title)=>{const identity=await workflow.renameProject(id,title);setHistory(items=>items.map(item=>item.id===id?{...item,...identity}:item));return identity;}}
          history={history}
          loading={historyLoading}
          error={historyError}
          onRefresh={refreshHistory}
          onOpenProject={(projectId) => openHistoryProject(projectId).catch((error) => setHistoryError(error.message))}
          onDeleteProject={async (projectId) => {
            await projectApi.delete(projectId);
            if (workflow.project?.id === projectId) workflow.closeProject();
            setHistory((items) => items.filter((item) => item.id !== projectId));
          }}
        />
      ) : workflow.currentPage === "setup" ? (
        <SetupPage
          onRenameProject={workflow.renameProject}
          project={workflow.project}
          onContinue={workflow.continueScenePlan}
          status={workflow.status}
          progress={workflow.progress}
          onSubmit={submit}
          onError={workflow.fail}
        />
      ) : (
        <EditorPage
          onRenameProject={workflow.renameProject}
          controlBusy={workflow.controlBusy}
          onProcessingControl={workflow.controlProcessing}
          onUploadVoiceover={workflow.restoreVoiceover}
          onGoHome={workflow.closeProject}
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
          onQuoteDesignChange={(styleId, fields) => workflow.updateSceneQuoteDesign(selectedScene.scene_id, styleId, fields)}
          onQuoteTextChange={(quoteText, quoteAuthor) => {
            if (!selectedScene) return;
            workflow.updateSceneQuoteText(selectedScene.scene_id, quoteText, quoteAuthor).catch(workflow.fail);
          }}
          onAddSuggestionMedia={(file) => workflow.addSuggestionMedia(selectedScene.scene_id, file)}
          onImageReplace={(file) => {
            if (!selectedScene) return;
            workflow.replaceSceneImage(selectedScene.scene_id, file).catch(workflow.fail);
          }}
          onClipPortionChange={workflow.updateClipPortion}
          onMediaFramingChange={workflow.updateMediaFraming}
          onVideoReplace={(file) => {
            if (!selectedScene) return;
            workflow.replaceSceneVideo(selectedScene.scene_id, file).catch(workflow.fail);
          }}
          onRefreshSuggestions={(customQuery) => {
            if (!selectedScene) return;
            workflow.refreshSuggestions(selectedScene.scene_id, customQuery).catch(workflow.fail);
          }}
          onChooseSuggestion={(suggestionId) =>
            selectedScene
              ? workflow.chooseSuggestion(selectedScene.scene_id, suggestionId).catch(workflow.fail)
              : null
          }
          onUseReferenceImage={(matchId) =>
            selectedScene
              ? workflow.chooseReferenceMatch(selectedScene.scene_id, matchId).catch(workflow.fail)
              : null
          }
          onImageAnimationStyleChange={(styleId) => {
            if (!selectedScene) return;
            workflow.changeSceneImageAnimationStyle(selectedScene.scene_id, styleId).catch(workflow.fail);
          }}
          onSplitScene={workflow.splitScene}
          onDeleteScene={workflow.deleteScene}
          onTransitionChange={(sceneId, transition) => workflow.updateSceneTransition(sceneId, transition).catch(error => {
            workflow.fail(error);
            throw error;
          })}
          onSceneBoundaryChange={(sceneId, deltaSec) =>
            workflow.adjustSceneBoundary(sceneId, deltaSec).catch((error) => {
              workflow.fail(error);
              throw error;
            })
          }
          onGenerateFinal={() => workflow.generateFinalVideo().catch(workflow.fail)}
        />
      )}
    </main>
  );
}
