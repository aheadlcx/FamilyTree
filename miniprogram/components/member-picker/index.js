// 成员选择器（底部弹层）：单选/多选，支持本地搜索
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Component({
  options: { addGlobalClass: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '选择成员' },
    multi: { type: Boolean, value: false },
    exclude: { type: Array, value: [] }
  },
  data: {
    loaded: false,
    loading: false,
    all: [],
    list: [],
    keyword: '',
    selectedCount: 0
  },
  observers: {
    show(v) {
      if (v && !this.data.loaded) this.load()
      if (v) this.setData({ keyword: '', selectedCount: 0 })
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
      const selected = this._selected || {}
      const list = this.data.all
        .filter(m => {
          if (!kw) return true
          return (m.name || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.birthPlace || '').toLowerCase().indexOf(kw) >= 0 ||
            (m.occupation || '').toLowerCase().indexOf(kw) >= 0
        })
        .map(m => Object.assign({}, m, {
          _sel: !!selected[m._id],
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
      if (!this.properties.multi) {
        this.triggerEvent('pick', { member: m })
        this.close()
        return
      }
      this._selected = this._selected || {}
      if (this._selected[id]) delete this._selected[id]
      else this._selected[id] = true
      this.setData({ selectedCount: Object.keys(this._selected).length })
      this.applyFilter()
    },
    onConfirm() {
      const members = this.data.all.filter(m => this._selected && this._selected[m._id])
      this.triggerEvent('pickmultiple', { members })
      this.close()
    },
    close() {
      this._selected = {}
      this.triggerEvent('close')
    },
    noop() {}
  }
})
