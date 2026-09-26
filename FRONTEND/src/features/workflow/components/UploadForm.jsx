import { useEffect, useState } from "react";

function ClipPreview({ file }) {
  const [url, setUrl] = useState(null);
  const [duration, setDuration] = useState(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <div className="reference-clip-preview">
    {url && <video src={url} muted controls preload="metadata" playsInline onLoadedMetadata={event => setDuration(event.currentTarget.duration)} />}
    <small>{Number.isFinite(duration) ? `${duration.toFixed(1)}s · ` : ''}Muted preview</small>
  </div>;
}

export function UploadForm({ onSubmit, disabled }) {
  const [voiceoverFile, setVoiceoverFile] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [referenceClipFiles, setReferenceClipFiles] = useState([]);
  const [clipError, setClipError] = useState("");
  const [maxImages, setMaxImages] = useState(0);
  const [imageMinSceneDurationSec, setImageMinSceneDurationSec] = useState(4);
  const [imageMaxSceneDurationSec, setImageMaxSceneDurationSec] = useState(6);
  const [videoMinSceneDurationSec, setVideoMinSceneDurationSec] = useState(5);
  const [videoMaxSceneDurationSec, setVideoMaxSceneDurationSec] = useState(10);
  const [useQuoteDetection, setUseQuoteDetection] = useState(true);
  const [maxReferenceReuse, setMaxReferenceReuse] = useState(4);

  useEffect(() => {
    setMaxImages(referenceFiles.length * Math.max(1, Number(maxReferenceReuse || 1)));
  }, [referenceFiles.length, maxReferenceReuse]);

  const referencesCapacity = referenceFiles.length * Math.max(1, Number(maxReferenceReuse || 1));
  const requestedImageScenes = Number(maxImages || 0);
  const exceedsReferenceCapacity = referenceFiles.length > 0 && requestedImageScenes > referencesCapacity;
  const imageDurationValid = Number(imageMaxSceneDurationSec) >= Number(imageMinSceneDurationSec);
  const videoDurationValid = Number(videoMaxSceneDurationSec) >= Number(videoMinSceneDurationSec);
  const durationValid = imageDurationValid && videoDurationValid;
  const canGenerate =
    Boolean(voiceoverFile) &&
    durationValid &&
    !disabled;

  const appendReferenceFiles = (files) => {
    if (!files.length) return;
    setReferenceFiles((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((f) => `${f.name}__${f.size}__${f.lastModified}`));
      for (const file of files) {
        const key = `${file.name}__${file.size}__${file.lastModified}`;
        if (!seen.has(key)) {
          next.push(file);
          seen.add(key);
        }
      }
      return next;
    });
  };

  const removeReferenceAt = (index) => {
    setReferenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!canGenerate) return;
    onSubmit({
      voiceoverFile,
      referenceFiles,
      referenceClipFiles,
      draftOptions: {
        maxImages,
        imageMinSceneDurationSec,
        imageMaxSceneDurationSec,
        videoMinSceneDurationSec,
        videoMaxSceneDurationSec,
        useReferencesOnly: true,
        useQuoteDetection,
        maxReferenceReuse
      }
    });
  };

  return (
    <form className="panel upload-panel" onSubmit={submit}>
      <div className="setup-heading">
        <p className="eyebrow">New video</p>
        <h2>Create your scene plan</h2>
        <p>Upload a voiceover, then add optional reference images and clips to guide the visuals.</p>
      </div>

      <label className="file-picker file-picker-primary">
        <input
          type="file"
          accept="audio/*"
          required
          disabled={disabled}
          onChange={(e) => setVoiceoverFile(e.target.files?.[0] || null)}
        />
        <span className="file-picker-icon" aria-hidden="true">♪</span>
        <span className="file-picker-copy">
          <strong>{voiceoverFile ? "Voiceover ready" : "Choose voiceover"}</strong>
          <small>{voiceoverFile ? voiceoverFile.name : "MP3, WAV, M4A, or another audio file"}</small>
        </span>
        <span className="file-picker-action">Browse</span>
      </label>

      <label className="file-picker">
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          onChange={(e) => {
            appendReferenceFiles(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        <span className="file-picker-icon" aria-hidden="true">+</span>
        <span className="file-picker-copy">
          <strong>Add reference images <em>Optional</em></strong>
          <small>Use images that match the video’s look and story.</small>
        </span>
        <span className="file-picker-action">Add</span>
      </label>
      {referenceFiles.length > 0 ? (
        <div className="reference-summary">
          <div className="reference-summary-header">
            <span>{referenceFiles.length} reference image{referenceFiles.length === 1 ? "" : "s"}</span>
            <span>Click + to add more</span>
          </div>
          <ul className="pending-files-list">
          {referenceFiles.map((file, index) => (
            <li key={`${file.name}_${file.size}_${file.lastModified}_${index}`}>
              <span title={file.name}>{file.name}</span>
              <button
                type="button"
                className="pending-file-remove"
                onClick={() => removeReferenceAt(index)}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                title={`Remove ${file.name}`}
              >
                ×
              </button>
            </li>
          ))}
          </ul>
        </div>
      ) : null}

      <label className="file-picker">
        <input type="file" accept=".mp4,.mov,.webm,.m4v,.mkv,.avi" multiple disabled={disabled}
          onChange={event => {
            const incoming = Array.from(event.target.files || []);
            event.target.value = '';
            const next = [...referenceClipFiles];
            for (const file of incoming) {
              if (!/\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(file.name) || file.size > 200 * 1024 * 1024) {
                setClipError('Use MP4, MOV, WebM, M4V, MKV or AVI clips up to 200 MB each.');
                return;
              }
              if (!next.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) next.push(file);
            }
            if (next.length > 30) { setClipError('Add at most 30 reference clips per project.'); return; }
            setClipError('');
            setReferenceClipFiles(next);
          }} />
        <span className="file-picker-icon" aria-hidden="true">+</span>
        <span className="file-picker-copy">
          <strong>Add reference clips <em>Optional</em></strong>
          <small>Short clips to match your story. Analysed without audio. Up to 30 clips, 60s each.</small>
        </span>
        <span className="file-picker-action">Add</span>
      </label>
      {clipError && <p role="alert">{clipError}</p>}
      {referenceClipFiles.length > 0 && <div className="reference-summary">
        <div className="reference-summary-header"><span>{referenceClipFiles.length} reference clip{referenceClipFiles.length === 1 ? '' : 's'}</span><span>Analysed when you generate scenes</span></div>
        <ul className="pending-files-list">
          {referenceClipFiles.map((file, index) => <li key={`${file.name}_${file.size}_${file.lastModified}`}>
            <ClipPreview file={file} />
            <span title={file.name}>{file.name}</span>
            <button type="button" className="pending-file-remove" disabled={disabled} aria-label={`Remove ${file.name}`}
              onClick={() => setReferenceClipFiles(previous => previous.filter((_, i) => i !== index))}>×</button>
          </li>)}
        </ul>
      </div>}

      <details className="setup-options">
        <summary>Scene settings <span>Optional</span></summary>
        <div className="option-grid">
        <label className="option-full">
          Max reference image scenes
          <input
            type="number"
            min={0}
            max={1000}
            value={maxImages}
            onChange={(e) => setMaxImages(Number(e.target.value || 0))}
            disabled={disabled}
          />
        </label>
        <label className="option-full option-toggle-row">
          <div className="option-toggle-copy">
            <span className="option-toggle-title">Enable quote detection</span>
            <small className="option-toggle-help">Detect direct speech and create quote scenes automatically.</small>
          </div>
          <input
            type="checkbox"
            checked={useQuoteDetection}
            onChange={(e) => setUseQuoteDetection(e.target.checked)}
            disabled={disabled}
          />
        </label>
        <label className="option-full">
          Max reference reuse per asset
          <input
            type="number"
            min={1}
            max={50}
            value={maxReferenceReuse}
            onChange={(e) => setMaxReferenceReuse(Number(e.target.value || 1))}
            disabled={disabled}
          />
        </label>
        <label>
          Min image scene sec
          <input
            type="number"
            min={1}
            max={120}
            value={imageMinSceneDurationSec}
            onChange={(e) => setImageMinSceneDurationSec(Number(e.target.value || 1))}
            disabled={disabled}
          />
        </label>
        <label>
          Max image scene sec
          <input
            type="number"
            min={1}
            max={240}
            value={imageMaxSceneDurationSec}
            onChange={(e) => setImageMaxSceneDurationSec(Number(e.target.value || 1))}
            disabled={disabled}
          />
        </label>
        <label>
          Min video scene sec
          <input
            type="number"
            min={1}
            max={120}
            value={videoMinSceneDurationSec}
            onChange={(e) => setVideoMinSceneDurationSec(Number(e.target.value || 1))}
            disabled={disabled}
          />
        </label>
        <label>
          Max video scene sec
          <input
            type="number"
            min={1}
            max={240}
            value={videoMaxSceneDurationSec}
            onChange={(e) => setVideoMaxSceneDurationSec(Number(e.target.value || 1))}
            disabled={disabled}
          />
        </label>
        </div>
      </details>
      <button className="generate-scenes-button" disabled={!canGenerate} type="submit">
        {disabled ? "Creating scene plan…" : "Create scene plan"}
      </button>
      {!imageDurationValid ? (
        <p className="form-error">Max image scene sec must be greater than or equal to Min image scene sec.</p>
      ) : null}
      {imageDurationValid && !videoDurationValid ? (
        <p className="form-error">Max video scene sec must be greater than or equal to Min video scene sec.</p>
      ) : null}
      {exceedsReferenceCapacity ? (
        <p className="form-warning">
          Your references can cover {referencesCapacity} image scenes; remaining scenes can use reference clips or stock video.
        </p>
      ) : null}
    </form>
  );
}
