// 族谱树节点（递归组件）：显示本人+配偶卡片，下方递归渲染子女
Component({
  options: { addGlobalClass: true },
  properties: {
    node: { type: Object, value: null },
    selfId: { type: String, value: '' }
  },
  methods: {
    onTap(e) {
      this.triggerEvent('select', { id: e.currentTarget.dataset.id })
    },
    onLongPress(e) {
      this.triggerEvent('action', { id: e.currentTarget.dataset.id })
    },
    onChildSelect(e) {
      this.triggerEvent('select', e.detail)
    },
    onChildAction(e) {
      this.triggerEvent('action', e.detail)
    }
  }
})
