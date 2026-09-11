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
     opts: { title, exclude: [id], allowCreate, defaultGender, linkTo }
     返回 Promise：member | null（关闭/遮罩取消均返回 null） */
  function memberPicker(opts) {
    const o = opts || {}
    return new Promise(async resolve => {
      let all = []
      let keyword = ''
      let closed = false
      let familyId = ''

      const dg = Number(o.defaultGender) || 0
      const opt = (v, label) => '<option value="' + v + '"' + (dg === v ? ' selected' : '') + '>' + label + '</option>'
      const createEntry = o.allowCreate
        ? '<button class="btn btn-plain" id="mp-new">＋ 新建成员并关联</button>'
        : ''
      const createForm =
        '<div id="mp-create" style="display:none;">' +
        '<div class="form-item"><div class="form-label">姓名</div><input class="form-input" id="mp-c-name" placeholder="必填"></div>' +
        '<div class="form-item"><div class="form-label">性别</div><select class="form-select" id="mp-c-gender">' +
        opt(0, '未知') + opt(1, '男') + opt(2, '女') +
        '</select></div>' +
        '<div class="form-item"><div class="form-label">出生日期</div><input class="form-input" type="date" id="mp-c-birth" min="1800-01-01" max="2100-12-31"></div>' +
        '<div class="form-tip">先快速入谱' + (o.linkTo ? '并自动双向关联配偶' : '') + '，详细资料可稍后在编辑页补充</div>' +
        '<button class="btn btn-plain" id="mp-c-cancel">返回选择列表</button>' +
        '<button class="btn btn-primary" id="mp-c-save">保存' + (o.linkTo ? '并关联' : '入谱') + '</button>' +
        '</div>'
      const sheet = UI.sheet(
        '<div class="sheet-header">' +
        '<div class="sheet-title">' + esc(o.title || '选择成员') + '</div>' +
        '<span class="sheet-close">✕</span></div>' +
        '<div class="mp-search" id="mp-search-wrap"><input id="mp-search-input" placeholder="搜索姓名 / 职业 / 籍贯" /></div>' +
        '<div class="mp-list" id="mp-list"><div class="mp-empty">加载中…</div></div>' +
        createEntry + createForm,
        () => finish(null) // 点遮罩关闭也要收尾
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
            '<div class="mp-item' + (dis ? ' disabled' : '') + '" data-id="' + m._id + '">' +
            photoHtml(m, 'mp-avatar' + (m.photoFileId ? '' : ' mp-avatar-ph')) +
            '<div class="mp-info">' +
            '<div class="mp-name">' + esc(m.name) + ' <span class="muted">' + esc(m.years) + '</span></div>' +
            '<div class="muted">' + (m.gender === 1 ? '男' : (m.gender === 2 ? '女' : '未知')) + ' · 第' + ((m.generation || 0) + 1) + '世</div>' +
            '</div>' +
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
        finish(m)
      })

      sheet.el.querySelector('#mp-search-input').addEventListener('input', e => {
        keyword = e.target.value || ''
        renderList()
      })

      /* ---------- 新建成员并关联 ---------- */
      const newBtn = sheet.el.querySelector('#mp-new')
      if (!newBtn) return
      const searchWrap = sheet.el.querySelector('#mp-search-wrap')
      const createEl = sheet.el.querySelector('#mp-create')
      newBtn.addEventListener('click', () => {
        searchWrap.style.display = 'none'
        listEl.style.display = 'none'
        newBtn.style.display = 'none'
        createEl.style.display = 'block'
      })
      sheet.el.querySelector('#mp-c-cancel').addEventListener('click', () => {
        createEl.style.display = 'none'
        searchWrap.style.display = ''
        listEl.style.display = ''
        newBtn.style.display = ''
      })
      sheet.el.querySelector('#mp-c-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') sheet.el.querySelector('#mp-c-save').click()
      })
      sheet.el.querySelector('#mp-c-save').addEventListener('click', async () => {
        const name = sheet.el.querySelector('#mp-c-name').value.trim()
        if (!name) { UI.toast('请填写姓名'); return }
        if (!familyId) { UI.toast('请先加入家族'); return }
        const saveBtn = sheet.el.querySelector('#mp-c-save')
        saveBtn.disabled = true
        try {
          const gender = Number(sheet.el.querySelector('#mp-c-gender').value) || 0
          const birthDate = sheet.el.querySelector('#mp-c-birth').value
          const r = await window.FamilyAPI.call('addMember', {
            familyId, name, gender, birthDate, isAlive: true,
            // 编辑模式下选配偶：服务端会同步把对方写回当前成员的 spouseIds
            spouseIds: o.linkTo ? [o.linkTo] : []
          })
          const b = birthDate ? birthDate.slice(0, 4) : ''
          finish({
            _id: r.id, name, gender, birthDate,
            initial: name.charAt(0) || '·',
            years: b ? b + ' –' : '',
            isAlive: true, photoFileId: '', generation: 0,
            birthPlace: '', occupation: ''
          })
        } catch (e) {
          saveBtn.disabled = false
          UI.toast(e.message)
        }
      })

      try {
        const ctx = await window.FamilyAPI.call('getFamilyContext', {})
        if (!ctx || !ctx.inFamily) { renderList(); return }
        familyId = ctx.family._id
        const r = await window.FamilyAPI.call('listMembers', { familyId })
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
