import json, sys, os, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
M = "/tmp/claude-0/-home-user-yhyryjyd/fc87de01-2c56-5994-8dc7-ab313a424a72/scratchpad/tts"
k = Kokoro(f"{M}/kokoro-v1.0.onnx", f"{M}/voices-v1.0.bin")
os.makedirs("voice", exist_ok=True)
total = 0
for key, text in json.load(open("narration.json")).items():
    s, sr = k.create(text, voice="af_heart", speed=0.98, lang="en-us")
    pad = np.zeros(int(sr*0.6), dtype=s.dtype)       # breathing room before/after
    s = np.concatenate([pad, s, pad])
    sf.write(f"voice/{key}.wav", s, sr)
    total += len(s)/sr
    print(f"{key}: {len(s)/sr:.1f}s")
print(f"total {total:.1f}s")
