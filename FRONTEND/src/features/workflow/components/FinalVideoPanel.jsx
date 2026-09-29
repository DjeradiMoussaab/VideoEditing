import { useEffect, useRef, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";
import { ProjectDownload } from './ProjectTitle';

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function FinalVideoPanel({ project, onRenameProject, onGenerate, onProcessingControl, onUploadVoiceover, controlBusy, disabled, progress, hasFinalVideo, needsRegeneration }) {
  const upload = useRef(null);
  const sectionRef = useRef(null);
  const [pinned, setPinned] = useState(false);
  const state = project?.status || "";
  const running = state.endsWith("_RUNNING");
  const paused = state.endsWith("_PAUSED");
  const stopping = state.endsWith("_STOPPING");
  const failed = state.endsWith("_FAILED");
  const cancelled = state.endsWith("_CANCELLED");
  const draft = state.startsWith("DRAFT_") && state !== "DRAFT_READY";
  const active = running || paused || stopping;
  const missingVoice = !active && project?.voiceoverUrl === null;
  const ready = hasFinalVideo && !needsRegeneration && !active && !failed && !cancelled;
  const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  const scenes = project?.scenes || [];
  const duration = scenes.reduce((sum, scene) => sum + Number(scene.duration_sec || 0), 0);
  const videoUrl = toAbsoluteUrl(project?.artifacts?.finalUrl);
  const downloadUrl = toAbsoluteUrl(project?.artifacts?.finalUrl, { download: 1 });
  const eyebrow = missingVoice ? "Action needed" : draft ? "Scene generation" : "Final video";
  const title = missingVoice ? "Voiceover missing" : stopping ? "Stopping generation…" : paused ? "Generation paused" : running ? (draft ? "Preparing your scenes" : "Generating your video") : failed ? "Generation interrupted" : cancelled ? "Generation cancelled" : ready ? "Your video is ready" : needsRegeneration ? "Your edits are ready to render" : "Ready to generate";
  const description = missingVoice ? "Retrying won’t fix this — the original audio is missing. Upload it to continue; your scenes stay saved." : paused ? (draft ? "Resume from your saved progress." : "Resume will restart the final render.") : running ? "You can keep this page open or return later." : failed ? (progress?.summary || "Generation did not finish. Try again with your saved scenes.") : cancelled ? "Your scenes are saved. Start again whenever you’re ready." : ready ? "Preview your video or download it below." : "Combine your scenes and voiceover into a finished video.";
  const primaryLabel = missingVoice ? "Upload voiceover" : paused ? "Resume" : failed ? "Retry generation" : cancelled ? "Generate again" : needsRegeneration ? "Generate updated video" : "Generate video";
  const primaryDisabled = controlBusy || stopping || (!missingVoice && !paused && !draft && disabled);
  const iconVariant = running ? "is-running" : paused ? "is-paused" : (missingVoice || failed) ? "is-danger" : cancelled ? "is-muted" : "";
  const dotVariant = running ? "is-running" : paused ? "is-paused" : (missingVoice || failed) ? "is-danger" : cancelled ? "is-muted" : ready ? "is-success" : "";

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("has-generation-stickybar", pinned);
    return () => document.body.classList.remove("has-generation-stickybar");
  }, [pinned]);

  function generate() {
    if (missingVoice) upload.current?.click();
    else if (paused) onProcessingControl("resume");
    else if (draft) onProcessingControl("regenerate");
    else onGenerate();
  }
  function secondary(event, action) {
    event.currentTarget.closest("details")?.removeAttribute("open");
    onProcessingControl(action);
  }
  function scrollToPanel() {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderIcon() {
    if (running) return <span className="generate-spinner" />;
    if (paused) return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6v12M15 6v12" /></svg>;
    if (missingVoice || failed) return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></svg>;
    if (cancelled) return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3" /><path d="M3.5 4.5v5h5" /></svg>;
    if (ready) return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>;
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="4" /><path d="m10 9 5 3-5 3V9Z" /></svg>;
  }
  function renderPrimary(extraClassName) {
    const className = extraClassName ? `generation-primary ${extraClassName}` : "generation-primary";
    if (running) return <button type="button" className={className} disabled={controlBusy} onClick={() => onProcessingControl("pause")}>Pause</button>;
    if (stopping) return <button type="button" className={className} disabled>Stopping…</button>;
    if (ready) return <ProjectDownload className={className} href={downloadUrl} project={project} onRename={onRenameProject}>↓ Download video</ProjectDownload>;
    return <button type="button" className={className} disabled={primaryDisabled} onClick={generate}>{controlBusy ? "Please wait…" : primaryLabel}</button>;
  }

  return (
    <>
      {pinned && (
        <div className="generation-stickybar" role="status" aria-live="polite">
          <div className="generation-stickybar-inner">
            <button type="button" className="generation-stickybar-info" onClick={scrollToPanel}>
              <span className={`generation-dot ${dotVariant}`} aria-hidden="true" />
              <span className="generation-stickybar-text">
                <strong>{title}</strong>
                {active && <span>{paused ? "Progress saved" : `${percent}% complete`}</span>}
              </span>
            </button>
            <div className="generation-stickybar-actions">
              {(running || paused) && <button type="button" className="generation-secondary" disabled={controlBusy} onClick={() => onProcessingControl("cancel")}>Cancel</button>}
              {renderPrimary("generation-stickybar-primary")}
            </div>
          </div>
        </div>
      )}
      <section ref={sectionRef} className="panel generation-panel" aria-label="Video generation" aria-busy={Boolean(controlBusy)}>
        <div className="generation-header">
          <div className={`generation-icon ${iconVariant}`} aria-hidden="true">{renderIcon()}</div>
          <div className="generation-heading">
            <span className="generation-eyebrow">{eyebrow}</span>
            <h3 aria-live="polite">{title}</h3>
            <p className={failed || missingVoice ? "generation-error" : ""}>{description}</p>
          </div>
          <div className="generation-actions">
            {renderPrimary()}
            {(running || paused) && <button type="button" className="generation-secondary" disabled={controlBusy} onClick={() => onProcessingControl("cancel")}>Cancel</button>}
            {(running || ready) && <details className="generation-menu">
              <summary aria-label="More generation options">•••</summary>
              <div>
                {running ? <>
                  <button type="button" className="is-danger" disabled={controlBusy} onClick={event => secondary(event, "regenerate")}>Restart from beginning</button>
                  <small>Restarting discards current render progress.</small>
                </> : <button type="button" disabled={controlBusy || (ready && disabled)} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onGenerate(); }}>Regenerate video</button>}
              </div>
            </details>}
          </div>
        </div>
        <input ref={upload} type="file" accept="audio/*" hidden aria-label="Upload voiceover" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUploadVoiceover(file); }} />
        {active && <div className="generation-progress">
          <div className="generation-progress-label"><span>{paused ? "Progress saved" : progress?.summary || "Getting started…"}</span><strong>{percent}%</strong></div>
          <div className="progress-track" role="progressbar" aria-label="Generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
        </div>}
        <div className="generation-footer">
          <span>{scenes.length} {scenes.length === 1 ? "scene" : "scenes"}{duration > 0 ? ` · ${formatDuration(duration)}` : ""}</span>
          {(active || failed || cancelled) && progress && <details className="generation-details"><summary>Show details</summary><div>
            {progress.stats?.totalClips > 0 && <p>{progress.stats.clipsRendered || 0} / {progress.stats.totalClips} clips rendered</p>}
            <p>{progress.summary}</p>
            {(progress.recap || []).length > 0 && <ul>{progress.recap.slice(-3).map((line, index) => <li key={index}>{line}</li>)}</ul>}
          </div></details>}
        </div>
        {videoUrl && <div className="generation-output">
          {!ready && <p>Previous video · Your latest changes are not included.</p>}
          <video controls src={videoUrl} preload="metadata" />
        </div>}
      </section>
    </>
  );
}
