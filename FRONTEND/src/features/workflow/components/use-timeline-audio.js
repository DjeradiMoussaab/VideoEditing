import { useEffect, useRef, useState } from 'react';
import { audioRegions, waveformPeaks } from './timeline-audio.mjs';

export function useTimelineAudio(url, scenes, duration) {
  const engine = useRef({ context: null, buffer: null, sources: [], time: 0, started: 0, playing: false });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waveform, setWaveform] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  function stop() {
    const e = engine.current;
    if (e.playing) e.time += e.context.currentTime - e.started;
    e.playing = false;
    e.sources.forEach(source => { try { source.stop(); } catch {} source.disconnect(); });
    e.sources = [];
    setPlaying(false);
  }
  useEffect(() => {
    const controller = new AbortController();
    const e = engine.current;
    stop(); e.time = 0; e.buffer = null;
    setTime(0); setWaveform(null); setError(''); setStatus(url ? 'loading' : 'missing');
    if (!url) return;
    const context = new AudioContext();
    e.context = context;
    (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Audio could not be loaded.');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        e.buffer = buffer;
        setWaveform(waveformPeaks(buffer)); setStatus('ready');
      } catch (err) {
        if (!controller.signal.aborted) { setStatus('error'); setError(err.message || 'Audio could not be decoded.'); }
      }
    })();
    return () => { controller.abort(); stop(); void context.close(); };
  }, [url, retry]);
  // Timing edits invalidate scheduled audio, so pause at the current position.
  useEffect(() => { stop(); engine.current.time = Math.min(duration, engine.current.time); setTime(engine.current.time); }, [scenes, duration]);
  function schedule() {
    const e = engine.current;
    const now = e.context.currentTime;
    for (const region of audioRegions(scenes, e.buffer.duration)) {
      const skip = Math.max(0, e.time - region.start);
      const length = region.audible - skip;
      if (length <= 0) continue;
      const source = e.context.createBufferSource();
      source.buffer = e.buffer; source.connect(e.context.destination);
      source.start(now + Math.max(0, region.start - e.time), region.source + skip, length);
      e.sources.push(source);
    }
    e.started = now; e.playing = true; setPlaying(true);
  }
  function seek(value) {
    const e = engine.current;
    const resume = e.playing;
    stop(); e.time = Math.max(0, Math.min(duration, value)); setTime(e.time);
    if (resume && e.time < duration) schedule();
  }
  async function toggle() {
    const e = engine.current;
    if (e.playing) { stop(); setTime(e.time); return; }
    if (!e.buffer) return;
    try {
      const context = e.context;
      await context.resume();
      if (e.context !== context || context.state === "closed" || e.playing) return;
      if (e.time >= duration) e.time = 0;
      schedule(); setError('');
    } catch { setError('Playback could not start. Try again.'); }
  }
  useEffect(() => {
    if (!playing) return;
    let frame;
    const tick = () => {
      const e = engine.current;
      const current = e.time + e.context.currentTime - e.started;
      if (current >= duration) { stop(); e.time = duration; setTime(duration); return; }
      setTime(current); frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  return { time, playing, waveform, status, error, seek, toggle, reload: () => setRetry(value => value + 1), audioDuration: engine.current.buffer?.duration || 0 };
}
