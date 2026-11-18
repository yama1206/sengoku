"""BGMの元の曲を、ローカルの ComfyUI（ACE-Step 1.5 turbo）で作る。
使い方: python tools/gen_music.py 出力フォルダ [種類 ...] [--seeds N] [--base シードの元] [--sec 秒]
・ComfyUI（127.0.0.1:8188）を直接呼ぶ。キューに他の仕事があれば終わるまで待つ。
・出力フォルダに 種類_シード.mp3 で保存する。同じ名前があれば作らない（上書きしない）。
・歌なし（[Instrumental]、または [区切り] だけの組み立て）。曲の説明は英語のほうが通りやすい。
"""
import json, os, sys, time, random, urllib.request, urllib.error, urllib.parse, uuid

COMFY = "http://127.0.0.1:8188"
CKPT = "ace_step_1.5_turbo_aio.safetensors"
WA = "traditional japanese instruments, sengoku period, no vocals, instrumental, game soundtrack"
# 名前: (曲の説明, bpm, 調, 拍子[, 曲の組み立て])  組み立ては歌詞の欄に [区切り] だけを書いて、どこで何を鳴らすかを伝える
KINDS = {
    # 戦場：太鼓の刻みと法螺貝、尺八と三味線で勇ましく緊迫した合戦の曲
    "battle": ("epic japanese war drum battle music, thunderous taiko ensemble driving rhythm, aggressive shamisen riffs, "
               "piercing shakuhachi and shinobue flute melody, conch shell horn calls, tense and heroic samurai battlefield, "
               "orchestral strings swelling, " + WA, 140, "D minor", "4"),
    # 2.15.0 戦場（速め）：テンポを上げ、途中で止まらず最後まで鳴り続ける
    "battle_fast": ("fast relentless japanese war drum battle music, rapid driving taiko ensemble, aggressive fast shamisen riffs, "
                    "piercing shakuhachi and shinobue flute melody, conch shell horn calls, urgent heroic samurai charge, "
                    "orchestral strings, steady even dynamics, continuous energy from start to end, no breaks, no fade out, " + WA,
                    168, "D minor", "4"),
    # 2.15.0 戦場（暗く重い）：明るさを消し、命の取り合いの緊迫と恐ろしさ
    "battle_dark": ("dark grim deadly japanese battlefield music, life or death struggle, fast pounding low taiko drums, "
                    "heavy ominous low strings ostinato, harsh dissonant shamisen stabs, mournful wailing shakuhachi, "
                    "distant conch horn, cold menacing tension, brutal and desperate, tragic war, horror of killing, "
                    "japanese in-scale minor mode, steady even dynamics, continuous from start to end, " + WA,
                    168, "C minor", "4"),
    # 2.15.0 戦場（さらに暗く）：高く明るい笛を外し、低い唸りと地鳴りの太鼓、死と血の匂い
    "battle_doom": ("pitch black doom japanese battlefield horror music, slaughter and death everywhere, "
                    "deep thunderous low taiko pounding like a heartbeat of war, sub bass drone, dark low cello and contrabass ostinato, "
                    "grinding detuned low shamisen, breathy ghostly low shakuhachi moans, ominous chanting monks low drone, "
                    "funereal, despair, blood, cold dread, dissonant tritone harmony, very low register, gloomy muddy dark timbre, "
                    "japanese in-scale minor mode, steady even dynamics, continuous from start to end, " + WA,
                    168, "Bb minor", "4"),
    # 2.15.0 戦場（和楽器だけ）：最初に法螺貝、そのあと太鼓が「ドンドコドコドンドンドンドン」と刻み続ける
    "battle_wa": ("dark grim japanese battlefield war music played only on traditional japanese instruments, "
                  "solo horagai conch shell trumpet blasts at the opening, then a wadaiko taiko drum ensemble, "
                  "huge odaiko bass drum and shime-daiko, driving taiko groove don dokodoko don don don don, "
                  "heavy repeated taiko pattern, low shakuhachi breaths, sparse dark tsugaru shamisen stabs, kakegoe shouts, "
                  "acoustic, raw, deadly serious, life or death, cold dread, japanese in-scale minor mode, "
                  "steady even dynamics, continuous from start to end, sengoku period, no vocals, instrumental, game soundtrack",
                  168, "Bb minor", "4",
                  "[Intro - horagai conch shell horn solo]\n\n[Main - taiko drum ensemble groove]\n\n"
                  "[Build - taiko with shakuhachi and shamisen]\n\n[Main - taiko drum ensemble groove]\n\n"
                  "[Climax - full taiko ensemble]\n\n[Main - taiko drum ensemble groove]"),
    # 2.15.0 部品：法螺貝だけ（曲の頭につなげる）。AIに組み立てを任せると守られないので、部品で作ってつなぐ
    "horagai": ("solo horagai japanese conch shell trumpet, one single instrument only, long deep mournful horn blasts, "
                "samurai battle signal echoing across a misty mountain valley, natural reverb, acoustic field recording, "
                "no drums, no percussion, no other instruments, sengoku period, instrumental",
                60, "Bb minor", "4", "[Intro - solo conch shell horn]"),
    # 2.15.0 部品：太鼓だけ（ドンドコドコドンドンドンドン）。法螺貝のあとにつなげる
    "taiko": ("wadaiko japanese taiko drum ensemble only, percussion only, no melody, no harmony, "
              "huge deep odaiko bass drum and tight shime-daiko, relentless driving war drum groove, "
              "repeated pattern don dokodoko don don don don, powerful heavy hits, rim clicks, kakegoe shouts, "
              "dark serious battlefield, acoustic, raw, steady even dynamics, continuous from start to end, "
              "sengoku period, instrumental",
              168, "Bb minor", "4", "[Main - taiko drums only]"),
    # 2.15.0 時代劇ふう：昔のテレビ時代劇の合戦・斬り合いの場面で流れるような、張りつめた劇伴
    "jidaigeki": ("classic japanese jidaigeki samurai period drama tv soundtrack, tense sword fight and battle scene underscore, "
                  "dramatic and serious, sharp shamisen and biwa strikes, piercing shakuhachi cries, pounding taiko and tsuzumi, "
                  "hyoshigi wooden clappers, conch horn call, urgent suspense, life or death duel, "
                  "cinematic period drama score, japanese in-scale minor mode, continuous from start to end, "
                  "no vocals, instrumental",
                  168, "D minor", "4",
                  "[Intro - conch horn call]\n\n[Main - tense battle theme]\n\n[Build]\n\n[Main - tense battle theme]\n\n[Climax]\n\n[Main - tense battle theme]"),
    # 2.15.0 時代劇ふう（オーケストラ入り）：時代劇らしい弦と金管のうねりに和楽器を重ねる
    "jidaigeki_orch": ("classic japanese jidaigeki samurai period drama tv soundtrack, battle scene theme, "
                       "dramatic orchestral strings and brass stabs mixed with shakuhachi, shamisen, taiko and tsuzumi, "
                       "tense heroic but serious, grim life or death fight, cinematic period drama score, "
                       "japanese in-scale minor mode, continuous from start to end, no vocals, instrumental",
                       168, "D minor", "4",
                       "[Intro - conch horn call]\n\n[Main - tense battle theme]\n\n[Build]\n\n[Main - tense battle theme]\n\n[Climax]\n\n[Main - tense battle theme]"),
    # 2.15.0 ここからは ACE-Step 1.5 の書き方の決まりに沿う：説明はタグ5〜12個、「no vocals」「instrumental」や数値は書かない、
    # 歌詞の欄は構成タグだけ
    # 王道・大軍勢の激突：重い和太鼓＋映画のようなオーケストラ
    "clash": ("epic battle soundtrack, cinematic orchestra, massive taiko drums, brass section, "
              "dramatic strings, shakuhachi, war horns, grand and heroic, intense, japanese samurai war",
              150, "D minor", "4",
              "[Intro - lone conch horn, distant taiko rumble]\n\n"
              "[Build up - taiko ensemble grows, low strings ostinato]\n\n"
              "[Chorus - full orchestra and taiko, brass main theme]\n\n"
              "[Instrumental - shakuhachi melody over pounding taiko]\n\n"
              "[Chorus - full orchestra and taiko, brass main theme]\n\n"
              "[Outro - massive taiko hits, final brass chord]"),
    # 一騎打ち・刀の斬り合い：疾走する三味線＋ヘヴィロック
    "duel": ("japanese heavy rock, fast tsugaru shamisen, distorted electric guitar, heavy drums, "
             "driving bass, taiko accents, aggressive, intense sword duel, samurai action",
             176, "E minor", "4",
             "[Intro - shamisen solo riff]\n\n"
             "[Build up - guitar and drums kick in, palm muted riffs]\n\n"
             "[Chorus - shamisen and guitar unison main riff]\n\n"
             "[Instrumental - shamisen and guitar trade solos]\n\n"
             "[Chorus - shamisen and guitar unison main riff]\n\n"
             "[Outro - final clash, abrupt stop]"),
    # 出陣前の緊張感：重々しい陣太鼓と不穏な尺八、ゆっくり
    "shutsujin": ("dark cinematic, slow war drums, deep taiko, ominous shakuhachi, low drones, "
                  "biwa, tense, suspenseful, foreboding, japanese samurai",
                  72, "C minor", "4",
                  "[Intro - single deep taiko beats, silence between]\n\n"
                  "[Build up - shakuhachi enters, low drone]\n\n"
                  "[Chorus - steady war drum march, shakuhachi theme]\n\n"
                  "[Instrumental - biwa strikes over slow taiko]\n\n"
                  "[Chorus - steady war drum march, shakuhachi theme]\n\n"
                  "[Outro - drums fade, lone shakuhachi]"),
}


