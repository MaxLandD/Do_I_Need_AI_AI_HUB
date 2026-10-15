# HOME-07 · Do I need AI for this? · video production

Source for the AI Hub home-page video, built from the storyboard
(`HOME-07_…_Storyboard_…pdf`), the key frames and captions (`…KeyFramesAndCaptions….zip`)
and the ElevenLabs voice-over in the repository root.

## Deliverables (`/output`)

| File | What |
| --- | --- |
| `HOME-07_DoINeedAIForThis_EN_v2.mp4` | 1920 × 1080, 16:9, 30 fps, H.264 High, yuv420p, BT.709, +faststart, AAC 48 kHz stereo, captions burned in |
| `HOME-07_DoINeedAIForThis_captions_EN_v2.srt` | Captions retimed to the supplied voice-over, word for word as in the script |
| `HOME-07_DoINeedAIForThis_EN_v2_thumbnail.png` | Scene 7 still: four ticks and the lit AI slot (no caption) |

## Timing

The video follows the supplied voice-over, which runs 60.4 s, not the 58.5 s planned in
the storyboard. The voice starts at 0:00.9, once the intro title has landed, and the last frame
is held one second after the voice ends, so the video runs **62.1 s (1863 frames)**.
Every animation cue comes from a forced alignment of the voice-over (`data/voice_words.json`),
so each card lands on the words that name its tool.

## How it is built

```
./build.sh
```

1. `tools/align_voice.py` aligns the 144 words of the script to the voice-over (PocketSphinx).
2. `tools/gen_data.py` writes the caption cues, the SRT and the icon data.
3. `animation/` is a deterministic HTML page (`render(t)` draws the frame at time *t*),
   which `render.js` records frame by frame with headless Chromium.
4. `audio/build_audio.py` composes and renders the music, synthesises the sound effects,
   ducks the music under the voice and masters the mix to −16 LUFS (−1.5 dBTP).
5. ffmpeg encodes the MP4.

## Sound

* **Music:** an original piece written for this video (100 BPM, D major: marimba, pad, finger bass,
  electric piano, pizzicato, glockenspiel, strings, light percussion). The bar grid puts the AI slot
  lighting up on a downbeat (bar 16), lifts on "Four times no? Then AI can help." (bar 22), settles for
  the outro and ends on a final chord that rings out to the last frame. The groove stops for one beat
  on the freeze after the Ask AI click.
* **Effects (storyboard):** five soft ticks as the tasks appear, a click as the cursor lands, a pop as
  each card lands (one semitone higher each time, softer for "You"), a warm two-note chime when the
  AI slot lights, plus very soft whooshes on transitions.

## Assets and licences

* Arimo font: Apache License 2.0 (Google Fonts).
* Icons: Font Awesome Free 6.5.2, CC BY 4.0 (`animation/assets/icons/LICENSE-FontAwesome.txt`).
* AI Accelerator logo: taken from the storyboard PDF.
* Music: rendered with GeneralUser GS v2.0.3 by S. Christian Collins, which may be used without
  restriction for music creation, private or commercial. The SoundFont is downloaded at build time
  and is not stored in this repository.
