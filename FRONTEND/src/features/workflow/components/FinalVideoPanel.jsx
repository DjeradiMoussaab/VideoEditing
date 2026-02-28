import { toAbsoluteUrl } from "../../../services/api-client";

export function FinalVideoPanel({ project, onGenerate, disabled }) {
  const finalUrl = project?.artifacts?.finalSubbedUrl || project?.artifacts?.finalUrl;
  const version = project?.updatedAt;
  const videoUrl = toAbsoluteUrl(finalUrl, { v: version });
  const downloadUrl = toAbsoluteUrl(finalUrl, { v: version, download: 1 });

  return (
    <section className="panel final-panel">
      <div className="inline-actions">
        <h3>Final Video</h3>
        <button onClick={onGenerate} disabled={disabled}>Generate Final Video</button>
      </div>

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
