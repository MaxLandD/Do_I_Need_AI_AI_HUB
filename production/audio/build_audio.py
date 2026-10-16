"""Build the full soundtrack: original music, sound effects, voice-over, mix.

Music is composed here note by note (100 BPM, D major) and rendered with the
GeneralUser GS SoundFont (free for any music use, private or commercial).
The score is written on a 100 BPM grid and then played through a tempo map
anchored to the picture (like a film score following the cut), so the story
beats land on downbeats whatever the voice-over timing:
  bar 6   the first task lifts out of the list
  bar 16  the AI slot lights up
  bar 22  "Four times no? Then AI can help." - the music lifts
  bar 23  outro, music settles
  bar 26  final chord under "MSF AI Hub", rings out to the last frame
and the groove stops for one beat on the "freeze" after the Ask AI click.
The tempo stays within a few percent of 100 BPM and changes smoothly.

Sound effects follow the storyboard: five soft ticks as the tasks appear, a
click as the cursor lands, a pop as each card lands (one semitone higher each
time, softer for "You"), and a warm two-note chime when the AI slot lights.

Usage: python3 build_audio.py <cues.json> <voice.mp3> <GeneralUser-GS.sf2> <out_dir>
Writes music.wav, sfx.wav, voice.wav and mix.wav (48 kHz stereo).
"""
import json, os, subprocess, sys
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d
from scipy.interpolate import PchipInterpolator
import tinysoundfont
import pyloudnorm as pyln

SR = 48000
BPM = 100.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4          # sixteenth note
SWING = 0.018            # late off-beat sixteenths, a little bounce

rng = np.random.default_rng(7)

# ----------------------------------------------------------------------------
# harmony
# ----------------------------------------------------------------------------
# name: (bass note, pad voicing, arpeggio tones)
CH = {
    "Dadd9": (38, [54, 57, 62, 64], [62, 66, 69, 74, 76]),
    "Dmaj9": (38, [54, 57, 61, 64], [61, 64, 66, 69, 73]),
    "A/C#":  (37, [52, 57, 61, 64], [61, 64, 69, 73, 76]),
    "Bm7":   (35, [54, 57, 62, 66], [62, 66, 69, 71, 74]),
    "Gmaj7": (31, [54, 59, 62, 66], [62, 66, 67, 71, 74]),
    "Gmaj9": (31, [57, 59, 62, 66], [62, 66, 69, 71, 74]),
    "Em9":   (40, [55, 59, 62, 66], [62, 64, 67, 71, 74]),
    "A11":   (33, [55, 59, 62, 64], [62, 64, 67, 69, 74]),
    "Asus":  (33, [57, 62, 64, 69], [64, 69, 71, 74, 76]),
    "D/F#":  (42, [54, 57, 62, 64], [62, 66, 69, 74, 76]),
}

# one entry per bar (bar n starts at (n-1)*BAR); a tuple splits the bar in halves
FORM = [
    "Dadd9", "Gmaj9",                                   # 1-2   intro
    "Dadd9", "A/C#", "Bm7",                             # 3-5   the reflex (freeze on beat 4 of bar 5)
    "Dadd9", "A/C#", "Bm7", "Gmaj7",                    # 6-9   sorting
    "Dadd9", "A/C#", "Bm7", "Gmaj7",                    # 10-13
    "Em9", "A11",                                       # 14-15 build to the AI moment
    "Dmaj9", "Gmaj9",                                   # 16-17 AI earns its place
    "Bm7", "Gmaj7", "D/F#", ("Asus", "A11"),            # 18-21 the four questions
    "Dadd9",                                            # 22    lift
    "Gmaj7", "D/F#", ("Em9", "A11"),                    # 23-25 outro settles
    "Dmaj9",                                            # 26    final chord
]
N_BARS = len(FORM)

# section of each bar -> which parts play
SECTION = {}
for b in range(1, N_BARS + 1):
    if b <= 2: SECTION[b] = "intro"
    elif b <= 5: SECTION[b] = "reflex"
    elif b <= 13: SECTION[b] = "groove"
    elif b <= 15: SECTION[b] = "build"
    elif b <= 17: SECTION[b] = "peak"
    elif b <= 21: SECTION[b] = "questions"
    elif b == 22: SECTION[b] = "lift"
    elif b <= 25: SECTION[b] = "outro"
    else: SECTION[b] = "final"

