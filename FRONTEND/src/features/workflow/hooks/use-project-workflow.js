import { useEffect, useMemo, useRef, useState } from "react";
import { projectApi } from "../../../services/project-api";

export function useProjectWorkflow() {
  const [project, setProject] = useState(null);
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [busySceneId, setBusySceneId] = useState(null);
  const [currentPage, setCurrentPage] = useState("setup");
  const [finalNeedsRegeneration, setFinalNeedsRegeneration] = useState(false);
  async function renameProject(id,title){
    const {identity}=await projectApi.rename(id,title);
    setProject(current=>current?.id===id?{...current,...identity}:current);
    return identity;
  }

  const scenes = project?.scenes || [];
  const selectedScene = useMemo(
    () => scenes.find((scene) => Number(scene.scene_id) === Number(selectedSceneId)) || null,
    [scenes, selectedSceneId]
  );
  const progress = project?.progress || null;
  const hasFinalVideo = Boolean(project?.artifacts?.finalUrl);

  const activeProject = useRef(null);
  const [controlBusy, setControlBusy] = useState(false);
  function applyProject(next) {
    if (activeProject.current !== next?.id) return;
    setProject(next);
    setStatus(next.status === "DRAFT_RUNNING" ? "draft_running" : next.status === "FINAL_RUNNING" ? "final_running" : next.status.endsWith("_FAILED") ? "error" : next.status === "FINAL_READY" ? "done" : "editing");
    setSelectedSceneId(previous => next.scenes?.some(scene => scene.scene_id === previous) ? previous : next.scenes?.[0]?.scene_id || null);
    setFinalNeedsRegeneration(Boolean(next.artifacts?.needsRegeneration));
  }

  useEffect(() => {
    const id = project?.id;
    if (!id || !/_(RUNNING|STOPPING)$/.test(project.status)) return;
    let active = true;
    let timer;
    async function poll() {
      try {
        const data = await projectApi.get(id);
        if (active) applyProject(data.project);
      } catch { /* Retry transient connection failures. */ }
      if (active) timer = setTimeout(poll, 1200);
    }
    timer = setTimeout(poll, 1200);
    return () => { active = false; clearTimeout(timer); };
  }, [project?.id, project?.status]);

  async function controlProcessing(action) {
    if (!project?.id || controlBusy) return;
    setControlBusy(true);
    setMessage("");
    try { applyProject((await projectApi.controlProcessing(project.id, action)).project); }
    catch (error) { setMessage(error.message); }
    finally { setControlBusy(false); }
  }

  async function restoreVoiceover(file) {
    if (!project?.id || controlBusy) return;
    setControlBusy(true);
    setMessage("");
    try { applyProject((await projectApi.restoreVoiceover(project.id, file)).project); }
    catch (error) { setMessage(error.message); }
    finally { setControlBusy(false); }
  }

  async function generateScenes({
    voiceoverFile,
    referenceFiles,
    referenceClipFiles,
    draftOptions
  }) {
    if (!voiceoverFile) throw new Error("Voiceover is required.");

    setStatus("draft_running");
    setMessage("");
    setFinalNeedsRegeneration(false);

    const created = await projectApi.create();
    const projectId = created.project.id;
    activeProject.current = projectId;
    setProject(created.project);

    const formData = new FormData();
    formData.append("voiceover", voiceoverFile);
    for (const file of referenceFiles || []) {
      formData.append("reference", file);
    }

    for (const file of referenceClipFiles || []) formData.append("referenceClip", file);

    await projectApi.uploadInputs(projectId, formData);
    setCurrentPage("editor");
    const draft = await projectApi.generateDraft(projectId, draftOptions || {});
    applyProject(draft.project);
  }

  async function continueScenePlan() {
    if (!project?.id || status === "draft_running") return;
    setMessage("");
    try {
      applyProject((await projectApi.continueDraft(project.id)).project);
      setCurrentPage("editor");
    } catch (error) { fail(error); }
  }

  async function refreshProject() {
    if (!project?.id) return;
    const data = await projectApi.get(project.id);
    setProject(data.project);
  }

  function closeProject() {
    activeProject.current = null;
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

    activeProject.current = projectId;
    applyProject(nextProject);
    setCurrentPage("editor");
    setMessage("");
    setBusySceneId(null);
    setFinalNeedsRegeneration(Boolean(nextProject.artifacts?.needsRegeneration));
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

  async function updateSceneQuoteDesign(sceneId, quoteStyleId, quoteFields) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.setSceneQuoteDesign(project.id, sceneId, quoteStyleId, quoteFields);
      setProject(data.project);
      setFinalNeedsRegeneration(true);
    } finally { setBusySceneId(null); }
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

  async function updateClipPortion(sceneId, portion) {
    if (!project?.id) throw new Error('Open a project first.');
    const projectId = project.id;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.setClipPortion(projectId, sceneId, portion);
      if (activeProject.current === projectId) {
        setProject(data.project);
        setFinalNeedsRegeneration(true);
      }
    } finally { setBusySceneId(null); }
  }

  async function replaceSceneVideo(sceneId, file) {
    if (!project?.id || !file) return;
    setBusySceneId(sceneId);
    const data = await projectApi.uploadSceneVideo(project.id, sceneId, file);
    setProject(data.project);
    setFinalNeedsRegeneration(true);
    setBusySceneId(null);
  }

  async function addSuggestionMedia(sceneId, file) {
    if (!project?.id || !file) return;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.addSuggestionMedia(project.id, file);
      setProject(data.project);
    } finally { setBusySceneId(null); }
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

  async function deleteScene(sceneId) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.deleteScene(project.id, sceneId, project.updatedAt);
      setProject(data.project);
      setSelectedSceneId(data.selectedSceneId);
      setFinalNeedsRegeneration(true);
    } finally { setBusySceneId(null); }
  }

  async function splitScene(sceneId, timeSec) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.splitScene(project.id, sceneId, timeSec, project.updatedAt);
      setProject(data.project);
      setSelectedSceneId(data.newSceneId);
      setFinalNeedsRegeneration(true);
    } finally {
      setBusySceneId(null);
    }
  }

  async function updateSceneTransition(sceneId, transition) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.updateSceneTransition(project.id, sceneId, transition, project.updatedAt);
      setProject(data.project);
      setFinalNeedsRegeneration(true);
    } finally { setBusySceneId(null); }
  }

  async function adjustSceneBoundary(sceneId, deltaSec) {
    if (!project?.id) return;
    setBusySceneId(sceneId);
    try {
      const data = await projectApi.adjustSceneBoundary(project.id, sceneId, deltaSec);
      setProject(data.project);
      setFinalNeedsRegeneration(true);
    } finally { setBusySceneId(null); }
  }

  async function generateFinalVideo() {
    if (!project?.id) return;
    setMessage("");
    setControlBusy(true);
    try { applyProject((await projectApi.generateFinal(project.id)).project); }
    catch (error) { fail(error); }
    finally { setControlBusy(false); }
  }

  function fail(error) {
    setStatus("error");
    setMessage(error instanceof Error ? error.message : String(error));
  }

  return {
    renameProject,
    project,
    controlBusy,
    controlProcessing,
    restoreVoiceover,
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
    continueScenePlan,
    refreshProject,
    changeSceneType,
    addSuggestionMedia,
    replaceSceneImage,
    replaceSceneVideo,
    updateClipPortion,
    refreshSuggestions,
    chooseSuggestion,
    chooseReferenceMatch,
    changeSceneImageAnimationStyle,
    adjustSceneBoundary,
    updateSceneTransition,
    splitScene,
    deleteScene,
    updateSceneQuoteText,
    updateSceneQuoteDesign,
    generateFinalVideo,
    fail
  };
}
