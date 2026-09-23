import { useEffect, useRef, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";

function formatMinSec(totalSec) {
  const sec = Math.max(0, Math.round(Number(totalSec || 0)));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export function HistoryPage({ history, loading, error, onRefresh, onOpenProject, onDeleteProject }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const deleteDialogRef = useRef(null);
  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (pendingDelete && !dialog.open) dialog.showModal();
    if (!pendingDelete && dialog.open) dialog.close();
  }, [pendingDelete]);

  return (
    <section className="panel history-page" aria-labelledby="history-heading">
      <header className="inline-actions">
        <h3 id="history-heading">Generated Videos History</h3>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {actionError && !pendingDelete && <p className="error-banner" role="alert">{actionError}</p>}
      {error ? <p className="error-banner">{error}</p> : null}

      {!loading && (!history || history.length === 0) ? (
        <p>No generated videos yet.</p>
      ) : null}

      <section className="history-grid">
        {(history || []).map((item) => {
          const videoUrl = toAbsoluteUrl(item.finalUrl, { v: item.updatedAt });
          const downloadUrl = toAbsoluteUrl(item.downloadUrl, { v: item.updatedAt });
          const finished = Boolean(item.isFinished);
          return (
            <article key={item.id} className={`panel history-card ${finished ? "finished" : "unfinished"}`}>
              <header className="history-card-head">
                <h4>{item.id}</h4>
                <span className={`status-pill ${finished ? "done" : "in-progress"}`}>
                  {finished ? "Finished" : "Unfinished"}
                </span>
              </header>
              {videoUrl ? <video controls src={videoUrl} preload="metadata" /> : <div className="history-preview-placeholder">Unfinished project</div>}
              <div className="history-card-overview">{item.sceneCount} scenes · {formatMinSec(item.durationSec)}</div>
              <div className="history-card-actions">
                <button type="button" className="continue-link" disabled={item.isRunning || deleting}
                  onClick={() => onOpenProject?.(item.id)}>
                  {item.isRunning ? "Processing…" : finished ? "Edit project" : "Continue editing"}
                </button>
                <button type="button" className="delete-project" disabled={deleting || item.isRunning}
                  title={item.isRunning ? "Wait for processing to finish" : "Delete project"}
                  onClick={() => { setPendingDelete(item.id); setActionError(""); }}>Delete</button>
              {downloadUrl ? (
                <a className="download-link" href={downloadUrl}>
                  Download video
                </a>
              ) : null}
              </div>
              <details className="history-project-details">
                <summary>Project details{item.generatedVideos?.length ? ` · ${item.generatedVideos.length} versions` : ""}</summary>
              <div className="history-meta-grid">
                <span>Created: {formatDate(item.createdAt)}</span>
                <span>Updated: {formatDate(item.updatedAt)}</span>
                <span>Scenes: {item.sceneCount}</span>
                <span>Duration: {formatMinSec(item.durationSec)}</span>
                <span>Images: {item.imageCount}</span>
                <span>Videos: {item.videoCount}</span>
                <span>References: {item.referenceCount}</span>
                <span>Render profile: {item.renderProfile || "-"}</span>
                <span>Final render time: {item.finalRenderElapsedSec ? formatMinSec(item.finalRenderElapsedSec) : "-"}</span>
              </div>
              {item.generatedVideos?.length > 0 && <details className="history-versions">
                <summary>Generated versions ({item.generatedVideos.length})</summary>
                {[...item.generatedVideos].reverse().map(version => <div key={version.id} className="history-version">
                  <strong>Version {version.number} · {formatDate(version.createdAt)}</strong>
                  <video controls preload="none" src={toAbsoluteUrl(version.finalUrl)} />
                  <a className="download-link" href={toAbsoluteUrl(version.finalUrl, { download: 1 })}>Download version {version.number}</a>
                </div>)}
              </details>}
              </details>
            </article>
          );
        })}
      </section>
      <dialog ref={deleteDialogRef} className="history-delete-dialog" role="alertdialog"
        aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description"
        onCancel={(event) => { event.preventDefault(); if (!deleting) setPendingDelete(null); }}>
        <div className="delete-dialog-icon" aria-hidden="true">!</div>
        <h3 id="delete-dialog-title">Delete project?</h3>
        <p id="delete-dialog-description">Project <strong>{pendingDelete}</strong>, its uploaded files, and all saved video versions will be permanently deleted. This cannot be undone.</p>
        {actionError && <p className="error-banner" role="alert">{actionError}</p>}
        <div className="delete-dialog-actions">
          <button type="button" autoFocus disabled={deleting} onClick={() => setPendingDelete(null)}>Cancel</button>
          <button type="button" className="delete-project" disabled={deleting} onClick={async () => {
            if (deleting || !pendingDelete) return;
            setDeleting(true);
            setActionError("");
            try { await onDeleteProject(pendingDelete); setPendingDelete(null); }
            catch (error) { setActionError(error.message || "Could not delete project."); }
            finally { setDeleting(false); }
          }}>{deleting ? "Deleting…" : "Delete project"}</button>
        </div>
      </dialog>
    </section>
  );
}
