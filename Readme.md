# Video Pipeline Studio

Turn a voiceover into a video using your images, stock clips, and quote cards. Review the scenes, customize them, and download the finished video.

## Before you start

You will need:

- A voiceover audio file, such as an MP3, WAV, or M4A.
- Optional reference images you would like to use in the video.
- An internet connection for creating the scene plan and finding stock clips.
- A computer with the application installed and configured.

**Installing on a new computer?** Follow the [installation guide](SETUP.md), or share it with the person helping you set up the application. Setup requires OpenAI and Pexels API keys. OpenAI usage may incur charges.

Windows currently requires an additional setup step called WSL2, explained in the installation guide.

## Open the application

If someone has already created a launcher for you, use it. Otherwise:

1. Open two Terminal windows in the application's folder.
2. In the first, enter:

   ```sh
   npm start
   ```

3. In the second, enter:

   ```sh
   npm run start:frontend
   ```

4. Open **[localhost:5173](http://localhost:5173)** in your browser. If the second Terminal shows a different address, use that address instead.

Keep both Terminal windows open while working. To stop the application after your work finishes, press **Ctrl+C** in each window.

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
