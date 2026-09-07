// 极简静态服务器：预览 Web 版族谱
// 用法: node tools/serve-web.js [端口]   （默认 8765）
const http = require('http')
const fs = require('fs')
const path = require('path')

const port = Number(process.argv[2]) || 8765
const root = path.join(__dirname, '..', 'web')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
}

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p === '/') p = '/index.html'
  const file = path.normalize(path.join(root, p))
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(data)
  })
}).listen(port, () => {
  console.log('族谱 Web 版已启动: http://localhost:' + port)
})
