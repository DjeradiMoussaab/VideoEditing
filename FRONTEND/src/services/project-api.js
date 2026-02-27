import { request } from "./api-client";

export const projectApi = {
  create: () => request("/projects", { method: "POST" }),
  get: (projectId) => request(`/projects/${projectId}`),
  uploadInputs: (projectId, formData) =>
    request(`/projects/${projectId}/inputs`, {
      method: "POST",
      body: formData
    }),
  generateDraft: (projectId) =>
    request(`/projects/${projectId}/draft`, { method: "POST" }),
  setSceneType: (projectId, sceneId, type) =>
    request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type })
    }),
  uploadSceneImage: (projectId, sceneId, file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request(`/projects/${projectId}/scenes/${sceneId}/image`, {
      method: "POST",
      body: formData
    });
  },
  refreshSuggestions: (projectId, sceneId) =>
    request(`/projects/${projectId}/scenes/${sceneId}/stock/refresh`, {
      method: "POST"
    }),
  selectSuggestion: (projectId, sceneId, suggestionId) =>
    request(`/projects/${projectId}/scenes/${sceneId}/stock/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId })
    }),
  generateFinal: (projectId) =>
    request(`/projects/${projectId}/final`, {
      method: "POST"
    })
};
