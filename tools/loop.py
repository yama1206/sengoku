"""曲の一部（サビなど）を繰り返せるように、つなぎ目を整える。
ComfyUI の Python で動かす（tame.py と同じ）:
  python tools/loop.py 入力.mp3 出力の頭 開始秒 終了秒 [--times N] [--xfade 秒]
・開始秒と終了秒は拍の頭に合わせて渡す（だいたいで良い。±15ms の中で一番つながる所に合わせ直す）
・終了の直前を、開始の直前の音へなめらかに移しておく。こうすると終了→開始へ飛んでも、ぷつっと鳴らない
・出力: 頭.mp3（曲の最初から終了のすぐ後まで。ゲームでは開始〜終了を繰り返す）、頭.json（繰り返しの開始・終了の秒）、
        頭_preview.mp3（最初から流して、繰り返しを N 回つなげた試し聞き用）
"""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tame


def refine(m, sr, a, b, win=0.015, look=0.03):
    """b の位置を ±win 秒動かして、b の直前の波形が a の直前の波形と一番そろう所を探す"""
    L = int(look * sr); W = int(win * sr)
    ref = m[a - L:a]
    best = (-9, b)
    for d in range(-W, W + 1):
        seg = m[b + d - L:b + d]
        c = np.dot(ref, seg) / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-9)
        if c > best[0]:
            best = (c, b + d)
    return best


def main():
    a = sys.argv[1:]
    times, xf = 4, 0.06
    if "--times" in a:
        i = a.index("--times"); times = int(a[i + 1]); del a[i:i + 2]
    if "--xfade" in a:  # 2.20.0 つなぎ目を重ねる長さ（秒）。静かな曲は長めにするとなじむ
        i = a.index("--xfade"); xf = float(a[i + 1]); del a[i:i + 2]
    src, head, t0, t1 = a[0], a[1], float(a[2]), float(a[3])
    x, sr = tame.load(src)
    m = x.mean(axis=0)
    s, e = int(t0 * sr), int(t1 * sr)
    c, e = refine(m, sr, s, e)
    print(f"繰り返し {s / sr:.3f}秒 → {e / sr:.3f}秒（{(e - s) / sr:.2f}秒）つなぎ目のそろい具合 {c:.2f}")
    # 終了の 0.1 秒前からは、開始の 0.1 秒前からの音をそのまま写し、終了のあとにも開始のあとの音を 0.2 秒つけておく。
    # mp3 は読み込むブラウザによって頭に数十msのずれが入るが、ずれが 0.1 秒までなら飛ぶ前後の音がぴったり同じになる
    hold, tail, f = int(0.1 * sr), int(0.2 * sr), int(xf * sr)
    tail = min(tail, x.shape[1] - s)
    y = np.concatenate([x[:, :e], x[:, s:s + tail]], axis=1)
    y[:, e - hold:e] = x[:, s - hold:s]
    w = np.linspace(0, 1, f, dtype=np.float32)
    y[:, e - hold - f:e - hold] = x[:, e - hold - f:e - hold] * (1 - w) + x[:, s - hold - f:s - hold] * w
    tame.save(head + ".mp3", y, sr)
    json.dump({"loopStart": round(s / sr, 4), "loopEnd": round(e / sr, 4)}, open(head + ".json", "w"))
    pv = np.concatenate([y[:, :e]] + [y[:, s:e]] * (times - 1), axis=1)
    fo = int(2 * sr); pv[:, -fo:] *= np.linspace(1, 0, fo, dtype=np.float32)
    tame.save(head + "_preview.mp3", pv, sr)
    print(f"保存 {head}.mp3 / {head}.json / {head}_preview.mp3（{pv.shape[1] / sr:.1f}秒）")


if __name__ == "__main__":
    main()
