// 共享组件：成员卡片 / 递归族谱树 / 成员选择器（对应小程序的 member-card、tree-node、member-picker）
(function () {
  const UI = window.UI
  const esc = UI.esc

  function photoHtml(m, cls) {
    if (m.photoFileId) {
      return '<img class="' + cls + '" src="' + m.photoFileId + '" alt="">'
    }
    return '<div class="' + cls + ' ph g' + (m.gender || 0) + '">' + esc(m.initial) + '</div>'
  }

  function roleName(role) {
    return role === 'owner' ? '族主' : (role === 'admin' ? '管理员' : (role === 'editor' ? '编辑员' : '浏览'))
  }

  /* ---------- 递归族谱树（对应 tree-node 组件） ---------- */
  function treeNodeHtml(node, selfId) {
    if (!node) return ''
    function card(m, isSpouse) {
      return (
        '<div class="tn-card ' + (isSpouse ? 'tn-spouse' : '') + (selfId === m._id ? ' tn-self' : '') + '" data-id="' + m._id + '">' +
        '<span class="tn-more" data-menu="' + m._id + '">⋯</span>' +
        (m.photoFileId
          ? '<img class="tn-photo" src="' + m.photoFileId + '" alt="">'
          : '<div class="tn-photo tn-ph g' + (m.gender || 0) + '">' + esc(m.initial) + '</div>') +
        '<div class="tn-name">' + esc(m.name) + (m.isAlive === false ? '<span class="tn-cross">†</span>' : '') + '</div>' +
        '<div class="tn-years">' + esc(m.years) + '</div>' +
        '<div class="tn-gen">' + (isSpouse ? '配偶' : '第' + ((m.generation || 0) + 1) + '世') + '</div>' +
        '</div>'
      )
    }
    const spouses = (node.spouses || [])
    const spousesHtml = spouses.length
      ? '<div class="tn-link">♥</div>' + spouses.map(s => card(s, true)).join('<div class="tn-link">♥</div>')
      : ''
    const kids = (node.children || [])
    const kidsHtml = kids.length
      ? '<div class="tn-children">' + kids.map(c => '<div class="tn-child">' + treeNodeHtml(c, selfId) + '</div>').join('') + '</div>'
      : ''
    return '<div class="tn"><div class="tn-couple">' + card(node, false) + spousesHtml + '</div>' + kidsHtml + '</div>'
  }

  /* ---------- 成员选择器（对应 member-picker 组件） ----------
     opts: { title, multi, exclude: [id] }
     返回 Promise：单选 → member | null；多选 → members[] */
  function memberPicker(opts) {
    const o = opts || {}
    return new Promise(async resolve => {
      let all = []
      let keyword = ''
      const selected = {}
      let closed = false

      const sheet = UI.sheet(
        '<div class="sheet-header">' +
        '<div class="sheet-title">' + esc(o.title || '选择成员') + '</div>' +
        '<span class="sheet-close">✕</span></div>' +
        '<div class="mp-search"><input id="mp-search-input" placeholder="搜索姓名 / 职业 / 籍贯" /></div>' +
        '<div class="mp-list" id="mp-list"><div class="mp-empty">加载中…</div></div>' +
        (o.multi
          ? '<button class="btn btn-primary" id="mp-confirm" disabled>确定（已选 0 人）</button>'
          : '')
      )
      const listEl = sheet.el.querySelector('#mp-list')

      function finish(result) {
        if (closed) return
        closed = true
        sheet.close()
        resolve(result)
      }

      sheet.el.querySelector('.sheet-close').addEventListener('click', () => finish(null))

      function renderList() {
        const kw = keyword.trim().toLowerCase()
        const exclude = o.exclude || []
        const list = all.filter(m => {
          if (!kw) return true
          return (m.name || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.birthPlace || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.occupation || '').toLowerCase().indexOf(kw) >= 0
        })
        if (!list.length) {
          listEl.innerHTML = '<div class="mp-empty">没有找到成员</div>'
          return
        }
        listEl.innerHTML = list.map(m => {
          const dis = exclude.indexOf(m._id) >= 0
          return (
            '<div class="mp-item' + (selected[m._id] ? ' active' : '') + (dis ? ' disabled' : '') + '" data-id="' + m._id + '">' +
            photoHtml(m, 'mp-avatar' + (m.photoFileId ? '' : ' mp-avatar-ph')) +
            '<div class="mp-info">' +
            '<div class="mp-name">' + esc(m.name) + ' <span class="muted">' + esc(m.years) + '</span></div>' +
            '<div class="muted">' + (m.gender === 1 ? '男' : (m.gender === 2 ? '女' : '未知')) + ' · 第' + ((m.generation || 0) + 1) + '世</div>' +
            '</div>' +
            (selected[m._id] ? '<span class="mp-check">✓</span>' : '') +
            '</div>'
          )
        }).join('')
      }

      listEl.addEventListener('click', e => {
        const row = e.target.closest('[data-id]')
        if (!row) return
        const m = all.find(x => x._id === row.getAttribute('data-id'))
        if (!m) return
        if ((o.exclude || []).indexOf(m._id) >= 0) return
        if (!o.multi) { finish(m); return }
        if (selected[m._id]) delete selected[m._id]
        else selected[m._id] = true
        const n = Object.keys(selected).length
        const confirmBtn = sheet.el.querySelector('#mp-confirm')
        if (confirmBtn) {
          confirmBtn.disabled = !n
          confirmBtn.textContent = '确定（已选 ' + n + ' 人）'
        }
        renderList()
      })

      sheet.el.querySelector('#mp-search-input').addEventListener('input', e => {
        keyword = e.target.value || ''
        renderList()
      })

      const confirmBtn = sheet.el.querySelector('#mp-confirm')
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          finish(all.filter(m => selected[m._id]))
        })
      }

      try {
        const ctx = await window.FamilyAPI.call('getFamilyContext', {})
        if (!ctx || !ctx.inFamily) { renderList(); return }
        const r = await window.FamilyAPI.call('listMembers', { familyId: ctx.family._id })
        all = r.members
        renderList()
      } catch (e) {
        all = []
        renderList()
      }
    })
  }

  window.Components = { photoHtml, treeNodeHtml, memberPicker, roleName }
})()
