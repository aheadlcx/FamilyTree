// 族谱小程序统一云函数
// 所有数据访问都经过本函数，客户端集合权限建议设置为「仅创建者可读写」以 lockdown。
// 权限模型：owner(族主) > admin(管理员) > editor(编辑员) > viewer(浏览)
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COLLECTIONS = ['users', 'families', 'members', 'joinRequests', 'events', 'auditLogs']
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 }

function ApiError(msg, code) {
  const e = new Error(msg)
  e.code = code || 'ERR'
  return e
}
function ok(data) { return { ok: true, data: data === undefined ? null : data } }
function fail(msg, code) { return { ok: false, msg: String(msg || '服务错误'), code: code || 'ERR' } }

/* ================= 通用工具 ================= */

function clone(x) { return JSON.parse(JSON.stringify(x)) }
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
function slim(m) {
  return {
    _id: m._id,
    name: m.name || '',
    gender: m.gender || 0,
    initial: initialOf(m.name),
    years: yearsLabel(m),
    isAlive: m.isAlive !== false,
    photoFileId: m.photoFileId || '',
    generation: m.generation || 0,
    birthDate: m.birthDate || '',
    birthPlace: m.birthPlace || '',
    occupation: m.occupation || ''
  }
}
function byBirth(a, b) {
  const x = a.birthDate || '9999', y = b.birthDate || '9999'
  if (x === y) return 0
  return x < y ? -1 : 1
}
// 按完整日期计算寿命，无法精确时退化为年份差
function fullAge(birth, death) {
  if (!birth || !death) return null
  if (birth.length < 10 || death.length < 10) {
    const y = Number(death.slice(0, 4)) - Number(birth.slice(0, 4))
    return isNaN(y) ? null : y
  }
  const by = Number(birth.slice(0, 4)), bm = Number(birth.slice(5, 7)), bd = Number(birth.slice(8, 10))
  const dy = Number(death.slice(0, 4)), dm = Number(death.slice(5, 7)), dd = Number(death.slice(8, 10))
  if (isNaN(by) || isNaN(bm) || isNaN(bd) || isNaN(dy) || isNaN(dm) || isNaN(dd)) return null
  let age = dy - by
  if (dm < bm || (dm === bm && dd < bd)) age--
  return age
}

async function getUser(openid) {
  const r = await db.collection('users').where({ openid }).limit(1).get()
  return r.data[0] || null
}
async function ensureUser(openid) {
  let u = await getUser(openid)
  if (u) return u
  const now = Date.now()
  const add = await db.collection('users').add({
    data: { openid, nickname: '', avatarUrl: '', families: [], currentFamilyId: '', createdAt: now, lastLoginAt: now }
  })
  return { _id: add._id, openid, nickname: '', avatarUrl: '', families: [], currentFamilyId: '' }
}
function refOf(user, familyId) {
  return (user.families || []).find(f => f.familyId === familyId) || null
}
async function requireRole(openid, familyId, minRole) {
  if (!familyId) throw ApiError('缺少家族参数')
  const u = await getUser(openid)
  if (!u) throw ApiError('请先登录', 'NOUSER')
  const ref = refOf(u, familyId)
  if (!ref) throw ApiError('你还不是该家族成员', 'NOPERM')
  if ((ROLE_RANK[ref.role] || 0) < (ROLE_RANK[minRole] || 99)) throw ApiError('权限不足', 'NOPERM')
  return { user: u, ref }
}
async function addLog(familyId, openid, action, detail) {
  try {
    await db.collection('auditLogs').add({
      data: { familyId, openid, action, detail: String(detail || '').slice(0, 200), createdAt: Date.now() }
    })
  } catch (e) { /* 日志失败不影响主流程 */ }
}
// 内容安全检测（尽力而为，云函数 openapi 未开通时静默跳过）
async function checkText(text) {
  const s = String(text || '').trim()
  if (!s) return
  try {
    const r = await cloud.openapi.security.msgSecCheck({ content: s.slice(0, 2500) })
    const risky = (r && r.errCode === 87014) || (r && r.result && r.result.suggest === 'risky')
    if (risky) throw ApiError('内容包含违规信息，请修改', 'RISKY')
  } catch (e) {
    if (e && (e.code === 'RISKY' || e.errCode === 87014)) throw ApiError('内容包含违规信息，请修改', 'RISKY')
  }
}
function inviteCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let c = ''
  for (let i = 0; i < 6; i++) c += s.charAt(Math.floor(Math.random() * s.length))
  return c
}
async function fetchAll(query, cap) {
  const out = []
  const capN = cap || 5000
  const limit = 1000
  while (out.length < capN) {
    const r = await query.skip(out.length).limit(Math.min(limit, capN - out.length)).get()
    out.push.apply(out, r.data)
    if (r.data.length < limit) break
  }
  return out
}
async function initCollections() {
  const out = []
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
      out.push(name + ': created')
    } catch (e) {
      out.push(name + ': ' + (e.errCode === -501001 || /exists/i.test(e.errMsg || '') ? 'exists' : (e.errMsg || 'skip')))
    }
  }
  return out
}

/* ================= 世代计算 ================= */

