// 族谱树主页
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

// 从族谱树收集近 30 天寿星（树上覆盖全部成员：主节点 + 配偶卡 + 子孙）
function collectBirthdays(roots) {
  const people = []
  const seen = {}
  const collect = n => {
    if (!n || seen[n._id]) return
    seen[n._id] = true
    people.push(n)
    ;(n.spouses || []).forEach(s => { if (!seen[s._id]) { seen[s._id] = true; people.push(s) } })
    ;(n.children || []).forEach(collect)
  }
  ;(roots || []).forEach(collect)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return people
    .filter(p => p.isAlive !== false && p.birthDate && p.birthDate.length >= 10)
    .map(p => {
      const mm = Number(p.birthDate.slice(5, 7))
      const dd = Number(p.birthDate.slice(8, 10))
      if (isNaN(mm) || isNaN(dd)) return null
      let next = new Date(now.getFullYear(), mm - 1, dd)
      if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd)
      const days = Math.round((next - today) / 86400000)
      return { _id: p._id, name: p.name, md: mm + '月' + dd + '日', days }
    })
    .filter(x => x && x.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3)
}

Page({
  data: {
    ready: false,
    noFamily: false,
    ctx: null,
    roots: [],
    total: 0,
    selfId: '',
    canEdit: false,
    canManage: false,
    birthdays: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    return api.call('getFamilyContext', {}).then(ctx => {
      if (!ctx || !ctx.inFamily) {
        app.clearContext()
        this.setData({ ready: true, noFamily: true, ctx: null })
        return
      }
      app.setContext(ctx)
      return api.call('getTree', { familyId: ctx.family._id }).then(tree => {
        const birthdays = collectBirthdays(tree.roots)
        this.setData({
          ready: true,
          noFamily: false,
          ctx,
          roots: tree.roots,
          total: tree.total,
          selfId: tree.selfMemberId || '',
          canEdit: util.canEdit(ctx.role),
          canManage: util.canManage(ctx.role),
          birthdays
        })
        wx.setNavigationBarTitle({ title: ctx.family.name || '家族族谱' })
      })
    }).catch(e => {
      this.setData({ ready: true })
      api.toastErr(e)
    })
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  },

  onNodeSelect(e) {
    wx.navigateTo({ url: '/pages/member-detail/index?id=' + e.detail.id })
  },

  goMember(e) {
    wx.navigateTo({ url: '/pages/member-detail/index?id=' + e.currentTarget.dataset.id })
  },

  // 转发到朋友圈
  onShareTimeline() {
    const f = this.data.ctx && this.data.ctx.family
    return { title: f ? '「' + f.name + '」家族族谱' : '家族族谱' }
  },

  onNodeAction(e) {
    const id = e.detail.id
    const d = this.data
    const items = ['查看资料', '查看支系']
    const acts = ['detail', 'branch']
    if (d.canEdit) { items.push('编辑资料'); acts.push('edit') }
    if (d.canEdit) { items.push('添加子女'); acts.push('addchild') }
    if (d.selfId && d.selfId !== id) { items.push('设为本人'); acts.push('self') }
    wx.showActionSheet({
      itemList: items,
      success: res => {
        const act = acts[res.tapIndex]
        if (act === 'detail') wx.navigateTo({ url: '/pages/member-detail/index?id=' + id })
        else if (act === 'branch') wx.navigateTo({ url: '/pages/tree-view/index?id=' + id })
        else if (act === 'edit') wx.navigateTo({ url: '/pages/member-edit/index?id=' + id })
        else if (act === 'addchild') wx.navigateTo({ url: '/pages/member-edit/index?childOf=' + id })
        else if (act === 'self') {
          api.call('setSelfMember', { familyId: d.ctx.family._id, memberId: id })
            .then(() => { wx.showToast({ title: '已设为本人', icon: 'success' }); this.refresh() })
            .catch(e2 => api.toastErr(e2))
        }
      }
    })
  },

  goWelcome() { wx.navigateTo({ url: '/pages/welcome/index' }) },
  goStats() { wx.navigateTo({ url: '/pages/stats/index' }) },
  goAdmin() {
    wx.navigateTo({ url: '/pages/family-admin/index' })
  },
  viewSelf() {
    if (this.data.selfId) wx.navigateTo({ url: '/pages/tree-view/index?id=' + this.data.selfId })
  },

  onShareAppMessage() {
    const f = this.data.ctx && this.data.ctx.family
    // 邀请码仅管理角色持有；浏览/编辑成员转发时回退为普通分享
    if (!f || !f.inviteCode) return { title: '家族族谱', path: '/pages/index/index' }
    return {
      title: '邀请你加入「' + f.name + '」，共修族谱',
      path: '/pages/welcome/index?code=' + f.inviteCode,
      imageUrl: ''
    }
  }
})
