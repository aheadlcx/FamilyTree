// 本地数据层：对应云开发数据库的六个集合，持久化到 localStorage
// 数据结构与小程序版完全一致
(function () {
  const KEY = 'familytree_web_db_v1'
  const EMPTY = {
    users: [],
    families: [],
    members: [],
    joinRequests: [],
    events: [],
    auditLogs: [],
    session: { currentOpenid: '' }
  }
  let cache = null

  function load() {
    if (cache) return cache
    try {
      const raw = localStorage.getItem(KEY)
      cache = raw ? JSON.parse(raw) : null
    } catch (e) {
      cache = null
    }
    if (!cache) cache = JSON.parse(JSON.stringify(EMPTY))
    Object.keys(EMPTY).forEach(k => {
      if (cache[k] === undefined) cache[k] = JSON.parse(JSON.stringify(EMPTY[k]))
    })
    return cache
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache))
    } catch (e) {
      console.error('本地存储写入失败（可能超出容量，请清理照片或重置数据）', e)
      if (window.UI) UI.toast('本地存储空间不足，建议删除部分照片后重试')
    }
  }

  window.FamilyDB = {
    load,
    save,
    reset() {
      cache = JSON.parse(JSON.stringify(EMPTY))
      save()
    }
  }
})()
