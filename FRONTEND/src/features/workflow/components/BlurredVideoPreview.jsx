import { useEffect, useRef, useState } from 'react';

export function BlurredVideoPreview({ src, mediaOffsetSec = 0, muted = false, videoRef, controls = true, onReady, onProgress, onEnded, onError }) {
  const internalVideo = useRef(null);
  const video = videoRef || internalVideo;
  const canvas = useRef(null);
  const frame = useRef(null);
  const [needsBackground, setNeedsBackground] = useState(false);

  function drawBackground() {
    const media = video.current, target = canvas.current;
    if (!media?.videoWidth || media.readyState < 2 || !target) return;
    const context = target.getContext('2d');
    if (!context) return;
    const scale = Math.max(target.width / media.videoWidth, target.height / media.videoHeight);
    const width = media.videoWidth * scale, height = media.videoHeight * scale;
    context.drawImage(media, (target.width - width) / 2, (target.height - height) / 2, width, height);
  }
  useEffect(() => {
    const media = video.current;
    if (!media || !needsBackground) return;
    let disposed = false;
    const nativeFrames = typeof media.requestVideoFrameCallback === 'function';
    const tick = () => {
      if (disposed) return;
      drawBackground();
      frame.current = nativeFrames ? media.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    tick();
    return () => {
      disposed = true;
      if (nativeFrames) media.cancelVideoFrameCallback(frame.current);
      else cancelAnimationFrame(frame.current);
    };
  }, [needsBackground, src]);

  return <div className="blurred-video-preview">
    <canvas ref={canvas} width="480" height="270" hidden={!needsBackground} aria-hidden="true" />
    <video ref={video} controls={controls} playsInline muted={muted} src={src} onEnded={onEnded} onError={onError}
      onLoadedMetadata={event => {
        const media = event.currentTarget;
        setNeedsBackground(Math.abs(media.videoWidth / media.videoHeight - 16 / 9) > .01);
        if (Number.isFinite(media.duration) && media.duration > 0) media.currentTime = Number(mediaOffsetSec || 0) % media.duration;
        onReady?.(media);
      }} onLoadedData={drawBackground} onSeeked={drawBackground} onTimeUpdate={event=>{drawBackground();onProgress?.(event.currentTarget);}} />
  </div>;
}