function primaryParentId(m, byId) {
  if (m.fatherId && byId[m.fatherId]) return m.fatherId
  if (m.motherId && byId[m.motherId]) return m.motherId
  return null
}
function computeGen(m, byId) {
  if (m.fatherId && byId[m.fatherId]) return (byId[m.fatherId].generation || 0) + 1
  if (m.motherId && byId[m.motherId]) return (byId[m.motherId].generation || 0) + 1
  const sid = (m.spouseIds || []).find(s => byId[s])
  if (sid) return byId[sid].generation || 0
  return 0
}
function createsCycle(selfId, parentId, byId) {
  let cur = parentId
  let guard = 0
  while (cur && guard++ < 1000) {
    if (cur === selfId) return true
    const p = byId[cur]
    if (!p) return false
    cur = primaryParentId(p, byId)
  }
  return false
}
// 世代重算：父母规则优先，其次配偶同世代（嫁入/娶入者跟随配偶的世代）
async function recalcGenerations(familyId) {
  const all = await fetchAll(db.collection('members').where({ familyId }))
  const byId = {}
  all.forEach(m => { byId[m._id] = m })
  const gen = {}
  all.forEach(m => { gen[m._id] = 0 })
  // 不动点迭代：父/母有谱则 +1；否则跟随配偶。链长不超过成员数，必收敛
  let changed = true
  let guard = 0
  while (changed && guard++ < all.length + 5) {
    changed = false
    all.forEach(m => {
      let g = 0
      if (m.fatherId && gen[m.fatherId] !== undefined) g = gen[m.fatherId] + 1
      else if (m.motherId && gen[m.motherId] !== undefined) g = gen[m.motherId] + 1
      else {
        const sid = (m.spouseIds || []).find(s => byId[s])
        if (sid !== undefined) g = gen[sid]
      }
      if (g !== gen[m._id]) { gen[m._id] = g; changed = true }
    })
  }
  for (const m of all) {
    if ((m.generation || 0) !== gen[m._id]) {
      await db.collection('members').doc(m._id).update({ data: { generation: gen[m._id] } }).catch(() => {})
    }
  }
}

/* ================= 成员数据清洗 ================= */

function pickMemberData(d) {
  const out = {}
  const strs = { name: 60, birthDate: 20, deathDate: 20, birthPlace: 60, occupation: 60, phone: 30, bio: 2000, photoFileId: 200 }
  Object.keys(strs).forEach(k => {
    if (d[k] !== undefined) out[k] = String(d[k] || '').slice(0, strs[k])
  })
  if (d.gender !== undefined) out.gender = Number(d.gender) || 0
  if (d.isAlive !== undefined) out.isAlive = !!d.isAlive
  if (d.fatherId !== undefined) out.fatherId = d.fatherId ? String(d.fatherId) : ''
  if (d.motherId !== undefined) out.motherId = d.motherId ? String(d.motherId) : ''
  return out
}

/* ================= 用户 ================= */

async function login(openid) {
  const u = await ensureUser(openid)
  await db.collection('users').doc(u._id).update({ data: { lastLoginAt: Date.now() } }).catch(() => {})
  return {
    user: {
      _id: u._id,
      nickname: u.nickname || '',
      avatarUrl: u.avatarUrl || '',
      families: u.families || [],
      currentFamilyId: u.currentFamilyId || ''
    }
  }
}
async function updateProfile(openid, d) {
  const u = await ensureUser(openid)
  const data = {}
  if (d.nickname !== undefined) {
    await checkText(d.nickname)
    data.nickname = String(d.nickname || '').slice(0, 30)
  }
  if (d.avatarUrl !== undefined) data.avatarUrl = String(d.avatarUrl || '').slice(0, 200)
  if (Object.keys(data).length) {
    await db.collection('users').doc(u._id).update({ data })
  }
  return {}
}
async function listMyFamilies(openid) {
  const u = await ensureUser(openid)
  const refs = u.families || []
  if (!refs.length) return { families: [] }
  const fams = await db.collection('families').where({ _id: _.in(refs.map(r => r.familyId)) }).get()
  const famMap = {}
  fams.data.forEach(f => { famMap[f._id] = f })
  const countMap = {}
  for (const r of refs) {
    if (!famMap[r.familyId] || countMap[r.familyId] !== undefined) continue
    const c = await db.collection('members').where({ familyId: r.familyId }).count()
    countMap[r.familyId] = c.total
  }
  const families = refs
    .filter(r => famMap[r.familyId])
    .map(r => ({
      familyId: r.familyId,
      role: r.role,
      memberId: r.memberId || '',
      name: famMap[r.familyId].name,
      surname: famMap[r.familyId].surname || '',
      memberCount: countMap[r.familyId] || 0,
      isCurrent: u.currentFamilyId === r.familyId
    }))
  return { families }
}
async function myPendingRequests(openid) {
  const u = await ensureUser(openid)
  const reqs = await fetchAll(db.collection('joinRequests').where({ openid, status: 'pending' }), 50)
  const famIds = reqs.map(r => r.familyId)
  const famMap = {}
  if (famIds.length) {
    const fams = await db.collection('families').where({ _id: _.in(famIds) }).get()
    fams.data.forEach(f => { famMap[f._id] = f })
  }
  return {
    requests: reqs.map(r => ({
      _id: r._id,
      familyName: (famMap[r.familyId] && famMap[r.familyId].name) || '未知家族',
      status: r.status,
      createdAt: r.createdAt
    }))
  }
}

/* ================= 家族 ================= */

