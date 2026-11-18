"""曲の部品をつなげて1曲にする（例：法螺貝 → 太鼓）。つなぎ目は少し重ねてなめらかにし、最後に tame で音量をならす。
ComfyUI の Python で動かす（tame.py と同じ）:
  python tools/join.py 出力.mp3 部品1.mp3 部品2.mp3 ... [--overlap 秒]
"""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tame


def main():
    a = sys.argv[1:]
    ov = 0.4
    if "--overlap" in a:
        i = a.index("--overlap"); ov = float(a[i + 1]); del a[i:i + 2]
    out, parts = a[0], a[1:]
    y, sr = None, None
    for p in parts:
        x, r = tame.load(p)
        x = tame.trim_tail(x, r)
        if y is None:
            y, sr = x, r; continue
        n = min(int(sr * ov), y.shape[1], x.shape[1])
        f = np.linspace(0, 1, n, dtype=np.float32)
        mid = y[:, -n:] * (1 - f) + x[:, :n] * f
        y = np.concatenate([y[:, :-n], mid, x[:, n:]], axis=1)
    tame.measure(y, sr, "つないだ")
    y = tame.tame(y, sr)
    tame.save(out, y, sr)
    print(f"保存 {out}（{y.shape[1] / sr:.1f}秒）")


if __name__ == "__main__":
    main()
