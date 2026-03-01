import { useState } from "react";

export function UploadForm({ onSubmit, disabled }) {
  const [voiceoverFile, setVoiceoverFile] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [maxImages, setMaxImages] = useState(10);
  const [minSceneDurationSec, setMinSceneDurationSec] = useState(6);
  const [maxSceneDurationSec, setMaxSceneDurationSec] = useState(15);
  const [useReferencesOnly, setUseReferencesOnly] = useState(false);
  const [maxReferenceReuse, setMaxReferenceReuse] = useState(2);

  const referencesCapacity = referenceFiles.length * Math.max(1, Number(maxReferenceReuse || 1));
  const durationValid = Number(maxSceneDurationSec) >= Number(minSceneDurationSec);
  const referencesValid = !useReferencesOnly || referencesCapacity >= Number(maxImages || 0);
  const canGenerate =
    Boolean(voiceoverFile) &&
    durationValid &&
    referencesValid &&
    !disabled;

  const submit = (event) => {
    event.preventDefault();
    if (!canGenerate) return;
    onSubmit({
      voiceoverFile,
      referenceFiles,
      draftOptions: {
        maxImages,
        minSceneDurationSec,
        maxSceneDurationSec,
        useReferencesOnly,
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
          onChange={(e) => setReferenceFiles(Array.from(e.target.files || []))}
        />
      </label>
      <div className="option-grid">
        <label className="option-full">
          Max images
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
            <span className="option-toggle-title">Use reference images only</span>
            <small className="option-toggle-help">No AI image generation. Image scenes will use uploaded references only.</small>
          </div>
          <input
            type="checkbox"
            checked={useReferencesOnly}
            onChange={(e) => setUseReferencesOnly(e.target.checked)}
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
          Min scene sec
          <input
            type="number"
            min={1}
            max={120}
            value={minSceneDurationSec}
            onChange={(e) => setMinSceneDurationSec(Number(e.target.value || 1))}
          />
        </label>
        <label>
          Max scene sec
          <input
            type="number"
            min={1}
            max={240}
            value={maxSceneDurationSec}
            onChange={(e) => setMaxSceneDurationSec(Number(e.target.value || 1))}
          />
        </label>
      </div>
      <button disabled={!canGenerate} type="submit">
        Generate Scenes
      </button>
      {!durationValid ? (
        <p className="form-error">Max scene sec must be greater than or equal to Min scene sec.</p>
      ) : null}
      {useReferencesOnly ? (
        <p className={referencesValid ? "form-note" : "form-error"}>
          Reference capacity: {referenceFiles.length} x {maxReferenceReuse} = {referencesCapacity} (must be at least Max images: {maxImages})
        </p>
      ) : null}
    </form>
  );
}
