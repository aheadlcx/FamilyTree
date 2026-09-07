// 家族大事记时间线
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    ready: false,
    noFamily: false,
    events: [],
    canEdit: false,
    canManage: false
  },

  onShow() {
    this.load()
  },

  load() {
    const ctx = app.globalData.context
    const ensure = ctx && ctx.family ? Promise.resolve(ctx) : api.call('getFamilyContext', {})
    return Promise.resolve(ensure).then(c => {
      if (!c || !c.inFamily) {
        app.clearContext()
        this.setData({ ready: true, noFamily: true })
        return
      }
      app.setContext(c)
      return api.call('listEvents', { familyId: c.family._id }).then(r => {
        this.setData({
          ready: true,
          noFamily: false,
          events: r.events.map(e => Object.assign(e, { dateLabel: e.date, timeLabel: util.fmtDay(e.createdAt) })),
          canEdit: util.canEdit(c.role),
          canManage: util.canManage(c.role)
        })
      })
    }).catch(e => {
      this.setData({ ready: true })
      api.toastErr(e)
    })
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  },

  previewImages(e) {
    const { images, current } = e.currentTarget.dataset
    if (!images || !images.length) return
    wx.previewImage({ urls: images, current: current || images[0] })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/event-edit/index' })
  },
  goEdit(e) {
    wx.navigateTo({ url: '/pages/event-edit/index?id=' + e.currentTarget.dataset.id })
  },
  removeEvent(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除大事记',
      content: '确定删除这条大事记吗？',
      confirmColor: '#e64340',
      success: res => {
        if (!res.confirm) return
        api.call('removeEvent', { id })
          .then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.load() })
          .catch(err => api.toastErr(err))
      }
    })
  },
  goWelcome() {
    wx.navigateTo({ url: '/pages/welcome/index' })
  }
})