FREEZE = (4 * BAR + 3 * BEAT, 5 * BAR)    # bar 5, beat 4: everything rhythmic stops


def bar_t(b):
    return (b - 1) * BAR


def chords_in_bar(b):
    f = FORM[b - 1]
    if isinstance(f, tuple):
        return [(bar_t(b), BAR / 2, f[0]), (bar_t(b) + BAR / 2, BAR / 2, f[1])]
    return [(bar_t(b), BAR, f)]


def chord_at(t):
    b = int(t // BAR) + 1
    b = min(max(b, 1), N_BARS)
    for t0, d, name in chords_in_bar(b):
        if t0 <= t < t0 + d + 1e-9:
            return name
    return chords_in_bar(b)[-1][2]


def step_time(b, step):
    t = bar_t(b) + step * STEP
    if step % 2 == 1:
        t += SWING
    return t


def frozen(t):
    return FREEZE[0] - 0.01 <= t < FREEZE[1] - 0.01


def hum(t, amt=0.006):
    return t + rng.normal(0, amt)


def vel(v, amt=6):
    return int(np.clip(v + rng.normal(0, amt), 1, 127))


# ----------------------------------------------------------------------------
# parts: each returns a list of notes (t, dur, key, velocity)
# ----------------------------------------------------------------------------
def part_pad():
    notes = []
    lvl = {"intro": 62, "reflex": 52, "groove": 46, "build": 60, "peak": 54, "questions": 58,
           "lift": 58, "outro": 60, "final": 66}
    for b in range(1, N_BARS + 1):
        for t0, d, name in chords_in_bar(b):
            dur = d + 0.12
            if b == N_BARS:
                dur = 4.0
            for k in CH[name][1]:
                notes.append((t0, dur, k, vel(lvl[SECTION[b]], 3)))
    return notes


MARIMBA_A = [(0, 0, 92), (2, 2, 70), (3, 3, 78), (6, 1, 86), (8, 2, 74), (10, 4, 84), (11, 3, 70), (14, 1, 80)]
MARIMBA_B = [(0, 0, 92), (3, 2, 76), (4, 3, 72), (6, 4, 86), (8, 2, 74), (11, 1, 80), (12, 3, 72), (14, 2, 82)]


def part_marimba():
    notes = []
    scale = {"intro": 0.62, "reflex": 0.78, "groove": 0.9, "build": 0.95, "peak": 1.0,
             "questions": 0.0, "lift": 1.0, "outro": 0.6, "final": 0.0}
    for b in range(1, N_BARS + 1):
        sc = scale[SECTION[b]]
        if sc == 0:
            continue
        pat = MARIMBA_A if b % 2 else MARIMBA_B
        if SECTION[b] == "intro" and b == 1:
            pat = [p for p in pat if p[0] >= 8]        # enter halfway through bar 1
        for step, idx, v in pat:
            t = step_time(b, step)
            if frozen(t):
                continue
            arp = CH[chord_at(t)][2]
            notes.append((hum(t), STEP * 1.6, arp[idx % len(arp)], vel(v * sc)))
    return notes


def part_bass():
    notes = []
    pat = [(0, 2.6, 0, 96), (3, 1.0, 0, 70), (6, 1.4, 7, 82), (8, 2.2, 0, 90), (11, 1.0, 0, 70), (14, 1.6, 12, 78)]
    for b in range(3, N_BARS + 1):
        sec = SECTION[b]
        if sec in ("questions", "outro"):
            for t0, d, name in chords_in_bar(b):
                notes.append((t0, d * 0.95, CH[name][0], vel(80 if sec == "questions" else 74)))
            continue
        if sec == "final":
            notes.append((bar_t(b), 2.2, CH["Dmaj9"][0], 92))
            continue
        for step, dur, interval, v in pat:
            t = step_time(b, step)
            if frozen(t):
                continue
            root = CH[chord_at(t)][0]
            if b == 15 and step >= 8:                   # pedal into the AI moment
                root = 33
            if sec == "reflex" and step not in (0, 8):
                continue
            notes.append((hum(t, 0.004), dur * STEP, root + interval, vel(v)))
    return notes


def part_ep():
    """Soft electric-piano comping in the groove sections."""
    notes = []
    for b in range(1, N_BARS + 1):
        sec = SECTION[b]
        if sec not in ("groove", "build", "peak", "lift", "outro", "final"):
            continue
        for t0, d, name in chords_in_bar(b):
            voicing = [k + 12 for k in CH[name][1]]
            if sec == "final":
                for i, k in enumerate(voicing):
                    notes.append((t0 + i * 0.035, 3.5, k, vel(58, 3)))
                continue
            if sec == "outro":
                for k in voicing:
                    notes.append((hum(t0), d * 0.9, k, vel(46, 3)))
                continue
            hits = [(0, 5), (10, 3)] if d == BAR else [(0, 4)]
            for step, ln in hits:
                t = t0 + step * STEP + (SWING if step % 2 else 0)
                if frozen(t):
                    continue
                for k in voicing:
                    notes.append((hum(t, 0.004), ln * STEP, k, vel(50, 4)))
    return notes


def part_pizz():
    """Pizzicato arpeggios carry the four questions and the outro."""
    notes = []
    pat = [0, 2, 4, 6, 8, 10, 12, 14]
    order = [0, 2, 1, 3, 2, 4, 3, 1]
    for b in range(1, N_BARS + 1):
        sec = SECTION[b]
        if sec not in ("questions", "outro"):
            continue
        for i, step in enumerate(pat):
            t = step_time(b, step)
            arp = CH[chord_at(t)][2]
            v = 84 if step in (0, 8) else 68
            if sec == "outro":
                v -= 12
            notes.append((hum(t), STEP * 1.5, arp[order[i]] - 12, vel(v)))
    return notes


def part_glock():
    notes = []
    # intro motif (bars 1-2), D major pentatonic
    motif = [(1, 0, 74), (1, 3, 78), (1, 6, 81), (1, 10, 76), (1, 12, 78),
             (2, 0, 79), (2, 3, 78), (2, 6, 74), (2, 10, 71), (2, 12, 74), (2, 14, 76)]
    for b, s, k in motif:
        notes.append((step_time(b, s), STEP * 2, k, vel(58)))
    # the AI moment: a rising sparkle (bar 16)
    run = [74, 78, 81, 85, 86, 88, 90, 93]
    for i, k in enumerate(run):
        notes.append((bar_t(16) + i * STEP * 0.5, STEP * 2, k, vel(52 + i * 3)))
    for s, k in [(4, 86), (6, 85), (8, 81), (12, 78)]:
        notes.append((step_time(16, s), STEP * 2, k, vel(48)))
    # the lift (bar 22)
    for i, k in enumerate([74, 78, 81, 86, 88, 86, 81, 78]):
        notes.append((step_time(22, i * 2), STEP * 2, k, vel(56 - i * 2)))
    # final chord shimmer (bar 26)
    for i, k in enumerate([73, 76, 78, 81, 85, 88]):
        notes.append((bar_t(26) + 0.04 + i * 0.09, 1.2, k, vel(52 - i * 3)))
    return notes


def part_strings():
    notes = []
    for b in (14, 15, 16, 17, 22, 26):
        for t0, d, name in chords_in_bar(b):
            dur = d + 0.1 if b != 26 else 3.6
            v = {14: 46, 15: 58, 16: 66, 17: 54, 22: 68, 26: 60}[b]
            for k in CH[name][1]:
                notes.append((t0, dur, k + 12, vel(v, 3)))
            notes.append((t0, dur, CH[name][0] + 24, vel(v - 6, 3)))
    return notes


KICK, SIDE, CLAP, HAT, SHAKER, TAMB, CRASH, RIDE = 36, 37, 39, 42, 82, 54, 49, 51


def part_drums():
    notes = []
    for b in range(1, N_BARS + 1):
        sec = SECTION[b]
        for s in range(16):
            t = step_time(b, s)
            if frozen(t):
                continue
            hits = []
            if sec in ("reflex", "groove", "build", "peak", "lift"):
                if s in (0, 8): hits.append((KICK, 84 if sec != "reflex" else 66))
                if s == 10 and sec in ("groove", "peak", "lift") and b % 2 == 0: hits.append((KICK, 54))
                if s in (4, 12) and sec != "reflex": hits.append((SIDE, 70))
                if s in (4, 12) and sec in ("peak", "lift"): hits.append((CLAP, 56))
                if s % 2 == 0 and sec != "reflex": hits.append((HAT, 40 if s % 4 else 50))
                hits.append((SHAKER, 54 if s % 2 else 38))
                if s in (4, 12) and sec in ("peak", "lift"): hits.append((TAMB, 44))
            elif sec == "questions":
                if s == 0: hits.append((KICK, 62))
                if s == 8 and b % 2 == 0: hits.append((KICK, 48))
                hits.append((SHAKER, 44 if s % 2 else 30))
            elif sec == "outro":
                if s % 2 == 1: hits.append((SHAKER, 34))
            elif sec == "intro" and b == 2 and s >= 12:
                hits.append((SHAKER, 30 + (s - 12) * 6))
            for k, v in hits:
                notes.append((hum(t, 0.003), 0.2, k, vel(v, 5)))
        # little fill into the AI moment
        if b == 15:
            for i, s in enumerate((12, 13, 14, 15)):
                notes.append((step_time(b, s), 0.1, SIDE, vel(44 + i * 10)))
    for t, v in [(bar_t(16), 56), (bar_t(22), 52)]:
        notes.append((t, 2.0, CRASH, v))
    return notes


# ----------------------------------------------------------------------------
# rendering
# ----------------------------------------------------------------------------
class TempoMap:
    """Score time (seconds at 100 BPM) -> video time, smooth through anchors."""

    def __init__(self, anchors):
        x, y = map(np.asarray, zip(*sorted(anchors)))
        self.x, self.y = x, y
        self.f = PchipInterpolator(x, y, extrapolate=False)
        self.d = self.f.derivative()

    def __call__(self, t):
        t = np.asarray(t, dtype=float)
        lo, hi = self.x[0], self.x[-1]
        out = self.f(np.clip(t, lo, hi))
        out = np.where(t < lo, self.y[0] + (t - lo) * float(self.d(lo)), out)
        out = np.where(t > hi, self.y[-1] + (t - hi) * float(self.d(hi)), out)
        return out if out.ndim else float(out)

    def report(self):
        for (x0, y0), (x1, y1) in zip(zip(self.x, self.y), zip(self.x[1:], self.y[1:])):
            print(f"  bars {x0 / BAR + 1:4.1f}-{x1 / BAR + 1:4.1f}: {100 * (x1 - x0) / (y1 - y0):5.1f} BPM average")


def render_part(sf2, notes, program, total, bank=0, drums=False, pan=64, gain=0.0, warp=None):
    syn = tinysoundfont.Synth(gain=gain, samplerate=SR)
    sfid = syn.sfload(sf2)
    syn.program_select(0, sfid, bank, program, is_drums=drums)
    syn.control_change(0, 10, pan)
    ev = []
    for t, d, k, v in notes:
        t = max(0.0, t)
        on, off = (warp(t), warp(t + d)) if warp else (t, t + d)
        ev.append((off, 0, k, 0))
        ev.append((on, 1, k, v))
    ev.sort(key=lambda e: (e[0], e[1]))
    out = np.zeros((total, 2), np.float32)
    pos = 0
    for t, kind, k, v in ev:
        s = min(total, int(round(t * SR)))
        if s > pos:
            out[pos:s] = np.frombuffer(syn.generate(s - pos), dtype=np.float32).reshape(-1, 2)
            pos = s
        if kind == 1:
            syn.noteon(0, k, v)
        else:
            syn.noteoff(0, k)
    if pos < total:
        out[pos:] = np.frombuffer(syn.generate(total - pos), dtype=np.float32).reshape(-1, 2)
    return out


def reverb_ir(seconds=2.2, predelay=0.018, damp=5500.0):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n + int(predelay * SR), 2))
    for c in range(2):
        noise = rng.normal(0, 1, n)
        b, a = signal.butter(1, damp / (SR / 2), "low")
        noise = signal.lfilter(b, a, noise)
        env = np.exp(-6.9 * t / seconds)                   # -60 dB at `seconds`
        ir[int(predelay * SR):, c] = noise * env
    # a few early reflections
    for d, g in [(0.011, 0.5), (0.019, 0.35), (0.027, 0.3), (0.041, 0.22)]:
        ir[int((predelay + d) * SR), 0] += g
        ir[int((predelay + d * 1.13) * SR), 1] += g
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
    return ir


