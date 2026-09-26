// Music checks: render the generative music offline (no speakers needed),
// report levels and quiet stretches, draw a spectrogram, and save WAV samples.
//
//   node tools/shot.mjs music [--theme=sea] [--secs=60]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const scenarios = {
  music: {
    async run(page, snap, args) {
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      const themes = String(args.theme || 'sea,town,night,grandline,underwater,battle,title').split(',');
      const secs = Number(args.secs || 50);
      const outDir = join(root, 'shots');
      mkdirSync(outDir, { recursive: true });
      for (const theme of themes) {
        const res = await page.evaluate(async ([theme, secs]) => {
          const au = window.OP.game.audio;
          const SR = 22050;
          const off = new OfflineAudioContext(1, SR * secs, SR);
          // drive the engine against the offline clock
          let fake = 0;
          Object.defineProperty(off, 'currentTime', { get: () => fake, configurable: true });
          Object.defineProperty(off, 'state', { get: () => 'running', configurable: true });
          const Real = window.AudioContext;
          window.AudioContext = function () { return off; };
          au.ctx = null; au.verb = null; au.songBus = null; au.song = null; au.theme = null;
          clearInterval(au.scheduler);
          au.init();
          clearInterval(au.scheduler);
          window.AudioContext = Real;
          au.settings = { ...au.settings, music: 1, volume: 0 };
          au.apply(au.settings);
          au.music(theme);
          au.restUntil = 0.2;
          for (fake = 0; fake < secs - 0.5; fake += 0.1) au.schedule();
          delete off.currentTime; delete off.state;
          const buf = await off.startRendering();
          const d = buf.getChannelData(0);
          // levels in half-second windows
          const win = SR / 2, env = [];
          let peak = 0, nan = 0;
          for (let i = 0; i < d.length; i += win) {
            let s = 0;
            for (let j = i; j < Math.min(d.length, i + win); j++) { const v = d[j]; if (!Number.isFinite(v)) nan++; else { s += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); } }
            env.push(Math.sqrt(s / win));
          }
          // a spectrogram: 72 log-spaced bins (Goertzel), 80 ms frames
          const cv = document.createElement('canvas');
          const frame = Math.floor(SR * 0.08), nf = Math.floor(d.length / frame), bins = 72;
          cv.width = nf; cv.height = bins * 3;
          const g = cv.getContext('2d');
          g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
          for (let b = 0; b < bins; b++) {
            const f = 70 * Math.pow(4000 / 70, b / (bins - 1));
            const w = 2 * Math.PI * f / SR, cw = 2 * Math.cos(w);
            for (let fi = 0; fi < nf; fi++) {
              let s1 = 0, s2 = 0;
              for (let j = fi * frame; j < (fi + 1) * frame; j++) { const s0 = d[j] + cw * s1 - s2; s2 = s1; s1 = s0; }
              const pw = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - cw * s1 * s2)) / frame;
              const k = Math.min(1, Math.max(0, (Math.log10(pw + 1e-9) + 4.2) / 3));
              g.fillStyle = `rgb(${Math.round(255 * Math.min(1, k * 1.6))},${Math.round(255 * Math.max(0, k * 1.4 - 0.4))},${Math.round(255 * Math.max(0, k * 2 - 1.2))})`;
              g.fillRect(fi, (bins - 1 - b) * 3, 1, 3);
            }
          }
          // 16-bit WAV
          const n = d.length, bytes = new ArrayBuffer(44 + n * 2), v = new DataView(bytes);
          const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
          str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
          v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
          v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
          const norm = peak > 0 ? Math.min(4, 0.8 / peak) : 1;
          for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (d[i] || 0) * norm)) * 32767, true);
          let bin = '';
          const u8 = new Uint8Array(bytes);
          for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          return { peak: +peak.toFixed(3), nan, env: env.map((x) => +x.toFixed(4)), wav: btoa(bin), png: cv.toDataURL('image/png') };
        }, [theme, secs]);
        const quiet = res.env.filter((x) => x < 0.002).length;
        console.log(theme, JSON.stringify({ peak: res.peak, nan: res.nan, meanRms: +(res.env.reduce((a, b) => a + b, 0) / res.env.length).toFixed(4), quietHalfSeconds: quiet, of: res.env.length }));
        writeFileSync(join(outDir, `music-${theme}.wav`), Buffer.from(res.wav, 'base64'));
        writeFileSync(join(outDir, `music-${theme}-spectrogram.png`), Buffer.from(res.png.split(',')[1], 'base64'));
      }
    },
  },
};
