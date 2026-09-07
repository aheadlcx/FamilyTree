// 成员详情：资料 + 五类关系链 + 权限化操作
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    ready: false,
    error: '',
    m: null,
    father: null,
    mother: null,
    spouses: [],
    children: [],
    siblings: [],
    isSelf: false,
    canEdit: false,
    canManage: false,
    familyId: ''
  },

  onLoad(options) {
    this._id = options.id || ''
  },

  onShow() {
    this.load()
  },

  load() {
    const ctxP = app.globalData.context
      ? Promise.resolve(app.globalData.context)
      : api.call('getFamilyContext', {}).then(c => {
        if (c && c.inFamily) app.setContext(c)
        return c
      })
    return Promise.all([api.call('getMember', { id: this._id }), ctxP])
      .then(([r, ctx]) => {
        const role = ctx && ctx.inFamily ? ctx.role : 'viewer'
        this.setData({
          ready: true,
          error: '',
          m: r.member,
          father: r.father,
          mother: r.mother,
          spouses: r.spouses,
          children: r.children,
          siblings: r.siblings,
          isSelf: r.isSelf,
          canEdit: util.canEdit(role),
          canManage: util.canManage(role),
          familyId: ctx && ctx.inFamily ? ctx.family._id : ''
        })
      })
      .catch(e => {
        this.setData({ ready: true, error: e.message || '加载失败' })
      })
  },

  goMember(e) {
    wx.navigateTo({ url: '/pages/member-detail/index?id=' + e.currentTarget.dataset.id })
  },
  previewPhoto() {
    if (!this.data.m || !this.data.m.photoFileId) return
    wx.previewImage({ urls: [this.data.m.photoFileId] })
  },

  setSelf() {
    api.call('setSelfMember', { familyId: this.data.familyId, memberId: this._id })
      .then(() => { wx.showToast({ title: '已设为本人', icon: 'success' }); this.load() })
      .catch(e => api.toastErr(e))
  },
  viewBranch() {
    wx.navigateTo({ url: '/pages/tree-view/index?id=' + this._id })
  },
  goEdit() {
    wx.navigateTo({ url: '/pages/member-edit/index?id=' + this._id })
  },
  addChild() {
    wx.navigateTo({ url: '/pages/member-edit/index?childOf=' + this._id })
  },
  remove() {
    wx.showModal({
      title: '删除成员',
      content: '确定删除「' + this.data.m.name + '」吗？其子女的父/母关联将同时解除。',
      confirmColor: '#e64340',
      success: res => {
        if (!res.confirm) return
        api.call('removeMember', { id: this._id })
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 600)
          })
          .catch(e => api.toastErr(e))
      }
    })
  }
})