async function createFamily(openid, d) {
  await checkText(d.name)
  await checkText(d.description)
  const name = String(d.name || '').trim()
  if (!name) throw ApiError('请填写家族名称')
  const u = await ensureUser(openid)
  const now = Date.now()
  const add = await db.collection('families').add({
    data: {
      name: name.slice(0, 40),
      surname: String(d.surname || '').trim().slice(0, 10),
      description: String(d.description || '').slice(0, 300),
      creatorOpenid: openid,
      inviteCode: inviteCode(),
      autoApprove: false,
      defaultRole: 'viewer',
      createdAt: now,
      updatedAt: now
    }
  })
  const ref = { familyId: add._id, role: 'owner', memberId: '', joinedAt: now }
  const families = (u.families || []).concat([ref])
  await db.collection('users').doc(u._id).update({ data: { families, currentFamilyId: add._id } })
  await addLog(add._id, openid, 'createFamily', name)
  return { familyId: add._id }
}
async function getFamilyContext(openid, familyId) {
  const u = await ensureUser(openid)
  const fid = familyId || u.currentFamilyId
  if (!fid) return { inFamily: false, user: { nickname: u.nickname, avatarUrl: u.avatarUrl } }
  const ref = refOf(u, fid)
  if (!ref) return { inFamily: false, user: { nickname: u.nickname, avatarUrl: u.avatarUrl } }
  const fam = await db.collection('families').doc(fid).get().catch(() => null)
  if (!fam || !fam.data) return { inFamily: false, user: { nickname: u.nickname, avatarUrl: u.avatarUrl } }
  const countRes = await db.collection('members').where({ familyId: fid }).count()
  let pendingCount = 0
  const isAdmin = (ROLE_RANK[ref.role] || 0) >= ROLE_RANK.admin
  if (isAdmin) {
    const p = await db.collection('joinRequests').where({ familyId: fid, status: 'pending' }).count()
    pendingCount = p.total
  }
  // 邀请码与创建者 openid 仅管理角色可见，避免浏览/编辑成员越权拉人或泄露他人身份
  const familyData = clone(fam.data)
  if (!isAdmin) {
    delete familyData.inviteCode
    delete familyData.creatorOpenid
  }
  return {
    inFamily: true,
    family: familyData,
    role: ref.role,
    memberCount: countRes.total,
    pendingCount,
    selfMemberId: ref.memberId || ''
  }
}
async function switchFamily(openid, familyId) {
  const u = await ensureUser(openid)
  if (!refOf(u, familyId)) throw ApiError('你还不是该家族成员', 'NOPERM')
  await db.collection('users').doc(u._id).update({ data: { currentFamilyId: familyId } })
  return {}
}
async function updateFamily(openid, familyId, d) {
  await requireRole(openid, familyId, 'admin')
  const data = { updatedAt: Date.now() }
  if (d.name !== undefined) {
    await checkText(d.name)
    const name = String(d.name || '').trim()
    if (!name) throw ApiError('家族名称不能为空')
    data.name = name.slice(0, 40)
  }
  if (d.surname !== undefined) data.surname = String(d.surname || '').trim().slice(0, 10)
  if (d.description !== undefined) {
    await checkText(d.description)
    data.description = String(d.description || '').slice(0, 300)
  }
  if (d.autoApprove !== undefined) data.autoApprove = !!d.autoApprove
  if (d.defaultRole !== undefined) {
    if (['viewer', 'editor'].indexOf(d.defaultRole) < 0) throw ApiError('默认角色不合法')
    data.defaultRole = d.defaultRole
  }
  await db.collection('families').doc(familyId).update({ data })
  await addLog(familyId, openid, 'updateFamily', data.name || '')
  return {}
}
async function regenerateInviteCode(openid, familyId) {
  await requireRole(openid, familyId, 'admin')
  const code = inviteCode()
  await db.collection('families').doc(familyId).update({ data: { inviteCode: code, updatedAt: Date.now() } })
  await addLog(familyId, openid, 'regenerateInviteCode', code)
  return { inviteCode: code }
}
// 生成小程序码：scene 携带邀请码，扫码直达欢迎页加入流程
async function getInviteQr(openid, familyId) {
  await requireRole(openid, familyId, 'admin')
  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) throw ApiError('家族不存在')
  const code = fam.data.inviteCode
  let wxres
  try {
    wxres = await cloud.openapi.wxacode.getUnlimited({
      scene: 'c=' + code,
      page: 'pages/welcome/index',
      checkPath: false,
      width: 430
    })
  } catch (e) {
    throw ApiError('生成小程序码失败：' + (e.errMsg || e.message || '请检查云函数 openapi 权限'))
  }
  if (wxres.errCode && wxres.errCode !== 0) {
    throw ApiError('生成小程序码失败：' + (wxres.errMsg || wxres.errCode))
  }
  const up = await cloud.uploadFile({
    cloudPath: 'qrcode/' + familyId + '-' + Date.now() + '.png',
    fileContent: wxres.buffer
  })
  await addLog(familyId, openid, 'getInviteQr', code)
  return { fileId: up.fileID, inviteCode: code }
}
async function previewInvite(d) {
  const code = String(d.code || '').trim().toUpperCase()
  if (!code) throw ApiError('请输入邀请码')
  const r = await db.collection('families').where({ inviteCode: code }).limit(1).get()
  if (!r.data.length) throw ApiError('邀请码无效')
  return { familyId: r.data[0]._id, name: r.data[0].name, surname: r.data[0].surname || '' }
}
async function joinFamily(openid, d) {
  const code = String(d.code || '').trim().toUpperCase()
  if (!code) throw ApiError('请输入邀请码')
  await checkText(d.message)
  const u = await ensureUser(openid)
  const famRes = await db.collection('families').where({ inviteCode: code }).limit(1).get()
  if (!famRes.data.length) throw ApiError('邀请码无效')
  const fam = famRes.data[0]
  if (refOf(u, fam._id)) throw ApiError('你已经是该家族成员')
  const dup = await db.collection('joinRequests').where({ familyId: fam._id, openid, status: 'pending' }).count()
  if (dup.total > 0) throw ApiError('已提交过申请，请等待管理员审核')
  const now = Date.now()
  if (fam.autoApprove) {
    const role = fam.defaultRole || 'viewer'
    const families = (u.families || []).concat([{ familyId: fam._id, role, memberId: '', joinedAt: now }])
    await db.collection('users').doc(u._id).update({ data: { families, currentFamilyId: fam._id } })
    await addLog(fam._id, openid, 'joinFamily', '自动通过')
    return { approved: true, familyId: fam._id }
  }
  await db.collection('joinRequests').add({
    data: {
      familyId: fam._id,
      openid,
      nickname: u.nickname || '微信用户',
      avatarUrl: u.avatarUrl || '',
      message: String(d.message || '').slice(0, 200),
      status: 'pending',
      createdAt: now
    }
  })
  await addLog(fam._id, openid, 'joinFamily', '提交申请')
  return { approved: false, familyId: fam._id }
}
async function listJoinRequests(openid, familyId) {
  await requireRole(openid, familyId, 'admin')
  const r = await fetchAll(db.collection('joinRequests').where({ familyId, status: 'pending' }), 200)
  r.sort((a, b) => b.createdAt - a.createdAt)
  return { requests: r }
}
async function handleJoinRequest(openid, id, approve) {
  const reqRes = await db.collection('joinRequests').doc(id).get().catch(() => null)
  if (!reqRes || !reqRes.data) throw ApiError('申请不存在')
  const req = reqRes.data
  await requireRole(openid, req.familyId, 'admin')
  if (req.status !== 'pending') throw ApiError('该申请已处理')
  if (approve) {
    const fam = await db.collection('families').doc(req.familyId).get()
    const role = (fam.data && fam.data.defaultRole) || 'viewer'
    const target = await getUser(req.openid)
    if (target && !refOf(target, req.familyId)) {
      const families = (target.families || []).concat([{ familyId: req.familyId, role, memberId: '', joinedAt: Date.now() }])
      const upd = { families }
      if (!target.currentFamilyId) upd.currentFamilyId = req.familyId
      await db.collection('users').doc(target._id).update({ data: upd })
    }
    await db.collection('joinRequests').doc(id).update({ data: { status: 'approved', handledBy: openid, handledAt: Date.now() } })
    await addLog(req.familyId, openid, 'approveJoin', req.nickname)
  } else {
    await db.collection('joinRequests').doc(id).update({ data: { status: 'rejected', handledBy: openid, handledAt: Date.now() } })
    await addLog(req.familyId, openid, 'rejectJoin', req.nickname)
  }
  return {}
}
async function listFamilyUsers(openid, familyId) {
  await requireRole(openid, familyId, 'admin')
  const r = await fetchAll(db.collection('users').where({ 'families.familyId': familyId }), 1000)
  const users = r.map(u => {
    const ref = refOf(u, familyId) || {}
    return {
      openid: u.openid,
      nickname: u.nickname || '微信用户',
      avatarUrl: u.avatarUrl || '',
      role: ref.role || 'viewer',
      memberId: ref.memberId || '',
      joinedAt: ref.joinedAt || 0
    }
  })
  users.sort((a, b) => (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0) || a.joinedAt - b.joinedAt)
  return { users }
}
async function setUserRole(openid, familyId, targetOpenid, role) {
  const { ref } = await requireRole(openid, familyId, 'admin')
  if (['viewer', 'editor', 'admin'].indexOf(role) < 0) throw ApiError('角色不合法')
  if (targetOpenid === openid) throw ApiError('不能修改自己的角色')
  const target = await getUser(targetOpenid)
  if (!target) throw ApiError('用户不存在')
  const tref = refOf(target, familyId)
  if (!tref) throw ApiError('对方不是家族成员')
  if (tref.role === 'owner') throw ApiError('不能修改族主角色，请使用转让族主')
  // 管理员只能授予/收回 viewer、editor；涉及管理员需要族主操作
  if ((role === 'admin' || ROLE_RANK[tref.role] >= ROLE_RANK.admin) && ref.role !== 'owner') {
    throw ApiError('该操作需要族主执行')
  }
  const families = target.families.map(f => f.familyId === familyId ? Object.assign({}, f, { role }) : f)
  await db.collection('users').doc(target._id).update({ data: { families } })
  await addLog(familyId, openid, 'setUserRole', (target.nickname || targetOpenid) + ' → ' + role)
  return {}
}
async function removeFamilyUser(openid, familyId, targetOpenid) {
  const { ref } = await requireRole(openid, familyId, 'admin')
  if (targetOpenid === openid) throw ApiError('请使用「退出家族」')
  const target = await getUser(targetOpenid)
  if (!target) throw ApiError('用户不存在')
  const tref = refOf(target, familyId)
  if (!tref) throw ApiError('对方不是家族成员')
  if (tref.role === 'owner') throw ApiError('不能移除族主')
  if (ROLE_RANK[tref.role] >= ROLE_RANK.admin && ref.role !== 'owner') throw ApiError('移除管理员需要族主执行')
  const families = target.families.filter(f => f.familyId !== familyId)
  const upd = { families }
  if (target.currentFamilyId === familyId) upd.currentFamilyId = families.length ? families[0].familyId : ''
  await db.collection('users').doc(target._id).update({ data: upd })
  await addLog(familyId, openid, 'removeUser', target.nickname || targetOpenid)
  return {}
}
async function leaveFamily(openid, familyId) {
  const { user, ref } = await requireRole(openid, familyId, 'viewer')
  if (ref.role === 'owner') throw ApiError('族主请先转让族主或解散家族')
  const families = user.families.filter(f => f.familyId !== familyId)
  const upd = { families }
  if (user.currentFamilyId === familyId) upd.currentFamilyId = families.length ? families[0].familyId : ''
  await db.collection('users').doc(user._id).update({ data: upd })
  await addLog(familyId, openid, 'leaveFamily', user.nickname || '')
  return {}
}
async function transferOwner(openid, familyId, targetOpenid) {
  const { user } = await requireRole(openid, familyId, 'owner')
  if (targetOpenid === openid) throw ApiError('你已经是族主')
  const target = await getUser(targetOpenid)
  if (!target || !refOf(target, familyId)) throw ApiError('对方不是家族成员')
  const meFamilies = user.families.map(f => f.familyId === familyId ? Object.assign({}, f, { role: 'admin' }) : f)
  await db.collection('users').doc(user._id).update({ data: { families: meFamilies } })
  const tFamilies = target.families.map(f => f.familyId === familyId ? Object.assign({}, f, { role: 'owner' }) : f)
  await db.collection('users').doc(target._id).update({ data: { families: tFamilies } })
  await db.collection('families').doc(familyId).update({ data: { creatorOpenid: targetOpenid, updatedAt: Date.now() } })
  await addLog(familyId, openid, 'transferOwner', '→ ' + (target.nickname || targetOpenid))
  return {}
}
async function dissolveFamily(openid, familyId) {
  await requireRole(openid, familyId, 'owner')
  const members = await fetchAll(db.collection('members').where({ familyId }), 5000)
  for (const m of members) {
    if (m.photoFileId) { try { await cloud.deleteFile({ fileList: [m.photoFileId] }) } catch (e) {} }
  }
  const events = await fetchAll(db.collection('events').where({ familyId }), 5000)
  for (const ev of events) {
    if (ev.images && ev.images.length) { try { await cloud.deleteFile({ fileList: ev.images }) } catch (e) {} }
  }
  await db.collection('members').where({ familyId }).remove()
  await db.collection('events').where({ familyId }).remove()
  await db.collection('joinRequests').where({ familyId }).remove()
  await db.collection('auditLogs').where({ familyId }).remove()
  const users = await fetchAll(db.collection('users').where({ 'families.familyId': familyId }), 1000)
  for (const u of users) {
    const families = (u.families || []).filter(f => f.familyId !== familyId)
    const upd = { families }
    if (u.currentFamilyId === familyId) upd.currentFamilyId = families.length ? families[0].familyId : ''
    await db.collection('users').doc(u._id).update({ data: upd })
  }
  await db.collection('families').doc(familyId).remove()
  return {}
}
async function setSelfMember(openid, familyId, memberId) {
  const { user, ref } = await requireRole(openid, familyId, 'viewer')
  if (memberId) {
    const m = await db.collection('members').doc(memberId).get().catch(() => null)
    if (!m || !m.data || m.data.familyId !== familyId) throw ApiError('成员不存在')
  }
  const families = user.families.map(f => f.familyId === familyId ? Object.assign({}, f, { memberId: memberId || '' }) : f)
  await db.collection('users').doc(user._id).update({ data: { families } })
  return {}
}
async function listAuditLogs(openid, familyId) {
  await requireRole(openid, familyId, 'admin')
  const r = await fetchAll(db.collection('auditLogs').where({ familyId }), 200)
  r.sort((a, b) => b.createdAt - a.createdAt)
  const users = await fetchAll(db.collection('users').where({ 'families.familyId': familyId }), 1000)
  const nameMap = {}
  users.forEach(u => { nameMap[u.openid] = u.nickname || '微信用户' })
  return {
    logs: r.slice(0, 100).map(l => ({
      _id: l._id,
      action: l.action,
      detail: l.detail,
      operator: nameMap[l.openid] || '成员',
      createdAt: l.createdAt
    }))
  }
}
async function exportFamily(openid, familyId) {
  await requireRole(openid, familyId, 'owner')
  const fam = await db.collection('families').doc(familyId).get()
  const members = await fetchAll(db.collection('members').where({ familyId }), 5000)
  const events = await fetchAll(db.collection('events').where({ familyId }), 5000)
  return {
    family: fam.data,
    members,
    events,
    exportedAt: Date.now()
  }
}

