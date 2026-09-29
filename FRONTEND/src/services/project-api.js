import { request } from "./api-client";

export const projectApi = {
  rename: (id,title) => request(`/projects/${id}/title`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}),
  controlProcessing: (id, action) => request(`/projects/${id}/processing/${action}`, { method: "POST" }),
  restoreVoiceover: (id, file) => { const body = new FormData(); body.append("voiceover", file); return request(`/projects/${id}/voiceover`, { method: "POST", body }); },
  create: () => request("/projects", { method: "POST" }),
  delete: (projectId) => request(`/projects/${projectId}`, { method: "DELETE" }),
  listHistory: () => request("/projects/history"),
  get: (projectId) => request(`/projects/${projectId}?t=${Date.now()}`),
  uploadInputs: (projectId, formData) =>
    request(`/projects/${projectId}/inputs`, {
      method: "POST",
      body: formData
    }),
  generateDraft: (projectId, options = {}) =>
    request(`/projects/${projectId}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options)
    }),
  continueDraft: (projectId) => request(`/projects/${projectId}/draft/continue`, { method: "POST" }),
  setSceneType: (projectId, sceneId, type, quoteText) =>
    request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        ...(quoteText !== undefined ? { quoteText } : {})
      })
    }),
  setSceneQuoteDesign: (projectId, sceneId, quoteStyleId, quoteFields) =>
    request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteStyleId, quoteFields })
    }),
  setSceneQuoteText: (projectId, sceneId, quoteText, quoteAuthor) =>
    request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteText, quoteAuthor })
    }),
  setSceneImageAnimationStyle: (projectId, sceneId, imageAnimationStyle) =>
    request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageAnimationStyle })
    }),
  deleteScene: (projectId, sceneId, expectedUpdatedAt) =>
    request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt })
    }),
  splitScene: (projectId, sceneId, timeSec, expectedUpdatedAt) =>
    request(`/projects/${projectId}/scenes/${sceneId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeSec, expectedUpdatedAt })
    }),
  adjustSceneBoundary: (projectId, sceneId, deltaSec) =>
    request(`/projects/${projectId}/scenes/${sceneId}/boundary`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deltaSec })
    }),
  uploadSceneImage: (projectId, sceneId, file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request(`/projects/${projectId}/scenes/${sceneId}/image`, {
      method: "POST",
      body: formData
    });
  },
  uploadSceneVideo: (projectId, sceneId, file) => {
    const formData = new FormData();
    formData.append("video", file);
    return request(`/projects/${projectId}/scenes/${sceneId}/video`, {
      method: "POST",
      body: formData
    });
  },
  refreshSuggestions: (projectId, sceneId, customQuery = "") =>
    request(`/projects/${projectId}/scenes/${sceneId}/stock/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customQuery })
    }),
  selectSuggestion: (projectId, sceneId, suggestionId) =>
    request(`/projects/${projectId}/scenes/${sceneId}/stock/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId })
    }),
  selectReferenceMatch: (projectId, sceneId, matchId) =>
    request(`/projects/${projectId}/scenes/${sceneId}/reference/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId })
    }),
  generateFinal: (projectId) =>
    request(`/projects/${projectId}/final`, {
      method: "POST"
    })
};
