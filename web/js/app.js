// 全局壳：hash 路由 / 底部导航 / 演示身份栏 / 账号切换器
(function () {
  const api = () => window.FamilyAPI

  const TABS = [
    { name: 'index', text: '族谱', icon: 'tab-tree' },
    { name: 'member-list', text: '成员', icon: 'tab-members' },
    { name: 'timeline', text: '大事记', icon: 'tab-moments' },
    { name: 'profile', text: '我的', icon: 'tab-mine' }
  ]

  window.App = {
    state: { user: null, ctx: null },
    setContext(ctx) { this.state.ctx = ctx },
    clearContext() { this.state.ctx = null },
    go(path) { location.hash = '#' + path },
    rerender() { route() },

    showTabbar(active) {
      const bar = document.getElementById('tabbar')
      bar.style.display = 'flex'
      bar.innerHTML = TABS.map(t =>
        '<div class="tab-item' + (active === t.name ? ' active' : '') + '" data-tab="' + t.name + '">' +
        '<img src="images/' + t.icon + (active === t.name ? '-active' : '') + '.png">' +
        '<div>' + t.text + '</div></div>'
      ).join('')
      bar.querySelectorAll('[data-tab]').forEach(el => {
        el.onclick = () => App.go('/' + el.getAttribute('data-tab'))
      })
    },
    hideTabbar() {
      document.getElementById('tabbar').style.display = 'none'
    },

    refreshDemoBar() {
      const bar = document.getElementById('demo-bar')
      if (!api().demo.current()) {
        bar.style.display = 'none'
        return
      }
      const accounts = api().demo.accounts()
      const cur = accounts.find(a => a.openid === api().demo.current())
      bar.style.display = 'flex'
      bar.innerHTML =
        '<span class="demo-user">🎭 演示身份：' +
        (cur
          ? (cur.avatarUrl
            ? '<img src="' + cur.avatarUrl + '">'
            : '<span class="demo-av">' + UI.esc((cur.nickname || '?').charAt(0)) + '</span>') +
            '<span>' + UI.esc(cur.nickname || '未设置昵称') + '</span>'
          : '<span>未登录</span>') +
        '</span><span class="demo-switch">切换账号 ›</span>'
      bar.onclick = () => App.showAccountSwitcher()
    },

    // 模拟“换一台手机登录另一个微信号”
    showAccountSwitcher() {
      const accounts = api().demo.accounts()
      const cur = api().demo.current()
      const rows = accounts.map(a =>
        '<div class="mp-item' + (a.openid === cur ? ' active' : '') + '" data-oid="' + a.openid + '">' +
        (a.avatarUrl
          ? '<img class="mp-avatar" src="' + a.avatarUrl + '">'
          : '<div class="mp-avatar mp-avatar-ph g0">' + UI.esc((a.nickname || '?').charAt(0)) + '</div>') +
        '<div class="mp-info"><div class="mp-name">' + UI.esc(a.nickname || '未设置昵称') +
        (a.openid === cur ? ' <span class="tag tag-green">当前</span>' : '') + '</div>' +
        '<div class="muted">已加入 ' + a.familyCount + ' 个家族</div></div></div>'
      ).join('')
      const sheet = UI.sheet(
        '<div class="sheet-header"><div class="sheet-title">切换演示微信账号</div><span class="sheet-close">✕</span></div>' +
        '<div class="form-tip" style="margin:0 0 8px;">相当于换一台手机登录另一个微信号，用于演示审批、权限等多人场景</div>' +
        '<div class="mp-list">' + (rows || '<div class="mp-empty">暂无账号</div>') + '</div>' +
        '<button class="btn btn-plain" id="acc-new">＋ 新建模拟微信账号</button>'
      )
      const close = () => sheet.close()
      sheet.el.querySelector('.sheet-close').addEventListener('click', close)
      sheet.el.addEventListener('click', async e => {
        if (e.target.closest('#acc-new')) {
          api().demo.createAccount()
          close()
          App.clearContext()
          App.refreshDemoBar()
          App.go('/welcome')
          return
        }
        const row = e.target.closest('[data-oid]')
        if (row) {
          api().demo.switchTo(row.getAttribute('data-oid'))
          close()
          App.clearContext()
          App.refreshDemoBar()
          App.go('/index')
        }
      })
    }
  }

  /* ---------- 路由 ---------- */
  function currentRoute() {
    const raw = (location.hash || '#/index').slice(1)
    const q = raw.indexOf('?')
    const path = q >= 0 ? raw.slice(0, q) : raw
    const params = {}
    if (q >= 0) {
      new URLSearchParams(raw.slice(q + 1)).forEach((v, k) => { params[k] = v })
    }
    return { name: path.replace(/^\//, '') || 'index', params }
  }

  async function route() {
    const { name, params } = currentRoute()
    if (!api().demo.current() && name !== 'welcome') {
      location.hash = '#/welcome'
      return
    }
    App.refreshDemoBar()
    window.scrollTo(0, 0)
    const page = window.Pages[name] || window.Pages.index
    try {
      await page.render(params)
    } catch (e) {
      console.error(e)
      UI.toast(e.message || '页面加载失败')
    }
  }

  window.addEventListener('hashchange', route)
  window.addEventListener('DOMContentLoaded', route)
})()
