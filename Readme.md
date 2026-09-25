# Video Pipeline Studio

Video Pipeline Studio turns an uploaded voiceover into an editable scene timeline, then renders a finished video using reference images, stock video clips, and styled quote cards.

The application runs locally: a React/Vite frontend provides the editor, a Node.js/Express backend manages projects and external API requests, and FFmpeg renders the video. Draft creation uses OpenAI; stock video search and downloads use Pexels. These operations require network access and appropriate API credentials. Local rendering uses the downloaded or uploaded media.

The application version is recorded in [VERSION](VERSION). For details about consistent installations across machines, see [SETUP.md](SETUP.md).

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Starting and stopping](#starting-and-stopping)
- [Creating a video](#creating-a-video)
- [Editing scenes](#editing-scenes)
- [Rendering and history](#rendering-and-history)
- [Configuration](#configuration)
- [Files and backups](#files-and-backups)
- [Commands and development](#commands-and-development)
- [Troubleshooting](#troubleshooting)
- [Compatibility and limitations](#compatibility-and-limitations)

## Requirements

| Component | Project requirement |
| --- | --- |
| Node.js | **24.21.0**, specified in `.nvmrc`, `.node-version`, and package manifests |
| npm | **11.7.0** |
| FFmpeg and ffprobe | Matching **7.1.x** versions from the same build; prefer the patched **7.1.4** release |
| Browser | A modern Safari, Chrome, Edge, or Firefox installation; browser and display differences still need visual testing |
| OpenAI | An API key with access to the models configured in `BACKEND/src/config.mjs` |
| Pexels | An API key for stock video search/downloads |
| Storage | Enough free disk space for inputs, downloaded clips, intermediate renders, caches, and saved output versions |

JavaScript dependencies are pinned in `BACKEND/package.json` and `FRONTEND/package.json`; their lockfiles specify the dependency trees. Install with the supplied setup command rather than copying `node_modules` from another computer.

FFmpeg must include the `libx264` and `aac` encoders, and the `drawtext`, `subtitles`, `zoompan`, `gblur`, `xfade`, `scale`, and `overlay` filters. A matching version number alone does not guarantee a matching build. `npm run doctor` checks these capabilities, and `npm run test:render` exercises actual rendering.

Quote rendering uses Georgia/Arial when the macOS fonts are available, otherwise DejaVu Serif/Sans. Install the fallback fonts when needed, particularly on Linux. The UI loads Manrope and Space Grotesk from Google Fonts and falls back to other fonts if they cannot be loaded.

### Operating systems

- **macOS:** run the frontend and backend natively. Use tools built for your Mac's processor architecture.
- **Linux:** run natively with the required Node, FFmpeg, and font packages installed.
- **Windows:** run the project inside **WSL2**, including Node/npm and FFmpeg. Keep the checkout in the WSL filesystem and run the commands below in the WSL terminal. Open the frontend URL in your Windows browser. Native Windows rendering is not currently supported because render commands use Unix shell quoting.

The checks do not establish that every browser or computer works without problems. The current limitations and test coverage are described at the end of this document.

## Installation

### 1. Get the project

Clone this repository or extract its source archive. Open a terminal in the project root—the folder containing this README, `package.json`, `BACKEND`, `FRONTEND`, and `SHARED`.

Keep `SHARED` alongside the two application folders; both the editor and renderer use it.

### 2. Install Node.js and npm

Install Node **24.21.0**. If you already use nvm on macOS, Linux, or WSL, run these commands from the project root:

```sh
nvm install
nvm use
npm install --global npm@11.7.0
node --version
npm --version
```

The expected versions are `v24.21.0` and `11.7.0`. If nvm is not installed, use your preferred Node version manager or the matching [official Node release](https://nodejs.org/en/blog/release/v24.21.0), then install the specified npm version.

Select the same Node version in each terminal used to run the application.

### 3. Install FFmpeg

Install matching FFmpeg and ffprobe binaries for your operating system and architecture. The [FFmpeg download page](https://ffmpeg.org/download.html) links to platform builds. Choose the required 7.1 release family and a build containing the features listed above; a package manager's latest default may be a different version.

Make both commands available on your terminal's `PATH`:

```sh
ffmpeg -version
ffprobe -version
```

If either command is missing, fix PATH or installation before proceeding. Open a new terminal after changing PATH.

### 4. Install project dependencies

From the project root:

```sh
npm run setup
```

This verifies the exact Node/npm versions, then runs `npm ci` separately for the backend and frontend. It installs the locked dependencies and replaces those folders' existing `node_modules` directories. It does not install FFmpeg, configure API keys, or change your system Node version.

Keep both `package-lock.json` files. Do not delete them to work around an installation failure.

### 5. Configure API keys

If `BACKEND/.env` does not already exist, copy the example without overwriting an existing configuration:

```sh
cp -n BACKEND/.env.example BACKEND/.env
```

Edit `BACKEND/.env` and supply your own values:

```dotenv
OPENAI_API_KEY=your_openai_api_key
PEXELS_API_KEY=your_pexels_api_key
PORT=8080
CLIP_RENDER_CONCURRENCY=4
RENDER_PROFILE=final
```

The backend resolves this file relative to its own source location. Environment variables already set in the terminal take precedence. Restart the backend after editing the file.

Keep credentials out of screenshots, shared logs, and published changes. Do not put API secrets in `FRONTEND/.env`; Vite variables are browser-visible. Draft creation can incur OpenAI API usage; the local smoke test does not call external APIs.

The frontend's default API address is `http://localhost:8080/api`. No frontend environment file is needed for this default. For a different backend address, create `FRONTEND/.env` from its example and set:

```dotenv
VITE_API_BASE=http://localhost:8080/api
```

Restart the frontend development server after changing this value; rebuild if using a built frontend.

### 6. Verify the installation

Run:

```sh
npm run doctor
npm run check
npm run test:render
```

| Check | What it verifies |
| --- | --- |
| `doctor` | Node/npm versions, installed direct dependency versions against the manifests/locks, FFmpeg/ffprobe versions, and required media features |
| `check` | Backend tests followed by a production frontend build |
| `test:render` | Every configured image animation, all eight quote styles, a transition, and a final H.264/AAC video using temporary synthetic media |

The render smoke test uses software encoding by default, makes no API requests, and removes its temporary files. It also exercises file paths containing spaces. These checks do not verify API credentials, every possible uploaded media format, or browser appearance.

## Starting and stopping

Keep two terminals open in the project root.

**Terminal 1 — backend:**

```sh
npm start
```

The default API address is `http://localhost:8080`. You can open `http://localhost:8080/api/health` in a browser; a running API returns `{"ok":true}`. This endpoint confirms that the server is responding, not that credentials or FFmpeg are valid.

**Terminal 2 — frontend:**

```sh
npm run start:frontend
```

Open the URL printed by Vite, normally **http://localhost:5173**. If that port is occupied, Vite may choose another port.

Keep the backend running while creating drafts or rendering. To stop a server, press **Ctrl+C** in its terminal. Avoid stopping the backend during active work; if interrupted, inspect the project state and logs before retrying.

`npm run start:prod` is the standalone command-line pipeline, **not** a production web-server launcher. For the browser application, use the two commands above.

## Creating a video

1. Open **Studio** and select **Choose voiceover**. The picker accepts audio files, including MP3, WAV, and M4A; actual decoding depends on the file's codec and the browser/FFmpeg support.
2. Optionally add reference images. You can add several batches and remove individual files before submitting. This input currently accepts images, not reference video clips.
3. Expand **Scene settings** if you want to adjust the defaults.
4. Click **Create scene plan** and wait for processing to finish. The editor opens when the draft is ready.

The upload API accepts one voiceover and up to **100 reference images**, with a **200 MiB per-file** upload limit. This upload limit is not a guarantee that an upstream transcription service accepts an audio file of the same size. Start with a short voiceover when validating a new installation.

### Scene settings

| Setting | Behavior |
| --- | --- |
| Max reference image scenes | Caps the requested number of image scenes. Initially calculated from reference count × reuse limit. Remaining coverage can use stock video. |
| Enable quote detection | Detects direct speech and can create quote scenes automatically; enabled by default. |
| Max reference reuse per image | Defaults to 4. Controls how many times a reference may be reused during drafting. |
| Image scene duration | Defaults to a 4–6 second range. |
| Video scene duration | Defaults to a 5–10 second range. |

Each maximum duration must be at least its minimum. These are planning settings, not a promise that every resulting scene has the same duration. The initial timeline planner currently has a **500-scene limit**, configured in `BACKEND/src/config.mjs`.

## Editing scenes

### Timeline and navigation

- Click a scene in the timeline or scenes list to select it for editing.
- Use the timeline ruler/playhead to choose a time and the play button to preview the voiceover.
- Use **10 sec**, **30 sec**, **1 min**, **2 min**, **4 min**, or **8 min** to change the visible timeline scale.
- The icon beside these controls shows or hides the **Scenes** list. It is hidden by default.
- Drag a scene boundary to adjust the timing shared by adjacent scenes. The thumbnail and timing rows stay aligned.
- Thumbnail durations display seconds to two decimal places. The playback clock uses minutes, seconds, and milliseconds.
- **Back to home** returns to Studio. Use History to reopen a saved project.
- **Scene Summary** is collapsed by default and can be expanded for an overview.

### Image scenes

Choose **Image** from the scene type selector. Select a reference suggestion or use **Replace** to upload an image. Choose an animation style from the animation controls. The editor shows the selected media; the final render applies the animation.

Reference suggestions can also appear for video scenes. Selecting a reference image changes that scene to an image scene.

### Video scenes

Choose **Video**, then either use **Replace** to upload a clip or select a stock result with **Use this**.

To search again, enter a **Custom stock query** and click **Refresh**. The stock section displays up to **24** suggestions, depending on the returned results. The preview link opens the candidate clip, while **Source** opens its source page. Select **Use this** to apply it to the scene.

The media preview may show the source clip's full duration. The rendered scene uses the timeline duration; shorter source clips can loop to fill it.

### Quote scenes

Choose **Quote** to replace reference suggestions with the quote style picker. Select a style, edit its fields, and review the live preview.

| Style | Available text fields |
| --- | --- |
| Classic | Main quote, author/attribution |
| Editorial | Title, main quote, author/attribution |
| Bold Statement | Statement |
| Framed | Main quote, author/attribution |
| Two Voices | Title, first text, second text, author/attribution |
| Three Thoughts | Title, first text, second text, third text |
| Spotlight | Small label, title, main quote, author/attribution |
| Lower Third | Title, main quote, author/attribution |

Fields have visible character limits and text automatically wraps/scales to fit. Picker cards contain example text; that sample is not automatically inserted into your scene.

Click **Apply changes** to save quote text and style changes before selecting another scene or leaving the editor. The **Unsaved changes** indicator means the quote draft has not yet been applied. Saved quote designs are used by timeline thumbnails and final rendering.

### Split a scene

Position the playhead inside a scene, then hover its thumbnail and click the scissors icon. You can also use **Command+B** on macOS or **Ctrl+B** on Windows/Linux.

Both resulting scenes must be **strictly longer than one second**. A cut at or too close to an edge is unavailable. The split retains the overall timeline duration and preserves source media; video offsets allow the second part to continue from the split position.

### Delete a scene

Hover a timeline thumbnail and click its trash icon. The next scene absorbs the deleted scene's duration. If you delete the last scene, the preceding scene absorbs that duration. The overall timeline duration is preserved, and the only remaining scene cannot be deleted.

Deleting a scene is different from deleting an entire project in History.

### Keyboard controls

| Shortcut | Action |
| --- | --- |
| Space | Toggle voiceover playback while editing |
| Command+B / Ctrl+B | Split at the playhead when the duration constraint is satisfied |
| Left / Right arrow, with timeline focus | Seek backward/forward one second |
| Shift + Left / Right arrow, with timeline focus | Seek backward/forward 0.1 second |
| Home / End, with playhead slider focus | Seek to the start/end |

Playback and split shortcuts avoid ordinary text-editing fields. Most scene actions save through the API when performed; quote drafts explicitly require **Apply changes**. Edits do not rewrite an existing finished video until you render again.

## Rendering and history

1. Finish your scene edits and apply any pending quote changes.
2. Click **Generate Final Video** below the editor.
3. Follow the progress display. **Render details** shows clip counts and the current stage.
4. Preview the completed output and use **Download video** to save it.

The default final profile is **1920 × 1080 at 60 fps**, with H.264 video and AAC audio in an MP4 container. A `preview` render profile is also configured at **1280 × 720 at 30 fps**. See configuration below.

After further editing, use **Regenerate Video**. The previous render remains available while a new one is needed or running. If rendering fails, inspect the backend terminal and the project error, resolve the cause, then use **Retry generation**.

Open **History** to:

- Continue unfinished projects or edit completed projects.
- Preview and download completed videos.
- Inspect project details and saved generated versions when available.
- Delete a project after confirmation. This permanently deletes its uploaded media and saved versions; an active project is stopped before deletion.

The browser workflow does not currently provide a subtitle-generation control. Subtitle-related backend files exist, but the default pipeline does not run those steps.

## Configuration

### Environment variables

| Variable | Default / purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for OpenAI-backed draft processing. Backend only. |
| `PEXELS_API_KEY` | Required for stock video requests. Backend only. |
| `PORT` | `8080`; backend listening port. |
| `VIDEO_CODEC` | Automatic platform default: VideoToolbox on macOS, libx264 elsewhere. Set `libx264` to force software encoding. |
| `CLIP_RENDER_CONCURRENCY` | `4`; use `1` or `2` if parallel rendering exhausts available memory. |
| `RENDER_PROFILE` | `final`; `preview` selects the lower-resolution profile for newly configured work. Existing projects may retain their saved profile. |
| `IMAGE_ANIMATION_STYLE` | `fullscreen_zoom_in`; default animation when not overridden for a scene. |
| `VITE_API_BASE` | `http://localhost:8080/api`; frontend configuration only. |

Advanced options, model IDs, the scene limit, render profiles, and animation definitions are in `BACKEND/src/config.mjs`. Quote styles and their field limits are in `SHARED/quote-styles.mjs`.

Example conservative rendering settings for a machine with less available memory:

```dotenv
VIDEO_CODEC=libx264
CLIP_RENDER_CONCURRENCY=1
```

Restart the backend after changing its configuration. Software encoding can be slower. On macOS, the app probes the hardware encoder before using it and falls back to software when that probe fails; this does not prevent later failures caused by resource exhaustion or invalid input media.

### Changing ports

If the backend uses `PORT=8081`, set `VITE_API_BASE=http://localhost:8081/api` in the frontend environment file and restart both services. For a different frontend development port:

```sh
npm --prefix FRONTEND run dev -- --port 5174
```

The frontend and backend are separate servers. `localhost` refers to the computer running the browser; it does not automatically point to another machine hosting the backend.

## Files and backups

```text
video-pipeline/
├── BACKEND/
│   ├── src/                 API, project services, pipeline, renderers, tests
│   ├── assets/              Bundled media assets
│   ├── out/jobs/            Browser-created project data
│   ├── .env.example         Backend configuration template
│   ├── package.json
│   └── package-lock.json
├── FRONTEND/
│   ├── src/                 Studio, timeline, editor, history
│   ├── dist/                Generated by the frontend build
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── SHARED/                  Shared quote layouts and validation
├── scripts/                 Setup, doctor, render smoke test
├── .github/workflows/       Compatibility checks
├── SETUP.md
├── VERSION
└── Readme.md
```

Browser projects live in `BACKEND/out/jobs/<project-id>/`. Each project has a `manifest.json` and directories for inputs, custom media, suggestions, rendered outputs, and any saved versions. The current render is typically under `out/final.mp4` inside that project; use the download link in the UI to obtain the intended output/version.

Back up the **whole project directory**, not only the MP4, if you want to retain editing data. Stop active work before taking a backup. Do not remove `BACKEND/out/jobs` as a routine troubleshooting step; it contains user projects.

Manifests currently contain absolute filesystem paths. Copying an existing project folder to a different computer or directory is **not** a supported portable import: paths may need migration. A fresh installation can create new projects normally, but moving editable projects requires separate care. Copying a final MP4 for playback does not have this restriction.

## Commands and development

Run these commands from the repository root unless specified otherwise:

| Command | Purpose |
| --- | --- |
| `npm run setup` | Verify runtime versions and install both locked dependency trees |
| `npm start` | Start the API server |
| `npm run start:frontend` | Start the Vite frontend development server |
| `npm run dev:frontend` | Alias for the frontend development server |
| `npm --prefix BACKEND run dev:api` | Start the API with Node's file watcher |
| `npm run doctor` | Check the local toolchain and media capabilities |
| `npm test` | Run backend service tests |
| `npm run build:frontend` | Generate `FRONTEND/dist` |
| `npm run check` | Run backend tests and build the frontend |
| `npm run test:render` | Run the synthetic-media render smoke test |
| `npm run benchmark:animations` | Run the animation benchmark script; inspect its input requirements first |

Additional frontend timeline/media unit tests can be run with:

```sh
node --test FRONTEND/src/features/workflow/components/*.test.mjs
```

To preview the built frontend locally:

```sh
npm run build:frontend
npm --prefix FRONTEND run preview
```

Keep the API running and open the preview URL printed by Vite. Building the frontend does not start either server, and the Express API does not automatically serve `FRONTEND/dist`. Vite's preview command is a local build check, not a production deployment setup.

The compatibility workflow checks clean installation, backend tests, and frontend builds on macOS, Linux, and Windows. Its Linux job additionally renders synthetic media using the runner's FFmpeg. A configured workflow is not evidence of a passing run; inspect the actual CI results after pushing.

### Standalone pipeline

The CLI is an advanced alternative to the browser workflow. Root scripts `npm run start:prod` and `npm run start:mock` invoke it through the backend package.

It expects filesystem inputs such as `BACKEND/input/voiceover.mp3`, with optional reference media in `BACKEND/input/reference.png` or `BACKEND/input/references/`, and writes outputs directly under `BACKEND/out`. The `--mock-openai` mode additionally expects mock input files; it is not a ready-to-run demonstration project. Use `npm run test:render` for a self-contained local rendering check.

The CLI does not replace the project editor or start the web application. Inspect `BACKEND/src/cli.mjs` and `BACKEND/src/context.mjs` before using its advanced options.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Setup rejects Node or npm | Run `node --version` and `npm --version` in that terminal. Select Node 24.21.0 and npm 11.7.0, then retry. |
| Locked dependency installation fails | Check network access and the full npm error. Keep the lockfiles and use `npm run setup`. Avoid reusing dependencies installed on another OS/architecture. |
| `ffmpeg` or `ffprobe` not found | Check installation and PATH in the same terminal that starts the backend; restart that terminal if PATH changed. |
| `No such filter: drawtext` or `subtitles` | The FFmpeg build lacks required features. Install a suitable build and rerun `doctor` and the render smoke test. |
| UI cannot reach the backend | Open `/api/health` at the configured backend address. Check the backend process, PORT, and VITE_API_BASE; restart Vite after environment changes. |
| Port already in use | Stop the conflicting process or choose another port. Keep the frontend API address in sync with the backend. |
| Missing API key or authorization/model error | Check BACKEND/.env, inherited environment variables, and the account's model access. Restart the backend. Do not include keys in shared diagnostics. |
| Draft fails on a large audio upload | The app's upload limit and upstream service limits are different. Try a shorter file and inspect the exact API error. |
| Stock results are empty or unavailable | Check the Pexels key, connectivity, and query. Try another query; results may contain fewer than 24 clips. |
| Timeline exceeds 500 scenes | Increase the planning duration ranges to reduce scene count, or deliberately change `config.scenes.max` if the machine can handle the larger project. |
| Final rendering fails on another Mac | Run `doctor` and `test:render` there. Compare FFmpeg builds and fonts, try VIDEO_CODEC=libx264, and inspect the backend error. |
| Rendering is slow or the machine runs out of memory | Reduce CLIP_RENDER_CONCURRENCY to 1, close resource-heavy applications, and check free disk space. Test the preview profile with a new project. |
| Quote changes disappear or do not render | Click Apply changes and confirm Saved before navigating or starting a render. Regenerate an older finished video after editing. |
| Media preview is black or cannot play | Check the source codec and file integrity. Browser playback and FFmpeg decoding support differ; test a conventional H.264/AAC MP4. |
| UI spacing differs between machines | Compare browser/version, window size, display scaling, and zoom. Check Google Fonts loading and try 100% zoom with the scenes list hidden. |
| Copied projects have missing media | Saved absolute paths may still point to the old computer. Preserve the backup and migrate paths deliberately; do not assume folder copying is a portable import. |

For a useful bug report, include the OS version and processor architecture, browser version, application VERSION/Git revision, `npm run doctor` output, reproduction steps, and the relevant backend error text. Include a screenshot for layout issues. Remove API keys and private content before sharing.

## Compatibility and limitations

- Dependency pinning makes JavaScript installations repeatable; it does not make different FFmpeg builds, fonts, browser engines, and hardware identical.
- Reference image upload and per-scene video replacement are supported. Uploading a library of reference video clips for automatic matching is not currently implemented.
- Timeline playback previews the voiceover; individual scene previews show their media or quote design. Generate the final video to review the assembled result with transitions and animations.
- Native Windows rendering is not yet supported. Use WSL2 for the backend/rendering workflow.
- Saved projects are local filesystem data, not cloud-synced or portable project bundles.
- The application is designed for local use. It does not provide an authenticated multi-user deployment setup; do not treat the development servers as a ready-made public service.
- Release verification should include a short real project and visual checks on the intended browsers, window sizes, and machines. Automated tests cannot guarantee flawless operation on every computer.
