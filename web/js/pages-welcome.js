// welcome 页：微信登录（模拟）→ 创建家族 / 邀请码加入（与小程序版逻辑一致）
(function () {
  const UI = window.UI
  const esc = UI.esc
  const api = () => window.FamilyAPI

  window.Pages = window.Pages || {}

  window.Pages.welcome = {
    async render(params) {
      App.hideTabbar()
      const view = document.getElementById('view')
      const state = {
        step: 'choice',
        avatarUrl: '',
        nickname: '',
        myFamilies: [],
        myPending: [],
        invite: null,
        inviteCode: (params && params.code) || '',
        submitting: false
      }

      function html() {
        let h = '<div class="hero"><div class="hero-title">家族族谱</div><div class="hero-sub">记录血脉 · 传承家风</div></div>'
        h +=
          '<div class="card"><div class="h2">微信身份</div><div class="profile-row">' +
          '<div class="avatar-btn" id="w-avatar-btn">' +
          (state.avatarUrl
            ? '<img class="pf-avatar" id="w-avatar" src="' + state.avatarUrl + '">'
            : '<div class="pf-avatar pf-avatar-ph" id="w-avatar">像</div>') +
          '<span class="pf-avatar-edit">改</span></div>' +
          '<input class="nick-input" id="w-nick" placeholder="填写微信昵称" value="' + esc(state.nickname) + '">' +
          '</div><div class="form-tip">Web 版使用模拟微信账号登录；头像昵称将展示给家族成员</div></div>'

        if (state.invite) {
          h +=
            '<div class="card invite-card"><div class="h2">收到邀请</div>' +
            '<div class="invite-name">「' + esc(state.invite.name) + '」邀请你加入家族</div>' +
            '<button class="btn btn-primary" id="w-join-invite">立即加入</button></div>'
        }
        if (state.myFamilies.length) {
          h += '<div class="card"><div class="h2">我的家族</div>' +
            state.myFamilies.map(f =>
              '<div class="cell" data-enter="' + f.familyId + '">' +
              '<div><div class="cell-title">' + esc(f.name) + '</div><div class="muted">' + f.memberCount + ' 位族人</div></div>' +
              '<div class="cell-right"><span class="tag tag-gold">' + esc(window.Components.roleName(f.role)) + '</span><span class="arrow">›</span></div></div>'
            ).join('') + '</div>'
        }
        if (state.myPending.length) {
          h += '<div class="card"><div class="h2">我的申请</div>' +
            state.myPending.map(r =>
              '<div class="cell" style="cursor:default;"><div class="cell-title">' + esc(r.familyName) + '</div>' +
              '<div class="cell-right"><span class="tag ' + (r.status === 'pending' ? 'tag-gold' : (r.status === 'approved' ? 'tag-green' : 'tag-red')) + '">' +
              (r.status === 'pending' ? '审核中' : (r.status === 'approved' ? '已通过' : '已拒绝')) +
              '</span></div></div>'
            ).join('') +
            '<button class="btn btn-plain" id="w-recheck">重新检查状态</button></div>'
        }

        if (state.step === 'choice') {
          h +=
            '<div class="card">' +
            '<button class="btn btn-primary" id="w-create">创建新家族</button>' +
            '<button class="btn btn-plain" id="w-join">用邀请码加入</button>' +
            '<button class="btn btn-plain" id="w-switch">切换其他微信账号（演示）</button>' +
            '</div>'
        } else if (state.step === 'create') {
          h +=
            '<div class="card"><div class="h2">创建家族</div>' +
            '<div class="form-item"><div class="form-label">家族名称</div><input class="form-input" id="f-name" placeholder="如：张氏家族 / 李家大院"></div>' +
            '<div class="form-item"><div class="form-label">姓氏</div><input class="form-input" id="f-surname" placeholder="如：张"></div>' +
            '<div class="form-item"><div class="form-label">家族简介</div><input class="form-input" id="f-desc" placeholder="祖籍、堂号、家风等（选填）"></div>' +
            '<button class="btn btn-primary" id="w-submit-create">创建（我将自动成为族主）</button>' +
            '<button class="btn btn-plain" id="w-back">返回</button></div>'
        } else if (state.step === 'join') {
          h +=
            '<div class="card"><div class="h2">加入家族</div>' +
            '<div class="form-item"><div class="form-label">邀请码</div><input class="form-input" id="f-code" placeholder="向家族管理员索取" value="' + esc(state.inviteCode) + '"></div>' +
            '<div class="form-item"><div class="form-label">申请留言</div><input class="form-input" id="f-msg" placeholder="如：我是张三之孙（选填）"></div>' +
            '<button class="btn btn-primary" id="w-submit-join">提交申请</button>' +
            '<button class="btn btn-plain" id="w-back">返回</button></div>'
        } else if (state.step === 'pending') {
          h += '<div class="card"><div class="h2">申请已提交</div><div class="muted">请等待家族管理员审核。可在右上角演示栏切换到管理员账号进行审批。</div></div>'
        }
        h += '<div class="muted" style="text-align:center;padding:15px 0 30px;">微信登录 · 云开发逻辑复刻 · 数据仅家族内可见</div>'
        return h
      }

      function bind() {
        const $ = id => view.querySelector(id)
        const avatarBtn = $('#w-avatar-btn')
        if (avatarBtn) {
          avatarBtn.onclick = async () => {
            const img = await UI.chooseImage(200)
            if (img) { state.avatarUrl = img; rerender() }
          }
        }
        const nick = $('#w-nick')
        if (nick) nick.addEventListener('input', () => { state.nickname = nick.value })

        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn }

        async function saveProfile() {
          if (state.avatarUrl && state.avatarUrl.indexOf('data:') === 0) {
            // 已是 dataURL，直接保存
          }
          await api().call('updateProfile', { nickname: state.nickname, avatarUrl: state.avatarUrl })
        }

        on('#w-create', () => { state.step = 'create'; rerender() })
        on('#w-join', () => { state.step = 'join'; rerender() })
        on('#w-back', () => { state.step = 'choice'; rerender() })

        on('#w-submit-create', async () => {
          const name = $('#f-name').value
          if (!name.trim()) { UI.toast('请填写家族名称'); return }
          state.submitting = true
          try {
            await saveProfile()
            await api().call('createFamily', {
              name,
              surname: $('#f-surname').value,
              description: $('#f-desc').value
            })
            App.clearContext()
            UI.toast('创建成功')
            setTimeout(() => { App.go('/index') }, 400)
          } catch (e) { state.submitting = false; UI.toast(e.message) }
        })

        on('#w-submit-join', async () => {
          const code = $('#f-code').value
          if (!code.trim()) { UI.toast('请输入邀请码'); return }
          try {
            await saveProfile()
            const r = await api().call('joinFamily', { code, message: $('#f-msg').value })
            if (r.approved) {
              App.clearContext()
              UI.toast('加入成功')
              setTimeout(() => { App.go('/index') }, 400)
            } else {
              state.step = 'pending'
              const pend = await api().call('myPendingRequests', {})
              state.myPending = pend.requests
              rerender()
            }
          } catch (e) { UI.toast(e.message) }
        })

        on('#w-join-invite', async () => {
          try {
            await saveProfile()
            const r = await api().call('joinFamily', { code: state.inviteCode, message: '' })
            if (r.approved) {
              App.clearContext()
              UI.toast('加入成功')
              setTimeout(() => { App.go('/index') }, 400)
            } else {
              state.step = 'pending'
              rerender()
            }
          } catch (e) { UI.toast(e.message) }
        })

        on('#w-recheck', async () => {
          try {
            const ctx = await api().call('getFamilyContext', {})
            if (ctx && ctx.inFamily) { App.clearContext(); App.go('/index'); return }
            const pend = await api().call('myPendingRequests', {})
            state.myPending = pend.requests
            rerender()
            UI.toast('还未通过审核')
          } catch (e) { UI.toast(e.message) }
        })

        on('#w-switch', () => App.showAccountSwitcher())

        view.querySelectorAll('[data-enter]').forEach(el => {
          el.onclick = async () => {
            try {
              await api().call('switchFamily', { familyId: el.getAttribute('data-enter') })
              App.clearContext()
              App.go('/index')
            } catch (e) { UI.toast(e.message) }
          }
        })
      }

      function rerender() {
        view.innerHTML = html()
        bind()
      }

      // 首次进入：模拟微信一键登录
      if (!api().demo.current()) {
        view.innerHTML =
          '<div class="hero"><div class="hero-title">家族族谱</div><div class="hero-sub">记录血脉 · 传承家风</div></div>' +
          '<div class="card" style="margin-top:60px;">' +
          '<div style="text-align:center;font-size:44px;margin-bottom:10px;">👨‍👩‍👧‍👦</div>' +
          '<button class="wx-login-btn" id="w-login">微信一键登录</button>' +
          '<div class="wx-login-note">Web 演示版将创建一个模拟微信账号（对应小程序里的 openid 登录）</div>' +
          '</div>'
        view.querySelector('#w-login').onclick = () => {
          api().demo.createAccount()
          App.refreshDemoBar()
          this.render(params)
        }
        return
      }

      try {
        const r = await api().call('login', {})
        state.nickname = r.user.nickname || ''
        state.avatarUrl = r.user.avatarUrl || ''
        const fams = await api().call('listMyFamilies', {})
        state.myFamilies = fams.families
        const pend = await api().call('myPendingRequests', {})
        state.myPending = pend.requests
        if (state.inviteCode) {
          try {
            state.invite = await api().call('previewInvite', { code: state.inviteCode })
          } catch (e) { /* 邀请码失效则忽略 */ }
        }
        rerender()
      } catch (e) {
        UI.toast(e.message)
      }
    }
  }
})()
