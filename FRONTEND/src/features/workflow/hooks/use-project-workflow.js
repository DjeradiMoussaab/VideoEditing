import { useMemo, useState } from "react";
import { projectApi } from "../../../services/project-api";

export function useProjectWorkflow() {
  const [project, setProject] = useState(null);
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [busySceneId, setBusySceneId] = useState(null);
  const [currentPage, setCurrentPage] = useState("setup");
  const [finalNeedsRegeneration, setFinalNeedsRegeneration] = useState(false);

  const scenes = project?.scenes || [];
  const selectedScene = useMemo(
    () => scenes.find((scene) => Number(scene.scene_id) === Number(selectedSceneId)) || null,
    [scenes, selectedSceneId]
  );
  const progress = project?.progress || null;
  const hasFinalVideo = Boolean(project?.artifacts?.finalUrl);

  function startProgressPolling(projectId) {
    const intervalId = setInterval(async () => {
      try {
        const data = await projectApi.get(projectId);
        setProject(data.project);
      } catch {
        // Ignore transient polling errors.
      }
    }, 1200);

    return () => clearInterval(intervalId);
  }

  async function waitForFinalCompletion(projectId) {
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const data = await projectApi.get(projectId);
      const nextProject = data.project;
      setProject(nextProject);
      if (nextProject?.status === "FINAL_READY") return nextProject;
      if (nextProject?.status === "FINAL_FAILED") {
        throw new Error(nextProject?.progress?.summary || "Final render failed");
      }
    }
  }

  async function generateScenes({
    voiceoverFile,
    referenceFiles,
    draftOptions
  }) {
    if (!voiceoverFile) throw new Error("Voiceover is required.");

    setStatus("draft_running");
    setMessage("");
    setFinalNeedsRegeneration(false);

    const created = await projectApi.create();
    const projectId = created.project.id;

    const formData = new FormData();
    formData.append("voiceover", voiceoverFile);
    for (const file of referenceFiles || []) {
      formData.append("reference", file);
    }

    await projectApi.uploadInputs(projectId, formData);
    const stopPolling = startProgressPolling(projectId);
    let draft;
    try {
      draft = await projectApi.generateDraft(projectId, draftOptions || {});
    } finally {
      stopPolling();
    }

    setProject(draft.project);
    setSelectedSceneId(draft.project.scenes?.[0]?.scene_id || null);
    setStatus("editing");
    setCurrentPage("editor");
    setFinalNeedsRegeneration(false);
  }

  async function refreshProject() {
    if (!project?.id) return;
    const data = await projectApi.get(project.id);
    setProject(data.project);
  }

  function closeProject() {
    setProject(null);
    setSelectedSceneId(null);
    setCurrentPage("setup");
    setStatus("idle");
    setMessage("");
    setBusySceneId(null);
    setFinalNeedsRegeneration(false);
  }

  async function openExistingProject(projectId) {
    if (!projectId) throw new Error("projectId is required");
    const data = await projectApi.get(projectId);
    const nextProject = data?.project || null;
    if (!nextProject) throw new Error("Project not found");

    setProject(nextProject);
    setSelectedSceneId(nextProject.scenes?.[0]?.scene_id || null);
    setCurrentPage(nextProject.scenes?.length ? "editor" : "setup");
    setStatus(nextProject.status === "FINAL_READY" ? "done" : "editing");
    setMessage("");
    setBusySceneId(null);
    setFinalNeedsRegeneration(false);
  }

  async function changeSceneType(sceneId, type, quoteText) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.setSceneType(project.id, sceneId, type, quoteText);
      setProject(data.project);
      setFinalNeedsRegeneration(true);
    } finally {
      // Never leave the type picker disabled after a failed request.
      setBusySceneId(null);
    }
  }

  async function updateSceneQuoteText(sceneId, quoteText, quoteAuthor) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    const data = await projectApi.setSceneQuoteText(project.id, sceneId, quoteText, quoteAuthor);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
    setBusySceneId(null);
  }

  async function replaceSceneImage(sceneId, file) {
    if (!project?.id || !file) return;
    setBusySceneId(sceneId);
    const data = await projectApi.uploadSceneImage(project.id, sceneId, file);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
    setBusySceneId(null);
  }

  async function replaceSceneVideo(sceneId, file) {
    if (!project?.id || !file) return;
    setBusySceneId(sceneId);
    const data = await projectApi.uploadSceneVideo(project.id, sceneId, file);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
    setBusySceneId(null);
  }

  async function refreshSuggestions(sceneId, customQuery = "") {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    const data = await projectApi.refreshSuggestions(project.id, sceneId, customQuery);
    setProject(data.project);
    setBusySceneId(null);
  }

  async function chooseSuggestion(sceneId, suggestionId) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    const data = await projectApi.selectSuggestion(project.id, sceneId, suggestionId);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
    setBusySceneId(null);
  }

  async function chooseReferenceMatch(sceneId, matchId) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    const data = await projectApi.selectReferenceMatch(project.id, sceneId, matchId);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
    setBusySceneId(null);
  }

  async function changeSceneImageAnimationStyle(sceneId, imageAnimationStyle) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    const data = await projectApi.setSceneImageAnimationStyle(project.id, sceneId, imageAnimationStyle);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
    setBusySceneId(null);
  }

  async function adjustSceneBoundary(sceneId, deltaSec) {
    if (!project?.id) return;
    const data = await projectApi.adjustSceneBoundary(project.id, sceneId, deltaSec);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
  }

  async function generateFinalVideo() {
    if (!project?.id) return;
    setStatus("final_running");
    setProject((prev) => {
      if (!prev) return prev;
      const totalClips = Array.isArray(prev?.scenes) ? prev.scenes.length : 0;
      const totalVideoSec = (prev?.scenes || []).reduce(
        (sum, scene) => sum + Math.max(0, Number(scene?.duration_sec || 0)),
        0
      );
      return {
        ...prev,
        progress: {
          ...(prev.progress || {}),
          phase: "final_queued",
          percent: 0,
          summary: "Queued final render",
          stats: {
            ...(prev.progress?.stats || {}),
            clipsRendered: 0,
            totalClips,
            renderedSec: 0,
            totalVideoSec,
            currentStep: "queued"
          }
        }
      };
    });
    let started;
    try {
      started = await projectApi.generateFinal(project.id);
      if (started?.project) {
        setProject(started.project);
      }
      const finalProject = await waitForFinalCompletion(project.id);
      setProject(finalProject);
      setStatus("done");
      setFinalNeedsRegeneration(false);
    } catch (error) {
      fail(error);
    }
  }

  function fail(error) {
    setStatus("error");
    setMessage(error instanceof Error ? error.message : String(error));
  }

  return {
    project,
    scenes,
    selectedScene,
    selectedSceneId,
    status,
    message,
    busySceneId,
    currentPage,
    hasFinalVideo,
    finalNeedsRegeneration,
    progress,
    setCurrentPage,
    setSelectedSceneId,
    openExistingProject,
    closeProject,
    generateScenes,
    refreshProject,
    changeSceneType,
    replaceSceneImage,
    replaceSceneVideo,
    refreshSuggestions,
    chooseSuggestion,
    chooseReferenceMatch,
    changeSceneImageAnimationStyle,
    adjustSceneBoundary,
    updateSceneQuoteText,
    generateFinalVideo,
    fail
  };
}
