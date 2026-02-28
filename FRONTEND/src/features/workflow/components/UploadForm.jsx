import { useState } from "react";

export function UploadForm({ onSubmit, disabled }) {
  const [voiceoverFile, setVoiceoverFile] = useState(null);
  const [referenceFile, setReferenceFile] = useState(null);
  const [maxImages, setMaxImages] = useState(10);
  const [minSceneDurationSec, setMinSceneDurationSec] = useState(6);
  const [maxSceneDurationSec, setMaxSceneDurationSec] = useState(15);

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      voiceoverFile,
      referenceFile,
      draftOptions: {
        maxImages,
        minSceneDurationSec,
        maxSceneDurationSec
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
        Reference image (optional)
        <input type="file" accept="image/*" onChange={(e) => setReferenceFile(e.target.files?.[0] || null)} />
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
      <button disabled={disabled || !voiceoverFile} type="submit">
        Generate Scenes
      </button>
    </form>
  );
}
