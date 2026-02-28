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

  async function changeSceneType(sceneId, type) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    const data = await projectApi.setSceneType(project.id, sceneId, type);
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

  async function refreshSuggestions(sceneId) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    const data = await projectApi.refreshSuggestions(project.id, sceneId);
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

  async function generateFinalVideo() {
    if (!project?.id) return;
    setStatus("final_running");
    const stopPolling = startProgressPolling(project.id);
    let data;
    try {
      data = await projectApi.generateFinal(project.id);
    } finally {
      stopPolling();
    }
    setProject(data.project);
    setStatus("done");
    setFinalNeedsRegeneration(false);
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
    generateScenes,
    refreshProject,
    changeSceneType,
    replaceSceneImage,
    replaceSceneVideo,
    refreshSuggestions,
    chooseSuggestion,
    generateFinalVideo,
    fail
  };
}
