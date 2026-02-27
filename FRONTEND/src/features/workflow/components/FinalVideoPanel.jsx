import { toAbsoluteUrl } from "../../../services/api-client";

export function FinalVideoPanel({ project, onGenerate, disabled }) {
  const finalUrl = project?.artifacts?.finalSubbedUrl || project?.artifacts?.finalUrl;

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
          <video controls src={toAbsoluteUrl(finalUrl)} />
          <a href={`${toAbsoluteUrl(finalUrl)}?download=1`} className="download-link">
            Download video
          </a>
        </>
      )}
    </section>
  );
}
