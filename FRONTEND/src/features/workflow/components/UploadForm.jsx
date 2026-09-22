import { useState } from "react";

export function UploadForm({ onSubmit, disabled }) {
  const [voiceoverFile, setVoiceoverFile] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [maxImages, setMaxImages] = useState(10);
  const [imageMinSceneDurationSec, setImageMinSceneDurationSec] = useState(4);
  const [imageMaxSceneDurationSec, setImageMaxSceneDurationSec] = useState(6);
  const [videoMinSceneDurationSec, setVideoMinSceneDurationSec] = useState(5);
  const [videoMaxSceneDurationSec, setVideoMaxSceneDurationSec] = useState(10);
  const [useQuoteDetection, setUseQuoteDetection] = useState(true);
  const [maxReferenceReuse, setMaxReferenceReuse] = useState(2);

  const referencesCapacity = referenceFiles.length * Math.max(1, Number(maxReferenceReuse || 1));
  const requestedImageScenes = Number(maxImages || 0);
  const exceedsReferenceCapacity = requestedImageScenes > referencesCapacity;
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
      <h2>Start Project</h2>
      <label>
        Voiceover (required)
        <input type="file" accept="audio/*" required onChange={(e) => setVoiceoverFile(e.target.files?.[0] || null)} />
      </label>
      <label>
        Reference images (optional, multiple)
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            appendReferenceFiles(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </label>
      {referenceFiles.length > 0 ? (
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
      ) : null}
      <div className="option-grid">
        <label className="option-full">
          Max reference image scenes
          <input
            type="number"
            min={0}
            max={1000}
            value={maxImages}
            onChange={(e) => setMaxImages(Number(e.target.value || 0))}
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
          />
        </label>
        <label className="option-full">
          Max reference reuse per image
          <input
            type="number"
            min={1}
            max={50}
            value={maxReferenceReuse}
            onChange={(e) => setMaxReferenceReuse(Number(e.target.value || 1))}
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
          />
        </label>
      </div>
      <button disabled={!canGenerate} type="submit">
        Generate Scenes
      </button>
      {!imageDurationValid ? (
        <p className="form-error">Max image scene sec must be greater than or equal to Min image scene sec.</p>
      ) : null}
      {imageDurationValid && !videoDurationValid ? (
        <p className="form-error">Max video scene sec must be greater than or equal to Min video scene sec.</p>
      ) : null}
      <p className="form-note">
        Reference capacity: {referenceFiles.length} x {maxReferenceReuse} = {referencesCapacity} image scenes. Extra scenes use stock video.
      </p>
      {exceedsReferenceCapacity ? (
        <p className="form-warning">
          You requested up to {requestedImageScenes} image scenes, but your uploaded references can cover {referencesCapacity}. The remaining scenes will use stock video.
        </p>
      ) : null}
    </form>
  );
}
