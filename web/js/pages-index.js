// index（族谱树）与 tree-view（支系视图）
(function () {
  const UI = window.UI
  const api = () => window.FamilyAPI

  window.Pages = window.Pages || {}

  async function nodeMenu(id, ctx, selfId) {
    const canEdit = ['editor', 'admin', 'owner'].indexOf(ctx.role) >= 0
    const items = ['查看资料', '查看支系']
    const acts = ['detail', 'branch']
    if (canEdit) { items.push('编辑资料'); acts.push('edit') }
    if (canEdit) { items.push('添加子女'); acts.push('addchild') }
    if (selfId && selfId !== id) { items.push('设为本人'); acts.push('self') }
    const idx = await UI.actionSheet(items)
    if (idx < 0) return
    const act = acts[idx]
    if (act === 'detail') App.go('/member-detail?id=' + id)
    else if (act === 'branch') App.go('/tree-view?id=' + id)
    else if (act === 'edit') App.go('/member-edit?id=' + id)
    else if (act === 'addchild') App.go('/member-edit?childOf=' + id)
    else if (act === 'self') {
      try {
        await api().call('setSelfMember', { familyId: ctx.family._id, memberId: id })
        UI.toast('已设为本人')
        App.rerender()
      } catch (e) { UI.toast(e.message) }
    }
  }

  function bindTreeEvents(view, ctx, selfId) {
    view.onclick = async e => {
      const menu = e.target.closest('[data-menu]')
      if (menu) {
        e.stopPropagation()
        await nodeMenu(menu.getAttribute('data-menu'), ctx, selfId)
        return
      }
      const card = e.target.closest('.tn-card[data-id]')
      if (card) {
        App.go('/member-detail?id=' + card.getAttribute('data-id'))
      }
    }
  }

  window.Pages.index = {
    async render() {
      App.showTabbar('index')
        const view = document.getElementById('view')
        try {
          const ctx = await api().call('getFamilyContext', {})
        if (!ctx || !ctx.inFamily) {
          App.clearContext()
          view.innerHTML =
            '<div class="empty"><div class="empty-icon">🌳</div><div>你还未加入任何家族</div>' +
            '<div class="muted" style="margin:6px 0 15px;">创建家族，或用邀请码加入家人的家族</div>' +
            '<button class="btn btn-primary" style="margin:0 40px;" id="i-go-welcome">创建 / 加入家族</button></div>'
          view.querySelector('#i-go-welcome').onclick = () => App.go('/welcome')
          return
        }
        App.setContext(ctx)
        const tree = await api().call('getTree', { familyId: ctx.family._id })
        const canManage = ['admin', 'owner'].indexOf(ctx.role) >= 0
        document.title = (ctx.family.name || '家族族谱') + ' · Web 版'

        // 近 30 天寿星提醒（从树上的全部成员收集出生日期）
        const people = []
        const seen = {}
        const collect = n => {
          if (!n || seen[n._id]) return
          seen[n._id] = true
          people.push(n)
          ;(n.spouses || []).forEach(s => { if (!seen[s._id]) { seen[s._id] = true; people.push(s) } })
          ;(n.children || []).forEach(collect)
        }
        tree.roots.forEach(collect)
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const birthdays = people
          .filter(p => p.isAlive !== false && p.birthDate && p.birthDate.length >= 10)
          .map(p => {
            const mm = Number(p.birthDate.slice(5, 7)), dd = Number(p.birthDate.slice(8, 10))
            if (isNaN(mm) || isNaN(dd)) return null
            let next = new Date(now.getFullYear(), mm - 1, dd)
            if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd)
            const days = Math.round((next - today) / 86400000)
            return { _id: p._id, name: p.name, md: mm + '月' + dd + '日', days }
          })
          .filter(x => x && x.days <= 30)
          .sort((a, b) => a.days - b.days)
          .slice(0, 3)
        const bdHtml = birthdays.length
          ? '<div class="bd-banner"><span class="bd-icon">🎂</span><span class="bd-label">近期寿星</span>' +
            birthdays.map(b =>
              '<span class="bd-item" data-id="' + b._id + '">' + UI.esc(b.name) + '·' + b.md +
              (b.days === 0 ? '（今天）' : '（还有' + b.days + '天）') + '</span>'
            ).join('') + '</div>'
          : ''

        const toolbar =
          '<div class="toolbar"><div class="toolbar-left" id="i-stats" style="cursor:pointer;">' +
          '<div class="toolbar-family">' + UI.esc(ctx.family.name) + '</div>' +
          '<div class="toolbar-sub"><span class="tag tag-gold">' + window.Components.roleName(ctx.role) + '</span>' +
          '<span class="muted">' + tree.total + ' 位族人 · ' + UI.esc(ctx.family.surname || '') + '</span></div></div>' +
          '<div class="toolbar-right">' +
          (tree.selfMemberId ? '<span class="tool-btn" id="i-self">📍我</span>' : '') +
          (canManage ? '<span class="tool-btn" id="i-admin">管理' + (ctx.pendingCount ? '<span class="badge-dot">' + ctx.pendingCount + '</span>' : '') + '</span>' : '') +
          // 邀请码仅管理角色可见（与云函数 getFamilyContext 的脱敏规则一致）
          (canManage ? '<span class="tool-btn green" id="i-invite">邀请</span>' : '') +
          '</div></div>'

        let body
        if (!tree.roots.length) {
          body = '<div class="empty"><div class="empty-icon">🌱</div><div>族谱还是空的</div><div class="muted" style="margin-top:6px;">去「成员」页添加第一位族人吧</div></div>'
        } else {
          body =
            '<div class="tree-scroll"><div class="tree-canvas">' +
            tree.roots.map(r => '<div class="tree-root">' + window.Components.treeNodeHtml(r, tree.selfMemberId) + '</div>').join('') +
            '</div></div>'
        }
        view.innerHTML = toolbar + bdHtml + body

        view.querySelectorAll('.bd-item').forEach(el => {
          el.onclick = () => App.go('/member-detail?id=' + el.getAttribute('data-id'))
        })
        view.querySelector('#i-stats').onclick = () => App.go('/stats')
        const selfBtn = view.querySelector('#i-self')
        if (selfBtn) selfBtn.onclick = () => App.go('/tree-view?id=' + tree.selfMemberId)
        const adminBtn = view.querySelector('#i-admin')
        if (adminBtn) adminBtn.onclick = () => App.go('/family-admin')
        const inviteBtn = view.querySelector('#i-invite')
        if (inviteBtn) {
          inviteBtn.onclick = () => {
            const url = location.href.split('#')[0] + '#/welcome?code=' + ctx.family.inviteCode
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(() => UI.toast('邀请链接已复制'))
            } else {
              UI.toast('邀请码：' + ctx.family.inviteCode)
            }
          }
        }

        bindTreeEvents(view, ctx, tree.selfMemberId)
      } catch (e) {
        UI.toast(e.message)
      }
    }
  }

  window.Pages['tree-view'] = {
    async render(params) {
      App.hideTabbar()
      const view = document.getElementById('view')
      try {
        let ctx = App.state.ctx
        if (!ctx || !ctx.family) {
          ctx = await api().call('getFamilyContext', {})
          if (ctx && ctx.inFamily) App.setContext(ctx)
        }
        if (!ctx || !ctx.inFamily) { App.go('/index'); return }
        const tree = await api().call('getTree', { familyId: ctx.family._id, rootId: params.id })
        const name = tree.roots.length ? tree.roots[0].name : ''
        document.title = name ? name + ' 的支系' : '支系视图'
        const hint = name ? '<div class="tv-root-hint">以下为 ' + UI.esc(name) + ' 及其后代</div>' : ''
        const body = !tree.roots.length
          ? '<div class="empty"><div class="empty-icon">🍃</div><div>未找到该成员的支系</div></div>'
          : '<div class="tree-scroll"><div class="tree-canvas">' + hint +
            '<div class="tree-root">' + window.Components.treeNodeHtml(tree.roots[0], tree.selfMemberId) + '</div></div></div>'
        view.innerHTML = UI.navbarHtml('支系视图') + body
        UI.bindNavbar(view)
        bindTreeEvents(view, ctx, tree.selfMemberId)
      } catch (e) {
        UI.toast(e.message)
      }
    }
  }
})()
