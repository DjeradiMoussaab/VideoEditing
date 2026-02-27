import { useMemo, useState } from "react";
import { projectApi } from "../../../services/project-api";

export function useProjectWorkflow() {
  const [project, setProject] = useState(null);
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [busySceneId, setBusySceneId] = useState(null);

  const scenes = project?.scenes || [];
  const selectedScene = useMemo(
    () => scenes.find((scene) => Number(scene.scene_id) === Number(selectedSceneId)) || null,
    [scenes, selectedSceneId]
  );

  async function generateScenes({ voiceoverFile, storyFile, storyText, referenceFile }) {
    if (!voiceoverFile) throw new Error("Voiceover is required.");

    setStatus("draft_running");
    setMessage("");

    const created = await projectApi.create();
    const projectId = created.project.id;

    const formData = new FormData();
    formData.append("voiceover", voiceoverFile);
    if (storyFile) formData.append("story", storyFile);
    if (referenceFile) formData.append("reference", referenceFile);
    if (!storyFile && storyText?.trim()) formData.append("storyText", storyText.trim());

    await projectApi.uploadInputs(projectId, formData);
    const draft = await projectApi.generateDraft(projectId);

    setProject(draft.project);
    setSelectedSceneId(draft.project.scenes?.[0]?.scene_id || null);
    setStatus("editing");
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
    setBusySceneId(null);
  }

  async function replaceSceneImage(sceneId, file) {
    if (!project?.id || !file) return;
    setBusySceneId(sceneId);
    const data = await projectApi.uploadSceneImage(project.id, sceneId, file);
    setProject(data.project);
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
    setBusySceneId(null);
  }

  async function generateFinalVideo() {
    if (!project?.id) return;
    setStatus("final_running");
    const data = await projectApi.generateFinal(project.id);
    setProject(data.project);
    setStatus("done");
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
    setSelectedSceneId,
    generateScenes,
    refreshProject,
    changeSceneType,
    replaceSceneImage,
    refreshSuggestions,
    chooseSuggestion,
    generateFinalVideo,
    fail
  };
}