def call(path, body=None, timeout=30):
    r = urllib.request.Request(COMFY + path, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=timeout) as f:
        return f.read()


def wait_idle():
    while True:
        q = json.loads(call("/queue"))
        n = len(q.get("queue_running", [])) + len(q.get("queue_pending", []))
        if not n:
            return
        print(f"  ComfyUI のキューに {n} 件 … 待つ", flush=True)
        time.sleep(20)


def workflow(tags, bpm, key, ts, sec, seed, prefix, lyrics="[Instrumental]"):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "3": {"class_type": "TextEncodeAceStepAudio1.5", "inputs": {
            "clip": ["1", 1], "tags": tags, "lyrics": lyrics, "seed": seed, "bpm": bpm, "duration": sec,
            "timesignature": ts, "language": "en", "keyscale": key, "generate_audio_codes": True,
            "cfg_scale": 2.0, "temperature": 0.85, "top_p": 0.9, "top_k": 0, "min_p": 0.0}},
        "4": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["3", 0]}},
        "5": {"class_type": "EmptyAceStep1.5LatentAudio", "inputs": {"seconds": sec, "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {
            "model": ["2", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0],
            "seed": seed, "steps": 8, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1}},
        "7": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveAudioMP3", "inputs": {"audio": ["7", 0], "filename_prefix": prefix, "quality": "V0"}},
    }


