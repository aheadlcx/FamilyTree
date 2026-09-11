// 我的：微信身份、当前家族、切换家族、申请状态、帮助
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    user: null,
    ctx: null,
    roleName: '',
    myFamilies: [],
    myPending: [],
    selfMemberName: '',
    showHelp: false,
    showSwitcher: false
  },

  onShow() {
    this.load()
  },

  load() {
    return api.call('login', {}).then(r => {
      app.globalData.userInfo = r.user
      this.setData({ user: r.user })
      return api.call('getFamilyContext', {}).then(ctx => {
        if (ctx && ctx.inFamily) app.setContext(ctx)
        else app.clearContext()
        this.setData({
          ctx: ctx && ctx.inFamily ? ctx : null,
          roleName: ctx && ctx.inFamily ? util.roleName(ctx.role) : ''
        })
        if (ctx && ctx.inFamily && ctx.selfMemberId) {
          api.call('getMember', { id: ctx.selfMemberId })
            .then(mr => this.setData({ selfMemberName: mr.member.name }))
            .catch(() => this.setData({ selfMemberName: '' }))
        } else {
          this.setData({ selfMemberName: '' })
        }
        return Promise.all([
          api.call('listMyFamilies', {}).catch(() => ({ families: [] })),
          api.call('myPendingRequests', {}).catch(() => ({ requests: [] }))
        ]).then(([fams, pend]) => {
          fams.families.forEach(f => { f.roleName = util.roleName(f.role) })
          this.setData({ myFamilies: fams.families, myPending: pend.requests })
        })
      })
    }).catch(e => api.toastErr(e))
  },

  /* ---------- 微信头像昵称 ---------- */
  onChooseAvatar(e) {
    const tmp = e.detail.avatarUrl
    util.uploadImage(tmp, 'avatars').then(fileId => {
      return api.call('updateProfile', { avatarUrl: fileId }).then(() => {
        wx.showToast({ title: '头像已更新', icon: 'success' })
        this.load()
      })
    }).catch(e2 => api.toastErr(e2))
  },
  editNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '输入新的昵称',
      success: res => {
        if (!res.confirm) return
        api.call('updateProfile', { nickname: res.content || '' })
          .then(() => { wx.showToast({ title: '已保存', icon: 'success' }); this.load() })
          .catch(e => api.toastErr(e))
      }
    })
  },

  /* ---------- 家族 ---------- */
  switchFamily() {
    // wx.showActionSheet 上限 6 项，改用自定义弹层
    if (!this.data.myFamilies.length) return
    this.setData({ showSwitcher: true })
  },
  closeSwitcher() {
    this.setData({ showSwitcher: false })
  },
  noop() {},
  async doSwitchFamily(e) {
    const id = e.currentTarget.dataset.id
    const f = this.data.myFamilies.find(x => x.familyId === id)
    if (!f || f.isCurrent) { this.setData({ showSwitcher: false }); return }
    try {
      await api.call('switchFamily', { familyId: id })
      app.clearContext()
      this.setData({ showSwitcher: false })
      wx.showToast({ title: '已切换', icon: 'success' })
      this.load()
    } catch (err) {
      api.toastErr(err)
    }
  },
  goAdmin() {
    wx.navigateTo({ url: '/pages/family-admin/index' })
  },
  goSelfDetail() {
    if (this.data.ctx && this.data.ctx.selfMemberId) {
      wx.navigateTo({ url: '/pages/member-detail/index?id=' + this.data.ctx.selfMemberId })
    }
  },
  goWelcome() {
    wx.navigateTo({ url: '/pages/welcome/index' })
  },
  goIndex() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  toggleHelp() {
    this.setData({ showHelp: !this.data.showHelp })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '仅清除本机登录状态，族谱数据不受影响。',
      success: res => {
        if (!res.confirm) return
        try { wx.clearStorageSync() } catch (e) { /* ignore */ }
        app.clearContext()
        app.globalData.userInfo = null
        wx.showToast({ title: '已退出', icon: 'success' })
        setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 500)
      }
    })
  }
})
