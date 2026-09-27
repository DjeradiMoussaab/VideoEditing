import { UploadForm } from "../components/UploadForm";
import { ProgressPanel } from "../components/ProgressPanel";

export function SetupPage({ status, progress, project, onContinue, onSubmit, onError }) {
  const hasProgress = Boolean(progress?.summary);

  return (
    <section className="setup-page">
      <div className="setup-main">
        {project?.status === "DRAFT_FAILED" && (
          <section className="panel" aria-label="Continue scene plan">
            <h3>Scene planning stopped</h3>
            <p>Your uploaded files and completed steps are saved. Continue this project from the last saved step.</p>
            <button type="button" onClick={onContinue} disabled={status === "draft_running"}>
              {status === "draft_running" ? "Continuing scene plan…" : "Continue scene plan"}
            </button>
          </section>
        )}
        <UploadForm
          onSubmit={async (payload) => {
            try {
              await onSubmit(payload);
            } catch (error) {
              onError(error);
            }
          }}
          disabled={status === "draft_running" || status === "final_running"}
        />
        {hasProgress ? <ProgressPanel progress={progress} /> : null}
      </div>
    </section>
  );
}