def apply_reverb(x, ir, wet):
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x + wet * y


def butter(x, f, kind, order=2):
    sos = signal.butter(order, f / (SR / 2), kind, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def peaking(x, f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * A, -2 * np.cos(w0), 1 - alpha * A]
    a = [1 + alpha / A, -2 * np.cos(w0), 1 - alpha / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def env_curve(points, total):
    """Piecewise-linear gain in dB from (time, dB) points."""
    t = np.arange(total) / SR
    ts, ds = zip(*points)
    return 10 ** (np.interp(t, ts, ds) / 20)


# ----------------------------------------------------------------------------
# sound effects (synthesised)
# ----------------------------------------------------------------------------
def sfx_tick(f=2100.0, length=0.07, level=1.0):
    t = np.arange(int(length * SR)) / SR
    tone = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) + 0.4 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t / 0.006)
    click = rng.normal(0, 1, len(t)) * np.exp(-t / 0.0015) * 0.3
    return level * (tone + click)


def sfx_click(level=1.0):
    out = np.zeros(int(0.12 * SR))
    for off, g in [(0.0, 1.0), (0.055, 0.6)]:
        n = int(0.006 * SR)
        burst = rng.normal(0, 1, n) * np.exp(-np.arange(n) / (0.0012 * SR))
        burst = butter(burst, 2500, "high", 2)
        s = int(off * SR)
        out[s:s + n] += g * burst
        t = np.arange(int(0.03 * SR)) / SR
        out[s:s + len(t)] += g * 0.5 * np.sin(2 * np.pi * 1400 * t) * np.exp(-t / 0.004)
    return level * out


