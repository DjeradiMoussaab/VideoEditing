export function ProgressPanel({ progress }) {
  const percent = Number(progress?.percent || 0);
  const stats = progress?.stats || {};
  const recap = progress?.recap || [];
  const summary = progress?.summary || "Waiting to start scene generation.";

  return (
    <section className="panel progress-panel">
      <div className="inline-actions">
        <h3>Progress</h3>
        <strong>{percent}%</strong>
      </div>
      <p>{summary}</p>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="stats-row">
        {stats.totalScenes ? <span>{stats.totalScenes} scenes</span> : null}
        {stats.imageScenes !== undefined ? <span>{stats.imageScenes} images</span> : null}
        {stats.videoScenes !== undefined ? <span>{stats.videoScenes} videos</span> : null}
        {stats.imagesGenerated !== undefined ? <span>{stats.imagesGenerated} image assets</span> : null}
        {stats.clipsRendered !== undefined ? <span>{stats.clipsRendered}/{stats.totalClips || 0} clips</span> : null}
      </div>

      {recap.length ? (
        <ul className="recap-list">
          {recap.slice(-3).map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
