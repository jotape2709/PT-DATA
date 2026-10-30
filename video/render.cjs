// Renderiza a animação quadro a quadro e codifica em MP4 (H.264, 30 fps).
// Uso: npx vite --port 5180 &  depois  node video/render.cjs [saida.mp4] [--stills]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const FPS = 30;
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'video/cartao-de-ponto.mp4';
const stills = process.argv.includes('--stills');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  p.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await p.goto('http://localhost:5180/video/index.html?render', { waitUntil: 'networkidle' });
  await p.evaluate(() => window.ready);
  const dur = await p.evaluate(() => window.DURATION);
  const grab = (t) => p.evaluate((tt) => { window.seek(tt); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t);
  if (stills) {
    fs.mkdirSync('/tmp/stills', { recursive: true });
    for (const t of [1, 3.5, 8, 11.5, 14, 16.5, 21, 23, 27.5, 30.5, 33.5, 36, 39]) {
      fs.writeFileSync(`/tmp/stills/t${String(t).replace('.', '_')}.png`, Buffer.from(await grab(t), 'base64'));
    }
    console.log('stills ok, duration', dur);
    await b.close();
    return;
  }
  const n = Math.round(dur * FPS);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    const buf = Buffer.from(await grab(i / FPS), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`quadro ${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('ok', out, `${n} quadros, ${dur.toFixed(1)} s`);
  await b.close();
})();
