import { splitTarget, isSplitShortcut } from "./scene-split.mjs";
import { SceneThumbnail } from "./SceneThumbnail";
import { formatTimecode } from "./timeline-format.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { toAbsoluteUrl } from "../../../services/api-client";

import { useTimelineAudio } from "./use-timeline-audio";
import { AudioWaveform } from "./AudioWaveform";

const MIN_SCENE_DURATION_SEC = 1;
const ZOOM_WINDOWS = [
  { label: "10 sec", seconds: 10 },
  { label: "30 sec", seconds: 30 },
  { label: "1 min", seconds: 60 },
  { label: "2 min", seconds: 120 },
  { label: "4 min", seconds: 240 },
  { label: "8 min", seconds: 480 }
];

function fmt(value) {
  const sec = Math.max(0, Number(value || 0));
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const rounded = Math.round(sec);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function roundSec(value) {
  return Number(Number(value || 0).toFixed(3));
}

function cloneScenes(scenes) {
  return scenes.map((scene) => ({ ...scene }));
}

function applyBoundaryDelta(scenes, boundaryIndex, deltaSec) {
  const nextScenes = cloneScenes(scenes);
  const current = nextScenes[boundaryIndex];
  const next = nextScenes[boundaryIndex + 1];
  if (!current || !next) return nextScenes;

  const boundary = roundSec(Number(current.end_sec || 0) + deltaSec);
  const currentStart = Number(current.start_sec || 0);
  const nextEnd = Number(next.end_sec || 0);

  current.end_sec = boundary;
  current.duration_sec = roundSec(boundary - currentStart);
  next.start_sec = boundary;
  next.duration_sec = roundSec(nextEnd - boundary);
  return nextScenes;
}

function clampDelta(current, next, deltaSec) {
  const currentDuration = Number(current?.duration_sec || 0);
  const nextDuration = Number(next?.duration_sec || 0);
  const minDelta = MIN_SCENE_DURATION_SEC - currentDuration;
  const maxDelta = nextDuration - MIN_SCENE_DURATION_SEC;
  if (maxDelta < minDelta) return 0;
  return roundSec(Math.max(minDelta, Math.min(maxDelta, Number(deltaSec || 0))));
}

function typeLabel(type) {
  if (type === "quote") return "Quote";
  if (type === "video") return "Video";
  return "Image";
}

export function SceneTimeline({ audioUrl, scenes, selectedSceneId, onSelectScene, onBoundaryChange, showScenes, onToggleScenes, onSplitScene, onDeleteScene, editDisabled }) {
  const splitPending = useRef(false);
  const thumbnailSeek = useRef(null);
  const [splitting, setSplitting] = useState(false);
  const [splitMessage, setSplitMessage] = useState("");
  const trackRef = useRef(null);
  const scrollRef = useRef(null);
  const scrubRef = useRef(false);
  const dragRef = useRef(null);
  const [draftScenes, setDraftScenes] = useState(() => cloneScenes(scenes || []));
  const [dragInfo, setDragInfo] = useState(null);
  const [zoomWindowSec, setZoomWindowSec] = useState(60);

  useEffect(() => {
    if (!dragRef.current) setDraftScenes(cloneScenes(scenes || []));
  }, [scenes]);

  const totalDuration = useMemo(
    () => draftScenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration_sec || 0)), 0),
    [draftScenes]
  );

  const audio = useTimelineAudio(toAbsoluteUrl(audioUrl), draftScenes, totalDuration);
  const splittableScene = splitTarget(draftScenes, audio.time);
  async function deleteTimelineScene(sceneId) {
    if (splitPending.current || editDisabled || dragRef.current || !onDeleteScene || draftScenes.length < 2) return;
    splitPending.current = true;
    setSplitting(true);
    setSplitMessage("");
    audio.pause();
    const last = Number(draftScenes.at(-1)?.scene_id) === Number(sceneId);
    try {
      await onDeleteScene(sceneId);
      setSplitMessage(`Scene deleted. Its duration was added to the ${last ? "previous" : "next"} scene.`);
    } catch (error) {
      setSplitMessage(error.message || "Could not delete the scene. Try again.");
    } finally {
      splitPending.current = false;
      setSplitting(false);
    }
  }
  async function splitAtPlayhead() {
    if (splitPending.current || editDisabled || dragRef.current || !onSplitScene) return;
    const target = splitTarget(draftScenes, audio.time);
    if (!target) { setSplitMessage("Place the playhead inside a scene so both parts are longer than 1 second."); return; }
    splitPending.current = true;
    setSplitting(true);
    setSplitMessage("");
    audio.pause();
    try {
      await onSplitScene(target.scene_id, roundSec(audio.time));
      setSplitMessage("Scene split. The second scene is selected.");
    } catch (error) {
      setSplitMessage(error.message || "Could not split the scene. Try again.");
    } finally {
      splitPending.current = false;
      setSplitting(false);
    }
  }
  useEffect(() => {
    function onKeyDown(event) {
      if (event.code === "Space" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        if (event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]')) return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) void audio.toggle();
        return;
      }
      if (!isSplitShortcut(event)) return;
      event.preventDefault();
      void splitAtPlayhead();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });
  useEffect(() => {
    const scroll = scrollRef.current;
    const track = trackRef.current;
    if (!audio.playing || !scroll || !track || !totalDuration) return;
    const x = audio.time / totalDuration * track.clientWidth;
    if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 30) {
      scroll.scrollLeft = Math.max(0, x - scroll.clientWidth * 0.2);
    }
  }, [audio.time, audio.playing, totalDuration]);
  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll && trackRef.current && totalDuration) {
      scroll.scrollLeft = Math.max(0, audio.time / totalDuration * trackRef.current.clientWidth - scroll.clientWidth * 0.2);
    }
  }, [zoomWindowSec]);
  useEffect(() => {
    const selected = scenes.find(scene => Number(scene.scene_id) === Number(selectedSceneId));
    if (selected) audio.seek(thumbnailSeek.current ?? (Number(selected.start_sec) || 0));
    thumbnailSeek.current = null;
    // Selection changes seek; playback and resizing must not repeatedly seek.
  }, [selectedSceneId]);
  useEffect(() => {
    const scroll = scrollRef.current;
    const selected = trackRef.current?.querySelector(".timeline-segment.active");
    if (!scroll || !selected) return;
    const box = selected.getBoundingClientRect();
    const viewport = scroll.getBoundingClientRect();
    if (box.left < viewport.left) scroll.scrollLeft += box.left - viewport.left;
    else if (box.right > viewport.right) scroll.scrollLeft += Math.min(box.right - viewport.right, box.left - viewport.left);
  }, [selectedSceneId, zoomWindowSec]);
  function scrub(event) {
    const rect = trackRef.current.getBoundingClientRect();
    audio.seek((event.clientX - rect.left) / rect.width * totalDuration);
  }
  const scrubProps = {
    onPointerDown: event => { if (event.button !== 0) return; scrubRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); scrub(event); },
    onPointerMove: event => { if (scrubRef.current) scrub(event); },
    onPointerUp: () => { scrubRef.current = false; },
    onPointerCancel: () => { scrubRef.current = false; }
  };

  const boundaries = useMemo(() => {
    if (!totalDuration) return [];
    let cursor = 0;
    return draftScenes.slice(0, -1).map((scene, index) => {
      cursor += Math.max(0, Number(scene.duration_sec || 0));
      return {
        index,
        scene,
        leftPct: (cursor / totalDuration) * 100
      };
    });
  }, [draftScenes, totalDuration]);

  const segmentLayouts = useMemo(() => {
    if (!totalDuration) return [];
    let cursor = 0;
    return draftScenes.map((scene) => {
      const duration = Math.max(0, Number(scene.duration_sec || 0));
      const leftPct = (cursor / totalDuration) * 100;
      const widthPct = (duration / totalDuration) * 100;
      cursor += duration;
      return { scene, leftPct, widthPct };
    });
  }, [draftScenes, totalDuration]);

  function startDrag(event, boundaryIndex) {
    const track = trackRef.current;
    if (editDisabled || splitPending.current) return;
    if (!track || !draftScenes[boundaryIndex] || !draftScenes[boundaryIndex + 1]) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = track.getBoundingClientRect();
    const startX = event.clientX;
    const startScenes = cloneScenes(draftScenes);
    const active = {
      boundaryIndex,
      startX,
      trackWidth: Math.max(1, rect.width),
      totalDuration: Math.max(0.001, totalDuration),
      startScenes,
      deltaSec: 0
    };
    dragRef.current = active;
    setDragInfo({
      boundaryIndex,
      deltaSec: 0,
      currentDuration: Number(startScenes[boundaryIndex].duration_sec || 0),
      nextDuration: Number(startScenes[boundaryIndex + 1].duration_sec || 0)
    });
  }

  useEffect(() => {
    function onPointerMove(event) {
      const active = dragRef.current;
      if (!active) return;
      const rawDelta = ((event.clientX - active.startX) / active.trackWidth) * active.totalDuration;
      const current = active.startScenes[active.boundaryIndex];
      const next = active.startScenes[active.boundaryIndex + 1];
      const deltaSec = clampDelta(current, next, rawDelta);
      active.deltaSec = deltaSec;
      const nextDraft = applyBoundaryDelta(active.startScenes, active.boundaryIndex, deltaSec);
      setDraftScenes(nextDraft);
      setDragInfo({
        boundaryIndex: active.boundaryIndex,
        deltaSec,
        currentDuration: nextDraft[active.boundaryIndex]?.duration_sec || 0,
        nextDuration: nextDraft[active.boundaryIndex + 1]?.duration_sec || 0
      });
    }

    function onPointerUp(event) {
      const active = dragRef.current;
      if (!active) return;
      dragRef.current = null;
      setDragInfo(null);
      const deltaSec = event.type === "pointercancel" ? 0 : roundSec(active.deltaSec);
      if (Math.abs(deltaSec) >= 0.05) {
        const sceneId = active.startScenes[active.boundaryIndex]?.scene_id;
        Promise.resolve(onBoundaryChange(sceneId, deltaSec)).catch(() => {
          setDraftScenes(cloneScenes(scenes || []));
        });
      } else {
        setDraftScenes(cloneScenes(scenes || []));
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onBoundaryChange, scenes]);

  if (!draftScenes.length) return null;

  const trackWidthPct = Math.max(100, (totalDuration / Math.max(1, zoomWindowSec)) * 100);

  return (
    <section className={`panel scene-timeline ${dragInfo ? "is-dragging" : ""}`} tabIndex={0}
      aria-label="Scene and voiceover editor"
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); audio.seek(audio.time + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 0.1 : 1));
        }
      }}>
      <header className="scene-timeline-header">
        <div>
          <h3>Timeline</h3>
        </div>
        <div className="timeline-zoom-controls" aria-label="Timeline zoom">
          {ZOOM_WINDOWS.map((option) => (
            <button
              key={option.seconds}
              type="button"
              className={zoomWindowSec === option.seconds ? "active" : ""}
              onClick={() => setZoomWindowSec(option.seconds)}
              title={`${option.label} visible across the timeline width`}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className="timeline-scenes-toggle" aria-label={showScenes ? "Hide scenes list" : "Show scenes list"}
            title={showScenes ? "Hide scenes list" : "Show scenes list"} aria-expanded={showScenes} aria-controls="scene-list" onClick={onToggleScenes}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5 8h2M5 12h2M5 16h2"/></svg>
          </button>
        </div>
      </header>
      <div className="timeline-transport">
        <button type="button" className="timeline-play" disabled={audio.status !== "ready"} onClick={() => void audio.toggle()} aria-label={audio.playing ? "Pause voiceover" : "Play voiceover"}>{audio.playing ? "Ⅱ Pause" : "▶ Play"}</button>
        <output>{formatTimecode(audio.time)} <span>/ {formatTimecode(totalDuration)}</span></output>
      </div>
      <div className="scene-timeline-scroll" ref={scrollRef}>
        <div className="timeline-content" style={{ width: `${trackWidthPct}%` }}>
          <div className="timeline-ruler" {...scrubProps} aria-label="Seek on time ruler">
            {Array.from({ length: Math.ceil(totalDuration / (zoomWindowSec <= 30 ? 1 : zoomWindowSec / 12)) }, (_, i) => {
              const time = i * (zoomWindowSec <= 30 ? 1 : zoomWindowSec / 12);
              return <span key={i} style={{ left: `${time / totalDuration * 100}%` }}>{fmt(time)}</span>;
            })}
          </div>
          <div className="timeline-thumbnail-track" aria-label="Scene thumbnails">
            {segmentLayouts.map(({ scene, leftPct, widthPct }) => (
              <div key={scene.scene_id}
                className={`timeline-thumbnail-cell ${Number(selectedSceneId) === Number(scene.scene_id) ? "active" : ""}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                >
                <button type="button" className="timeline-thumbnail-select" aria-label={`Preview scene ${scene.scene_id}`}
                  aria-pressed={Number(selectedSceneId) === Number(scene.scene_id)}
                  onClick={event => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const position = event.detail === 0 ? Number(scene.start_sec) : Number(scene.start_sec) + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * Number(scene.duration_sec);
                    onSelectScene(scene.scene_id);
                    // Selection's normal seek runs first; keep a clicked thumbnail's exact position.
                    thumbnailSeek.current = Number(selectedSceneId) !== Number(scene.scene_id) ? position : null;
                    audio.seek(position);
                  }}>
                  <SceneThumbnail scene={scene} />
                  <span className="timeline-thumbnail-duration">{Number(scene.duration_sec || 0).toFixed(2)}s</span>
                </button>
                <button type="button" className="timeline-split-button"
                  aria-label={`Split scene ${scene.scene_id} at playhead`} aria-keyshortcuts="Control+b Meta+b"
                  disabled={editDisabled || splitting || Number(splittableScene?.scene_id) !== Number(scene.scene_id)}
                  title={Number(splittableScene?.scene_id) === Number(scene.scene_id) ? "Split at playhead (Ctrl+B / ⌘B)" : "Click inside this thumbnail to position the playhead. Both parts must exceed 1 second."}
                  onClick={() => void splitAtPlayhead()}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.2 8.2 12.3 12.3M8.2 15.8 20.5 3.5"/></svg>
                </button>
                <button type="button" className="timeline-delete-button"
                  aria-label={`Delete scene ${scene.scene_id}`}
                  disabled={editDisabled || splitting || draftScenes.length < 2}
                  title={draftScenes.length < 2 ? "The only remaining scene cannot be deleted" : `Delete scene; ${Number(scene.scene_id) === Number(draftScenes.at(-1)?.scene_id) ? "previous" : "next"} scene fills its duration`}
                  onClick={() => void deleteTimelineScene(scene.scene_id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v8M14 10v8"/></svg>
                </button>
              </div>
            ))}
            {boundaries.map(boundary => (
              <button key={boundary.scene.scene_id} type="button"
                className="thumbnail-boundary" style={{ left: `${boundary.leftPct}%` }}
                onPointerDown={event => startDrag(event, boundary.index)}
                aria-label={`Resize thumbnail boundary after scene ${boundary.scene.scene_id}`}
                title="Drag to resize scenes" />
            ))}
          </div>
        <div className="scene-timeline-track" ref={trackRef} style={{ width: "100%" }}>
          {segmentLayouts.map(({ scene, leftPct, widthPct }, index) => {
            const active = Number(selectedSceneId) === Number(scene.scene_id);
            const selectedSuggestion = scene.stockSuggestions?.find(item => String(item.id) === String(scene.selectedSuggestionId));
            const thumbUrl = scene.type === "image" ? toAbsoluteUrl(scene.assetUrl)
              : scene.source === "stock" ? toAbsoluteUrl(selectedSuggestion?.thumbnail) : null;
            const videoUrl = !thumbUrl && scene.assetUrl ? toAbsoluteUrl(scene.assetUrl) : null;
            return (
              <button
                key={scene.scene_id}
                type="button"
                className={[
                  "timeline-segment",
                  `timeline-segment--${scene.type || "image"}`,
                  index === 0 ? "timeline-segment--first" : "",
                  index === draftScenes.length - 1 ? "timeline-segment--last" : "",
                  active ? "active" : ""
                ].join(" ").trim()}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  ...(thumbUrl ? { backgroundImage: `url("${thumbUrl}")` } : {})
                }}
                aria-pressed={active}
                onClick={() => { onSelectScene(scene.scene_id); audio.seek(Number(scene.start_sec) || 0); }}
                title={`Scene ${scene.scene_id}: ${fmt(scene.duration_sec)}`}
              >
                {videoUrl && <video key={videoUrl} className="timeline-segment-video" src={videoUrl} muted playsInline preload="metadata" />}
                <span className="timeline-segment-title">S{scene.scene_id}</span>
                <span className="timeline-segment-meta">{Number(scene.duration_sec || 0).toFixed(2)}s</span>
                <span className="timeline-segment-type">{typeLabel(scene.type)}</span>
              </button>
            );
          })}

          {boundaries.map((boundary) => {
            const active = dragInfo?.boundaryIndex === boundary.index;
            return (
              <button
                key={`boundary-${boundary.scene.scene_id}`}
                type="button"
                className={`timeline-boundary ${active ? "active" : ""}`}
                style={{ left: `${boundary.leftPct}%` }}
                onPointerDown={(event) => startDrag(event, boundary.index)}
                aria-label={`Adjust boundary after scene ${boundary.scene.scene_id}`}
                title={`Drag to resize Scene ${boundary.scene.scene_id} and Scene ${draftScenes[boundary.index + 1]?.scene_id}`}
              >
                <span />
              </button>
            );
          })}

          {dragInfo ? (
            <div
              className="timeline-drag-readout"
              style={{
                left: `${boundaries.find((b) => b.index === dragInfo.boundaryIndex)?.leftPct || 50}%`
              }}
            >
              <strong>{dragInfo.deltaSec >= 0 ? "+" : ""}{dragInfo.deltaSec.toFixed(1)}s</strong>
              <span>
                {fmt(dragInfo.currentDuration)} / {fmt(dragInfo.nextDuration)}
              </span>
            </div>
          ) : null}
        </div>
          <div className="timeline-audio-track" {...scrubProps} role="slider" tabIndex={0}
            aria-label="Voiceover playhead" aria-valuemin={0} aria-valuemax={totalDuration} aria-valuenow={Number(audio.time.toFixed(2))}
            onKeyDown={event => {
                    if (event.key === "Home") { event.preventDefault(); audio.seek(0); }
              if (event.key === "End") { event.preventDefault(); audio.seek(totalDuration); }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); audio.seek(audio.time + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 0.1 : 1)); }
            }}>
            <AudioWaveform waveform={audio.waveform} scenes={draftScenes} duration={totalDuration} audioDuration={audio.audioDuration} scrollRef={scrollRef} />
          </div>
          <div className="timeline-playhead" style={{ left: `${audio.time / totalDuration * 100}%` }}><span /></div>
        </div>
      </div>
      {splitMessage && <p className="timeline-split-message" role="status">{splitMessage}</p>}
      {audio.status === "loading" && <span className="timeline-status" role="status">Loading voiceover waveform…</span>}
      {audio.status === "missing" && <span className="timeline-status">No voiceover available</span>}
      {audio.error && <div role="alert">{audio.error} <button type="button" onClick={audio.reload}>Retry audio</button></div>}
    </section>
  );
}
