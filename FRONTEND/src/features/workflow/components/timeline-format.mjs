export function formatTimecode(seconds) {
  const value = Number(seconds);
  const ms = Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 1000));
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}:${String(ms % 1000).padStart(3, "0")}`;
}
