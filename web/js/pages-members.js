// member-list / member-detail / member-edit
(function () {
  const UI = window.UI
  const C = () => window.Components
  const api = () => window.FamilyAPI
  const esc = UI.esc

  window.Pages = window.Pages || {}

  /* ================= 成员列表 ================= */
  window.Pages['member-list'] = {
    async render() {
      App.showTabbar('member-list')
      const view = document.getElementById('view')
      const state = { all: [], keyword: '', filter: 'all', selfId: '', canEdit: false }

      function filtered() {
        const kw = state.keyword.trim().toLowerCase()
        return state.all.filter(m => {
          if (state.filter === 'alive' && m.isAlive === false) return false
          if (state.filter === 'dead' && m.isAlive !== false) return false
          if (state.filter === 'male' && m.gender !== 1) return false
          if (state.filter === 'female' && m.gender !== 2) return false
          if (!kw) return true
          return (m.name || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.birthPlace || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.occupation || '').toLowerCase().indexOf(kw) >= 0
        })
      }

      function listHtml() {
        const list = filtered()
        if (!list.length) {
          return '<div class="empty"><div class="empty-icon">🍃</div><div>' +
            (state.all.length ? '没有符合条件的人' : '还没有族人，点击右下角 + 添加') + '</div></div>'
        }
        return '<div class="card" style="padding:4px 14px;">' + list.map(m =>
          '<div class="cell" data-id="' + m._id + '">' +
          (m.photoFileId
            ? '<img class="ml-avatar" src="' + m.photoFileId + '">'
            : '<div class="ml-avatar ml-ph g' + (m.gender || 0) + '">' + esc(m.initial) + '</div>') +
          '<div class="ml-info"><div class="ml-name">' + esc(m.name) +
          (m._id === state.selfId ? ' <span class="tag tag-green">我</span>' : '') +
          (m.isAlive === false ? ' <span class="tag tag-gray">故</span>' : '') +
          '</div><div class="muted">' + (m.gender === 1 ? '男' : (m.gender === 2 ? '女' : '未知')) +
          ' · 第' + ((m.generation || 0) + 1) + '世 · ' + esc(m.years || '生卒不详') + '</div></div>' +
          '<span class="arrow">›</span></div>'
        ).join('') + '</div>'
      }

      function renderList() {
        const wrap = view.querySelector('#ml-body')
        if (wrap) wrap.innerHTML = listHtml()
        const count = view.querySelector('#ml-count')
        if (count) count.textContent = '共 ' + filtered().length + ' 人'
      }

      try {
        const ctx = await api().call('getFamilyContext', {})
        if (!ctx || !ctx.inFamily) {
          App.clearContext()
          view.innerHTML = '<div class="empty"><div class="empty-icon">🌳</div><div>你还未加入任何家族</div>' +
            '<button class="btn btn-primary" style="margin:15px 40px 0;" id="ml-welcome">创建 / 加入家族</button></div>'
          view.querySelector('#ml-welcome').onclick = () => App.go('/welcome')
          return
        }
        App.setContext(ctx)
        const r = await api().call('listMembers', { familyId: ctx.family._id })
        state.all = r.members
        state.selfId = ctx.selfMemberId || ''
        state.canEdit = ['editor', 'admin', 'owner'].indexOf(ctx.role) >= 0

        view.innerHTML =
          '<div class="search-bar"><input class="search-input" id="ml-search" placeholder="搜索姓名 / 职业 / 籍贯">' +
          '<span class="search-stat" id="ml-go-stats">统计</span></div>' +
          '<div class="chipbar">' +
          [['all', '全部'], ['alive', '在世'], ['dead', '已故'], ['male', '男'], ['female', '女']].map(f =>
            '<span class="chip' + (state.filter === f[0] ? ' active' : '') + '" data-f="' + f[0] + '">' + f[1] + '</span>'
          ).join('') +
          '<span class="muted" id="ml-count" style="margin-left:auto;"></span></div>' +
          '<div id="ml-body"></div>' +
          (state.canEdit ? '<button class="fab" id="ml-add">＋</button>' : '')

        renderList()

        view.querySelector('#ml-search').addEventListener('input', e => {
          state.keyword = e.target.value || ''
          renderList()
        })
        view.querySelector('#ml-go-stats').onclick = () => App.go('/stats')
        view.querySelectorAll('.chip').forEach(ch => {
          ch.onclick = () => {
            state.filter = ch.getAttribute('data-f')
            view.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === ch))
            renderList()
          }
        })
        const add = view.querySelector('#ml-add')
        if (add) add.onclick = () => App.go('/member-edit')
        const welcome = view.querySelector('#ml-welcome')
        if (welcome) welcome.onclick = () => App.go('/welcome')

        view.onclick = e => {
          const cell = e.target.closest('.cell[data-id]')
          if (cell) App.go('/member-detail?id=' + cell.getAttribute('data-id'))
        }
      } catch (e) {
        UI.toast(e.message)
      }
    }
  }

  /* ================= 成员详情 ================= */
  window.Pages['member-detail'] = {
    async render(params) {
      App.hideTabbar()
      const view = document.getElementById('view')
      try {
        const [r, ctxRes] = await Promise.all([
          api().call('getMember', { id: params.id }),
          App.state.ctx ? Promise.resolve(App.state.ctx) : api().call('getFamilyContext', {})
        ])
        if (ctxRes && ctxRes.inFamily) App.setContext(ctxRes)
        const role = ctxRes && ctxRes.inFamily ? ctxRes.role : 'viewer'
        const canEdit = ['editor', 'admin', 'owner'].indexOf(role) >= 0
        const canManage = ['admin', 'owner'].indexOf(role) >= 0
        const m = r.member

        const chips = list => list.map(x =>
          '<span class="md-chip" data-id="' + x._id + '">' + esc(x.name) + '</span>').join('')

        let info = ''
        if (m.birthDate) info += '<div class="md-row"><div class="md-label">出生</div><div>' + esc(m.birthDate) + '</div></div>'
        if (m.deathDate) info += '<div class="md-row"><div class="md-label">逝世</div><div>' + esc(m.deathDate) + '</div></div>'
        if (m.birthPlace) info += '<div class="md-row"><div class="md-label">籍贯</div><div>' + esc(m.birthPlace) + '</div></div>'
        if (m.occupation) info += '<div class="md-row"><div class="md-label">职业</div><div>' + esc(m.occupation) + '</div></div>'
        if (m.phone) info += '<div class="md-row"><div class="md-label">电话</div><div>' + esc(m.phone) + '</div></div>'
        if (m.bio) info += '<div class="md-row"><div class="md-label">生平</div><div class="md-bio">' + esc(m.bio) + '</div></div>'
        if (!info) info = '<div class="muted">还没有补充资料</div>'

        let rel = ''
        if (r.father || r.mother) {
          rel += '<div class="md-rel"><div class="md-rel-label">父母</div><div class="md-chips">' +
            (r.father ? chips([r.father]) : '') + (r.mother ? chips([r.mother]) : '') + '</div></div>'
        }
        if (r.spouses.length) rel += '<div class="md-rel"><div class="md-rel-label">配偶</div><div class="md-chips">' + chips(r.spouses) + '</div></div>'
        if (r.children.length) rel += '<div class="md-rel"><div class="md-rel-label">子女</div><div class="md-chips">' + chips(r.children) + '</div></div>'
        if (r.siblings.length) rel += '<div class="md-rel"><div class="md-rel-label">同胞</div><div class="md-chips">' + chips(r.siblings) + '</div></div>'
        if (!rel) rel = '<div class="muted">暂无关联成员，可在「编辑」中添加父母 / 配偶</div>'

        view.innerHTML = UI.navbarHtml('成员资料') +
          '<div class="card md-head">' +
          (m.photoFileId
            ? '<img class="md-photo" id="md-photo" src="' + m.photoFileId + '">'
            : '<div class="md-photo md-ph g' + (m.gender || 0) + '">' + esc(m.initial) + '</div>') +
          '<div class="md-head-info"><div class="md-name">' + esc(m.name) +
          (r.isSelf ? ' <span class="tag tag-green">本人</span>' : '') +
          (m.isAlive === false ? ' <span class="tag tag-gray">已故</span>' : '') +
          '</div><div class="muted md-line">' + esc(m.years || '生卒不详') + '</div>' +
          '<div class="md-tags"><span class="tag tag-blue">' + (m.gender === 1 ? '男' : (m.gender === 2 ? '女' : '未知')) + '</span>' +
          '<span class="tag tag-gold">第' + ((m.generation || 0) + 1) + '世</span></div></div></div>' +

          '<div class="card"><div class="h2">详细资料</div>' + info + '</div>' +
          '<div class="card"><div class="h2">家族关系</div>' + rel + '</div>' +

          '<div class="card safe-bottom">' +
          '<button class="btn btn-plain" id="md-branch">🌳 在族谱中查看支系</button>' +
          (!r.isSelf && ctxRes && ctxRes.inFamily ? '<button class="btn btn-plain" id="md-self">👤 设为本人</button>' : '') +
          (canEdit ? '<button class="btn btn-primary" id="md-edit">编辑资料</button><button class="btn btn-plain" id="md-addchild">添加子女</button>' : '') +
          (canManage ? '<button class="btn btn-warn" id="md-del">删除该成员</button>' : '') +
          '</div>'

        UI.bindNavbar(view)
        const photo = view.querySelector('#md-photo')
        if (photo) photo.onclick = () => window.open(m.photoFileId)
        const bind = (id, fn) => { const el = view.querySelector(id); if (el) el.onclick = fn }
        bind('#md-branch', () => App.go('/tree-view?id=' + m._id))
        bind('#md-self', async () => {
          try {
            await api().call('setSelfMember', { familyId: ctxRes.family._id, memberId: m._id })
            UI.toast('已设为本人')
            this.render(params)
          } catch (e) { UI.toast(e.message) }
        })
        bind('#md-edit', () => App.go('/member-edit?id=' + m._id))
        bind('#md-addchild', () => App.go('/member-edit?childOf=' + m._id))
        bind('#md-del', async () => {
          const ok = await UI.confirm({ title: '删除成员', content: '确定删除「' + m.name + '」吗？其子女的父/母关联将同时解除。', danger: true })
          if (!ok) return
          try {
            await api().call('removeMember', { id: m._id })
            UI.toast('已删除')
            setTimeout(() => history.back(), 300)
          } catch (e) { UI.toast(e.message) }
        })
        view.onclick = e => {
          const chip = e.target.closest('.md-chip[data-id]')
          if (chip) App.go('/member-detail?id=' + chip.getAttribute('data-id'))
        }
      } catch (e) {
        view.innerHTML = UI.navbarHtml('成员资料') +
          '<div class="empty"><div class="empty-icon">🔒</div><div>' + esc(e.message) + '</div>' +
          '<div class="muted" style="margin-top:6px;">加入该家族后即可查看</div></div>'
        UI.bindNavbar(view)
      }
    }
  }

  /* ================= 成员编辑 ================= */
  window.Pages['member-edit'] = {
    async render(params) {
      App.hideTabbar()
      const view = document.getElementById('view')
      const isEdit = !!params.id
      const state = {
        form: {
          name: '', gender: 0, birthDate: '', deathDate: '', isAlive: true,
          birthPlace: '', occupation: '', phone: '', bio: '', photoFileId: ''
        },
        father: null, mother: null, spouses: []
      }
      let familyId = ''
      document.title = isEdit ? '编辑成员' : '添加成员'

      try {
        let ctx = App.state.ctx
        if (!ctx || !ctx.family) {
          ctx = await api().call('getFamilyContext', {})
          if (ctx && ctx.inFamily) App.setContext(ctx)
        }
        familyId = ctx && ctx.inFamily ? ctx.family._id : ''

        if (isEdit) {
          const r = await api().call('getMember', { id: params.id })
          Object.assign(state.form, {
            name: r.member.name, gender: r.member.gender,
            birthDate: r.member.birthDate, deathDate: r.member.deathDate,
            isAlive: r.member.isAlive !== false,
            birthPlace: r.member.birthPlace, occupation: r.member.occupation,
            phone: r.member.phone, bio: r.member.bio, photoFileId: r.member.photoFileId
          })
          state.father = r.father
          state.mother = r.mother
          state.spouses = r.spouses
        } else if (params.childOf) {
          const r = await api().call('getMember', { id: params.childOf })
          const p = r.member
          if (p.gender === 2) state.mother = p
          else state.father = p
        } else if (params.spouseWith) {
          const r = await api().call('getMember', { id: params.spouseWith })
          const s = r.member
          state.spouses = [s]
          if (s.gender === 1) state.form.gender = 2
          else if (s.gender === 2) state.form.gender = 1
        }
      } catch (e) {
        UI.toast(e.message)
      }

      function relHtml() {
        return (
          '<div class="form-item"><div class="form-label">父亲</div>' +
          (state.father
            ? '<div class="me-rel">' + esc(state.father.name) + '<span class="me-clear" id="me-clear-father">移除</span></div>'
            : '<span class="form-picker placeholder" id="me-pick-father">点击选择</span>') +
          '</div>' +
          '<div class="form-item"><div class="form-label">母亲</div>' +
          (state.mother
            ? '<div class="me-rel">' + esc(state.mother.name) + '<span class="me-clear" id="me-clear-mother">移除</span></div>'
            : '<span class="form-picker placeholder" id="me-pick-mother">点击选择</span>') +
          '</div>' +
          '<div class="form-item" style="align-items:flex-start;"><div class="form-label" style="padding-top:12px;">配偶</div>' +
          '<div class="me-spouses">' +
          state.spouses.map(s =>
            '<span class="me-spouse-chip">' + esc(s.name) + '<span class="me-spouse-x" data-rm-spouse="' + s._id + '">✕</span></span>'
          ).join('') +
          '<span class="me-spouse-add" id="me-pick-spouse">＋ 添加配偶</span>' +
          '</div></div>' +
          '<div class="form-tip">可从列表选择，或在弹层中直接新建入谱并自动关联；世代数会按父母自动计算</div>'
        )
      }

      function render() {
        const f = state.form
        view.innerHTML = UI.navbarHtml(isEdit ? '编辑成员' : '添加成员') +
          '<div class="card"><div class="h2">基本资料</div>' +
          '<div class="form-item"><div class="form-label">姓名</div><input class="form-input" id="me-name" placeholder="必填" value="' + esc(f.name) + '"></div>' +
          '<div class="form-item"><div class="form-label">性别</div><select class="form-select" id="me-gender">' +
          '<option value="0"' + (f.gender === 0 ? ' selected' : '') + '>未知</option>' +
          '<option value="1"' + (f.gender === 1 ? ' selected' : '') + '>男</option>' +
          '<option value="2"' + (f.gender === 2 ? ' selected' : '') + '>女</option>' +
          '</select></div>' +
          '<div class="form-item"><div class="form-label">照片</div><div class="me-photo-row">' +
          (f.photoFileId
            ? '<div class="me-photo-wrap"><img class="me-photo" id="me-photo" src="' + f.photoFileId + '"><span class="me-photo-del" id="me-photo-del">✕</span></div>'
            : '<span class="me-photo-add" id="me-photo-add">＋</span>') +
          '<span class="form-tip" style="margin:0 0 0 10px;">点击上传（自动压缩存本地，对应云存储）</span>' +
          '</div></div>' +
          '<div class="form-item"><div class="form-label">出生日期</div><input class="form-input" type="date" id="me-birth" value="' + esc(f.birthDate) + '" min="1800-01-01" max="2100-12-31"></div>' +
          '<div class="form-item"><div class="form-label">在世</div><input type="checkbox" class="me-switch" id="me-alive"' + (f.isAlive ? ' checked' : '') + '></div>' +
          (!f.isAlive
            ? '<div class="form-item"><div class="form-label">逝世日期</div><input class="form-input" type="date" id="me-death" value="' + esc(f.deathDate) + '" min="1800-01-01" max="2100-12-31"></div>'
            : '') +
          '<div class="form-item"><div class="form-label">籍贯</div><input class="form-input" id="me-place" placeholder="如：广东广州（选填）" value="' + esc(f.birthPlace) + '"></div>' +
          '<div class="form-item"><div class="form-label">职业</div><input class="form-input" id="me-occ" placeholder="选填" value="' + esc(f.occupation) + '"></div>' +
          '<div class="form-item"><div class="form-label">电话</div><input class="form-input" id="me-phone" placeholder="仅家族成员可见" value="' + esc(f.phone) + '"></div>' +
          '</div>' +

          '<div class="card"><div class="h2">生平简介</div>' +
          '<textarea class="form-textarea" id="me-bio" maxlength="2000" placeholder="事迹、生平、备注…">' + esc(f.bio) + '</textarea></div>' +

          '<div class="card"><div class="h2">家族关系</div><div id="me-rel">' + relHtml() + '</div></div>' +

          '<div class="safe-bottom"><button class="btn btn-primary" style="margin:5px 12px;" id="me-save">' +
          (isEdit ? '保存修改' : '添加成员') + '</button></div>'
        bind()
      }

      function bind() {
        UI.bindNavbar(view)
        const $ = id => view.querySelector(id)
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn }

        on('#me-photo-add', async () => {
          const img = await UI.chooseImage(400)
          if (img) { state.form.photoFileId = img; render() }
        })
        on('#me-photo-del', () => { state.form.photoFileId = ''; render() })
        on('#me-photo', () => { if (state.form.photoFileId) window.open(state.form.photoFileId) })

        const alive = $('#me-alive')
        if (alive) alive.addEventListener('change', () => {
          state.form.isAlive = alive.checked
          if (alive.checked) state.form.deathDate = ''
          render()
        })

        async function pick(kind) {
          const exclude = isEdit ? [params.id] : []
          if (kind === 'spouse') {
            state.spouses.forEach(s => exclude.push(s._id))
          }
          let defaultGender = 0
          if (kind === 'father') defaultGender = 1
          else if (kind === 'mother') defaultGender = 2
          else if (kind === 'spouse') {
            const g = state.form.gender
            defaultGender = g === 1 ? 2 : (g === 2 ? 1 : 0)
          }
          const m = await C().memberPicker({
            title: kind === 'father' ? '选择父亲' : (kind === 'mother' ? '选择母亲' : '选择配偶'),
            exclude,
            allowCreate: true,
            defaultGender,
            // 编辑模式下新建配偶时，服务端自动把当前成员写回新配偶的 spouseIds
            linkTo: kind === 'spouse' && isEdit ? params.id : ''
          })
          if (!m) return
          if (kind === 'father') state.father = m
          else if (kind === 'mother') state.mother = m
          else {
            state.spouses = state.spouses.filter(s => s._id !== m._id).concat([m])
          }
          const relEl = $('#me-rel')
          if (relEl) { relEl.innerHTML = relHtml(); bindRel() }
        }
        function bindRel() {
          const $ = id => view.querySelector(id)
          const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn }
          on('#me-pick-father', () => pick('father'))
          on('#me-pick-mother', () => pick('mother'))
          on('#me-pick-spouse', () => pick('spouse'))
          on('#me-clear-father', () => { state.father = null; const el = $('#me-rel'); if (el) { el.innerHTML = relHtml(); bindRel() } })
          on('#me-clear-mother', () => { state.mother = null; const el = $('#me-rel'); if (el) { el.innerHTML = relHtml(); bindRel() } })
          view.querySelectorAll('[data-rm-spouse]').forEach(x => {
            x.onclick = () => {
              const id = x.getAttribute('data-rm-spouse')
              state.spouses = state.spouses.filter(s => s._id !== id)
              const el = $('#me-rel')
              if (el) { el.innerHTML = relHtml(); bindRel() }
            }
          })
        }
        bindRel()

        on('#me-save', async () => {
          const f = state.form
          f.name = $('#me-name').value
          f.gender = Number($('#me-gender').value)
          f.birthDate = $('#me-birth').value
          const aliveEl = $('#me-alive')
          if (aliveEl) f.isAlive = aliveEl.checked
          const deathEl = $('#me-death')
          f.deathDate = deathEl ? deathEl.value : ''
          f.birthPlace = $('#me-place').value
          f.occupation = $('#me-occ').value
          f.phone = $('#me-phone').value
          f.bio = $('#me-bio').value
          if (!f.name.trim()) { UI.toast('请填写姓名'); return }
          if (state.father && state.mother && state.father._id === state.mother._id) { UI.toast('父母不能是同一人'); return }
          try {
            const payload = {
              familyId,
              name: f.name.trim(),
              gender: f.gender,
              birthDate: f.birthDate,
              deathDate: f.deathDate,
              isAlive: f.deathDate ? false : f.isAlive,
              birthPlace: f.birthPlace,
              occupation: f.occupation,
              phone: f.phone,
              bio: f.bio,
              photoFileId: f.photoFileId,
              fatherId: state.father ? state.father._id : '',
              motherId: state.mother ? state.mother._id : '',
              spouseIds: state.spouses.map(s => s._id)
            }
            if (isEdit) await api().call('updateMember', Object.assign({ id: params.id }, payload))
            else await api().call('addMember', payload)
            UI.toast(isEdit ? '已保存' : '已添加')
            setTimeout(() => history.back(), 300)
          } catch (e) { UI.toast(e.message) }
        })
      }

      render()
    }
  }
})()
