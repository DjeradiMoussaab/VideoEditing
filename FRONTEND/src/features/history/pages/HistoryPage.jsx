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

export function HistoryPage({ history, loading, error, onRefresh }) {
  return (
    <section className="history-page">
      <section className="panel inline-actions">
        <h3>Generated Videos History</h3>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      {!loading && (!history || history.length === 0) ? (
        <section className="panel">
          <p>No generated videos yet.</p>
        </section>
      ) : null}

      <section className="history-grid">
        {(history || []).map((item) => {
          const videoUrl = toAbsoluteUrl(item.finalUrl, { v: item.updatedAt });
          const downloadUrl = toAbsoluteUrl(item.downloadUrl, { v: item.updatedAt });
          return (
            <article key={item.id} className="panel history-card">
              <header className="history-card-head">
                <h4>{item.id}</h4>
                <span className="status-pill done">{item.status}</span>
              </header>
              {videoUrl ? <video controls src={videoUrl} preload="metadata" /> : null}
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
              {downloadUrl ? (
                <a className="download-link" href={downloadUrl}>
                  Download video
                </a>
              ) : null}
            </article>
          );
        })}
      </section>
    </section>
  );
}

