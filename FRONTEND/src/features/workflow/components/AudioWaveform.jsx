import { useEffect, useRef } from 'react';
import { audioRegions } from './timeline-audio.mjs';

export function AudioWaveform({ waveform, scenes, duration, audioDuration, scrollRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const scroll = scrollRef.current;
    if (!canvas || !scroll) return;
    const draw = () => {
      const width = scroll.clientWidth;
      const trackWidth = canvas.parentElement.clientWidth;
      const offset = scroll.scrollLeft;
      const scale = window.devicePixelRatio || 1;
      canvas.width = width * scale; canvas.height = 72 * scale;
      canvas.style.width = `${width}px`; canvas.style.transform = `translateX(${offset}px)`;
      const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
      ctx.strokeStyle = '#3fbfa4'; ctx.fillStyle = '#59dbc0';
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(0, 36); ctx.lineTo(width, 36); ctx.stroke(); ctx.globalAlpha = 1;
      if (!waveform || !duration) return;
      const regions = audioRegions(scenes, audioDuration);
      for (let x = 0; x < width; x += 3) {
        const start = (x + offset) / trackWidth * duration;
        const end = (x + offset + 3) / trackWidth * duration;
        let peak = 0;
        for (const region of regions) {
          const from = Math.max(start, region.start);
          const to = Math.min(end, region.start + region.audible);
          if (to <= from) continue;
          const a = Math.floor((region.source + from - region.start) * waveform.rate);
          const b = Math.ceil((region.source + to - region.start) * waveform.rate);
          for (let i = a; i < b; i++) peak = Math.max(peak, waveform.peaks[i] || 0);
        }
        const height = Math.max(1, Math.min(1, peak) * 62);
        ctx.fillRect(x, 36 - height / 2, 2, height);
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(scroll); observer.observe(canvas.parentElement);
    scroll.addEventListener('scroll', draw, { passive: true }); draw();
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', draw); };
  }, [waveform, scenes, duration, audioDuration, scrollRef]);
  return <canvas ref={canvasRef} className="audio-waveform-canvas" aria-hidden="true" />;
}
