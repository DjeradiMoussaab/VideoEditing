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

  const openHistory = useCallback(() => {
    setActiveView("history");
    refreshHistory();
  }, [refreshHistory]);

  const selectedScene = workflow.selectedScene;
  const progressStats = workflow.progress?.stats || null;
  const showScoringSavings = activeView === "studio" && hasScoringSavings(progressStats);

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
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
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
          history={history}
          loading={historyLoading}
          error={historyError}
          onRefresh={refreshHistory}
        />
      ) : workflow.currentPage === "setup" ? (
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
          onQuoteTextChange={(quoteText) => {
            if (!selectedScene) return;
            workflow.updateSceneQuoteText(selectedScene.scene_id, quoteText).catch(workflow.fail);
          }}
          onImageReplace={(file) => {
            if (!selectedScene) return;
            workflow.replaceSceneImage(selectedScene.scene_id, file).catch(workflow.fail);
          }}
          onVideoReplace={(file) => {
            if (!selectedScene) return;
            workflow.replaceSceneVideo(selectedScene.scene_id, file).catch(workflow.fail);
          }}
          onInsertVideoAfter={(file) => {
            if (!selectedScene) return;
            workflow.insertVideoAfterScene(selectedScene.scene_id, file).catch(workflow.fail);
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
          onGenerateFinal={() => workflow.generateFinalVideo().catch(workflow.fail)}
        />
      )}
    </main>
  );
}
