import { useEffect, useRef, useState } from 'react';
import { TRANSITIONS, transitionLimit } from '../../../../../SHARED/transitions.mjs';
import { SceneThumbnail } from './SceneThumbnail';

function EffectPreview({ effect, duration, playing, compact = false }) {
  const video = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    media.playbackRate = 1 / duration;
    media.currentTime = 0;
    if (playing) void media.play().catch(() => {});
    else media.pause();
  }, [playing, duration, effect]);
  return <div className={`transition-preview ${compact ? 'transition-preview--compact' : ''}`}>
    {!failed && <video ref={video} src={`/transitions/${effect}.mp4`} poster={`/transitions/${effect}.jpg`}
      muted playsInline loop preload={compact ? 'none' : 'auto'} onError={() => setFailed(true)} aria-hidden="true" />}
    {failed && <img src={`/transitions/${effect}.jpg`} alt="Transition sample" />}
  </div>;
}

export function TransitionEditor({ leftScene, rightScene, transition, busy, onChange, onClose }) {
  const [draft, setDraft] = useState(transition);
  const [durationText, setDurationText] = useState(String(transition.duration_sec));
  const [hovered, setHovered] = useState(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const sliderActive = useRef(false);
  const maxDuration = transitionLimit(leftScene, rightScene);
  const disabled = busy || saving;
  const selected = TRANSITIONS.find(item => item.id === draft.type) || TRANSITIONS[0];

  useEffect(() => {
    setDraft(transition);
    setDurationText(String(transition.duration_sec));
    setError('');
  }, [transition.type, transition.duration_sec]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReducedMotion(preference.matches); setPlaying(!preference.matches); };
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  function previewDuration(value) {
    const duration = Math.round(Math.min(maxDuration, Math.max(0.5, Number(value))) * 1000) / 1000;
    const next = { ...draft, duration_sec: duration };
    setDraft(next); setDurationText(String(duration)); setSaved(false);
    return next;
  }
  async function save(next) {
    if (disabled || pending.current) return;
    if (next.type === transition.type && next.duration_sec === transition.duration_sec) return;
    pending.current = true;
    setSaving(true); setError(''); setSaved(false); setDraft(next);
    try { await onChange(next); setSaved(true); }
    catch (failure) {
      setDraft(transition); setDurationText(String(transition.duration_sec));
      setError(failure.message || 'Could not save this transition. Please try again.');
    } finally { pending.current = false; setSaving(false); }
  }
  function commitText() {
    if (!durationText.trim() || !Number.isFinite(Number(durationText))) {
      setDurationText(String(draft.duration_sec)); return;
    }
    void save(previewDuration(durationText));
  }
  return <section className="panel transition-editor" data-transition-editor aria-label="Transition editor">
    <header className="transition-editor-header">
      <div><span className="transition-eyebrow">TRANSITION</span><h3>Scene {leftScene.scene_id} <span aria-hidden="true">→</span> Scene {rightScene.scene_id}</h3></div>
      <div className="transition-editor-header-actions">
        <span className="transition-save-status" role="status">{saving ? 'Saving…' : saved ? '✓ Saved' : 'Changes save automatically'}</span>
        <button type="button" className="transition-close" onClick={onClose} aria-label="Return to scene editor">Back to scene <span aria-hidden="true">↗</span></button>
      </div>
    </header>
    <div className="transition-editor-body">
      <div className="transition-preview-column">
        <div className="transition-preview-stage">
          <EffectPreview key={draft.type} effect={draft.type} duration={draft.duration_sec} playing={playing} />
          <span className="transition-preview-badge">EFFECT PREVIEW</span>
          <div className="transition-preview-caption"><span>{selected.label}</span><span>{draft.duration_sec.toFixed(2)}s</span></div>
        </div>
        <div className="transition-preview-toolbar">
          <span>Sample scenes · actual transition effect</span>
          <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause transition preview' : 'Play transition preview'}>{playing ? 'Ⅱ Pause' : '▶ Play'}</button>
        </div>
        <div className="transition-scene-pair" aria-label="Connected scenes">
          <div><div className="transition-scene-image"><SceneThumbnail scene={leftScene} /></div><span>FROM <strong>Scene {leftScene.scene_id}</strong></span></div>
          <span className="transition-pair-arrow" aria-hidden="true">→</span>
          <div><div className="transition-scene-image"><SceneThumbnail scene={rightScene} /></div><span>TO <strong>Scene {rightScene.scene_id}</strong></span></div>
        </div>
        <div className="transition-duration-panel">
          <div className="transition-duration-heading"><label htmlFor="transition-duration-number">Duration</label>
            <div className="transition-duration-input"><input id="transition-duration-number" aria-label="Transition duration in seconds" type="number" min="0.5" max={maxDuration} step="0.05"
              disabled={disabled} value={durationText} onChange={event => setDurationText(event.target.value)} onBlur={commitText}
              onKeyDown={event => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') { setDurationText(String(transition.duration_sec)); setDraft(transition); }
              }} /><span>s</span></div>
          </div>
          <input className="transition-duration-slider" type="range" aria-label="Adjust transition duration" min="0.5" max={maxDuration} step="0.01"
            disabled={disabled} value={draft.duration_sec} style={{ '--range-progress': `${maxDuration > .5 ? (draft.duration_sec - .5) / (maxDuration - .5) * 100 : 0}%` }}
            onPointerDown={event => { sliderActive.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
            onChange={event => { previewDuration(event.target.value); }}
            onPointerUp={event => { sliderActive.current = false; void save(previewDuration(event.currentTarget.value)); }}
            onPointerCancel={() => { sliderActive.current = false; setDraft(transition); setDurationText(String(transition.duration_sec)); }}
            onKeyUp={event => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) void save(previewDuration(event.currentTarget.value)); }}
            onBlur={event => { if (!sliderActive.current) void save(previewDuration(event.currentTarget.value)); }} />
          <div className="transition-range-labels"><span>0.50s</span><span>{maxDuration.toFixed(2)}s</span></div>
          <p>{maxDuration < 2 ? 'Limited by the shorter adjacent scene.' : 'Centered on the scene border. Drag its edges in the timeline, too.'}</p>
        </div>
      </div>
      <div className="transition-library">
        <div className="transition-library-heading"><div><h4>Choose your transition</h4><p>Hover or focus to preview. Click to apply.</p></div><span>8 effects</span></div>
        <div className="transition-effect-grid" role="group" aria-label="Transition types">
          {TRANSITIONS.map((effect, index) => <button type="button" key={effect.id}
            className={`transition-effect-card ${draft.type === effect.id ? 'is-selected' : ''}`} disabled={disabled}
            aria-label={`${effect.label}. ${effect.description}`} aria-pressed={draft.type === effect.id}
            onMouseEnter={() => setHovered(effect.id)} onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(effect.id)} onBlur={() => setHovered(null)}
            onClick={() => void save({ ...draft, type: effect.id })}>
            <div className="transition-effect-art"><EffectPreview effect={effect.id} duration={draft.duration_sec} compact playing={!reducedMotion && hovered === effect.id} />
              <span className="transition-effect-number">{String(index + 1).padStart(2, '0')}</span>
              {draft.type === effect.id && <span className="transition-effect-check" aria-hidden="true">✓</span>}
            </div>
            <span className="transition-effect-name">{effect.label}</span><span className="transition-effect-category">{effect.category}</span>
          </button>)}
        </div>
        <div className="transition-selected-description"><span className="transition-description-mark" aria-hidden="true">◇</span><div><strong>{selected.label}</strong><p>{selected.description}</p></div></div>
      </div>
    </div>
    {error && <p className="transition-editor-error" role="alert">{error}</p>}
  </section>;
}
