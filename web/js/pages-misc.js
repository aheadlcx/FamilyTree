// timeline / event-edit / stats / profile / family-admin
(function () {
  const UI = window.UI
  const esc = UI.esc
  const api = () => window.FamilyAPI

  window.Pages = window.Pages || {}

  async function ensureCtx() {
    let ctx = App.state.ctx
    if (!ctx || !ctx.family) {
      ctx = await api().call('getFamilyContext', {})
      if (ctx && ctx.inFamily) App.setContext(ctx)
    }
    return ctx && ctx.inFamily ? ctx : null
  }

  function noFamilyHtml() {
    return '<div class="empty"><div class="empty-icon">🌳</div><div>你还未加入任何家族</div>' +
      '<button class="btn btn-primary" style="margin:15px 40px 0;" id="nf-go">创建 / 加入家族</button></div>'
  }
  function bindNoFamily(view) {
    const b = view.querySelector('#nf-go')
    if (b) b.onclick = () => App.go('/welcome')
  }

  /* ================= 大事记 ================= */
  window.Pages.timeline = {
    async render() {
      App.showTabbar('timeline')
      const view = document.getElementById('view')
      try {
        const ctx = await ensureCtx()
        if (!ctx) { App.clearContext(); view.innerHTML = noFamilyHtml(); bindNoFamily(view); return }
        const r = await api().call('listEvents', { familyId: ctx.family._id })
        const canEdit = ['editor', 'admin', 'owner'].indexOf(ctx.role) >= 0
        const canManage = ['admin', 'owner'].indexOf(ctx.role) >= 0

        const body = !r.events.length
          ? '<div class="empty"><div class="empty-icon">📜</div><div>还没有大事记</div><div class="muted" style="margin-top:6px;">婚丧嫁娶、寿诞、团圆、乔迁…都值得记录</div></div>'
          : '<div class="tl-wrap">' + r.events.map(e =>
            '<div class="card tl-item"><span class="tl-dot-line"></span>' +
            '<span class="tl-date">' + esc(e.date) + '</span>' +
            '<div class="tl-title">' + esc(e.title) + '</div>' +
            (e.description ? '<div class="tl-desc">' + esc(e.description) + '</div>' : '') +
            (e.images.length
              ? '<div class="tl-images">' + e.images.map(img => '<img class="tl-img" src="' + img + '" data-img="' + esc(e._id) + '">').join('') + '</div>'
              : '') +
            '<div class="tl-foot"><span class="muted">' + esc(e.creator || '家族成员') + '记录</span>' +
            (canEdit
              ? '<span class="tl-actions"><span class="tl-act" data-edit="' + e._id + '">编辑</span>' +
                (canManage ? '<span class="tl-act tl-act-del" data-del="' + e._id + '">删除</span>' : '') + '</span>'
              : '') +
            '</div></div>'
          ).join('') + '</div>'

        view.innerHTML = body + (canEdit ? '<button class="fab" id="tl-add">＋</button>' : '')
        const add = view.querySelector('#tl-add')
        if (add) add.onclick = () => App.go('/event-edit')

        view.onclick = async e => {
          const img = e.target.closest('[data-img]')
          if (img) { UI.lightbox(img.getAttribute('src')); return }
          const ed = e.target.closest('[data-edit]')
          if (ed) { App.go('/event-edit?id=' + ed.getAttribute('data-edit')); return }
          const del = e.target.closest('[data-del]')
          if (del) {
            const ok = await UI.confirm({ title: '删除大事记', content: '确定删除这条大事记吗？', danger: true })
            if (!ok) return
            try {
              await api().call('removeEvent', { id: del.getAttribute('data-del') })
              UI.toast('已删除')
              this.render()
            } catch (err) { UI.toast(err.message) }
          }
        }
      } catch (e) { UI.toast(e.message) }
    }
  }

  /* ================= 大事记编辑 ================= */
  window.Pages['event-edit'] = {
    async render(params) {
      App.hideTabbar()
      const view = document.getElementById('view')
      const isEdit = !!params.id
      const state = { title: '', date: '', description: '', images: [] }
      document.title = isEdit ? '编辑大事记' : '添加大事记'

      try {
        if (isEdit) {
          const r = await api().call('getEvent', { id: params.id })
          Object.assign(state, { title: r.event.title, date: r.event.date, description: r.event.description, images: r.event.images })
        }
      } catch (e) { UI.toast(e.message) }

      function imgHtml() {
        return state.images.map((img, i) =>
          '<span class="ee-img-wrap"><img class="ee-img" src="' + img + '" data-pv="' + i + '">' +
          '<span class="ee-img-del" data-rm="' + i + '">✕</span></span>'
        ).join('') +
        (state.images.length < 9 ? '<span class="ee-img-add" id="ee-add">＋</span>' : '')
      }

      function render() {
        view.innerHTML = UI.navbarHtml(isEdit ? '编辑大事记' : '添加大事记') +
          '<div class="card">' +
          '<div class="form-item"><div class="form-label">标题</div><input class="form-input" id="ee-title" placeholder="如：爷爷八十大寿" value="' + esc(state.title) + '"></div>' +
          '<div class="form-item"><div class="form-label">日期</div><input class="form-input" type="date" id="ee-date" value="' + esc(state.date) + '" min="1800-01-01" max="2100-12-31"></div>' +
          '</div>' +
          '<div class="card"><div class="h2">详情</div>' +
          '<textarea class="form-textarea" id="ee-desc" maxlength="2000" placeholder="记录这件事的来龙去脉…">' + esc(state.description) + '</textarea></div>' +
          '<div class="card"><div class="h2">照片（' + state.images.length + '/9）</div>' +
          '<div class="ee-images" id="ee-images">' + imgHtml() + '</div>' +
          '<div class="form-tip">图片自动压缩存本地（对应云存储），仅家族成员可见</div></div>' +
          '<div class="safe-bottom"><button class="btn btn-primary" style="margin:5px 12px;" id="ee-save">保存</button></div>'
        bind()
      }

      function bind() {
        UI.bindNavbar(view)
        const imagesEl = view.querySelector('#ee-images')
        imagesEl.addEventListener('click', async e => {
          const rm = e.target.closest('[data-rm]')
          if (rm) {
            state.images.splice(Number(rm.getAttribute('data-rm')), 1)
            imagesEl.innerHTML = imgHtml()
            bind2()
            return
          }
          const pv = e.target.closest('[data-pv]')
          if (pv) UI.lightbox(state.images[Number(pv.getAttribute('data-pv'))])
        })
        function bind2() {
          const addBtn = imagesEl.querySelector('#ee-add')
          if (addBtn) addBtn.onclick = async () => {
            const img = await UI.chooseImage(480)
            if (img) {
              state.images.push(img)
              imagesEl.innerHTML = imgHtml()
              bind2()
            }
          }
        }
        bind2()

        view.querySelector('#ee-save').onclick = async () => {
          const ctx = await ensureCtx()
          if (!ctx) { UI.toast('请先加入家族'); return }
          const title = view.querySelector('#ee-title').value
          const date = view.querySelector('#ee-date').value
          const description = view.querySelector('#ee-desc').value
          if (!title.trim()) { UI.toast('请填写标题'); return }
          if (!date) { UI.toast('请选择日期'); return }
          try {
            const payload = { familyId: ctx.family._id, title: title.trim(), date, description, images: state.images }
            if (isEdit) await api().call('updateEvent', Object.assign({ id: params.id }, payload))
            else await api().call('addEvent', payload)
            UI.toast('已保存')
            setTimeout(() => history.back(), 300)
          } catch (e) { UI.toast(e.message) }
        }
      }

      render()
    }
  }

  /* ================= 统计 ================= */
  window.Pages.stats = {
    async render() {
      App.hideTabbar()
      const view = document.getElementById('view')
      try {
        const ctx = await ensureCtx()
        if (!ctx) { App.clearContext(); view.innerHTML = noFamilyHtml(); bindNoFamily(view); return }
        const s = await api().call('getStats', { familyId: ctx.family._id })
        const genMax = Math.max.apply(null, [1].concat(s.genDist.map(g => g.count)))
        const decMax = Math.max.apply(null, [1].concat(s.decadeDist.map(d => d.count)))

        let life = ''
        if (s.avgLifespan !== null || s.oldest) {
          life = '<div class="card"><div class="h2">寿命</div>' +
            (s.avgLifespan !== null ? '<div class="st-line"><span>已故族人平均寿命</span><span class="st-strong">' + s.avgLifespan + ' 岁</span></div>' : '') +
            (s.oldest ? '<div class="st-line"><span>最长寿</span><span class="st-strong">' + esc(s.oldest.name) + '（' + s.oldest.age + ' 岁）</span></div>' : '') +
            '</div>'
        }

        view.innerHTML = UI.navbarHtml('族谱统计') +
          '<div class="card"><div class="h2">' + esc(s.familyName) + ' · 总览</div><div class="st-grid">' +
          '<div class="st-cell"><div class="st-num">' + s.total + '</div><div class="st-label">族人总数</div></div>' +
          '<div class="st-cell"><div class="st-num">' + s.generations + '</div><div class="st-label">传承世代</div></div>' +
          '<div class="st-cell"><div class="st-num">' + s.alive + '</div><div class="st-label">在世</div></div>' +
          '<div class="st-cell"><div class="st-num">' + s.deceased + '</div><div class="st-label">已故</div></div>' +
          '</div></div>' +

          '<div class="card"><div class="h2">性别构成</div><div class="st-grid st-grid-3">' +
          '<div class="st-cell"><div class="st-num" style="color:#3d7eff;">' + s.male + '</div><div class="st-label">男</div></div>' +
          '<div class="st-cell"><div class="st-num" style="color:#ff7aa0;">' + s.female + '</div><div class="st-label">女</div></div>' +
          '<div class="st-cell"><div class="st-num">' + s.unknown + '</div><div class="st-label">未知</div></div>' +
          '</div></div>' +

          life +

          (s.genDist.length
            ? '<div class="card"><div class="h2">世代分布</div>' + s.genDist.map(g =>
              '<div class="st-bar-row"><span class="st-bar-label">第' + (g.gen + 1) + '世</span>' +
              '<span class="st-bar-track"><span class="st-bar-fill" style="display:block;width:' + Math.round(g.count / genMax * 100) + '%;"></span></span>' +
              '<span class="st-bar-num">' + g.count + '</span></div>').join('') + '</div>'
            : '') +

          (s.decadeDist.length
            ? '<div class="card"><div class="h2">出生年代分布</div>' + s.decadeDist.map(d =>
              '<div class="st-bar-row"><span class="st-bar-label">' + esc(d.decade) + '</span>' +
              '<span class="st-bar-track"><span class="st-bar-fill st-bar-gold" style="display:block;width:' + Math.round(d.count / decMax * 100) + '%;"></span></span>' +
              '<span class="st-bar-num">' + d.count + '</span></div>').join('') + '</div>'
            : '') +

          '<div class="card safe-bottom"><div class="st-line"><span>今年新增族人</span><span class="st-strong">' + s.addedThisYear + ' 位</span></div></div>'

        UI.bindNavbar(view)
      } catch (e) { UI.toast(e.message) }
    }
  }

  /* ================= 我的 ================= */
  window.Pages.profile = {
    async render() {
      App.showTabbar('profile')
      const view = document.getElementById('view')
      try {
        const r = await api().call('login', {})
        App.state.user = r.user
        const ctxRes = await api().call('getFamilyContext', {})
        if (ctxRes && ctxRes.inFamily) App.setContext(ctxRes)
        else App.clearContext()
        const ctx = ctxRes && ctxRes.inFamily ? ctxRes : null
        const [fams, pend] = await Promise.all([
          api().call('listMyFamilies', {}).catch(() => ({ families: [] })),
          api().call('myPendingRequests', {}).catch(() => ({ requests: [] }))
        ])
        let selfName = ''
        if (ctx && ctx.selfMemberId) {
          try {
            const mr = await api().call('getMember', { id: ctx.selfMemberId })
            selfName = mr.member.name
          } catch (e) { /* ignore */ }
        }

        const statusTag = st => '<span class="tag ' + (st === 'pending' ? 'tag-gold' : (st === 'approved' ? 'tag-green' : 'tag-red')) + '">' +
          (st === 'pending' ? '审核中' : (st === 'approved' ? '已通过' : '已拒绝')) + '</span>'

        view.innerHTML =
          '<div class="card pf-user">' +
          '<div class="pf-avatar-wrap" id="pf-avatar-btn" title="点击更换头像">' +
          (r.user.avatarUrl
            ? '<img class="pf-avatar" id="pf-avatar" src="' + r.user.avatarUrl + '">'
            : '<div class="pf-avatar pf-avatar-ph">像</div>') +
          '<span class="pf-avatar-edit">改</span></div>' +
          '<div class="pf-user-info"><div class="pf-name" id="pf-nick">' + esc(r.user.nickname || '未设置昵称') + ' <span class="pf-edit">✎</span></div>' +
          '<div class="muted">已通过微信登录验证（模拟账号：' + esc(api().demo.current().slice(0, 10)) + '…）</div></div></div>' +

          '<div class="card"><div class="h2">当前家族</div>' +
          (ctx
            ? '<div class="cell" id="pf-home"><div><div class="cell-title">' + esc(ctx.family.name) + '</div>' +
              '<div class="muted">' + ctx.memberCount + ' 位族人' + (selfName ? ' · 我是 ' + esc(selfName) : '') + '</div></div>' +
              '<div class="cell-right"><span class="tag tag-gold">' + window.Components.roleName(ctx.role) + '</span><span class="arrow">›</span></div></div>' +
              (fams.families.length > 1 ? '<div class="cell" id="pf-switch"><div class="cell-title">切换家族</div><div class="cell-right">共 ' + fams.families.length + ' 个<span class="arrow">›</span></div></div>' : '') +
              (ctx.selfMemberId ? '<div class="cell" id="pf-me"><div class="cell-title">我的族谱资料</div><div class="cell-right"><span class="arrow">›</span></div></div>' : '') +
              (ctx.role === 'owner' || ctx.role === 'admin'
                ? '<div class="cell" id="pf-admin"><div class="cell-title">家族管理' + (ctx.pendingCount ? '<span class="badge-dot">' + ctx.pendingCount + '</span>' : '') + '</div><div class="cell-right">审批 / 邀请 / 权限<span class="arrow">›</span></div></div>'
                : '')
            : '<div class="muted" style="padding:4px 0;">你还未加入家族</div>' +
              '<button class="btn btn-primary" id="pf-welcome">创建 / 加入家族</button>') +
          '</div>' +

          (pend.requests.length
            ? '<div class="card"><div class="h2">我的加入申请</div>' +
              pend.requests.map(x => '<div class="cell" style="cursor:default;"><div class="cell-title">' + esc(x.familyName) + '</div><div class="cell-right">' + statusTag(x.status) + '</div></div>').join('') + '</div>'
            : '') +

          '<div class="card"><div class="cell" id="pf-switch-user" style="cursor:pointer;"><div class="cell-title">切换演示微信账号</div><div class="cell-right">多角色联调<span class="arrow">›</span></div></div>' +
          '<div class="cell" id="pf-help-toggle" style="cursor:pointer;"><div class="cell-title">使用帮助</div><div class="cell-right"><span class="arrow">⌄</span></div></div>' +
          '<div class="pf-help" id="pf-help" style="display:none;">' +
          '<div class="pf-help-item"><span class="pf-help-k">① 权限说明</span> 族主拥有全部权限；管理员可审批、增删成员、管理家族；编辑员可添加/修改族员与大事记；浏览仅可查看。</div>' +
          '<div class="pf-help-item"><span class="pf-help-k">② 邀请家人</span> 在「族谱」页右上角点「邀请」复制链接/邀请码，切换到另一个演示账号即可申请加入，再切回管理员审批。</div>' +
          '<div class="pf-help-item"><span class="pf-help-k">③ 修谱建议</span> 先添加始祖（不填父母即为第一世），再依次为每人添加子女，世代数自动计算；父母/配偶可在选人弹层中直接新建入谱并自动关联。</div>' +
          '<div class="pf-help-item"><span class="pf-help-k">④ 数据安全</span> Web 版数据保存在浏览器 localStorage，与小程序版共用同一套业务逻辑；可随时导出 JSON 备份。</div>' +
          '</div></div>' +

          '<div class="card safe-bottom">' +
          '<button class="btn btn-warn" id="pf-logout">退出登录</button>' +
          '<button class="btn btn-plain" id="pf-reset">清空演示数据（重置）</button>' +
          '<div class="muted" style="text-align:center;margin-top:10px;">家族族谱 · Web 版 v1.0（与小程序版逻辑一致）</div></div>'

        const $ = id => view.querySelector(id)
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn }
        const rerender = () => this.render()

        $('#pf-avatar-btn').onclick = async () => {
          const img = await UI.chooseImage(160, 0.7)
          if (!img) return
          try {
            await api().call('updateProfile', { avatarUrl: img })
            UI.toast('头像已更新')
            rerender()
          } catch (e) { UI.toast(e.message) }
        }
        $('#pf-nick').onclick = async () => {
          const v = await UI.prompt({ title: '修改昵称', value: r.user.nickname || '', placeholder: '输入新的昵称' })
          if (v === null) return
          try {
            await api().call('updateProfile', { nickname: v })
            UI.toast('已保存')
            rerender()
          } catch (e) { UI.toast(e.message) }
        }
        on('#pf-home', () => App.go('/index'))
        on('#pf-switch', async () => {
          const list = fams.families
          const idx = await UI.actionSheet(list.map(f => f.name + (f.isCurrent ? '（当前）' : '')))
          if (idx < 0 || list[idx].isCurrent) return
          try {
            await api().call('switchFamily', { familyId: list[idx].familyId })
            App.clearContext()
            UI.toast('已切换')
            rerender()
          } catch (e) { UI.toast(e.message) }
        })
        on('#pf-me', () => App.go('/member-detail?id=' + ctx.selfMemberId))
        on('#pf-admin', () => App.go('/family-admin'))
        on('#pf-welcome', () => App.go('/welcome'))
        on('#pf-switch-user', () => App.showAccountSwitcher())
        on('#pf-help-toggle', () => {
          const el = $('#pf-help')
          el.style.display = el.style.display === 'none' ? 'block' : 'none'
        })
        on('#pf-logout', async () => {
          const ok = await UI.confirm({ title: '退出登录', content: '仅清除本机登录状态，族谱数据不受影响。' })
          if (!ok) return
          api().demo.logout()
          App.clearContext()
          App.refreshDemoBar()
          App.go('/welcome')
        })
        on('#pf-reset', async () => {
          const ok = await UI.confirm({ title: '清空演示数据', content: '将删除本浏览器中的全部演示数据（不可恢复），确定？', danger: true })
          if (!ok) return
          api().demo.reset()
          App.clearContext()
          App.refreshDemoBar()
          App.go('/welcome')
        })
      } catch (e) { UI.toast(e.message) }
    }
  }

  /* ================= 家族管理 ================= */
  window.Pages['family-admin'] = {
    async render() {
      App.hideTabbar()
      const view = document.getElementById('view')
      try {
        const ctx = await api().call('getFamilyContext', {})
        if (!ctx || !ctx.inFamily) { App.clearContext(); App.go('/index'); return }
        if (!['admin', 'owner'].includes(ctx.role)) {
          view.innerHTML = UI.navbarHtml('家族管理') + '<div class="empty"><div class="empty-icon">🔒</div><div>需要管理员及以上权限</div></div>'
          UI.bindNavbar(view)
          return
        }
        App.setContext(ctx)
        const isOwner = ctx.role === 'owner'
        const f = ctx.family
        const [reqs, us, logs] = await Promise.all([
          api().call('listJoinRequests', { familyId: f._id }).catch(() => ({ requests: [] })),
          api().call('listFamilyUsers', { familyId: f._id }).catch(() => ({ users: [] })),
          api().call('listAuditLogs', { familyId: f._id }).catch(() => ({ logs: [] }))
        ])

        const av = u => u.avatarUrl
          ? '<img class="fa-avatar" src="' + u.avatarUrl + '">'
          : '<div class="fa-avatar fa-avatar-ph">' + esc((u.nickname || '?').charAt(0)) + '</div>'

        const pendingHtml = !reqs.requests.length
          ? '<div class="muted">暂无待审批申请</div>'
          : reqs.requests.map(rq =>
            '<div class="cell" style="cursor:default;">' + av(rq) +
            '<div class="fa-mid"><div class="cell-title">' + esc(rq.nickname) + '</div>' +
            '<div class="muted">' + esc(rq.message || UI.fmtTime(rq.createdAt)) + '</div></div>' +
            '<div class="fa-ops"><button class="btn-mini btn-primary" data-ok="' + rq._id + '">通过</button>' +
            '<button class="btn-mini btn-warn" data-no="' + rq._id + '">拒绝</button></div></div>'
          ).join('')

        const usersHtml = us.users.map(u => {
          const locked = u.role === 'owner' || (!isOwner && u.role === 'admin')
          return '<div class="cell" style="cursor:default;">' + av(u) +
            '<div class="fa-mid"><div class="cell-title">' + (u.role === 'owner' ? '👑 ' : '') + esc(u.nickname) + '</div>' +
            '<div class="muted">' + window.Components.roleName(u.role) + ' · ' + UI.fmtDay(u.joinedAt) + '加入</div></div>' +
            (locked
              ? '<span class="muted">不可操作</span>'
              : '<div class="fa-ops"><select data-role="' + u.openid + '">' +
                '<option value="viewer"' + (u.role === 'viewer' ? ' selected' : '') + '>浏览</option>' +
                '<option value="editor"' + (u.role === 'editor' ? ' selected' : '') + '>编辑员</option>' +
                '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>管理员</option>' +
                '</select>' +
                '<button class="btn-mini btn-warn" data-rm-user="' + u.openid + '" data-name="' + esc(u.nickname) + '">移出</button></div>') +
            '</div>'
        }).join('')

        const logsHtml = !logs.logs.length
          ? '<div class="muted">暂无日志</div>'
          : logs.logs.map(l =>
            '<div class="fa-log"><div><span class="fa-log-op">' + esc(l.operator) + '</span>' +
            '<span class="fa-log-act">' + esc(l.action) + '</span>' +
            (l.detail ? '<span class="muted"> · ' + esc(l.detail) + '</span>' : '') +
            '</div><span class="muted">' + UI.fmtTime(l.createdAt) + '</span></div>').join('')

        view.innerHTML = UI.navbarHtml('家族管理') +

          '<div class="card"><div class="h2">加入申请 <span class="badge-dot">' + reqs.requests.length + '</span></div>' + pendingHtml + '</div>' +

          '<div class="card"><div class="h2">邀请加入</div>' +
          '<div class="fa-invite"><span class="fa-code" id="fa-code" title="点击复制">' + esc(f.inviteCode) + '</span>' +
          '<span class="fa-invite-ops"><button class="btn-mini btn-plain" id="fa-copy-link">复制邀请链接</button>' +
          '<button class="btn-mini btn-plain" id="fa-regen">更换邀请码</button></span></div>' +
          '<div class="form-tip">新成员在登录后输入邀请码申请加入，或直接打开邀请链接。</div>' +
          '<div class="divider"></div>' +
          '<div class="form-item"><div class="form-label">自动通过</div><input type="checkbox" class="me-switch" id="fa-auto"' + (f.autoApprove ? ' checked' : '') + '></div>' +
          '<div class="form-item"><div class="form-label">新成员角色</div><select class="form-select" id="fa-defrole">' +
          '<option value="viewer"' + ((f.defaultRole || 'viewer') === 'viewer' ? ' selected' : '') + '>浏览（只读）</option>' +
          '<option value="editor"' + (f.defaultRole === 'editor' ? ' selected' : '') + '>编辑员（可增改）</option>' +
          '</select></div></div>' +

          '<div class="card"><div class="h2">成员与权限（' + us.users.length + '）</div>' + usersHtml +
          '<div class="form-tip">管理员可管理浏览/编辑员；修改或移出管理员需要族主操作。</div></div>' +

          '<div class="card"><div class="h2">家族设置</div>' +
          '<div class="form-item"><div class="form-label">家族名称</div><input class="form-input" id="fa-name" value="' + esc(f.name) + '"></div>' +
          '<div class="form-item"><div class="form-label">姓氏</div><input class="form-input" id="fa-surname" value="' + esc(f.surname || '') + '"></div>' +
          '<div class="form-item"><div class="form-label">简介</div><input class="form-input" id="fa-desc" value="' + esc(f.description || '') + '"></div>' +
          '<button class="btn btn-primary" id="fa-save">保存设置</button></div>' +

          '<div class="card"><div class="h2">操作日志</div>' + logsHtml + '</div>' +

          '<div class="card safe-bottom"><div class="h2" style="color:#e64340;">更多操作</div>' +
          '<button class="btn btn-plain" id="fa-export">📦 导出族谱数据（JSON 备份）</button>' +
          (!isOwner ? '<button class="btn btn-plain" id="fa-leave">退出家族</button>' : '') +
          (isOwner ? '<button class="btn btn-plain" id="fa-transfer">👑 转让族主</button><button class="btn btn-warn" id="fa-dissolve">解散家族（删除全部数据）</button>' : '') +
          '</div>'

        UI.bindNavbar(view)
        const $ = id => view.querySelector(id)
        const rerender = () => this.render()

        const copyText = (text, tip) => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => UI.toast(tip))
          } else {
            UI.toast(text)
          }
        }
        $('#fa-code').onclick = () => copyText(f.inviteCode, '邀请码已复制')
        $('#fa-copy-link').onclick = () => copyText(location.href.split('#')[0] + '#/welcome?code=' + f.inviteCode, '邀请链接已复制')
        $('#fa-regen').onclick = async () => {
          const ok = await UI.confirm({ title: '更换邀请码', content: '旧邀请码将立即失效，确定更换？' })
          if (!ok) return
          try {
            const r = await api().call('regenerateInviteCode', { familyId: f._id })
            UI.toast('已更换为 ' + r.inviteCode)
            rerender()
          } catch (e) { UI.toast(e.message) }
        }
        $('#fa-auto').addEventListener('change', async e => {
          try {
            await api().call('updateFamily', { familyId: f._id, autoApprove: e.target.checked })
            UI.toast('已保存')
          } catch (err) { UI.toast(err.message); e.target.checked = !e.target.checked }
        })
        $('#fa-defrole').addEventListener('change', async e => {
          try {
            await api().call('updateFamily', { familyId: f._id, defaultRole: e.target.value })
            UI.toast('已保存')
          } catch (err) { UI.toast(err.message) }
        })

        view.querySelectorAll('[data-ok]').forEach(b => {
          b.onclick = async () => {
            try {
              await api().call('handleJoinRequest', { id: b.getAttribute('data-ok'), approve: true })
              UI.toast('已通过')
              rerender()
            } catch (e) { UI.toast(e.message) }
          }
        })
        view.querySelectorAll('[data-no]').forEach(b => {
          b.onclick = async () => {
            try {
              await api().call('handleJoinRequest', { id: b.getAttribute('data-no'), approve: false })
              UI.toast('已拒绝')
              rerender()
            } catch (e) { UI.toast(e.message) }
          }
        })
        view.querySelectorAll('[data-role]').forEach(sel => {
          sel.addEventListener('change', async () => {
            const oid = sel.getAttribute('data-role')
            const u = us.users.find(x => x.openid === oid)
            const ok = await UI.confirm({ title: '修改角色', content: '将「' + u.nickname + '」设为' + window.Components.roleName(sel.value) + '？' })
            if (!ok) { rerender(); return }
            try {
              await api().call('setUserRole', { familyId: f._id, targetOpenid: oid, role: sel.value })
              UI.toast('已修改')
              rerender()
            } catch (e) { UI.toast(e.message); rerender() }
          })
        })
        view.querySelectorAll('[data-rm-user]').forEach(b => {
          b.onclick = async () => {
            const name = b.getAttribute('data-name')
            const ok = await UI.confirm({ title: '移出家族', content: '将「' + name + '」移出家族？其浏览权限立即失效。', danger: true })
            if (!ok) return
            try {
              await api().call('removeFamilyUser', { familyId: f._id, targetOpenid: b.getAttribute('data-rm-user') })
              UI.toast('已移出')
              rerender()
            } catch (e) { UI.toast(e.message) }
          }
        })

        $('#fa-save').onclick = async () => {
          const name = $('#fa-name').value
          if (!name.trim()) { UI.toast('名称不能为空'); return }
          try {
            await api().call('updateFamily', { familyId: f._id, name: name.trim(), surname: $('#fa-surname').value, description: $('#fa-desc').value })
            UI.toast('已保存')
            App.clearContext()
          } catch (e) { UI.toast(e.message) }
        }

        $('#fa-export').onclick = async () => {
          UI.loading('导出中…')
          try {
            const data = await api().call('exportFamily', { familyId: f._id })
            UI.hideLoading()
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = f.name + '-族谱备份-' + UI.fmtDay(Date.now()).replace(/-/g, '') + '.json'
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 3000)
          } catch (e) { UI.hideLoading(); UI.toast(e.message) }
        }

        const leave = $('#fa-leave')
        if (leave) {
          leave.onclick = async () => {
            const ok = await UI.confirm({ title: '退出家族', content: '确定退出当前家族？', danger: true })
            if (!ok) return
            try {
              await api().call('leaveFamily', { familyId: f._id })
              App.clearContext()
              App.go('/index')
            } catch (e) { UI.toast(e.message) }
          }
        }

        const transfer = $('#fa-transfer')
        if (transfer) {
          transfer.onclick = async () => {
            const candidates = us.users.filter(u => u.role !== 'owner')
            if (!candidates.length) { UI.toast('没有可转让的成员'); return }
            const sheet = UI.sheet('<div class="sheet-header"><div class="sheet-title">选择新族主</div><span class="sheet-close">✕</span></div>' +
              candidates.map(u => '<div class="sheet-action" data-oid="' + u.openid + '">' + esc(u.nickname) + '（' + window.Components.roleName(u.role) + '）</div>').join(''))
            sheet.el.querySelector('.sheet-close').addEventListener('click', () => sheet.close())
            sheet.el.addEventListener('click', async e => {
              const row = e.target.closest('[data-oid]')
              if (!row) return
              const u = candidates.find(x => x.openid === row.getAttribute('data-oid'))
              sheet.close()
              const ok = await UI.confirm({ title: '转让族主', content: '确定将族主转让给「' + u.nickname + '」？你将成为管理员。' })
              if (!ok) return
              try {
                await api().call('transferOwner', { familyId: f._id, targetOpenid: u.openid })
                UI.toast('已转让')
                rerender()
              } catch (err) { UI.toast(err.message) }
            })
          }
        }

        const dissolve = $('#fa-dissolve')
        if (dissolve) {
          dissolve.onclick = async () => {
            const ok1 = await UI.confirm({ title: '解散家族', content: '将删除全部族谱数据且不可恢复，确定继续？', danger: true })
            if (!ok1) return
            const ok2 = await UI.confirm({ title: '再次确认', content: '真的要永远删除「' + f.name + '」的所有数据吗？', danger: true })
            if (!ok2) return
            try {
              await api().call('dissolveFamily', { familyId: f._id })
              UI.toast('已解散')
              App.clearContext()
              setTimeout(() => App.go('/index'), 300)
            } catch (e) { UI.toast(e.message) }
          }
        }
      } catch (e) { UI.toast(e.message) }
    }
  }
})()
