import { toAbsoluteUrl } from "../../../services/api-client";

function formatMinSec(totalSec) {
  const sec = Math.max(0, Math.round(Number(totalSec || 0)));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatElapsed(totalSec) {
  const sec = Math.max(0, Math.round(Number(totalSec || 0)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function phaseLabel(phase) {
  const map = {
    final_queued: "Queued",
    final_preparing: "Preparing assets",
    final_clips: "Rendering clips",
    final_concatenating: "Concatenating clips",
    final_adding_audio: "Adding audio",
    final_verifying: "Verifying output",
    final_ready: "Completed",
    final_failed: "Failed"
  };
  return map[phase] || "Running";
}

export function FinalVideoPanel({ project, onGenerate, disabled, status, progress, hasFinalVideo, needsRegeneration }) {
  const finalUrl = project?.artifacts?.finalUrl;
  const version = project?.updatedAt;
  const videoUrl = toAbsoluteUrl(finalUrl, { v: version });
  const downloadUrl = toAbsoluteUrl(finalUrl, { v: version, download: 1 });
  const buttonLabel = hasFinalVideo && needsRegeneration ? "Regenerate Video" : "Generate Final Video";
  const isFinalRunning = status === "final_running";
  const percent = Number(progress?.percent || 0);
  const stats = progress?.stats || {};
  const renderedSec = Number(stats.renderedSec || 0);
  const totalVideoSec = Number(stats.totalVideoSec || 0);
  const finalRenderElapsedSec = Number(
    project?.artifacts?.renderMetrics?.finalRenderElapsedSec ??
    stats?.finalRenderElapsedSec ??
    0
  );

  return (
    <section className="panel final-panel">
      <div className="inline-actions">
        <h3>Final Video</h3>
        <button onClick={onGenerate} disabled={disabled}>{buttonLabel}</button>
      </div>
      {hasFinalVideo && needsRegeneration ? (
        <p className="stale-note">Scene edits detected. Regenerate to update this final output.</p>
      ) : null}
      {hasFinalVideo && finalRenderElapsedSec > 0 ? (
        <section className="final-render-metric" aria-label="Final render timing">
          <span className="final-render-metric-label">Final render time</span>
          <strong className="final-render-metric-value">{formatElapsed(finalRenderElapsedSec)}</strong>
        </section>
      ) : null}
      {isFinalRunning ? (
        <section className="render-progress">
          <div className="render-progress-main">
            <div className="render-percent">{percent}%</div>
            <div>
              <p className="render-summary">{progress?.summary || "Generating final video..."}</p>
              <p className="render-time">{formatMinSec(renderedSec)} / {formatMinSec(totalVideoSec)} generated</p>
            </div>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <details className="render-details">
            <summary>Render details</summary>
            <ul>
              <li>Clips: {stats.clipsRendered || 0} / {stats.totalClips || 0}</li>
              <li>Step: {phaseLabel(progress?.phase)}</li>
              <li>Task: {stats.currentStep || "running"}</li>
              <li>Last update: {(progress?.recap || []).slice(-1)[0] || "In progress"}</li>
            </ul>
          </details>
        </section>
      ) : null}

      {!finalUrl ? (
        <p>Generate the final video to preview and download it.</p>
      ) : (
        <>
          <video controls src={videoUrl} />
          <a href={downloadUrl} className="download-link">
            Download video
          </a>
        </>
      )}
    </section>
  );
}
