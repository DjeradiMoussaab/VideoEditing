import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STYLE_ASSETS = {
  vintage: ['motion.json', 'background.png', 'decorations.png', 'photo-mask.png', 'surface.png', 'Particles.mp4', 'Noise Scratch.mp4', 'Light Leak.mp4'],
  historical: ['Paper.jpg', 'grunge1.jpg', 'OTF_Crumpled_Paper_10.jpg', 'old frame_00000.png', 'Particles_RENDER.mov', 'damage.mp4', 'LLEAK.mov', 'Main_Matte.mp4'],
  'history-slideshow': ['background.png', 'photo-mask.png', 'clouds-front.png', 'clouds-back.png', 'noise.mp4', 'particles.mp4', 'light-leak.mp4']
};
const root = fileURLToPath(new URL('../../assets/', import.meta.url));
export function missingStyleAssets(style, directory = path.join(root, style)) {
  return STYLE_ASSETS[style].filter(name => {
    try {
      const stat = fs.statSync(path.join(directory, name));
      return !stat.isFile() || stat.size === 0;
    }
    catch { return true; }
  });
}
export function assertStyleAssets(style, directory) {
  const missing = missingStyleAssets(style, directory);
  if (missing.length) throw new Error(`Missing ${style} animation assets: ${missing.join(', ')}. Copy the complete BACKEND/assets/${style}/ folder from the source project, or pull the update containing these files. Run npm run doctor to verify the installation.`);
}
