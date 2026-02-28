import { toAbsoluteUrl } from "../../../services/api-client";

export function FinalVideoPanel({ project, onGenerate, disabled, hasFinalVideo, needsRegeneration }) {
  const finalUrl = project?.artifacts?.finalUrl;
  const version = project?.updatedAt;
  const videoUrl = toAbsoluteUrl(finalUrl, { v: version });
  const downloadUrl = toAbsoluteUrl(finalUrl, { v: version, download: 1 });
  const buttonLabel = hasFinalVideo && needsRegeneration ? "Regenerate Video" : "Generate Final Video";

  return (
    <section className="panel final-panel">
      <div className="inline-actions">
        <h3>Final Video</h3>
        <button onClick={onGenerate} disabled={disabled}>{buttonLabel}</button>
      </div>
      {hasFinalVideo && needsRegeneration ? (
        <p className="stale-note">Scene edits detected. Regenerate to update this final output.</p>
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
