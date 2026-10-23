#!/usr/bin/env python3
"""Assemble the DealRadar demo: per-scene slow zoom + voiceover, blur/slide transitions, audio cross-fades.
Inputs: cards/card_intro.webm, cards/card_outro.webm, scenes/<key>.webm, voice/<key>.wav  (missing scenes are skipped with a warning).
Output: dealradar-demo.mp4"""
import json, os, subprocess, sys, shutil
W,H,FPS=1920,1080,30
XF=0.8   # transition length (s)
ORDER=["s1_home","s2_product","s3_alert","s4_extension","s5_automation","s6_code","s7_deploy"]
TRANS=["hblur","smoothleft","dissolve","smoothup","hblur","smoothleft","dissolve","fade"]  # motion-blur style wipes
def dur(f): return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]).decode().strip())
def run(c): print(" ".join(c[:3]),"..."); subprocess.run(c,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
os.makedirs("tmp",exist_ok=True)
clips=[]  # (video_path, audio_path or None, length)
def zoom_clip(src,out,length,zoom_from=1.0,zoom_to=1.06):
    """Fit source to length (loop/trim), apply a slow push-in (Ken Burns), 30fps, h264."""
    n=int(length*FPS)
    vf=(f"scale={W*2}:{H*2},zoompan=z='{zoom_from}+({zoom_to}-{zoom_from})*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},"
        f"format=yuv420p")
    run(["ffmpeg","-y","-stream_loop","-1","-i",src,"-t",f"{length:.3f}","-vf",vf,"-an","-c:v","libx264","-preset","medium","-crf","18","-r",str(FPS),out])
voice={k:f"voice/{k}.wav" for k in ORDER+["s8_outro"]}
# intro card: silent, 5.5 s
zoom_clip("cards/card_intro.webm","tmp/c_intro.mp4",5.5,1.0,1.04); clips.append(("tmp/c_intro.mp4",None,5.5))
for k in ORDER:
    src=f"scenes/{k}.webm"
    if not os.path.exists(src): print(f"!! missing scene {src}, skipped"); continue
    length=max(dur(voice[k])+0.4, dur(src)) if os.path.exists(voice[k]) else dur(src)
    # keep scene video real-time: if voice is longer than the recording, hold the last frame instead of looping
    out=f"tmp/{k}.mp4"; n=int(length*FPS)
    vf=(f"tpad=stop_mode=clone:stop_duration={max(0,length-dur(src)):.3f},scale={W*2}:{H*2},"
        f"zoompan=z='1+0.05*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},format=yuv420p")
    run(["ffmpeg","-y","-i",src,"-t",f"{length:.3f}","-vf",vf,"-an","-c:v","libx264","-preset","medium","-crf","18","-r",str(FPS),out])
    clips.append((out,voice[k] if os.path.exists(voice[k]) else None,length))
L=dur(voice["s8_outro"])+1.5
zoom_clip("cards/card_outro.webm","tmp/c_outro.mp4",L,1.0,1.04); clips.append(("tmp/c_outro.mp4",voice["s8_outro"],L))
# ---- video: chain xfade transitions
ins=[]; fc=[]
for i,(v,a,l) in enumerate(clips): ins+=["-i",v]
off=0; prev="[0:v]"
for i in range(1,len(clips)):
    off+=clips[i-1][2]-XF
    t=TRANS[(i-1)%len(TRANS)]
    fc.append(f"{prev}[{i}:v]xfade=transition={t}:duration={XF}:offset={off:.3f}[v{i}]"); prev=f"[v{i}]"
total=off+clips[-1][2]
# ---- audio: each voice placed at its clip's start, mixed with a soft bed of room tone (silence) so cross-fades stay smooth
aparts=[]; start=0; ai=len(clips)
for i,(v,a,l) in enumerate(clips):
    if a:
        ins+=["-i",a]
        fc.append(f"[{ai}:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.25,afade=t=out:st={dur(a)-0.3:.3f}:d=0.3,adelay={int(start*1000)}|{int(start*1000)}[a{i}]"); aparts.append(f"[a{i}]"); ai+=1
    start+=l-XF
fc.append("".join(aparts)+f"amix=inputs={len(aparts)}:normalize=0,apad=whole_dur={total:.3f}[aout]")
cmd=["ffmpeg","-y"]+ins+["-filter_complex",";".join(fc),"-map",prev,"-map","[aout]","-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart","-t",f"{total:.3f}","dealradar-demo.mp4"]
run(cmd); print(f"done: dealradar-demo.mp4  {total:.1f}s  ({len(clips)} clips)")
