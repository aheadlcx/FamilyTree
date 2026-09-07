// 支系视图：以某成员为根展示其后代子树
const api = require('../../utils/api')

Page({
  data: {
    ready: false,
    memberName: '',
    roots: [],
    selfId: ''
  },

  onLoad(options) {
    this._id = options.id || ''
  },

  onShow() {
    this.load()
  },

  load() {
    const app = getApp()
    const ctx = app.globalData.context
    if (!ctx || !ctx.family) {
      api.call('getFamilyContext', {}).then(c => {
        if (c && c.inFamily) {
          app.setContext(c)
          this.fetchTree(c.family._id)
        } else {
          this.setData({ ready: true })
        }
      }).catch(e => { this.setData({ ready: true }); api.toastErr(e) })
      return
    }
    this.fetchTree(ctx.family._id)
  },

  fetchTree(familyId) {
    api.call('getTree', { familyId, rootId: this._id }).then(tree => {
      let name = ''
      if (tree.roots.length) name = tree.roots[0].name
      this.setData({ ready: true, roots: tree.roots, selfId: tree.selfMemberId || '', memberName: name })
      if (name) wx.setNavigationBarTitle({ title: name + ' 的支系' })
    }).catch(e => {
      this.setData({ ready: true })
      api.toastErr(e)
    })
  },

  onNodeSelect(e) {
    wx.navigateTo({ url: '/pages/member-detail/index?id=' + e.detail.id })
  },

  onNodeAction(e) {
    wx.navigateTo({ url: '/pages/member-detail/index?id=' + e.detail.id })
  }
})