def run(wf):
    pid = json.loads(call("/prompt", {"prompt": wf, "client_id": str(uuid.uuid4())}))["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(3)
        h = json.loads(call("/history/" + pid))
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError(json.dumps(st.get("messages"), ensure_ascii=False)[:1500])
            for out in h[pid]["outputs"].values():
                for a in out.get("audio", []):
                    q = urllib.parse.urlencode({"filename": a["filename"], "subfolder": a["subfolder"], "type": a["type"]})
                    return call("/view?" + q, timeout=120), time.time() - t0
            raise RuntimeError("音の出力が見つからない")
        if time.time() - t0 > 900:
            raise RuntimeError("15分たっても終わらない")


def main():
    a = sys.argv[1:]
    seeds, base, sec = 2, 2150, 90.0
    for flag in ("--seeds", "--base", "--sec"):
        if flag in a:
            i = a.index(flag); v = a[i + 1]; del a[i:i + 2]
            if flag == "--seeds": seeds = int(v)
            elif flag == "--base": base = int(v)
            else: sec = float(v)
    if not a:
        print(__doc__); print("種類:", ", ".join(KINDS)); return
    outdir, kinds = a[0], a[1:] or list(KINDS)
    os.makedirs(outdir, exist_ok=True)
    for k in kinds:
        tags, bpm, key, ts, *rest = KINDS[k]
        lyrics = rest[0] if rest else "[Instrumental]"
        rnd = random.Random(f"{base}-{k}")
        for _ in range(seeds):
            seed = rnd.randrange(1, 2**31)
            path = os.path.join(outdir, f"{k}_{seed}.mp3")
            if os.path.exists(path):
                print("あるので飛ばす:", path); continue
            wait_idle()
            print(f"作る: {k} seed={seed} {sec}秒", flush=True)
            data, dt = run(workflow(tags, bpm, key, ts, sec, seed, f"sengoku/{k}_{seed}", lyrics))
            open(path, "wb").write(data)
            print(f"  保存 {path} ({len(data)//1024}KB, {dt:.0f}秒)", flush=True)


if __name__ == "__main__":
    main()
