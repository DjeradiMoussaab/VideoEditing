export function detectSceneMediaType(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime && mime !== 'application/octet-stream') return null;
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mpeg', 'mpg', 'ogv'].includes(extension)) return 'video';
  return null;
}