/* ================= 族员 ================= */

async function addMember(openid, familyId, d) {
  await requireRole(openid, familyId, 'editor')
  await checkText(d.name)
  await checkText(d.bio)
  const data = pickMemberData(d)
  if (!data.name) throw ApiError('请填写姓名')
  if (data.fatherId && data.fatherId === data.motherId) throw ApiError('父母不能是同一人')
  if (data.birthDate && data.deathDate && data.deathDate < data.birthDate) throw ApiError('逝世日期不能早于出生日期')
  const spouseIds = (Array.isArray(d.spouseIds) ? d.spouseIds : []).filter(Boolean).slice(0, 8)
  const linkIds = [data.fatherId, data.motherId].concat(spouseIds).filter(Boolean)
  let othersMap = {}
  if (linkIds.length) {
    const others = await db.collection('members').where({ _id: _.in(linkIds), familyId }).get()
    if (others.data.length !== linkIds.length) throw ApiError('关联的成员不存在或不属于本家族')
    othersMap = {}
    others.data.forEach(m => { othersMap[m._id] = m })
  }
  const now = Date.now()
  data.spouseIds = spouseIds
  data.familyId = familyId
  data.createdBy = openid
  data.createdAt = now
  data.updatedAt = now
  data.generation = computeGen(data, othersMap)
  const add = await db.collection('members').add({ data })
  for (const sid of spouseIds) {
    await db.collection('members').doc(sid).update({ data: { spouseIds: _.addToSet(add._id) } }).catch(() => {})
  }
  await recalcGenerations(familyId)
  await addLog(familyId, openid, 'addMember', data.name)
  return { id: add._id }
}
async function updateMember(openid, id, d) {
  const cur = await db.collection('members').doc(id).get().catch(() => null)
  if (!cur || !cur.data) throw ApiError('成员不存在')
  const m = cur.data
  await requireRole(openid, m.familyId, 'editor')
  await checkText(d.name)
  await checkText(d.bio)
  const data = pickMemberData(d)
  if (data.name === '') throw ApiError('姓名不能为空')
  if (d.spouseIds !== undefined) {
    const next = (Array.isArray(d.spouseIds) ? d.spouseIds : []).filter(Boolean).slice(0, 8)
    const prev = m.spouseIds || []
    const removed = prev.filter(x => next.indexOf(x) < 0)
    const added = next.filter(x => prev.indexOf(x) < 0)
    if (added.length) {
      const o = await db.collection('members').where({ _id: _.in(added), familyId: m.familyId }).get()
      if (o.data.length !== added.length) throw ApiError('配偶不存在或不属于本家族')
    }
    for (const sid of removed) {
      await db.collection('members').doc(sid).update({ data: { spouseIds: _.pull(id) } }).catch(() => {})
    }
    for (const sid of added) {
      await db.collection('members').doc(sid).update({ data: { spouseIds: _.addToSet(id) } }).catch(() => {})
    }
    data.spouseIds = next
  }
  // 生效后的父母/生卒校验（防止只改其中一个字段时绕过）
  const nFather = data.fatherId !== undefined ? data.fatherId : (m.fatherId || '')
  const nMother = data.motherId !== undefined ? data.motherId : (m.motherId || '')
  if (nFather && nFather === nMother) throw ApiError('父母不能是同一人')
  const nBirth = data.birthDate !== undefined ? data.birthDate : (m.birthDate || '')
  const nDeath = data.deathDate !== undefined ? data.deathDate : (m.deathDate || '')
  if (nBirth && nDeath && nDeath < nBirth) throw ApiError('逝世日期不能早于出生日期')
  const fatherChanged = data.fatherId !== undefined && data.fatherId !== (m.fatherId || '')
  const motherChanged = data.motherId !== undefined && data.motherId !== (m.motherId || '')
  if (fatherChanged || motherChanged) {
    const all = await fetchAll(db.collection('members').where({ familyId: m.familyId }))
    const byId = {}
    all.forEach(x => { byId[x._id] = x })
    for (const pid of [nFather, nMother]) {
      if (pid && byId[pid] && createsCycle(id, pid, byId)) throw ApiError('不能把后代设为父母（存在循环）')
    }
  }
  data.updatedAt = Date.now()
  await db.collection('members').doc(id).update({ data })
  await recalcGenerations(m.familyId)
  await addLog(m.familyId, openid, 'updateMember', data.name || m.name)
  return { id }
}
async function removeMember(openid, id) {
  const cur = await db.collection('members').doc(id).get().catch(() => null)
  if (!cur || !cur.data) throw ApiError('成员不存在')
  const m = cur.data
  await requireRole(openid, m.familyId, 'admin')
  const familyId = m.familyId
  await db.collection('members').where({ familyId, fatherId: id }).update({ data: { fatherId: '' } })
  await db.collection('members').where({ familyId, motherId: id }).update({ data: { motherId: '' } })
  for (const sid of (m.spouseIds || [])) {
    await db.collection('members').doc(sid).update({ data: { spouseIds: _.pull(id) } }).catch(() => {})
  }
  const linked = await fetchAll(db.collection('users').where({ 'families.memberId': id }), 1000)
  for (const u of linked) {
    const families = (u.families || []).map(f => f.memberId === id ? Object.assign({}, f, { memberId: '' }) : f)
    await db.collection('users').doc(u._id).update({ data: { families } }).catch(() => {})
  }
  if (m.photoFileId) { try { await cloud.deleteFile({ fileList: [m.photoFileId] }) } catch (e) {} }
  await db.collection('members').doc(id).remove()
  await recalcGenerations(familyId)
  await addLog(familyId, openid, 'removeMember', m.name)
  return {}
}
async function getMember(openid, id) {
  const cur = await db.collection('members').doc(id).get().catch(() => null)
  if (!cur || !cur.data) throw ApiError('成员不存在')
  const m = cur.data
  await requireRole(openid, m.familyId, 'viewer')
  const load = async (mid) => {
    if (!mid) return null
    const r = await db.collection('members').doc(mid).get().catch(() => null)
    return r && r.data ? slim(r.data) : null
  }
  const father = await load(m.fatherId)
  const mother = await load(m.motherId)
  const spouseRecs = m.spouseIds && m.spouseIds.length
    ? (await db.collection('members').where({ _id: _.in(m.spouseIds) }).get()).data
    : []
  const childrenRes = await db.collection('members').where(_.or([{ familyId: m.familyId, fatherId: id }, { familyId: m.familyId, motherId: id }])).get()
  let siblings = []
  const sibConds = []
  if (m.fatherId) sibConds.push({ familyId: m.familyId, fatherId: m.fatherId })
  if (m.motherId) sibConds.push({ familyId: m.familyId, motherId: m.motherId })
  if (sibConds.length) {
    const cond = sibConds.length === 2 ? _.or(sibConds) : sibConds[0]
    const r = await db.collection('members').where(cond).get()
    siblings = r.data.filter(x => x._id !== id)
  }
  const u = await getUser(openid)
  const ref = u && refOf(u, m.familyId)
  return {
    member: Object.assign(slim(m), {
      birthDate: m.birthDate || '',
      deathDate: m.deathDate || '',
      birthPlace: m.birthPlace || '',
      occupation: m.occupation || '',
      phone: m.phone || '',
      bio: m.bio || '',
      fatherId: m.fatherId || '',
      motherId: m.motherId || '',
      spouseIds: m.spouseIds || []
    }),
    father,
    mother,
    spouses: spouseRecs.map(slim),
    children: childrenRes.data.map(slim).sort(byBirth),
    siblings: siblings.map(slim).sort(byBirth),
    isSelf: !!(ref && ref.memberId === id)
  }
}
async function listMembers(openid, familyId) {
  await requireRole(openid, familyId, 'viewer')
  const all = await fetchAll(db.collection('members').where({ familyId }), 5000)
  all.sort((a, b) => {
    const g = (a.generation || 0) - (b.generation || 0)
    if (g !== 0) return g
    return byBirth(a, b)
  })
  return { members: all.map(slim) }
}
async function getTree(openid, familyId, rootId) {
  await requireRole(openid, familyId, 'viewer')
  const all = await fetchAll(db.collection('members').where({ familyId }), 5000)
  const byId = {}
  all.forEach(m => { byId[m._id] = m })
  const childMap = {}
  const rootsRaw = []
  all.forEach(m => {
    const pid = primaryParentId(m, byId)
    if (pid) (childMap[pid] = childMap[pid] || []).push(m._id)
    else rootsRaw.push(m)
  })
  function buildNode(id, depth, visited) {
    const m = byId[id]
    if (!m || visited[id] || depth > 60) return null
    visited[id] = true
    const spouses = (m.spouseIds || []).filter(s => byId[s]).map(s => slim(byId[s]))
    const kids = (childMap[id] || []).map(cid => buildNode(cid, depth + 1, visited)).filter(Boolean)
    return Object.assign(slim(m), { spouses, children: kids })
  }
  let roots
  if (rootId && byId[rootId]) {
    roots = [buildNode(rootId, 0, {})]
  } else {
    // 已作为某人配偶展示的根不再单独展示；夫妻同为根时保留先出现的一位
    const consumed = {}
    const keptRoots = []
    rootsRaw.forEach(r => {
      if (consumed[r._id]) return
      keptRoots.push(r)
      ;(r.spouseIds || []).forEach(s => { consumed[s] = true })
    })
    roots = keptRoots
      .sort((a, b) => (a.generation || 0) - (b.generation || 0) || byBirth(a, b))
      .map(r => buildNode(r._id, 0, {}))
      .filter(Boolean)
  }
  const u = await getUser(openid)
  const ref = u && refOf(u, familyId)
  return { roots, total: all.length, selfMemberId: (ref && ref.memberId) || '' }
}
async function getStats(openid, familyId) {
  await requireRole(openid, familyId, 'viewer')
  const all = await fetchAll(db.collection('members').where({ familyId }), 5000)
  let male = 0, female = 0, unknown = 0, alive = 0, deceased = 0
  const genMap = {}
  const decadeMap = {}
  let lifeSum = 0, lifeN = 0
  let oldest = null
  const thisYear = String(new Date().getFullYear())
  let addedThisYear = 0
  all.forEach(m => {
    if (m.gender === 1) male++
    else if (m.gender === 2) female++
    else unknown++
    if (m.isAlive === false) deceased++
    else alive++
    const gen = m.generation || 0
    genMap[gen] = (genMap[gen] || 0) + 1
    if (m.birthDate && m.birthDate.length >= 4) {
      const y = Number(m.birthDate.slice(0, 4))
      if (!isNaN(y) && y > 1800) {
        const dec = Math.floor(y / 10) * 10
        decadeMap[dec] = (decadeMap[dec] || 0) + 1
      }
    }
    if (m.isAlive === false && m.birthDate && m.deathDate) {
      const age = fullAge(m.birthDate, m.deathDate)
      if (age !== null && age >= 0 && age < 150) {
        lifeSum += age
        lifeN++
        if (!oldest || age > oldest.age) oldest = { name: m.name, age }
      }
    }
    if (m.createdAt && new Date(m.createdAt).getFullYear() === Number(thisYear)) addedThisYear++
  })
  const gens = Object.keys(genMap).map(k => ({ gen: Number(k), count: genMap[k] })).sort((a, b) => a.gen - b.gen)
  const decades = Object.keys(decadeMap).map(k => ({ decade: k + 's', count: decadeMap[k] })).sort((a, b) => a.decade.localeCompare(b.decade))
  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  return {
    total: all.length,
    male, female, unknown, alive, deceased,
    generations: gens.length ? gens[gens.length - 1].gen + 1 : 0,
    avgLifespan: lifeN ? Math.round(lifeSum / lifeN) : null,
    oldest,
    genDist: gens,
    decadeDist: decades,
    addedThisYear,
    familyName: (fam.data && fam.data.name) || '',
    surname: (fam.data && fam.data.surname) || ''
  }
}

