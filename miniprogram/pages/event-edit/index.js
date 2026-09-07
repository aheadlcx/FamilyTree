// 新增/编辑大事记：标题、日期、描述、多图上传
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    saving: false,
    isEdit: false,
    form: { title: '', date: '', description: '', images: [] }
  },

  onLoad(options) {
    this._id = options.id || ''
    this.setData({ isEdit: !!this._id })
    wx.setNavigationBarTitle({ title: this._id ? '编辑大事记' : '添加大事记' })
    if (this._id) this.load()
  },

  async load() {
    try {
      const r = await api.call('getEvent', { id: this._id })
      this.setData({ form: { title: r.event.title, date: r.event.date, description: r.event.description, images: r.event.images } })
    } catch (e) {
      api.toastErr(e)
    }
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k
    const data = {}
    data['form.' + k] = e.detail.value
    this.setData(data)
  },
  onDate(e) {
    this.setData({ 'form.date': e.detail.value })
  },

  chooseImages() {
    const left = 9 - this.data.form.images.length
    if (left <= 0) { wx.showToast({ title: '最多 9 张', icon: 'none' }); return }
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => {
        const temps = this.data.form.images.concat(res.tempFiles.map(f => f.tempFilePath))
        this.setData({ 'form.images': temps.slice(0, 9) })
      }
    })
  },
  removeImage(e) {
    const idx = e.currentTarget.dataset.idx
    const images = this.data.form.images.slice()
    images.splice(idx, 1)
    this.setData({ 'form.images': images })
  },
  previewImage(e) {
    const { current } = e.currentTarget.dataset
    wx.previewImage({ urls: this.data.form.images, current })
  },

  async onSave() {
    const f = this.data.form
    if (!f.title.trim()) { wx.showToast({ title: '请填写标题', icon: 'none' }); return }
    if (!f.date) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      const ctx = app.globalData.context
      const familyId = ctx && ctx.family ? ctx.family._id : (await api.call('getFamilyContext', {})).family._id
      // 上传本地图片到云存储
      const images = []
      for (const img of f.images) {
        if (img.indexOf('cloud://') === 0) images.push(img)
        else images.push(await util.uploadImage(img, 'events/' + familyId))
      }
      const payload = { familyId, title: f.title.trim(), date: f.date, description: f.description, images }
      if (this._id) await api.call('updateEvent', Object.assign({ id: this._id }, payload))
      else await api.call('addEvent', payload)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      this.setData({ saving: false })
      api.toastErr(e)
    }
  }
})
