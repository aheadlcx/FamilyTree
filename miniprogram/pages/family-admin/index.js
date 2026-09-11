// 家族管理：审批、邀请、成员角色、家族设置、日志、危险操作（按角色显隐）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    ready: false,
    denied: false,
    role: '',
    isOwner: false,
    family: null,
    /* 邀请 */
    inviteCode: '',
    qrFileId: '',
    qrLoading: false,
    autoApprove: false,
    defaultRoleIdx: 0,
    roleOptions: util.ROLE_OPTION_NAMES,
    /* 审批 */
    pending: [],
    /* 成员 */
    users: [],
    /* 设置 */
    setForm: { name: '', surname: '', description: '' },
    /* 日志 */
    logs: [],
    /* 转让弹层 */
    showTransfer: false,
    transferCandidates: []
  },

  onShow() {
    this.load()
  },

  load() {
    return api.call('getFamilyContext', {}).then(ctx => {
      if (!ctx || !ctx.inFamily || !util.canManage(ctx.role)) {
        this.setData({ ready: true, denied: true })
        return
      }
      app.setContext(ctx)
      const f = ctx.family
      this.setData({
        ready: true,
        denied: false,
        role: ctx.role,
        isOwner: ctx.role === 'owner',
        family: f,
        inviteCode: f.inviteCode || '',
        autoApprove: !!f.autoApprove,
        defaultRoleIdx: Math.max(0, util.ROLE_OPTIONS.indexOf(f.defaultRole || 'viewer')),
        setForm: { name: f.name || '', surname: f.surname || '', description: f.description || '' }
      })
      return Promise.all([
        api.call('listJoinRequests', { familyId: f._id }).catch(() => ({ requests: [] })),
        api.call('listFamilyUsers', { familyId: f._id }).catch(() => ({ users: [] })),
        api.call('listAuditLogs', { familyId: f._id }).catch(() => ({ logs: [] }))
      ]).then(([reqs, us, logs]) => {
        const users = us.users.map(u => ({
          openid: u.openid,
          nickname: u.nickname,
          initial: util.initialOf(u.nickname),
          avatarUrl: u.avatarUrl,
          role: u.role,
          roleName: util.roleName(u.role),
          roleIdx: Math.max(0, util.ROLE_OPTIONS.indexOf(u.role)),
          joinedLabel: util.fmtDay(u.joinedAt),
          // 族主不可操作；管理员只能由族主操作
          locked: u.role === 'owner' || (this.data.role !== 'owner' && u.role === 'admin')
        }))
        this.setData({
          pending: reqs.requests.map(r => Object.assign(r, {
            timeLabel: util.timeAgo(r.createdAt),
            initial: util.initialOf(r.nickname)
          })),
          users,
          logs: logs.logs.map(l => Object.assign(l, { timeLabel: util.timeAgo(l.createdAt) }))
        })
      })
    }).catch(e => {
      this.setData({ ready: true })
      api.toastErr(e)
    })
  },

  /* ---------- 邀请 ---------- */
  copyCode() {
    wx.setClipboardData({ data: this.data.inviteCode })
  },
  regenCode() {
    wx.showModal({
      title: '更换邀请码',
      content: '旧邀请码将立即失效，确定更换？',
      success: res => {
        if (!res.confirm) return
        api.call('regenerateInviteCode', { familyId: this.data.family._id })
          .then(r => {
            this.setData({ inviteCode: r.inviteCode, qrFileId: '' })
            wx.showToast({ title: '已更换', icon: 'success' })
          })
          .catch(e => api.toastErr(e))
      }
    })
  },
  // 生成小程序码（scene 携带邀请码，扫码直达加入页）
  loadQr() {
    if (this.data.qrLoading) return
    this.setData({ qrLoading: true })
    api.call('getInviteQr', { familyId: this.data.family._id })
      .then(r => {
        this.setData({ qrFileId: r.fileId, qrLoading: false })
        wx.setClipboardData({ data: r.inviteCode, fail: () => {} })
      })
      .catch(e => {
        this.setData({ qrLoading: false })
        api.toastErr(e)
      })
  },
  onAutoApprove(e) {
    const v = e.detail.value
    this.setData({ autoApprove: v })
    api.call('updateFamily', { familyId: this.data.family._id, autoApprove: v })
      .catch(e2 => { api.toastErr(e2); this.setData({ autoApprove: !v }) })
  },
  onDefaultRole(e) {
    const idx = Number(e.detail.value)
    this.setData({ defaultRoleIdx: idx })
    api.call('updateFamily', { familyId: this.data.family._id, defaultRole: util.ROLE_OPTIONS[idx] })
      .catch(e2 => api.toastErr(e2))
  },

  noop() {},

  onShareAppMessage() {
    const f = this.data.family
    return {
      title: '邀请你加入「' + f.name + '」，共修族谱',
      path: '/pages/welcome/index?code=' + this.data.inviteCode
    }
  },

  /* ---------- 审批 ---------- */
  approve(e) {
    this.handle(e, true)
  },
  reject(e) {
    this.handle(e, false)
  },
  handle(e, approve) {
    const id = e.currentTarget.dataset.id
    api.call('handleJoinRequest', { id, approve })
      .then(() => {
        wx.showToast({ title: approve ? '已通过' : '已拒绝', icon: 'success' })
        this.load()
      })
      .catch(err => api.toastErr(err))
  },

  /* ---------- 成员角色 ---------- */
  onRoleChange(e) {
    const oid = e.currentTarget.dataset.oid
    const idx = Number(e.detail.value)
    const role = util.ROLE_OPTIONS[idx]
    const u = this.data.users.find(x => x.openid === oid)
    if (!u || u.role === role) return
    wx.showModal({
      title: '修改角色',
      content: '将「' + u.nickname + '」设为' + util.roleName(role) + '？',
      success: res => {
        if (!res.confirm) return
        api.call('setUserRole', { familyId: this.data.family._id, targetOpenid: oid, role })
          .then(() => { wx.showToast({ title: '已修改', icon: 'success' }); this.load() })
          .catch(err => api.toastErr(err))
      }
    })
  },
  removeUser(e) {
    const oid = e.currentTarget.dataset.oid
    const u = this.data.users.find(x => x.openid === oid)
    wx.showModal({
      title: '移出家族',
      content: '将「' + u.nickname + '」移出家族？其浏览权限立即失效。',
      confirmColor: '#e64340',
      success: res => {
        if (!res.confirm) return
        api.call('removeFamilyUser', { familyId: this.data.family._id, targetOpenid: oid })
          .then(() => { wx.showToast({ title: '已移出', icon: 'success' }); this.load() })
          .catch(err => api.toastErr(err))
      }
    })
  },

  /* ---------- 家族设置 ---------- */
  onSetInput(e) {
    const k = e.currentTarget.dataset.k
    const data = {}
    data['setForm.' + k] = e.detail.value
    this.setData(data)
  },
  saveSettings() {
    const s = this.data.setForm
    if (!s.name.trim()) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return }
    api.call('updateFamily', {
      familyId: this.data.family._id,
      name: s.name.trim(),
      surname: s.surname,
      description: s.description
    }).then(() => {
      wx.showToast({ title: '已保存', icon: 'success' })
      app.clearContext()
    }).catch(e => api.toastErr(e))
  },

  /* ---------- 转让 / 解散 / 导出 / 退出 ---------- */
  openTransfer() {
    const candidates = this.data.users.filter(u => u.role !== 'owner')
    if (!candidates.length) { wx.showToast({ title: '没有可转让的成员', icon: 'none' }); return }
    this.setData({ showTransfer: true, transferCandidates: candidates })
  },
  closeTransfer() { this.setData({ showTransfer: false }) },
  pickTransfer(e) {
    const oid = e.currentTarget.dataset.oid
    const u = this.data.transferCandidates.find(x => x.openid === oid)
    this.setData({ showTransfer: false })
    wx.showModal({
      title: '转让族主',
      content: '确定将族主转让给「' + u.nickname + '」？你将成为管理员。',
      success: res => {
        if (!res.confirm) return
        api.call('transferOwner', { familyId: this.data.family._id, targetOpenid: oid })
          .then(() => { wx.showToast({ title: '已转让', icon: 'success' }); this.load() })
          .catch(err => api.toastErr(err))
      }
    })
  },

  exportData() {
    wx.showLoading({ title: '导出中…' })
    api.call('exportFamily', { familyId: this.data.family._id }).then(data => {
      const text = JSON.stringify(data, null, 2)
      const filePath = wx.env.USER_DATA_PATH + '/familytree-backup-' + util.fmtDay(Date.now()).replace(/-/g, '') + '.json'
      const fs = wx.getFileSystemManager()
      fs.writeFile({
        filePath,
        data: text,
        encoding: 'utf8',
        success: () => {
          wx.hideLoading()
          wx.shareFileMessage({
            filePath,
            fileName: this.data.family.name + '-族谱备份.json',
            success: () => {},
            fail: () => wx.showModal({ title: '已导出到本机', content: filePath, showCancel: false })
          })
        },
        fail: () => {
          wx.hideLoading()
          wx.setClipboardData({ data: text.slice(0, 100000) })
        }
      })
    }).catch(e => { wx.hideLoading(); api.toastErr(e) })
  },

  leaveFamily() {
    wx.showModal({
      title: '退出家族',
      content: '确定退出当前家族？',
      confirmColor: '#e64340',
      success: res => {
        if (!res.confirm) return
        api.call('leaveFamily', { familyId: this.data.family._id })
          .then(() => { app.clearContext(); wx.switchTab({ url: '/pages/index/index' }) })
          .catch(e => api.toastErr(e))
      }
    })
  },

  dissolveFamily() {
    wx.showModal({
      title: '解散家族',
      content: '将删除全部族谱数据且不可恢复，确定继续？',
      confirmColor: '#e64340',
      success: res => {
        if (!res.confirm) return
        wx.showModal({
          title: '再次确认',
          content: '真的要永远删除「' + this.data.family.name + '」的所有数据吗？',
          confirmColor: '#e64340',
          success: res2 => {
            if (!res2.confirm) return
            api.call('dissolveFamily', { familyId: this.data.family._id })
              .then(() => {
                wx.showToast({ title: '已解散', icon: 'success' })
                app.clearContext()
                setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 600)
              })
              .catch(e => api.toastErr(e))
          }
        })
      }
    })
  }
})
