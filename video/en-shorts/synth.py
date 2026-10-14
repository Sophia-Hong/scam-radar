"""쇼츠 소리: 키 타이핑(직접 합성) + 장면 전환 '톡'. 저작권 소재 0. timing.json → keys.wav (44.1kHz 모노 16bit)."""
import json, math, random, struct, wave, sys
from pathlib import Path
HERE = Path(__file__).parent
t = json.loads((HERE / "timing.json").read_text())
SR = 44100
N = int(SR * t["T"])
buf = [0.0] * N
rnd = random.Random(7)

def add(at, samples):
    i0 = int(at * SR)
    for k, s in enumerate(samples):
        if 0 <= i0 + k < N:
            buf[i0 + k] += s

def key(amp):
    out = []
    f = 170 + rnd.random() * 40
    for k in range(int(0.045 * SR)):
        x = k / SR
        click = (rnd.random() * 2 - 1) * math.exp(-x / 0.0022) * 0.9           # 딸깍
        thock = math.sin(2 * math.pi * f * x) * math.exp(-x / 0.012) * 0.6      # 톡
        tail = (rnd.random() * 2 - 1) * math.exp(-x / 0.010) * 0.12
        out.append(amp * (click + thock + tail))
    return out

def pop(amp):
    out = []
    for k in range(int(0.16 * SR)):
        x = k / SR
        f = 620 - 1600 * x
        out.append(amp * math.sin(2 * math.pi * f * x) * math.exp(-x / 0.045) * min(1, x / 0.004))
    return out

for at in t["KEYS"]:
    add(at + (rnd.random() - .5) * 0.018, key(0.22 + rnd.random() * 0.12))
for at in t["POPS"]:
    add(at, pop(0.28))
peak = max(1e-9, max(abs(s) for s in buf))
g = 0.8 / peak if peak > 0.8 else 1.0
with wave.open(str(HERE / "keys.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * g)) * 32767)) for s in buf))
print("keys.wav", len(t["KEYS"]), "keys", len(t["POPS"]), "pops", f"{N/SR:.1f}s")
