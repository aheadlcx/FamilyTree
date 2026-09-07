// 常量、权限判断、显示格式化
const ROLE_NAMES = { owner: '族主', admin: '管理员', editor: '编辑员', viewer: '浏览' }
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 }
const ROLE_OPTIONS = ['viewer', 'editor', 'admin']
const ROLE_OPTION_NAMES = ['浏览（只读）', '编辑员（可增改）', '管理员（可管理）']

function atLeast(role, min) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 99)
}
function canEdit(role) { return atLeast(role, 'editor') }
function canManage(role) { return atLeast(role, 'admin') }
function roleName(role) { return ROLE_NAMES[role] || '浏览' }
function genderName(g) { return Number(g) === 1 ? '男' : (Number(g) === 2 ? '女' : '未知') }

function initialOf(name) {
  const s = String(name || '').trim()
  return s ? s.charAt(0) : '·'
}
function yearsLabel(m) {
  const b = (m.birthDate || '').slice(0, 4)
  const d = (m.deathDate || '').slice(0, 4)
  if (b && d) return b + ' – ' + d
  if (b) return m.isAlive === false ? b + ' – ?' : b + ' –'
  if (d) return '? – ' + d
  return ''
}
// 补充展示字段，供列表/树渲染
function slimMember(m) {
  return Object.assign({}, m, {
    initial: initialOf(m.name),
    years: yearsLabel(m),
    genderName: genderName(m.gender),
    roleName: ''
  })
}
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = n => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}
function fmtDay(ts) {
  if (!ts) return ''
  return fmtTime(ts).slice(0, 10)
}
// 上传临时图片到云存储，返回 fileID
function uploadImage(filePath, folder) {
  const ext = (filePath.match(/\.\w+$/) || ['.jpg'])[0]
  const cloudPath = (folder || 'photos') + '/' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + ext
  return wx.cloud.uploadFile({ cloudPath, filePath }).then(res => res.fileID)
}

module.exports = {
  ROLE_NAMES, ROLE_RANK, ROLE_OPTIONS, ROLE_OPTION_NAMES,
  atLeast, canEdit, canManage, roleName, genderName,
  initialOf, yearsLabel, slimMember, fmtTime, fmtDay, uploadImage
}