/* ================= 大事记 ================= */

function eventSlim(e, nameMap) {
  return {
    _id: e._id,
    title: e.title || '',
    date: e.date || '',
    description: e.description || '',
    images: e.images || [],
    creator: (nameMap && nameMap[e.createdBy]) || '',
    createdAt: e.createdAt
  }
}
async function listEvents(openid, familyId) {
  await requireRole(openid, familyId, 'viewer')
  const all = await fetchAll(db.collection('events').where({ familyId }), 2000)
  all.sort((a, b) => ((b.date || '') + (b.createdAt || '')).localeCompare((a.date || '') + (a.createdAt || '')))
  const users = await fetchAll(db.collection('users').where({ 'families.familyId': familyId }), 1000)
  const nameMap = {}
  users.forEach(u => { nameMap[u.openid] = u.nickname || '微信用户' })
  return { events: all.map(e => eventSlim(e, nameMap)) }
}
async function getEvent(openid, id) {
  const r = await db.collection('events').doc(id).get().catch(() => null)
  if (!r || !r.data) throw ApiError('大事记不存在')
  await requireRole(openid, r.data.familyId, 'viewer')
  return { event: eventSlim(r.data) }
}
function pickEventData(d) {
  const out = {}
  if (d.title !== undefined) out.title = String(d.title || '').trim().slice(0, 60)
  if (d.date !== undefined) out.date = String(d.date || '').slice(0, 20)
  if (d.description !== undefined) out.description = String(d.description || '').slice(0, 2000)
  if (d.images !== undefined) out.images = (Array.isArray(d.images) ? d.images : []).filter(Boolean).slice(0, 9)
  return out
}
async function addEvent(openid, familyId, d) {
  await requireRole(openid, familyId, 'editor')
  const data = pickEventData(d)
  if (!data.title) throw ApiError('请填写标题')
  if (!data.date) throw ApiError('请选择日期')
  await checkText(data.title)
  await checkText(data.description)
  data.familyId = familyId
  data.createdBy = openid
  data.createdAt = Date.now()
  const add = await db.collection('events').add({ data })
  await addLog(familyId, openid, 'addEvent', data.title)
  return { id: add._id }
}
async function updateEvent(openid, id, d) {
  const r = await db.collection('events').doc(id).get().catch(() => null)
  if (!r || !r.data) throw ApiError('大事记不存在')
  await requireRole(openid, r.data.familyId, 'editor')
  const data = pickEventData(d)
  if (data.title !== undefined) {
    if (!data.title) throw ApiError('标题不能为空')
    await checkText(data.title)
  }
  await checkText(data.description)
  data.updatedAt = Date.now()
  await db.collection('events').doc(id).update({ data })
  await addLog(r.data.familyId, openid, 'updateEvent', data.title || r.data.title)
  return {}
}
async function removeEvent(openid, id) {
  const r = await db.collection('events').doc(id).get().catch(() => null)
  if (!r || !r.data) throw ApiError('大事记不存在')
  const ev = r.data
  const { ref } = await requireRole(openid, ev.familyId, 'viewer')
  const isAdmin = (ROLE_RANK[ref.role] || 0) >= ROLE_RANK.admin
  if (!isAdmin && ev.createdBy !== openid) throw ApiError('只能删除自己发布的内容，或需要管理员权限')
  if (ev.images && ev.images.length) { try { await cloud.deleteFile({ fileList: ev.images }) } catch (e) {} }
  await db.collection('events').doc(id).remove()
  await addLog(ev.familyId, openid, 'removeEvent', ev.title)
  return {}
}

