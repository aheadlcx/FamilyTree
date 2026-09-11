// 成员列表：客户端搜索 + 筛选（数据一次拉取，家族规模下性能足够）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    ready: false,
    noFamily: false,
    all: [],
    list: [],
    total: 0,
    keyword: '',
    filter: 'all',
    canEdit: false,
    selfId: ''
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
      return api.call('listMembers', { familyId: c.family._id }).then(r => {
        this.setData({
          ready: true,
          noFamily: false,
          all: r.members.map(util.slimMember),
          total: r.members.length,
          canEdit: util.canEdit(c.role),
          selfId: c.selfMemberId || ''
        })
        this.applyFilter()
      })
    }).catch(e => {
      this.setData({ ready: true })
      api.toastErr(e)
    })
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value || '' })
    this.applyFilter()
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.f })
    this.applyFilter()
  },

  applyFilter() {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const f = this.data.filter
    const list = this.data.all.filter(m => {
      if (f === 'alive' && m.isAlive === false) return false
      if (f === 'dead' && m.isAlive !== false) return false
      if (f === 'male' && m.gender !== 1) return false
      if (f === 'female' && m.gender !== 2) return false
      if (!kw) return true
      return (m.name || '').toLowerCase().indexOf(kw) >= 0 ||
        (m.birthPlace || '').toLowerCase().indexOf(kw) >= 0 ||
        (m.occupation || '').toLowerCase().indexOf(kw) >= 0
    })
    // 按世代分组（组头 + 组内人数）
    const counts = {}
    list.forEach(m => { const g = m.generation || 0; counts[g] = (counts[g] || 0) + 1 })
    let lastGen = null
    list.forEach(m => {
      const g = m.generation || 0
      m._gs = g !== lastGen
      if (m._gs) { m._gc = counts[g]; lastGen = g }
    })
    this.setData({ list })
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/member-detail/index?id=' + e.currentTarget.dataset.id })
  },
  goEdit() {
    wx.navigateTo({ url: '/pages/member-edit/index' })
  },
  goStats() {
    wx.navigateTo({ url: '/pages/stats/index' })
  },
  goWelcome() {
    wx.navigateTo({ url: '/pages/welcome/index' })
  }
})
