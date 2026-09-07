// 登录与入口页：微信头像昵称填写 → 创建家族 / 邀请码加入
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    loading: true,
    avatarUrl: '',
    nickname: '',
    myFamilies: [],
    myPending: [],
    invite: null,
    step: 'choice', // choice | create | join | pending
    form: { name: '', surname: '', description: '', code: '', message: '' },
    submitting: false
  },

  onLoad(options) {
    this._inviteCode = options.code || ''
    this.load()
  },

  async load() {
    try {
      const r = await api.call('login', {})
      this.setData({
        loading: false,
        nickname: r.user.nickname || '',
        avatarUrl: r.user.avatarUrl || '',
        step: 'choice'
      })
      const [fams, pend] = await Promise.all([
        api.call('listMyFamilies', {}),
        api.call('myPendingRequests', {})
      ])
      this.setData({ myFamilies: fams.families, myPending: pend.requests })
      if (this._inviteCode) {
        try {
          const inv = await api.call('previewInvite', { code: this._inviteCode })
          this.setData({ invite: inv })
          this.setData({ 'form.code': this._inviteCode })
        } catch (e) { /* 邀请码失效则忽略 */ }
      }
    } catch (e) {
      this.setData({ loading: false })
      api.toastErr(e)
    }
  },

  /* ---------- 微信头像昵称填写能力 ---------- */
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },
  onNickInput(e) {
    this.setData({ nickname: e.detail.value || '' })
  },

  async saveProfile() {
    let avatarUrl = this.data.avatarUrl
    if (avatarUrl && avatarUrl.indexOf('cloud://') !== 0 && avatarUrl.indexOf('http') !== 0) {
      avatarUrl = await util.uploadImage(avatarUrl, 'avatars')
    }
    await api.call('updateProfile', { nickname: this.data.nickname, avatarUrl })
  },

  /* ---------- 步骤切换 ---------- */
  toCreate() { this.setData({ step: 'create' }) },
  toJoin() { this.setData({ step: 'join' }) },
  backChoice() { this.setData({ step: 'choice' }) },

  onFormInput(e) {
    const k = e.currentTarget.dataset.k
    const data = {}
    data['form.' + k] = e.detail.value
    this.setData(data)
  },

  async enterFamily(e) {
    const id = e.currentTarget.dataset.id
    try {
      await api.call('switchFamily', { familyId: id })
      getApp().clearContext()
      wx.switchTab({ url: '/pages/index/index' })
    } catch (err) {
      api.toastErr(err)
    }
  },

  async submitCreate() {
    const f = this.data.form
    if (!f.name.trim()) { wx.showToast({ title: '请填写家族名称', icon: 'none' }); return }
    this.setData({ submitting: true })
    try {
      await this.saveProfile()
      await api.call('createFamily', { name: f.name, surname: f.surname, description: f.description })
      getApp().clearContext()
      wx.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 600)
    } catch (e) {
      this.setData({ submitting: false })
      api.toastErr(e)
    }
  },

  async submitJoin() {
    const f = this.data.form
    if (!f.code.trim()) { wx.showToast({ title: '请输入邀请码', icon: 'none' }); return }
    this.setData({ submitting: true })
    try {
      await this.saveProfile()
      const r = await api.call('joinFamily', { code: f.code, message: f.message })
      if (r.approved) {
        getApp().clearContext()
        wx.showToast({ title: '加入成功', icon: 'success' })
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 600)
      } else {
        this.setData({ step: 'pending', submitting: false })
        const pend = await api.call('myPendingRequests', {})
        this.setData({ myPending: pend.requests })
      }
    } catch (e) {
      this.setData({ submitting: false })
      api.toastErr(e)
    }
  },

  async joinByInvite() {
    this.setData({ 'form.code': this._inviteCode })
    await this.submitJoin()
  },

  async recheck() {
    try {
      const r = await api.call('getFamilyContext', {})
      if (r && r.inFamily) {
        getApp().clearContext()
        wx.switchTab({ url: '/pages/index/index' })
        return
      }
      const pend = await api.call('myPendingRequests', {})
      this.setData({ myPending: pend.requests })
      wx.showToast({ title: '还未通过审核', icon: 'none' })
    } catch (e) {
      api.toastErr(e)
    }
  }
})
