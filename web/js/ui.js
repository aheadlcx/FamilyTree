// UI 基础组件：toast / confirm / prompt / actionSheet / 底部弹层 / 图片压缩
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n }
  function fmtTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
  function fmtDay(ts) {
    if (!ts) return ''
    return fmtTime(ts).slice(0, 10)
  }
  // 相对时间（朋友圈式）：刚刚 / n分钟前 / n小时前 / n天前 / 超过30天显示日期
  function timeAgo(ts) {
    if (!ts) return ''
    const diff = Date.now() - ts
    const m = Math.floor(diff / 60000)
    if (m < 1) return '刚刚'
    if (m < 60) return m + '分钟前'
    const h = Math.floor(m / 60)
    if (h < 24) return h + '小时前'
    const d = Math.floor(h / 24)
    if (d < 30) return d + '天前'
    return fmtDay(ts)
  }

  /* ---------- Toast ---------- */
  let toastTimer = null
  function toast(msg) {
    const root = document.getElementById('toast-root')
    root.innerHTML = '<div class="toast">' + esc(msg) + '</div>'
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { root.innerHTML = '' }, 2000)
  }
  function loading(text) {
    const root = document.getElementById('toast-root')
    root.innerHTML = '<div class="loading-mask">' + esc(text || '加载中…') + '</div>'
  }
  function hideLoading() {
    document.getElementById('toast-root').innerHTML = ''
  }

  /* ---------- 弹层基础设施 ---------- */
  const modalRoot = () => document.getElementById('modal-root')

  function closeModal() { modalRoot().innerHTML = '' }

  function confirm(opts) {
    return new Promise(resolve => {
      const o = opts || {}
      const btn = document.createElement('div')
      btn.className = 'mask'
      btn.innerHTML =
        '<div class="modal-wrap">' +
        '<div class="modal-title">' + esc(o.title || '提示') + '</div>' +
        '<div class="modal-content">' + esc(o.content || '') + '</div>' +
        '<div class="modal-ops">' +
        '<button class="modal-btn" data-k="cancel">' + esc(o.cancelText || '取消') + '</button>' +
        '<button class="modal-btn ' + (o.danger ? 'danger' : 'primary') + '" data-k="ok">' + esc(o.confirmText || '确定') + '</button>' +
        '</div></div>'
      modalRoot().innerHTML = ''
      modalRoot().appendChild(btn)
      btn.addEventListener('click', e => {
        const k = e.target.getAttribute('data-k')
        if (k === 'ok') { closeModal(); resolve(true) }
        else if (k === 'cancel') { closeModal(); resolve(false) }
        else if (e.target === btn) { closeModal(); resolve(false) }
      })
    })
  }

  function prompt(opts) {
    return new Promise(resolve => {
      const o = opts || {}
      const btn = document.createElement('div')
      btn.className = 'mask'
      btn.innerHTML =
        '<div class="modal-wrap">' +
        '<div class="modal-title">' + esc(o.title || '输入') + '</div>' +
        (o.content ? '<div class="modal-content">' + esc(o.content) + '</div>' : '') +
        '<input class="modal-input" id="modal-input" placeholder="' + esc(o.placeholder || '') + '" value="' + esc(o.value || '') + '" />' +
        '<div class="modal-ops">' +
        '<button class="modal-btn" data-k="cancel">取消</button>' +
        '<button class="modal-btn primary" data-k="ok">确定</button>' +
        '</div></div>'
      modalRoot().innerHTML = ''
      modalRoot().appendChild(btn)
      const input = btn.querySelector('#modal-input')
      setTimeout(() => { try { input.focus() } catch (e) {} }, 50)
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { closeModal(); resolve(input.value) }
      })
      btn.addEventListener('click', e => {
        const k = e.target.getAttribute('data-k')
        if (k === 'ok') { closeModal(); resolve(input.value) }
        else if (k === 'cancel') { closeModal(); resolve(null) }
        else if (e.target === btn) { closeModal(); resolve(null) }
      })
    })
  }

  function actionSheet(items) {
    return new Promise(resolve => {
      const btn = document.createElement('div')
      btn.className = 'mask'
      btn.innerHTML =
        '<div class="sheet-wrap"><div class="sheet-actions">' +
        items.map((it, i) =>
          '<div class="sheet-action' + (String(it).indexOf('删除') >= 0 || String(it).indexOf('解散') >= 0 ? ' danger' : '') + '" data-i="' + i + '">' + esc(it) + '</div>'
        ).join('') +
        '<div class="sheet-action" data-i="-1" style="margin-top:6px;color:#9a938a;">取消</div>' +
        '</div></div>'
      modalRoot().innerHTML = ''
      modalRoot().appendChild(btn)
      btn.addEventListener('click', e => {
        const t = e.target.closest('[data-i]')
        if (t) {
          closeModal()
          const i = Number(t.getAttribute('data-i'))
          resolve(i >= 0 ? i : -1)
        } else if (e.target === btn) {
          closeModal()
          resolve(-1)
        }
      })
    })
  }

  // 通用底部弹层：给 html；点遮罩关闭时会回调 onClose（用于挂起中的 Promise 收尾）
  function sheet(html, onClose) {
    const btn = document.createElement('div')
    btn.className = 'mask'
    btn.innerHTML = '<div class="sheet-wrap">' + html + '</div>'
    modalRoot().innerHTML = ''
    modalRoot().appendChild(btn)
    const wrap = btn.querySelector('.sheet-wrap')
    const api = {
      el: wrap,
      close() {
        if (btn.parentNode) btn.parentNode.removeChild(btn)
      }
    }
    btn.addEventListener('click', e => {
      if (e.target === btn) {
        api.close()
        if (onClose) onClose()
      }
    })
    const x = wrap.querySelector('.sheet-close')
    if (x) x.addEventListener('click', () => api.close())
    return api
  }

  // 图片灯箱预览（点击关闭）。替代 window.open(data:) —— 后者会被浏览器拦截
  function lightbox(src) {
    if (!src) return
    const el = document.createElement('div')
    el.className = 'mask lb-mask'
    el.innerHTML = '<img class="lb-img" src="' + src + '" alt="">'
    modalRoot().appendChild(el)
    el.addEventListener('click', () => {
      if (el.parentNode) el.parentNode.removeChild(el)
    })
  }

  /* ---------- 图片压缩（对应小程序 chooseMedia compressed + 云存储） ---------- */
  function fileToDataURL(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          try {
            const scale = Math.min(1, (maxSide || 400) / Math.max(img.width, img.height))
            const w = Math.max(1, Math.round(img.width * scale))
            const h = Math.max(1, Math.round(img.height * scale))
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            canvas.getContext('2d').drawImage(img, 0, 0, w, h)
            resolve(canvas.toDataURL('image/jpeg', quality || 0.68))
          } catch (err) { reject(err) }
        }
        img.onerror = reject
        img.src = reader.result
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
  // 触发文件选择（对应 wx.chooseMedia）
  function chooseImage(maxSide, quality) {
    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.style.display = 'none'
      document.body.appendChild(input)
      input.addEventListener('change', () => {
        const f = input.files && input.files[0]
        document.body.removeChild(input)
        if (!f) { resolve(null); return }
        fileToDataURL(f, maxSide, quality).then(resolve).catch(() => resolve(null))
      })
      input.click()
    })
  }

  function navbarHtml(title) {
    return '<div class="navbar"><span class="nav-back">‹</span><span class="nav-title">' + esc(title) + '</span></div>'
  }
  function bindNavbar(view) {
    const back = view.querySelector('.nav-back')
    if (back) back.addEventListener('click', () => history.back())
  }

  window.UI = {
    esc, fmtTime, fmtDay, timeAgo, toast, loading, hideLoading,
    confirm, prompt, actionSheet, sheet, closeModal, lightbox,
    fileToDataURL, chooseImage, navbarHtml, bindNavbar
  }
})()
