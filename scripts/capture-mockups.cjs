// Renders docs/mockups/*.html to PNG images in docs/mockups/img/.
// Run with Ship Editor's Electron (Saga Forge has no node_modules yet):
//   ../ship-editor/node_modules/.bin/electron scripts/capture-mockups.cjs [page ...]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'docs', 'mockups');
const out = path.join(dir, 'img');
// --check=<dir> also writes small JPEG slices there (keep it outside docs/, e.g. D:/ModTools/.cache/sf-check)
const checkArg = process.argv.find((a) => a.startsWith('--check='));
const check = checkArg ? checkArg.slice(8) : null;
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs') && a !== '.');
const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'))
  .filter((f) => wanted.length === 0 || wanted.includes(f.replace(/\.html$/, '')));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: 1480, height: 1000, show: false, webPreferences: { offscreen: true } });
  for (const p of pages) {
    win.setContentSize(1480, 600); // shrink first, so the page height is measured fresh
    await win.loadFile(path.join(dir, p));
    const h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
    win.setContentSize(1480, Math.min(h, 4000));
    await new Promise((r) => setTimeout(r, 400));
    // re-run layout scripts at the final size
    await win.loadFile(path.join(dir, p));
    await new Promise((r) => setTimeout(r, 400));
    const img = await win.webContents.capturePage();
    const file = path.join(out, p.replace(/\.html$/, '.png'));
    fs.writeFileSync(file, img.toPNG());
    console.log('wrote', path.relative(process.cwd(), file), img.getSize());
    if (check) {
      // small JPEG previews (for reviewing the layout), one per 1200 px slice
      fs.mkdirSync(check, { recursive: true });
      const { width, height } = img.getSize();
      for (let y = 0, i = 0; y < height; y += 1200, i++) {
        const part = img.crop({ x: 0, y, width, height: Math.min(1200, height - y) }).resize({ width: 1000 });
        fs.writeFileSync(path.join(check, `${p.replace(/\.html$/, '')}-${i}.jpg`), part.toJPEG(70));
      }
    }
  }
  app.quit();
});
