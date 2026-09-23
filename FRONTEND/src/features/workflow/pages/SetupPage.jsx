import { UploadForm } from "../components/UploadForm";
import { ProgressPanel } from "../components/ProgressPanel";

export function SetupPage({ status, progress, onSubmit, onError }) {
  const hasProgress = Boolean(progress?.summary);

  return (
    <section className="setup-page">
      <div className="setup-main">
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
