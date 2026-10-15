"""Forced-align the voice-over against the script (PocketSphinx).

    python3 tools/align_voice.py <voice.mp3>   ->  data/voice_words.json

Gives start/end times (voice-over time base) for every one of the 144 words,
grouped by caption line. Everything else (captions, animation cues, sound
effects) is derived from this file. Needs: pip install pocketsphinx, ffmpeg.
"""
import json, os, re, subprocess, sys
import numpy as np
from pocketsphinx import Config, Decoder, get_model_path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LINES = [
    "AI is a great tool.",
    "But you don't need it for everything.",
    "A normal day. Five tasks.",
    "And the same reflex every time: open AI.",
    "Add up three invoices?",
    "No need for AI. A calculator is faster.",
    "Check the cold chain procedure?",
    "MSF already wrote it down. Go to the guideline.",
    "A two-line reply? Just type it.",
    "Asking AI would take longer.",
    "A colleague's evaluation? That needs you:",
    "your judgement, your words, your relationship.",
    "A forty-page report to summarise?",
    "Now AI earns its place.",
    "It saves real time. You still check it.",
    "So, before you open AI, ask yourself four questions.",
    "A simpler tool? Already written down?",
    "Does it need me? Quicker to do it myself?",
    "Four times no? Then AI can help.",
    "Sensitive, about a person, or unsure? Pause and ask.",
    "You will find everything else on the MSF AI Hub.",
]

# pronunciations missing from (or wrong in) the CMU dictionary
EXTRA = {"ai": "EY AY", "msf": "EH M EH S EH F", "summarise": "S AH M ER AY Z"}


def tokens(line):
    return [w.lower() for w in re.findall(r"[A-Za-z0-9']+", line.replace("-", " "))]


def main(voice):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", voice, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    mp = get_model_path()
    dict_path = os.path.join(ROOT, "data", "custom.dict")
    with open(dict_path, "w") as f:
        f.write(open(os.path.join(mp, "en-us", "cmudict-en-us.dict")).read())
        for k, v in EXTRA.items():
            f.write(f"{k} {v}\n")
    toks, line_of = [], []
    for li, l in enumerate(LINES):
        t = tokens(l)
        toks += t
        line_of += [li] * len(t)

    cfg = Config(hmm=os.path.join(mp, "en-us", "en-us"), dict=dict_path, samprate=16000, loglevel="FATAL")
    dec = Decoder(cfg)
    dec.set_align_text(" ".join(toks))
    dec.start_utt()
    dec.process_raw(pcm, full_utt=True)
    dec.end_utt()
    words = []
    for seg in dec.seg():
        if seg.word in ("<s>", "</s>", "<sil>", "(NULL)") or seg.word.startswith(("[", "++")):
            continue
        words.append({"w": re.sub(r"\(\d+\)$", "", seg.word),
                      "start": round(seg.start_frame / 100, 3), "end": round((seg.end_frame + 1) / 100, 3)})
    os.remove(dict_path)
    if len(words) != len(toks):
        sys.exit(f"alignment failed: {len(words)} words aligned, {len(toks)} expected")
    for w, li in zip(words, line_of):
        w["line"] = li
    json.dump({"lines": LINES, "words": words}, open(os.path.join(ROOT, "data", "voice_words.json"), "w"), indent=1)
    print(f"aligned {len(words)} words, speech {words[0]['start']:.2f}s to {words[-1]['end']:.2f}s")


if __name__ == "__main__":
    main(sys.argv[1])
