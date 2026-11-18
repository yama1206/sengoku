"""BGMの音量の差を縮める（小さい音と、太鼓のドンという大きい音の差をならす）。
ComfyUI の Python（numpy・av が入っている）で動かす:
  "%LOCALAPPDATA%\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\.venv\\Scripts\\python.exe" tools/tame.py 入力.mp3 出力.mp3 [--strength 1.0]
  --measure だけ付けると測るだけ（出力は作らない）
仕組み:
 1) ゆっくり効く音量ならし（0.4秒くらいの平均で、静かな所を持ち上げ大きい所を下げる）
 2) 速く効く圧縮（ドンの立ち上がりを数msで抑える）
 3) 全体の音量をそろえ、最後に割れないよう天井をかける
"""
import sys
import numpy as np
import av


def load(path):
    c = av.open(path)
    s = c.streams.audio[0]
    sr = s.rate
    rs = av.AudioResampler(format="fltp", layout="stereo", rate=sr)
    parts = []
    for fr in c.decode(s):
        for f in rs.resample(fr):
            parts.append(f.to_ndarray())
    c.close()
    return np.concatenate(parts, axis=1).astype(np.float32), sr


def save(path, x, sr):
    c = av.open(path, "w")
    s = c.add_stream("libmp3lame", rate=sr)
    s.layout = "stereo"
    s.bit_rate = 256000
    n = 1152
    for i in range(0, x.shape[1], n):
        fr = av.AudioFrame.from_ndarray(np.ascontiguousarray(x[:, i:i + n]), format="fltp", layout="stereo")
        fr.sample_rate = sr
        for p in s.encode(fr):
            c.mux(p)
    for p in s.encode(None):
        c.mux(p)
    c.close()


def db(v):
    return 20 * np.log10(np.maximum(v, 1e-9))


def measure(x, sr, name):
    m = np.abs(x).max(axis=0)
    w = int(sr * 0.4)
    k = len(m) // w
    rms = np.sqrt((x[:, :k * w] ** 2).mean(axis=0).reshape(k, w).mean(axis=1))
    pk = m[:k * w].reshape(k, w).max(axis=1)
    loud = db(rms)
    act = loud[loud > loud.max() - 40]  # 無音の所は数えない
    p10, p50, p95 = np.percentile(act, [10, 50, 95])
    crest = np.median(db(pk) - db(rms))
    print(f"{name}: 0.4秒ごとの音量 静か(10%)={p10:.1f}dB 中央={p50:.1f}dB 大(95%)={p95:.1f}dB  差={p95 - p10:.1f}dB"
          f"  一瞬の山と平均の差={crest:.1f}dB  最大={db(m.max()):.1f}dB")


def follow(det_db, att, rel):
    """dB の検出値を、上がる時 att・下がる時 rel（ブロック数の時定数）でなめらかに追う"""
    a, r = np.exp(-1 / max(att, 1e-3)), np.exp(-1 / max(rel, 1e-3))
    out = np.empty_like(det_db)
    y = det_db[0]
    for i, v in enumerate(det_db):
        c = a if v > y else r
        y = c * y + (1 - c) * v
        out[i] = y
    return out


def comp(x, sr, blk, thr, ratio, att_ms, rel_ms, use_rms):
    n = x.shape[1] // blk
    seg = x[:, :n * blk].reshape(2, n, blk)
    det = np.sqrt((seg ** 2).mean(axis=(0, 2))) if use_rms else np.abs(seg).max(axis=(0, 2))
    lv = follow(db(det), att_ms * sr / 1000 / blk, rel_ms * sr / 1000 / blk)
    over = np.maximum(lv - thr, 0)
    g_db = -over * (1 - 1 / ratio)
    t = (np.arange(n) + 0.5) * blk
    g = 10 ** (np.interp(np.arange(x.shape[1]), t, g_db) / 20)
    return x * g


def punch(x, sr, thr, ratio, look_ms=5, rel_ms=150, blk=32):
    """先読みの圧縮：ドンが来る少し前から音量を下げ始めるので、立ち上がりの山も逃がさない"""
    n = x.shape[1] // blk
    pk = db(np.abs(x[:, :n * blk].reshape(2, n, blk)).max(axis=(0, 2)))
    g = -np.maximum(pk - thr, 0) * (1 - 1 / ratio)
    L = max(1, int(look_ms * sr / 1000 / blk))
    gp = np.pad(g, (L, L), mode="edge")
    g = np.lib.stride_tricks.sliding_window_view(gp, 2 * L + 1).min(axis=1)  # 前後 L の一番下げる量
    r = np.exp(-1 / (rel_ms * sr / 1000 / blk))
    out = np.empty_like(g); y = 0.0
    for i, v in enumerate(g):  # 下げるのはすぐ、戻すのはゆっくり
        y = v if v < y else r * y + (1 - r) * v
        out[i] = y
    k = np.ones(L) / L
    out = np.convolve(np.pad(out, (L, L), mode="edge"), k, mode="same")[L:-L]  # ぷつっと鳴らないようになめらかに
    t = (np.arange(n) + 0.5) * blk
    return x * 10 ** (np.interp(np.arange(x.shape[1]), t, out) / 20)


def trim_tail(x, sr):
    """最後の無音を切り、終わりを0.5秒で消す"""
    m = np.abs(x).max(axis=0)
    loud = np.nonzero(m > 10 ** (-45 / 20))[0]
    end = min(x.shape[1], (loud[-1] if len(loud) else x.shape[1]) + int(sr * 0.3))
    y = x[:, :end].copy()
    f = min(int(sr * 0.5), end)
    y[:, end - f:] *= np.linspace(1, 0, f, dtype=np.float32)
    return y


def tame(x, sr, strength=1.0):
    def ref(y):  # 鳴っている所の音量（中央）
        w = int(sr * 0.4); k = y.shape[1] // w
        r = db(np.sqrt((y[:, :k * w] ** 2).mean(axis=0).reshape(k, w).mean(axis=1)))
        return np.median(r[r > r.max() - 40])
    m = ref(x)
    # 1) ゆっくりならす：中央より上を 1:2.5 で下げる
    y = comp(x, sr, 512, m - 2, 1 + 1.5 * strength, 80, 600, True)
    # 2) ドンの山を先読みで抑える：平均より6dB上の山を 1:6 で
    m2 = ref(y)
    y = punch(y, sr, m2 + 6, 1 + 5 * strength)
    # 3) 音量をそろえる（鳴っている所の平均を -18dB に）→ 天井 -1dB
    y = y * 10 ** ((-18 - ref(y)) / 20)
    y = punch(y, sr, -3, 20, 2, 60, 16)
    pk = np.abs(y).max()
    if pk > 0.89:
        y = y * (0.89 / pk)
    return y.astype(np.float32)


def main():
    a = sys.argv[1:]
    strength = 1.0
    if "--strength" in a:
        i = a.index("--strength"); strength = float(a[i + 1]); del a[i:i + 2]
    x, sr = load(a[0])
    measure(x, sr, "元")
    if "--measure" in a or len(a) < 2:
        return
    x = trim_tail(x, sr)
    print(f"長さ {x.shape[1] / sr:.1f}秒（最後の無音を切った）")
    y = tame(x, sr, strength)
    measure(y, sr, "後")
    save(a[1], y, sr)
    print("保存", a[1])


if __name__ == "__main__":
    main()