def sfx_pop(f, level=1.0, soft=False):
    length = 0.28 if soft else 0.2
    t = np.arange(int(length * SR)) / SR
    sweep = f * (1 + 0.55 * np.exp(-t / 0.012))          # quick downward blip
    phase = 2 * np.pi * np.cumsum(sweep) / SR
    dec = 0.07 if soft else 0.05
    body = np.sin(phase) * np.exp(-t / dec) + 0.25 * np.sin(2 * phase) * np.exp(-t / (dec * 0.5))
    thump = 0.5 * np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.03)
    att = np.clip(t / (0.004 if soft else 0.0015), 0, 1)
    x = (body + thump) * att
    if soft:
        x = butter(x, 2600, "low", 2)
    return level * x


def sfx_whoosh(length=0.6, f0=500, f1=2600, level=1.0, rise=0.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    out = np.zeros(n)
    hop = 512
    zi = None
    for i in range(0, n, hop):
        p = i / n
        fc = f0 * (f1 / f0) ** p
        sos = signal.butter(2, [fc / 1.6 / (SR / 2), min(0.99, fc * 1.6 / (SR / 2))], "band", output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        seg, zi = signal.sosfilt(sos, noise[i:i + hop], zi=zi)
        out[i:i + hop] = seg
    env = np.where(t < rise * length, (t / (rise * length)) ** 2, np.exp(-(t - rise * length) / (0.25 * length)))
    return level * out * env / (np.abs(out).max() + 1e-9)


def sfx_riser(length=1.0, level=1.0):
    return sfx_whoosh(length, 300, 5000, level, rise=0.92)


def place(buf, x, t, pan=0.0):
    s = int(round(t * SR))
    if s >= len(buf):
        return
    x = x[: len(buf) - s]
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[s:s + len(x), 0] += x * gl * np.sqrt(2)
    buf[s:s + len(x), 1] += x * gr * np.sqrt(2)


def midi_hz(k):
    return 440.0 * 2 ** ((k - 69) / 12)


# ----------------------------------------------------------------------------
def main():
    cues_path, voice_path, sf2, out_dir = sys.argv[1:5]
    os.makedirs(out_dir, exist_ok=True)
    meta = json.load(open(cues_path))
    C, TM = meta["cues"], meta["timing"]
    dur = TM["duration"]
    total = int(round(dur * SR))

    # ---------------- music ----------------
    warp = TempoMap([
        (0.0, 0.0),
        (bar_t(6), C["lift"] + 0.22),          # the first task lifts out of the list
        (bar_t(16), C["land"][4]),             # the AI slot lights up
        (bar_t(22), C["closing"] + 0.20),      # "Four times no? Then AI can help."
        (bar_t(23), C["outro"] + 0.05),        # fade through dark teal
        (bar_t(26), C["finalChord"]),          # "...on the MSF AI Hub."
    ])
    warp.report()
    parts = [
        # name, notes, program, bank, drums, pan, gain_db, reverb
        ("pad", part_pad(), 89, 0, False, 64, -4.0, 0.30),
        ("marimba", part_marimba(), 12, 0, False, 50, -1.0, 0.22),
        ("bass", part_bass(), 33, 0, False, 64, -1.5, 0.04),
        ("ep", part_ep(), 4, 0, False, 80, -3.0, 0.25),
        ("pizz", part_pizz(), 45, 0, False, 46, -2.0, 0.25),
        ("glock", part_glock(), 9, 0, False, 84, -6.0, 0.40),
        ("strings", part_strings(), 49, 0, False, 64, -5.0, 0.35),
        ("drums", part_drums(), 0, 128, True, 64, -3.0, 0.10),
    ]
    ir = reverb_ir()
    music = np.zeros((total, 2))
    for name, notes, prog, bank, drums, pan, g, wet in parts:
        x = render_part(sf2, notes, prog, total, bank=bank, drums=drums, pan=pan, warp=warp).astype(np.float64)
        x *= 10 ** (g / 20)
        x = apply_reverb(x, ir, wet)
        music += x
        print(f"  part {name:8s} {len(notes):4d} notes, peak {np.abs(x).max():.3f}")

    # the freeze: let the pad breathe, then a soft riser into the lift of the first card
    f0, f1 = warp(FREEZE[0]), warp(FREEZE[1])
    riser = sfx_riser(f1 - f0 + 0.05, 1.0)
    place(music, 0.10 * butter(riser, 6000, "low", 2), f0 + 0.02)

    # shape: fade in, overall arc, ending exactly on the last frame
    score_arc = [(0.35, -3), (4.8, -1.5), (12.0, 0), (31.2, 0), (36.0, 1.0), (40.8, -0.5),
                 (50.4, 0.5), (51.6, 1.5), (52.8, 0), (59.9, -0.5), (60.0, 0)]
    arc = env_curve([(0.0, -40)] + [(warp(t), db) for t, db in score_arc] +
                    [(dur - 1.6, -2.5), (dur - 0.05, -40), (dur, -60)], total)
    music *= arc[:, None]
    music = butter(music, 45, "high", 2)
    music = peaking(music, 2800, -3.0, 0.8)          # leave room for the voice
    music = peaking(music, 300, -2.5, 0.9)           # and keep the low mids clear

    # ---------------- voice ----------------
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", voice_path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    v = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    v = butter(v, 70, "high", 2)
    voice = np.zeros(total)
    s0 = int(round(TM["voOffset"] * SR))
    voice[s0:s0 + len(v)] = v[: total - s0]

    # ---------------- ducking (music sits under the voice) ----------------
    hop = int(0.01 * SR)
    rms = np.sqrt(np.convolve(voice ** 2, np.ones(hop) / hop, mode="same") + 1e-12)
    db = 20 * np.log10(rms + 1e-9)
    speech = np.clip((db + 48) / 14, 0, 1)
    sm = np.zeros_like(speech)
    a_att, a_rel = np.exp(-1 / (0.04 * SR)), np.exp(-1 / (0.30 * SR))
    acc = 0.0
    for i, x in enumerate(speech):
        a = a_att if x > acc else a_rel
        acc = a * acc + (1 - a) * x
        sm[i] = acc
    duck = 10 ** (-8.0 * sm / 20)
    meter0 = pyln.Meter(SR)
    music *= 10 ** ((-23.5 - meter0.integrated_loudness(music)) / 20)   # bed level before ducking
    music *= duck[:, None]

    # ---------------- sound effects ----------------
    fx = np.zeros((total, 2))
    for i, t in enumerate(C["rows"]):                                   # five soft ticks
        place(fx, sfx_tick(1900 + i * 120, level=0.16), t + 0.02, pan=-0.35)
    place(fx, sfx_click(0.30), C["click"] - 0.01, pan=0.3)               # cursor click
    place(fx, sfx_whoosh(0.55, 400, 2400, 0.10), C["introOut"] + 0.05)
    place(fx, sfx_whoosh(0.65, 350, 2200, 0.12), C["lift"])              # card lifts out
    base = midi_hz(74)                                                   # D5
    for k in range(4):
        place(fx, sfx_whoosh(0.55, 700, 2600, 0.05, rise=0.7), C["depart"][k] + 0.05, pan=-0.2 + 0.15 * k)
        f = base * 2 ** (k / 12)                                         # one semitone higher each time
        place(fx, sfx_pop(f, level=0.30 if k < 3 else 0.24, soft=(k == 3)), C["land"][k] - 0.01, pan=-0.45 + 0.25 * k)
    place(fx, sfx_whoosh(0.55, 700, 2600, 0.05, rise=0.7), C["depart"][4] + 0.05, pan=0.4)
    # warm two-note chime as the AI slot lights (vibraphone + celeste, A5 then D6)
    chime_notes = [(C["land"][4], 1.6, 81, 92), (C["land"][4] + 0.14, 2.2, 86, 96)]
    chime = render_part(sf2, chime_notes, 11, total, pan=80).astype(np.float64) * 0.75
    chime += render_part(sf2, chime_notes, 8, total, pan=80).astype(np.float64) * 0.35
    fx += apply_reverb(chime, ir, 0.35)
    place(fx, sfx_whoosh(0.6, 300, 1800, 0.10), C["away"])               # slots slide away
    for j, t in enumerate(C["chips"]):                                   # chips appear
        place(fx, sfx_tick(1250 + j * 90, length=0.09, level=0.12), t + 0.04, pan=-0.45 + 0.3 * j)
    place(fx, sfx_whoosh(0.6, 300, 1600, 0.09), C["outro"])              # fade through dark teal
    place(fx, sfx_whoosh(0.6, 500, 2200, 0.08), C["hub"])                # hub card
    place(fx, sfx_whoosh(0.7, 600, 3000, 0.07), C["logo"], pan=0.4)      # logo settles
    fx = butter(fx, 120, "high", 2)

    # ---------------- levels & master ----------------
    meter = pyln.Meter(SR)
    v_st = np.stack([voice, voice], axis=1)
    lv = meter.integrated_loudness(v_st)
    v_st *= 10 ** ((-17.0 - lv) / 20)                                     # voice anchor
    fx *= 10 ** ((-17.0 - lv) / 20) * 0.55                                # effects follow the voice gain
    mix = v_st + music + fx
    lmix = meter.integrated_loudness(mix)
    mix *= 10 ** ((-16.0 - lmix) / 20)
    # true-peak-safe limiter (4x oversampled peak detection, smooth gain)
    up = signal.resample_poly(mix, 4, 1, axis=0)
    pk = np.abs(up).max(axis=1).reshape(-1, 4).max(axis=1)[:total]
    ceiling = 10 ** (-1.5 / 20)
    g = np.minimum(1.0, ceiling / np.maximum(pk, 1e-9))
    win = int(0.004 * SR)
    gmin = minimum_filter1d(g, size=2 * win + 1, origin=0)              # 4 ms look-ahead around each peak
    rel = np.exp(-1 / (0.08 * SR))
    gs = np.empty_like(gmin)
    acc = 1.0
    for i, x in enumerate(gmin):
        acc = x if x < acc else rel * acc + (1 - rel) * x
        gs[i] = acc
    mix *= gs[:, None]

    def wav(name, x):
        import wave
        x = np.clip(x, -1, 1)
        with wave.open(os.path.join(out_dir, name), "wb") as f:
            f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
            f.writeframes((x * 32767).astype("<i2").tobytes())

    wav("music.wav", music)
    wav("sfx.wav", fx)
    wav("voice.wav", v_st)
    wav("mix.wav", mix)
    print(f"voice {meter.integrated_loudness(v_st):.1f} LUFS, music bed {meter.integrated_loudness(music):.1f} LUFS, "
          f"mix {meter.integrated_loudness(mix):.1f} LUFS, peak {20*np.log10(np.abs(mix).max()):.2f} dBFS, "
          f"limiter max reduction {20*np.log10(gs.min()):.2f} dB")


if __name__ == "__main__":
    main()
