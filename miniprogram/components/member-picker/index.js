// 成员选择器（底部弹层）：单选/多选，支持本地搜索；可选「新建成员并关联」快速入谱
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Component({
  options: { addGlobalClass: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '选择成员' },
    exclude: { type: Array, value: [] },
    // 是否显示「新建成员并关联」入口（选父母/配偶时开启）
    allowCreate: { type: Boolean, value: false },
    // 新建时的默认性别 0未知 1男 2女（选配偶时自动取反）
    defaultGender: { type: Number, value: 0 },
    // 新建成员需要双向互链的对象（编辑模式下正在编辑的成员 id，仅配偶场景）
    linkTo: { type: String, value: '' }
  },
  data: {
    loaded: false,
    loading: false,
    all: [],
    list: [],
    keyword: '',
    mode: 'list', // list | create
    creating: false,
    genderRange: ['未知', '男', '女'],
    cform: { name: '', gender: 0, birthDate: '' }
  },
  observers: {
    show(v) {
      if (v && !this.data.loaded) this.load()
      if (v) this.setData({ keyword: '', mode: 'list' })
    }
  },
  methods: {
    async load() {
      let ctx = app.globalData.context
      if (!ctx || !ctx.family) {
        try {
          ctx = await api.call('getFamilyContext', {})
          if (ctx && ctx.inFamily) app.setContext(ctx)
        } catch (e) { ctx = null }
      }
      if (!ctx || !ctx.family) return
      this._familyId = ctx.family._id
      this.setData({ loading: true })
      try {
        const r = await api.call('listMembers', { familyId: ctx.family._id })
        this.setData({ all: r.members.map(util.slimMember), loaded: true, loading: false })
        this.applyFilter()
      } catch (e) {
        this.setData({ loading: false })
        api.toastErr(e)
      }
    },
    applyFilter() {
      const kw = (this.data.keyword || '').toLowerCase()
      const exclude = this.properties.exclude || []
      const list = this.data.all
        .filter(m => {
          if (!kw) return true
          return (m.name || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.birthPlace || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.occupation || '').toLowerCase().indexOf(kw) >= 0
        })
        .map(m => Object.assign({}, m, {
          _dis: exclude.indexOf(m._id) >= 0
        }))
      this.setData({ list })
    },
    onSearch(e) {
      this.setData({ keyword: e.detail.value || '' })
      this.applyFilter()
    },
    onPick(e) {
      const id = e.currentTarget.dataset.id
      if ((this.properties.exclude || []).indexOf(id) >= 0) return
      const m = this.data.all.find(x => x._id === id)
      if (!m) return
      this.triggerEvent('pick', { member: m })
      this.close()
    },
    close() {
      this.triggerEvent('close')
    },
    noop() {},

    /* ---------- 新建成员并关联 ---------- */
    onOpenCreate() {
      this.setData({
        mode: 'create',
        cform: { name: '', gender: this.data.defaultGender || 0, birthDate: '' }
      })
    },
    onCreateBack() {
      this.setData({ mode: 'list' })
    },
    onCInput(e) {
      const data = {}
      data['cform.' + e.currentTarget.dataset.k] = e.detail.value
      this.setData(data)
    },
    onCGender(e) {
      this.setData({ 'cform.gender': Number(e.detail.value) })
    },
    onCBirth(e) {
      this.setData({ 'cform.birthDate': e.detail.value })
    },
    async onCreateSave() {
      const f = this.data.cform
      if (!f.name.trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return }
      if (!this._familyId) { wx.showToast({ title: '正在加载，请稍后再试', icon: 'none' }); return }
      if (this.data.creating) return
      this.setData({ creating: true })
      try {
        const r = await api.call('addMember', {
          familyId: this._familyId,
          name: f.name.trim(),
          gender: Number(f.gender) || 0,
          birthDate: f.birthDate,
          isAlive: true,
          // 编辑模式下选配偶：服务端会同步把对方写回当前成员的 spouseIds
          spouseIds: this.data.linkTo ? [this.data.linkTo] : []
        })
        const member = util.slimMember({
          _id: r.id,
          name: f.name.trim(),
          gender: Number(f.gender) || 0,
          birthDate: f.birthDate,
          isAlive: true
        })
        this.setData({ creating: false, mode: 'list' })
        this.triggerEvent('pick', { member })
        this.close()
      } catch (e) {
        this.setData({ creating: false })
        api.toastErr(e)
      }
    }
  }
})
