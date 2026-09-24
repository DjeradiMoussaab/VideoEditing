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
  const rawPercent = Number(progress?.percent || 0);
  const percent = Number.isFinite(rawPercent) ? Math.max(0, Math.min(100, rawPercent)) : 0;
  const sceneCount = project?.scenes?.length || 0;
  const duration = (project?.scenes || []).reduce((sum, scene) => sum + Number(scene.duration_sec || 0), 0);
  const failed = progress?.phase === "final_failed";
  const ready = hasFinalVideo && !needsRegeneration;
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
      <div className="final-hero">
        <span className={`final-status ${isFinalRunning ? "is-running" : ""}`}>
          <span aria-hidden="true" />{isFinalRunning ? "Rendering in progress" : failed ? "Render interrupted" : needsRegeneration && hasFinalVideo ? "Changes ready to render" : ready ? "Ready to download" : "Ready when you are"}
        </span>
        <div className="final-emblem" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="7" width="22" height="19" rx="4"/><path d="m13 12 8 5-8 5V12ZM5 11h22M10 7l3 4M18 7l3 4"/></svg>
        </div>
        <h3>{isFinalRunning ? "Bringing your scenes together" : failed ? "Let’s try that again" : ready ? "Your video is ready" : "Turn your scenes into a story"}</h3>
        <p className="final-description">{isFinalRunning ? "Your scenes, motion, and voiceover are coming together." : failed ? "The render didn’t finish. You can retry with your current scenes." : hasFinalVideo && needsRegeneration ? "Your scenes have changed. Render a fresh video with your latest edits." : ready ? "Preview your finished video below, or download it to share." : "Combine your edited scenes and voiceover into one finished video."}</p>
        <div className="final-specs"><span>{sceneCount} scenes</span><span aria-hidden="true">·</span><span>{formatMinSec(duration)} duration</span>{hasFinalVideo && finalRenderElapsedSec > 0 && <><span aria-hidden="true">·</span><span>Rendered in {formatElapsed(finalRenderElapsedSec)}</span></>}</div>
        <button type="button" className="generate-video-button" onClick={onGenerate} disabled={disabled || isFinalRunning}>
          {isFinalRunning ? <span className="generate-spinner" aria-hidden="true" /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></svg>}
          {isFinalRunning ? "Generating video…" : failed ? "Retry generation" : buttonLabel}
          {!isFinalRunning && <span aria-hidden="true">→</span>}
        </button>
        {!isFinalRunning && <span className="final-helper">{ready ? "Want another render? Generate again with the current scenes." : "Preview and download available when rendering completes."}</span>}
      </div>
      {isFinalRunning ? (
        <section className="render-progress" aria-label="Video rendering progress">
          <div className="render-progress-main">
            <div className="render-percent">{percent}%</div>
            <div>
              <p className="render-summary" role="status">{progress?.summary || "Generating final video..."}</p>
              <p className="render-time">{formatMinSec(renderedSec)} / {formatMinSec(totalVideoSec)} generated</p>
            </div>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Rendering video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
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

      {finalUrl && (
        <div className="final-output">
          <div className="final-output-header"><span>{needsRegeneration || isFinalRunning ? "Previous render" : "Final video"}</span><a href={downloadUrl} className="final-download"><span aria-hidden="true">↓</span> Download video</a></div>
          <video controls src={videoUrl} preload="metadata" />
        </div>
      )}
    </section>
  );
}
