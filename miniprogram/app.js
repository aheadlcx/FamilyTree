const config = require('./config')

App({
  globalData: {
    userInfo: null,
    // 当前家族上下文 { family, role, memberCount, pendingCount, selfMemberId }
    context: null
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    if (config.ENV) {
      wx.cloud.init({ env: config.ENV, traceUser: true })
    } else {
      wx.cloud.init({ traceUser: true })
    }
  },
  setContext(ctx) {
    this.globalData.context = ctx
  },
  clearContext() {
    this.globalData.context = null
  }
})
