// 生成 tabBar 图标（纯 Node，无依赖）：手写 PNG 编码器 + 像素绘制
// 用法: node tools/gen-icons.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

/* ---------- PNG 编码 ---------- */
function crc32(buf) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
function encodePng(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size * 4; x++) raw[y * (size * 4 + 1) + 1 + x] = px[y * size * 4 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- 画布 ---------- */
function canvas(size) { return { size, px: new Uint8Array(size * size * 4) } }
function set(cv, x, y, col) {
  if (x < 0 || y < 0 || x >= cv.size || y >= cv.size) return
  const i = (y * cv.size + x) * 4
  cv.px[i] = col[0]; cv.px[i + 1] = col[1]; cv.px[i + 2] = col[2]; cv.px[i + 3] = 255
}
function fillCircle(cv, cx, cy, r, col) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r * r) set(cv, x, y, col)
    }
}
function ring(cv, cx, cy, ro, ri, col) {
  for (let y = Math.floor(cy - ro); y <= cy + ro; y++)
    for (let x = Math.floor(cx - ro); x <= cx + ro; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy
      const d = dx * dx + dy * dy
      if (d <= ro * ro && d >= ri * ri) set(cv, x, y, col)
    }
}
function thickLine(cv, x1, y1, x2, y2, w, col) {
  const minx = Math.floor(Math.min(x1, x2) - w), maxx = Math.ceil(Math.max(x1, x2) + w)
  const miny = Math.floor(Math.min(y1, y2) - w), maxy = Math.ceil(Math.max(y1, y2) + w)
  const vx = x2 - x1, vy = y2 - y1
  const len2 = vx * vx + vy * vy || 1
  for (let y = miny; y <= maxy; y++)
    for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5
      let t = ((px - x1) * vx + (py - y1) * vy) / len2
      t = Math.max(0, Math.min(1, t))
      const dx = px - (x1 + t * vx), dy = py - (y1 + t * vy)
      if (dx * dx + dy * dy <= w * w) set(cv, x, y, col)
    }
}
function halfDisc(cv, cx, cy, r, col) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (y + 0.5 > cy + 1) continue
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r * r) set(cv, x, y, col)
    }
}

/* ---------- 图标（96x96） ---------- */
function drawTree(col) {
  const cv = canvas(96)
  fillCircle(cv, 48, 22, 11, col)                 // 根节点（始祖）
  thickLine(cv, 48, 34, 48, 48, 5, col)           // 主干
  thickLine(cv, 24, 50, 72, 50, 5, col)           // 横梁
  thickLine(cv, 24, 50, 24, 56, 5, col)
  thickLine(cv, 72, 50, 72, 56, 5, col)
  fillCircle(cv, 24, 68, 11, col)                 // 后代
  fillCircle(cv, 72, 68, 11, col)
  return cv
}
function drawMembers(col) {
  const cv = canvas(96)
  fillCircle(cv, 36, 32, 13, col)
  halfDisc(cv, 36, 64, 22, col)
  fillCircle(cv, 68, 40, 9, col)
  halfDisc(cv, 68, 62, 15, col)
  return cv
}
function drawMoments(col) {
  const cv = canvas(96)
  ring(cv, 48, 48, 32, 24, col)
  thickLine(cv, 48, 48, 48, 30, 5, col)
  thickLine(cv, 48, 48, 62, 54, 5, col)
  fillCircle(cv, 48, 48, 4, col)
  return cv
}
function drawMine(col) {
  const cv = canvas(96)
  fillCircle(cv, 48, 32, 15, col)
  halfDisc(cv, 48, 74, 26, col)
  return cv
}

/* ---------- 输出 ---------- */
const outDir = path.join(__dirname, '..', 'miniprogram', 'images')
fs.mkdirSync(outDir, { recursive: true })
const GRAY = [154, 147, 138]
const GREEN = [7, 193, 96]
const jobs = [
  ['tab-tree', drawTree],
  ['tab-members', drawMembers],
  ['tab-moments', drawMoments],
  ['tab-mine', drawMine]
]
jobs.forEach(([name, fn]) => {
  fs.writeFileSync(path.join(outDir, name + '.png'), encodePng(96, fn(GRAY).px))
  fs.writeFileSync(path.join(outDir, name + '-active.png'), encodePng(96, fn(GREEN).px))
})
console.log('icons generated:', fs.readdirSync(outDir).join(', '))
