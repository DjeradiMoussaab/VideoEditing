# Reproducible setup

Use the same Git revision and these tools on both machines:

| Tool | Baseline |
| --- | --- |
| Node.js | **24.21.0 LTS**, recorded in `.nvmrc` and `.node-version` |
| npm | **11.7.0**, recorded in every package.json |
| FFmpeg + ffprobe | **7.1.x**, matching versions from the same build; prefer patched **7.1.4** |
| Browser | Current Safari, Chrome, Edge or Firefox; compare the same browser version, window size and zoom when diagnosing UI differences |

Node release: https://nodejs.org/en/blog/release/v24.21.0
FFmpeg builds: https://ffmpeg.org/download.html

FFmpeg builds differ even when version numbers match. Require `libx264` and `aac` encoders plus `drawtext`, `subtitles`, `zoompan`, `gblur`, `xfade`, `scale`, and `overlay` filters. Quote rendering uses Georgia/Arial on macOS and DejaVu Serif/Sans elsewhere; the fallback fonts must be installed. Exact font appearance can differ between systems. The UI also downloads Manrope and Space Grotesk from Google Fonts; blocked/offline access uses fallback fonts.

## Install

1. Install the specified Node and npm versions. With nvm on macOS/Linux: `nvm install` then `nvm use`. If needed: `npm install --global npm@11.7.0`.
2. Install FFmpeg and ffprobe for the machine's architecture and add their directory to PATH.
3. From the repository root, run `npm run setup`. This checks Node/npm, then uses **npm ci** in both projects to install the exact lockfiles. Do not copy node_modules from another machine or delete lockfiles. Ordinary `npm install` is for intentional dependency updates.
4. Copy `BACKEND/.env.example` to `BACKEND/.env` and fill in your own credentials. Keep actual secrets local. Existing environment variables take precedence over the file.
5. Run `npm run doctor`, `npm run check`, then `npm run test:render`.
6. In separate terminals, run `npm start` and `npm run start:frontend`. Open http://localhost:5173. The frontend expects the backend on localhost:8080 by default; changing PORT also requires matching FRONTEND/.env using its example.

`doctor` reports runtime/version mismatches, missing installed dependencies and FFmpeg features without printing credentials. `check` runs backend tests and a production frontend build. `test:render` uses temporary synthetic media, all image-animation styles, all eight quote templates, a transition and final H.264/AAC export, including paths containing spaces. It uses no paid APIs and removes its temporary files.

## Rendering differences

Mac hardware encoding is tested before use; if unavailable, the app falls back to libx264. Set `VIDEO_CODEC=libx264` in BACKEND/.env and restart the backend to force software encoding. This is slower but avoids hardware-specific failures. If memory is limited, set `CLIP_RENDER_CONCURRENCY=1`. A successful capability check cannot prevent every runtime failure, such as running out of memory or disk space.

## Platform coverage and remaining limits

Native macOS and Linux use the existing Unix rendering commands. **For Windows, run the backend in WSL2**, with Node, FFmpeg and the repository installed inside WSL. Native Windows rendering is not supported yet because command builders use Unix quoting. The Windows CI job verifies installation, backend logic tests and the frontend build, not native rendering.

The GitHub workflow checks clean installation and builds on macOS, Windows and Linux, and runs a Linux render smoke test against the runner's FFmpeg as additional compatibility coverage (not the pinned local baseline). These jobs run after pushing; adding the workflow does not mean those platforms have already passed.

A successful build is not browser visual verification. Before a release, test the editor with the sidebar open/closed, long text and 100%/125% zoom on the target browsers and screen sizes. Also try a short real project with image replacement, stock video, quotes, split/delete and final export. API credentials, network access, source-media codecs and available memory still affect outcomes. The iMac's original failure cannot be identified without its error log.
