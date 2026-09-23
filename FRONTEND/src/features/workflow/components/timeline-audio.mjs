export function audioRegions(scenes, audioDuration) {
  let source = 0;
  return scenes.map((scene) => {
    const start = Number(scene.start_sec) || 0;
    const duration = Math.max(0, Number(scene.duration_sec) || 0);
    const silent = Boolean(scene.isInsertedScene) || scene.source === 'inserted_video';
    const region = { start, duration, source, audible: silent ? 0 : Math.max(0, Math.min(duration, audioDuration - source)) };
    if (!silent) source += duration;
    return region;
  });
}

export function waveformPeaks(buffer, rate = 80) {
  const count = Math.ceil(buffer.duration * rate);
  const peaks = new Float32Array(count);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) {
      const end = Math.min(samples.length, Math.floor((i + 1) * buffer.sampleRate / rate));
      for (let j = Math.floor(i * buffer.sampleRate / rate); j < end; j++) peaks[i] = Math.max(peaks[i], Math.abs(samples[j]));
    }
  }
  return { peaks, rate };
}
