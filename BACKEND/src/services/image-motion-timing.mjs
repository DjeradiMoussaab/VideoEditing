// One animation timeline per scene. All cameras, mattes and footage use this clock.
export function imageMotionTiming(durationSec, fps, sourceSec = 1) {
  if (![durationSec, fps, sourceSec].every(Number.isFinite) || durationSec <= 0 || fps <= 0 || sourceSec <= 0) {
    throw new Error('Invalid image animation duration or frame rate');
  }
  const frames = Math.max(1, Math.round(durationSec * fps));
  const span = Math.max(1, frames - 1);
  const sourceFrames = Math.max(1, Math.round(sourceSec * 30));
  return {
    frames,
    duration: frames / fps,
    progress: `min(1,on/${span})`,
    sourceTime: `(min(1,t*${fps}/${span})*${sourceSec})`,
    sourceFrameTime: `(min(1,on/${span})*${sourceSec})`,
    scale: span / fps / sourceSec,
    // Normalize source footage, retime its first-to-last frame, then interpolate
    // overlays at the requested output fps. Padding covers only EOF rounding.
    footage: frames === 1 ? 'trim=end_frame=1,setpts=0' : [
      `trim=duration=${sourceSec}`,
      'setpts=PTS-STARTPTS',
      'framerate=fps=30:scene=100',
      `trim=end_frame=${sourceFrames}`,
      'settb=AVTB',
      `setpts=N*${span}/(${fps}*${Math.max(1, sourceFrames - 1)})/TB`,
      `framerate=fps=${fps}:scene=100`,
      `tpad=stop_mode=clone:stop_duration=${frames / fps}`,
      `trim=end_frame=${frames}`,
      `settb=expr=1/${fps}`,
      'setpts=N'
    ].join(',')
  };
}
