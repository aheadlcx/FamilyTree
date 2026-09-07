// 族谱统计：人口、世代、性别、出生年代分布
const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    ready: false,
    s: null,
    genDist: [],
    decadeDist: []
  },

  onShow() {
    this.load()
  },

  load() {
    const ctx = app.globalData.context
    const ensure = ctx && ctx.family ? Promise.resolve(ctx) : api.call('getFamilyContext', {})
    return Promise.resolve(ensure).then(c => {
      if (!c || !c.inFamily) { this.setData({ ready: true }); return }
      app.setContext(c)
      return api.call('getStats', { familyId: c.family._id }).then(s => {
        const genMax = Math.max.apply(null, [1].concat(s.genDist.map(g => g.count)))
        const decMax = Math.max.apply(null, [1].concat(s.decadeDist.map(d => d.count)))
        this.setData({
          ready: true,
          s,
          genDist: s.genDist.map(g => Object.assign(g, { pct: Math.round(g.count / genMax * 100), label: '第' + (g.gen + 1) + '世' })),
          decadeDist: s.decadeDist.map(d => Object.assign(d, { pct: Math.round(d.count / decMax * 100) }))
        })
      })
    }).catch(e => {
      this.setData({ ready: true })
      api.toastErr(e)
    })
  }
})
