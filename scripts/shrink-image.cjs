// Shrinks an image to a JPEG for review (reads the input only).
//   node_modules/.bin/electron scripts/shrink-image.cjs <in.png> <out.jpg> [width]
const { app, nativeImage } = require('electron')
const fs = require('fs')
app.whenReady().then(() => {
  const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('shrink-image.cjs')) + 1)
  const [inp, out, w] = args
  const img = nativeImage.createFromPath(inp)
  const small = img.resize({ width: Number(w || 1400) })
  fs.writeFileSync(out, small.toJPEG(80))
  console.log(`${img.getSize().width}x${img.getSize().height} -> ${small.getSize().width}x${small.getSize().height}`)
  app.quit()
})
