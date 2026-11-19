"""2.20.0 曲の中で「ここからここまでを繰り返すと自然につながる」位置を探す（拍の頭にそろえる）。
ComfyUI の Python で動かす（tame.py と同じ）:
  python tools/loopfind.py 曲.mp3 [--bpm 指定のテンポ] [--only（半分・倍を試さない）] [--from 開始を探す最初の秒] [--top N]
・拍の速さと位置を音の立ち上がりから割り出し（指定のテンポの近く、半分・倍も試す）、拍ごとの音の特徴を比べる
・開始は曲の前の方（--from 秒〜3割）、終わりは曲の後ろの方（7割〜最後）で、1小節（4拍）の倍数の長さだけを見る
・つなぎ目の前後4拍ずつの似かたが高い順に出す。出た秒を tools/loop.py に渡す
"""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tame


def onset_env(m, sr, hop=128):
    n = len(m) // hop
    fr = m[:n * hop].reshape(n, hop) * np.hanning(hop)
    S = np.log1p(np.abs(np.fft.rfft(np.pad(fr, ((0, 0), (0, 384))), axis=1)))
    on = np.r_[0, np.maximum(np.diff(S, axis=0), 0).sum(1)]
    return (on - on.mean()) / (on.std() + 1e-9), sr / hop


def beat_fit(on, fps, dur, bpm):
    bp = 60 / bpm; best = (-9, 0)
    for ph in np.arange(0, bp, 0.004):
        idx = np.round(np.arange(ph, dur - 0.1, bp) * fps).astype(int)
        idx = idx[idx < len(on) - 1]
        s = np.mean(np.maximum(np.maximum(on[np.maximum(idx - 1, 0)], on[idx]), on[idx + 1]))
        best = max(best, (s, ph))
    return best


def features(m, sr, beats, bp):
    N = 1
    while N < bp * sr: N *= 2
    freqs = np.fft.rfftfreq(N, 1 / sr)
    edges = np.geomspace(40, 16000, 49); bi = np.digitize(freqs, edges) - 1; ok = (bi >= 0) & (bi < 48)
    pc = np.round(69 + 12 * np.log2(np.maximum(freqs, 1) / 440)).astype(int) % 12; cm = (freqs > 80) & (freqs < 4000)
    F = []
    for b in beats:
        s = int(b * sr); seg = m[s:s + int(bp * sr)]; seg = np.pad(seg, (0, N - len(seg))) * np.hanning(N)
        P = np.abs(np.fft.rfft(seg)) ** 2
        band = np.log1p(np.bincount(bi[ok], P[ok], 48) * 1e3)
        ch = np.bincount(pc[cm], P[cm], 12); ch = ch / (ch.sum() + 1e-9)
        F.append(np.r_[band, ch * 20])
    F = np.array(F); F = (F - F.mean(0)) / (F.std(0) + 1e-9)
    return F / (np.linalg.norm(F, axis=1, keepdims=True) + 1e-9)


def main():
    a = [v for v in sys.argv[1:] if v != "--only"]
    opt = {"--bpm": None, "--from": 6.0, "--top": 5}
    for k in list(opt):
        if k in a: i = a.index(k); opt[k] = float(a[i + 1]); del a[i:i + 2]
    x, sr = tame.load(a[0]); x = tame.trim_tail(x, sr); m = x.mean(0); dur = len(m) / sr
    on, fps = onset_env(m, sr)
    cands = []
    base = opt["--bpm"] or 120
    for mul in ((1,) if "--only" in sys.argv else (0.5, 1, 2)):
        for bpm in np.arange(base * mul * 0.9, base * mul * 1.1, 0.25):
            if 50 <= bpm <= 220: cands.append(bpm)
    sc = sorted(((beat_fit(on, fps, dur, b), b) for b in cands), reverse=True)
    (s, ph), bpm = sc[0]
    bp = 60 / bpm
    beats = np.arange(ph, dur - bp, bp)
    print(f"長さ {dur:.1f}秒  テンポ {bpm:.2f}  拍の頭 {ph:.3f}秒  拍の数 {len(beats)}")
    F = features(m, sr, beats, bp); S = F @ F.T; nb = len(F)
    res = []
    a0 = max(4, int((opt["--from"] - ph) / bp)); a1 = int(nb * 0.3); b0 = int(nb * 0.7)
    for i in range(a0, a1):
        for j in range(b0, nb - 1):
            if (j - i) % 4: continue
            pre = [S[i - k, j - k] for k in range(1, 5)]
            post = [S[i + k, j + k] for k in range(4) if j + k < nb]
            res.append((np.mean(pre + post) + 0.0005 * (j - i), i, j))
    res.sort(reverse=True)
    for v, i, j in res[:int(opt["--top"])]:
        print(f"そろい具合 {v:.2f}  繰り返し {beats[i]:.2f}秒 → {beats[j]:.2f}秒（{(j - i) // 4}小節・{beats[j] - beats[i]:.1f}秒）")


if __name__ == "__main__":
    main()
