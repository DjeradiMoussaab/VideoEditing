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

function findSelectedSuggestion(scene) {
  const suggestions = scene?.stockSuggestions || [];
  if (!suggestions.length) return null;
  if (!scene.selectedSuggestionId) return suggestions[0] || null;
  return suggestions.find((item) => String(item.id) === String(scene.selectedSuggestionId)) || suggestions[0] || null;
}

function timelineThumbnail(scene) {
  if (scene?.type === "image") return toAbsoluteUrl(scene.assetUrl);
  const selectedSuggestion = findSelectedSuggestion(scene);
  if (selectedSuggestion?.thumbnail) return toAbsoluteUrl(selectedSuggestion.thumbnail);
  const firstSuggestion = scene?.stockSuggestions?.[0];
  if (firstSuggestion?.thumbnail) return toAbsoluteUrl(firstSuggestion.thumbnail);
  return null;
}

function typeLabel(type) {
  if (type === "quote") return "Quote";
  if (type === "video") return "Video";
  return "Image";
}

export function SceneTimeline({ audioUrl, scenes, selectedSceneId, onSelectScene, onBoundaryChange }) {
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
        if (event.code === "Space") { event.preventDefault(); void audio.toggle(); }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); audio.seek(audio.time + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 0.1 : 1));
        }
      }}>
      <header className="scene-timeline-header">
        <div>
          <h3>Timeline</h3>
          <span>{fmt(totalDuration)} total</span>
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
        </div>
      </header>
      <div className="timeline-transport">
        <button type="button" onClick={() => audio.seek(0)} aria-label="Go to start">↤</button>
        <button type="button" className="timeline-play" disabled={audio.status !== "ready"} onClick={() => void audio.toggle()} aria-label={audio.playing ? "Pause voiceover" : "Play voiceover"}>{audio.playing ? "Ⅱ Pause" : "▶ Play"}</button>
        <output>{audio.time.toFixed(2)}s <span>/ {fmt(totalDuration)}</span></output>
        <span className="timeline-help">Click the ruler or waveform to seek · Drag scene edges to trim</span>
      </div>
      <div className="scene-timeline-scroll" ref={scrollRef}>
        <div className="timeline-content" style={{ width: `${trackWidthPct}%` }}>
          <div className="timeline-ruler" {...scrubProps} aria-label="Seek on time ruler">
            {Array.from({ length: Math.ceil(totalDuration / (zoomWindowSec <= 30 ? 1 : zoomWindowSec / 12)) }, (_, i) => {
              const time = i * (zoomWindowSec <= 30 ? 1 : zoomWindowSec / 12);
              return <span key={i} style={{ left: `${time / totalDuration * 100}%` }}>{fmt(time)}</span>;
            })}
          </div>
        <div className="scene-timeline-track" ref={trackRef} style={{ width: "100%" }}>
          {segmentLayouts.map(({ scene, leftPct, widthPct }, index) => {
            const active = Number(selectedSceneId) === Number(scene.scene_id);
            const thumbUrl = timelineThumbnail(scene);
            const videoUrl = !thumbUrl && (scene.type === "video" || scene.type === "quote")
              ? toAbsoluteUrl(scene.assetUrl)
              : null;
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
                onClick={() => { onSelectScene(scene.scene_id); audio.seek(Number(scene.start_sec) || 0); }}
                title={`Scene ${scene.scene_id}: ${fmt(scene.duration_sec)}`}
              >
                {videoUrl ? (
                  <video className="timeline-segment-video" src={videoUrl} muted playsInline preload="metadata" />
                ) : null}
                <span className="timeline-segment-title">S{scene.scene_id}</span>
                <span className="timeline-segment-meta">{fmt(scene.duration_sec)}</span>
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
              if (event.code === "Space") { event.preventDefault(); void audio.toggle(); }
              if (event.key === "Home") { event.preventDefault(); audio.seek(0); }
              if (event.key === "End") { event.preventDefault(); audio.seek(totalDuration); }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); audio.seek(audio.time + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 0.1 : 1)); }
            }}>
            <AudioWaveform waveform={audio.waveform} scenes={draftScenes} duration={totalDuration} audioDuration={audio.audioDuration} scrollRef={scrollRef} />
          </div>
          <div className="timeline-playhead" style={{ left: `${audio.time / totalDuration * 100}%` }}><span /></div>
        </div>
      </div>
      <footer className="timeline-footer">
        <span>{audio.status === "loading" ? "Loading voiceover waveform…" : audio.status === "missing" ? "No voiceover available" : audio.status === "error" ? "Unable to load voiceover" : "♫ Voiceover · Space to play · ← → to seek · Shift for 0.1s"}</span>
        <div><button type="button" aria-label="Pan timeline left" onClick={() => scrollRef.current.scrollBy({ left: -scrollRef.current.clientWidth * 0.75, behavior: "smooth" })}>←</button><button type="button" aria-label="Pan timeline right" onClick={() => scrollRef.current.scrollBy({ left: scrollRef.current.clientWidth * 0.75, behavior: "smooth" })}>→</button></div>
      </footer>
      {audio.error && <div role="alert">{audio.error} <button type="button" onClick={audio.reload}>Retry audio</button></div>}
    </section>
  );
}
