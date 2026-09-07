// 云函数调用封装：统一 action 协议、错误处理、集合不存在时自动初始化
let collectionReady = false

function wrapErr(r) {
  const e = new Error((r && r.msg) || '请求失败')
  e.code = r && r.code
  return e
}

function raw(action, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: Object.assign({ action: action }, data || {})
    }).then(res => {
      const r = res.result
      if (r && r.ok) resolve(r.data)
      else reject(wrapErr(r))
    }).catch(reject)
  })
}

function call(action, data) {
  return raw(action, data).catch(err => {
    const msg = (err && (err.errMsg || err.message)) || ''
    if (!collectionReady && /-502005|not exists|collection/i.test(msg)) {
      collectionReady = true
      return raw('initCollections', {}).then(() => raw(action, data))
    }
    throw err
  })
}

function toastErr(e) {
  wx.showToast({ title: (e && (e.message || e.errMsg)) || '操作失败', icon: 'none' })
}

module.exports = { call, toastErr }
