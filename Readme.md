# Video Pipeline Studio

Turn a voiceover into a video using your images, stock clips, and quote cards. Review the scenes, customize them, and download the finished video.

## Before you start

You will need:

- A voiceover audio file, such as an MP3, WAV, or M4A.
- Optional reference images you would like to use in the video.
- An internet connection for creating the scene plan and finding stock clips.
- A computer with the application installed and configured.

Setup requires OpenAI and Pexels API keys. OpenAI usage may incur charges.

## First-time installation on a Mac

Follow these steps **in order**. If a command reports an error, resolve it before moving to the next step. You only need to install the tools once.

These instructions include direct downloads for an **Intel MacBook**, such as the Intel i9. For Windows, use the WSL2 instructions in [SETUP.md](SETUP.md).

### 1. Install Node.js

Download the [Node.js 24.21.0 Mac installer](https://nodejs.org/dist/v24.21.0/node-v24.21.0.pkg), open it, and follow the installation steps. This installer supports Intel and Apple Silicon Macs.

Open a new **Terminal** window and enter:

```sh
node --version
```

It should show **v24.21.0**. Then install the npm version used by this project:

```sh
npm install --global npm@11.7.0
npm --version
```

The last command should show **11.7.0**. If you get a permission error, ask the person helping with installation to fix it before continuing.

### 2. Install FFmpeg and FFprobe

For an **Intel Mac**, download and install both packages:

- [FFmpeg 7.1 installer](https://ffmpeg.martin-riedl.de/download/macos/amd64/1737144116_7.1/ffmpeg.pkg)
- [FFprobe 7.1 installer](https://ffmpeg.martin-riedl.de/download/macos/amd64/1737144116_7.1/ffprobe.pkg)

These are third-party installers from Martin Riedl. Open each file and follow its installation steps. **For an M1, M2, M3, or other Apple Silicon Mac, use an ARM64 build instead; see [SETUP.md](SETUP.md).**

Reopen Terminal, then check:

```sh
ffmpeg -version
ffprobe -version
```

Both commands should work and report matching 7.1-series versions. If either says “command not found”, finish fixing that installation before continuing.

### 3. Open the project folder in Terminal

Extract the project ZIP. Keep the `BACKEND`, `FRONTEND`, and `SHARED` folders together.

In Terminal, type `cd ` (including the space), drag the extracted project folder into the Terminal window, and press **Enter**.

For example, if the folder is named `VideoEditing-main` in Downloads:

```sh
cd ~/Downloads/VideoEditing-main
```

Use your actual folder name if it is different. All remaining commands must be run from this main folder, not from inside BACKEND or FRONTEND.

### 4. Install the application's required packages

Run the following commands **one at a time**, waiting for each to finish successfully:

```sh
npm ci --prefix BACKEND --include=dev
```

```sh
npm ci --prefix FRONTEND --include=dev
```

**Both commands are required.** The first installs the backend packages, including `dotenv`. The second installs the interface packages, including `vite`. You do not need to install either package separately.

Do not copy another computer's `node_modules` folders. These commands install the versions saved with the project. Run them again after receiving a project update that changes its dependencies.

### 5. Add your API keys

From the main project folder, run:

```sh
cp -n BACKEND/.env.example BACKEND/.env
open -e BACKEND/.env
```

This creates the settings file if it is missing, then opens it in TextEdit. If it already exists, review its contents rather than replacing your existing settings.

Enter your own API keys. For a first run on an Intel Mac, use these settings:

```dotenv
OPENAI_API_KEY=your_openai_key
PEXELS_API_KEY=your_pexels_key
PORT=8080
VIDEO_CODEC=libx264
CLIP_RENDER_CONCURRENCY=1
RENDER_PROFILE=final
```

Replace `your_openai_key` and `your_pexels_key` with real keys, save the file, and close TextEdit. Keep the filename exactly `.env`, not `.env.txt`, and keep it as plain text. Do not share this file or screenshots of its keys.

These rendering settings use software encoding and process one clip at a time. They are a conservative starting point; rendering may be slower.

### 6. Check the installation

Run these commands one at a time:

```sh
npm run doctor
npm run check
npm run test:render
```

They check the installed tools, test the application, and generate a small temporary test video. The render test does not use your API keys or make paid API requests.

If any check fails, keep the complete error message and ask for help before starting a real project.

### 7. Start the application

In your current Terminal window, run:

```sh
npm start
```

Leave that window running. Open a **second Terminal window**, go to the same main project folder, and run:

```sh
cd ~/Downloads/VideoEditing-main
npm run start:frontend
```

Remember to adjust the folder path if yours is different.

Open **[localhost:5173](http://localhost:5173)** in your browser. If the second Terminal shows a different address, use that address instead.

Start with a short voiceover and a new project to check that everything works on this computer.

## Opening the application next time

You do not need to reinstall everything each time:

1. Open two Terminal windows in the main project folder.
2. Run `npm start` in the first.
3. Run `npm run start:frontend` in the second.
4. Open the browser address shown by the second window, normally **http://localhost:5173**.

Keep both windows open while working. To stop the application after your work finishes, press **Ctrl+C** in each window.

## Make your first video

### 1. Add your voiceover

On the **Studio** page, click **Choose voiceover** and select your audio file.

For your first attempt, use a short recording so you can quickly try the full process.

### 2. Add your images

Click **Add reference images** to choose photos or illustrations. You can add more images or remove any you do not want before continuing.

Images are optional. The application can also use stock video clips. This section currently accepts reference images, not reference video clips.

### 3. Create the scene plan

Click **Create scene plan** and wait for the editor to open.

You can leave **Scene settings** at their defaults. If needed, expand them to adjust scene lengths, how often images can be reused, or whether spoken quotes should become quote scenes.

### 4. Review and edit

Click a scene in the timeline to open its editor. Choose the scene type and adjust its content using the options below.

### 5. Generate and download

Click **Generate Final Video** below the editor. Keep the application running until it finishes.

Watch the finished video, then click **Download video** to save it to your computer.

## Customize your scenes

| Scene type | What you can do |
| --- | --- |
| **Image** | Choose a suggested image, upload your own with **Replace**, and select an animation style. |
| **Video** | Upload a clip with **Replace**, or select a stock clip with **Use this**. |
| **Quote** | Choose one of eight designs and edit its text, title, or author fields. |

### Preview an animation before generating the video

For an image or quote scene, the main preview loads automatically when you select the scene or change its animation. Quote previews update after a short pause in typing. Once loaded, use the video controls to play, pause, replay, or view it fullscreen.

This shows the scene’s rendered animation for its full duration, at a lighter preview quality and without audio. For quotes, it previews your current text and style—even before saving. Click **Apply changes** when you want to keep those quote edits. If you change the scene or its design, the preview updates automatically.

### Find a different stock clip

For a video scene, enter a few descriptive words in **Custom stock query**, then click **Refresh**. For example: “ocean sunset” or “family walking”.

Click **Use this** on the clip you want. Up to 24 results are shown; some searches may return fewer.

### Style a quote

Choose **Quote**, then pick a design:

- **Classic** or **Framed** for a quote and its author.
- **Editorial** or **Lower Third** for a title, quote, and author.
- **Bold Statement** for one prominent message.
- **Two Voices** for two pieces of text.
- **Three Thoughts** for three ideas.
- **Spotlight** for a label, title, supporting text, and author.

The preview updates as you type. **Click Apply changes before leaving the scene or generating the video.** Wait until it says **Saved**.

The small design examples are there for inspiration; their sample wording is not automatically added to your scene.

## Use the timeline

- **Select a scene:** click its thumbnail or its entry in the Scenes list.
- **Listen:** use the play button or press **Space** to play or pause the voiceover. Space still types normally inside text fields.
- **Move to another time:** click the timeline ruler or move the playhead.
- **Change the view:** use the **10 sec**, **30 sec**, or minute buttons to show a shorter or longer stretch of the timeline.
- **Show the Scenes list:** click the small toggle beside the timeline view buttons. Hide it again for more editing space.
- **Adjust scene length:** drag the boundary between two scenes.

Timeline playback lets you review the voiceover. Generate the video to see the complete result with scene animations and transitions.

### Split a scene

Move the playhead to where you want the cut. Hover over that scene's thumbnail and click the **scissors** icon.

You can also press **Command+B** on a Mac or **Ctrl+B** on Windows/Linux while outside a text field.

Each new scene must be **longer than one second**, so cuts very close to the beginning or end are unavailable.

### Delete a scene

Hover over the scene's thumbnail and click the **trash** icon.

The next scene becomes longer to fill the gap. If you delete the last scene, the previous scene fills the gap instead. The overall timeline length stays the same.

You cannot delete the only remaining scene.

## Come back to your work

Click **Back to home** to leave the editor. Open **History** to find your projects again.

From History, you can:

- Continue an unfinished project.
- Edit a completed project.
- Watch or download saved videos.
- View earlier generated versions when available.
- Delete a project you no longer need.

**Deleting a project permanently removes its uploaded files and saved videos.** Download anything you want to keep first.

After editing a finished project, click **Regenerate Video** to include your changes in a new video. Editing scenes does not change the previous downloaded video.

## If something goes wrong

| Problem | What to try |
| --- | --- |
| `Cannot find package dotenv` | From the main project folder, run `npm ci --prefix BACKEND --include=dev`, wait for success, then run `npm start`. |
| `vite: command not found` | From the main project folder, run `npm ci --prefix FRONTEND --include=dev`, wait for success, then run `npm run start:frontend`. |
| The application does not open | Check that both Terminal windows are still running. Use the browser address shown in the second window. |
| Creating the scene plan fails | Check your internet connection and try a short audio file. If it still fails, share the error message with the person who configured the application. |
| You do not like the stock results | Try a more specific search, or upload your own clip with **Replace**. |
| Quote changes are missing | Click **Apply changes** and check that it says **Saved**. Generate the video again if needed. |
| The editor feels crowded | Hide the Scenes list, enlarge the browser window, and reset browser zoom to 100%. |
| Generating the video fails | Save the error message from the application or first Terminal window. Resolve the reported issue before using **Retry generation**. The [setup guide](SETUP.md) includes checks for rendering problems. |
| It works on one computer but not another | Ask the person helping you to compare both installations using the [setup guide](SETUP.md). Include a screenshot if the problem is visual. |

Do not delete project folders to try to fix an error. They contain your saved work.

## Keep your work safe

Download your finished videos somewhere easy to find and back up important work.

Projects are saved on the computer running the application; they are not automatically synced between computers. A downloaded video can be copied normally, but moving an **editable project** to another computer may require help because it refers to files on the original machine.

For installation, maintenance, and technical checks, see [SETUP.md](SETUP.md). The current application version is in [VERSION](VERSION).
