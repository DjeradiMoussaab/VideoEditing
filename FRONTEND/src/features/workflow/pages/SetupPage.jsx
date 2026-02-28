import { UploadForm } from "../components/UploadForm";
import { ProgressPanel } from "../components/ProgressPanel";

export function SetupPage({ status, progress, onSubmit, onError }) {
  return (
    <section className="setup-page">
      <div className="setup-column">
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
      </div>
      <div className="setup-column">
        <ProgressPanel progress={progress} />
      </div>
    </section>
  );
}