/* ================= 入口 ================= */

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail('无法获取微信身份，请重新打开小程序', 'NOOPENID')
  const action = event && event.action
  try {
    switch (action) {
      /* 系统 */
      case 'ping': return ok({ pong: Date.now() })
      case 'initCollections': return ok(await initCollections())
      /* 用户 */
      case 'login': return ok(await login(OPENID))
      case 'updateProfile': return ok(await updateProfile(OPENID, event))
      case 'listMyFamilies': return ok(await listMyFamilies(OPENID))
      case 'myPendingRequests': return ok(await myPendingRequests(OPENID))
      /* 家族 */
      case 'createFamily': return ok(await createFamily(OPENID, event))
      case 'getFamilyContext': return ok(await getFamilyContext(OPENID, event.familyId))
      case 'switchFamily': return ok(await switchFamily(OPENID, event.familyId))
      case 'updateFamily': return ok(await updateFamily(OPENID, event.familyId, event))
      case 'regenerateInviteCode': return ok(await regenerateInviteCode(OPENID, event.familyId))
      case 'getInviteQr': return ok(await getInviteQr(OPENID, event.familyId))
      case 'previewInvite': return ok(await previewInvite(event))
      case 'joinFamily': return ok(await joinFamily(OPENID, event))
      case 'listJoinRequests': return ok(await listJoinRequests(OPENID, event.familyId))
      case 'handleJoinRequest': return ok(await handleJoinRequest(OPENID, event.id, !!event.approve))
      case 'listFamilyUsers': return ok(await listFamilyUsers(OPENID, event.familyId))
      case 'setUserRole': return ok(await setUserRole(OPENID, event.familyId, event.targetOpenid, event.role))
      case 'removeFamilyUser': return ok(await removeFamilyUser(OPENID, event.familyId, event.targetOpenid))
      case 'leaveFamily': return ok(await leaveFamily(OPENID, event.familyId))
      case 'transferOwner': return ok(await transferOwner(OPENID, event.familyId, event.targetOpenid))
      case 'dissolveFamily': return ok(await dissolveFamily(OPENID, event.familyId))
      case 'setSelfMember': return ok(await setSelfMember(OPENID, event.familyId, event.memberId))
      case 'listAuditLogs': return ok(await listAuditLogs(OPENID, event.familyId))
      case 'exportFamily': return ok(await exportFamily(OPENID, event.familyId))
      /* 族员 */
      case 'addMember': return ok(await addMember(OPENID, event.familyId, event))
      case 'updateMember': return ok(await updateMember(OPENID, event.id, event))
      case 'removeMember': return ok(await removeMember(OPENID, event.id))
      case 'getMember': return ok(await getMember(OPENID, event.id))
      case 'listMembers': return ok(await listMembers(OPENID, event.familyId))
      case 'getTree': return ok(await getTree(OPENID, event.familyId, event.rootId))
      case 'getStats': return ok(await getStats(OPENID, event.familyId))
      /* 大事记 */
      case 'listEvents': return ok(await listEvents(OPENID, event.familyId))
      case 'getEvent': return ok(await getEvent(OPENID, event.id))
      case 'addEvent': return ok(await addEvent(OPENID, event.familyId, event))
      case 'updateEvent': return ok(await updateEvent(OPENID, event.id, event))
      case 'removeEvent': return ok(await removeEvent(OPENID, event.id))
      default:
        return fail('未知操作: ' + action)
    }
  } catch (e) {
    if (e && e.code && e.code !== 'SERVER') return fail(e.message, e.code)
    console.error('[api]', action, e)
    return fail((e && e.message) || '服务器错误', 'SERVER')
  }
}
