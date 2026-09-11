// 新增/编辑成员：基本资料 + 父母/配偶关系（弹出成员选择器）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

const GENDER_RANGE = ['未知', '男', '女']

Page({
  data: {
    saving: false,
    isEdit: false,
    genderRange: GENDER_RANGE,
    form: {
      name: '',
      gender: 0,
      birthDate: '',
      deathDate: '',
      isAlive: true,
      birthPlace: '',
      occupation: '',
      phone: '',
      bio: '',
      photoFileId: '',
      photoTemp: ''
    },
    father: null,
    mother: null,
    spouses: [],
    pickerShow: false,
    pickerTitle: '选择成员',
    pickerExclude: [],
    pickerAllowCreate: false,
    pickerDefaultGender: 0,
    pickerLinkTo: ''
  },

  onLoad(options) {
    this._id = options.id || ''
    this._childOf = options.childOf || ''
    this._spouseWith = options.spouseWith || ''
    this.setData({ isEdit: !!this._id })
    wx.setNavigationBarTitle({ title: this._id ? '编辑成员' : '添加成员' })
    this.init()
  },

  async init() {
    let ctx = app.globalData.context
    if (!ctx || !ctx.family) {
      ctx = await api.call('getFamilyContext', {})
      if (ctx && ctx.inFamily) app.setContext(ctx)
    }
    this._familyId = ctx && ctx.inFamily ? ctx.family._id : ''
    if (this._id) {
      try {
        const r = await api.call('getMember', { id: this._id })
        const m = r.member
        this.setData({
          form: {
            name: m.name || '',
            gender: m.gender || 0,
            birthDate: m.birthDate || '',
            deathDate: m.deathDate || '',
            isAlive: m.isAlive !== false,
            birthPlace: m.birthPlace || '',
            occupation: m.occupation || '',
            phone: m.phone || '',
            bio: m.bio || '',
            photoFileId: m.photoFileId || '',
            photoTemp: ''
          },
          father: r.father,
          mother: r.mother,
          spouses: r.spouses
        })
      } catch (e) {
        api.toastErr(e)
      }
    } else if (this._childOf) {
      // 从某成员快捷「添加子女」
      try {
        const r = await api.call('getMember', { id: this._childOf })
        const p = util.slimMember(r.member)
        if (p.gender === 2) this.setData({ mother: p })
        else this.setData({ father: p })
      } catch (e) { /* 忽略，手动选择 */ }
    } else if (this._spouseWith) {
      try {
        const r = await api.call('getMember', { id: this._spouseWith })
        const s = util.slimMember(r.member)
        this.setData({ spouses: [s] })
        if (s.gender === 1) this.setData({ 'form.gender': 2 })
        else if (s.gender === 2) this.setData({ 'form.gender': 1 })
      } catch (e) { /* 忽略 */ }
    }
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k
    const data = {}
    data['form.' + k] = e.detail.value
    this.setData(data)
  },
  onGender(e) {
    this.setData({ 'form.gender': Number(e.detail.value) })
  },
  onBirth(e) {
    this.setData({ 'form.birthDate': e.detail.value })
  },
  onDeath(e) {
    this.setData({ 'form.deathDate': e.detail.value, 'form.isAlive': !e.detail.value })
  },
  onAlive(e) {
    const alive = e.detail.value
    this.setData({
      'form.isAlive': alive,
      'form.deathDate': alive ? '' : this.data.form.deathDate
    })
  },
  clearDate(e) {
    const k = e.currentTarget.dataset.k
    const data = {}
    data['form.' + k] = ''
    if (k === 'deathDate') data['form.isAlive'] = true
    this.setData(data)
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => {
        this.setData({ 'form.photoTemp': res.tempFiles[0].tempFilePath })
      }
    })
  },
  removePhoto() {
    this.setData({ 'form.photoTemp': '', 'form.photoFileId': '' })
  },
  previewPhoto() {
    const src = this.data.form.photoTemp || this.data.form.photoFileId
    if (src) wx.previewImage({ urls: [src] })
  },

  /* ---------- 关系选择 ---------- */
  pickFather() {
    this._picking = 'father'
    this.setData({
      pickerShow: true, pickerTitle: '选择父亲',
      pickerExclude: this._id ? [this._id] : [],
      pickerAllowCreate: true, pickerDefaultGender: 1, pickerLinkTo: ''
    })
  },
  pickMother() {
    this._picking = 'mother'
    this.setData({
      pickerShow: true, pickerTitle: '选择母亲',
      pickerExclude: this._id ? [this._id] : [],
      pickerAllowCreate: true, pickerDefaultGender: 2, pickerLinkTo: ''
    })
  },
  pickSpouse() {
    this._picking = 'spouse'
    const g = this.data.form.gender
    this.setData({
      pickerShow: true, pickerTitle: '选择配偶',
      pickerExclude: this.spouseIds().concat(this._id ? [this._id] : []),
      pickerAllowCreate: true,
      pickerDefaultGender: g === 1 ? 2 : (g === 2 ? 1 : 0),
      // 编辑模式下新建配偶时，服务端自动把当前成员写回新配偶的 spouseIds
      pickerLinkTo: this._id || ''
    })
  },
  clearFather() { this.setData({ father: null }) },
  clearMother() { this.setData({ mother: null }) },
  removeSpouse(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ spouses: this.data.spouses.filter(s => s._id !== id) })
  },
  spouseIds() {
    return this.data.spouses.map(s => s._id)
  },
  onPicked(e) {
    const m = e.detail.member
    if (this._picking === 'father') this.setData({ father: m })
    else if (this._picking === 'mother') this.setData({ mother: m })
    else if (this._picking === 'spouse') {
      const spouses = this.data.spouses.filter(s => s._id !== m._id).concat([m])
      this.setData({ spouses })
    }
  },
  onPickerClose() {
    this.setData({ pickerShow: false })
  },

  /* ---------- 保存 ---------- */
  async onSave() {
    const f = this.data.form
    if (!f.name.trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return }
    if (this.data.father && this.data.mother && this.data.father._id === this.data.mother._id) {
      wx.showToast({ title: '父母不能是同一人', icon: 'none' }); return
    }
    this.setData({ saving: true })
    try {
      let photoFileId = f.photoFileId
      if (f.photoTemp) {
        photoFileId = await util.uploadImage(f.photoTemp, 'photos/' + (this._familyId || 'common'))
      }
      const payload = {
        familyId: this._familyId,
        name: f.name.trim(),
        gender: f.gender,
        birthDate: f.birthDate,
        deathDate: f.deathDate,
        isAlive: f.deathDate ? false : f.isAlive,
        birthPlace: f.birthPlace,
        occupation: f.occupation,
        phone: f.phone,
        bio: f.bio,
        photoFileId,
        fatherId: this.data.father ? this.data.father._id : '',
        motherId: this.data.mother ? this.data.mother._id : '',
        spouseIds: this.spouseIds()
      }
      if (this._id) {
        await api.call('updateMember', Object.assign({ id: this._id }, payload))
        wx.showToast({ title: '已保存', icon: 'success' })
      } else {
        await api.call('addMember', payload)
        wx.showToast({ title: '已添加', icon: 'success' })
      }
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      this.setData({ saving: false })
      api.toastErr(e)
    }
  }
})
