import { useState } from "react";

export function UploadForm({ onSubmit, disabled }) {
  const [voiceoverFile, setVoiceoverFile] = useState(null);
  const [storyFile, setStoryFile] = useState(null);
  const [referenceFile, setReferenceFile] = useState(null);
  const [storyText, setStoryText] = useState("");

  const submit = (event) => {
    event.preventDefault();
    onSubmit({ voiceoverFile, storyFile, storyText, referenceFile });
  };

  return (
    <form className="panel upload-panel" onSubmit={submit}>
      <h2>Start Project</h2>
      <label>
        Voiceover (required)
        <input type="file" accept="audio/*" required onChange={(e) => setVoiceoverFile(e.target.files?.[0] || null)} />
      </label>
      <label>
        Story file (optional)
        <input type="file" accept=".txt,text/plain" onChange={(e) => setStoryFile(e.target.files?.[0] || null)} />
      </label>
      <label>
        Story text (optional)
        <textarea
          value={storyText}
          onChange={(e) => setStoryText(e.target.value)}
          placeholder="If no story file is uploaded, this text will be used."
          rows={4}
        />
      </label>
      <label>
        Reference image (optional)
        <input type="file" accept="image/*" onChange={(e) => setReferenceFile(e.target.files?.[0] || null)} />
      </label>
      <button disabled={disabled || !voiceoverFile} type="submit">
        Generate Scenes
      </button>
    </form>
  );
}
