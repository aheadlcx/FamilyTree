// API 层：cloudfunctions/api/index.js 的 1:1 移植。
// 相同的 action 协议、权限模型（owner>admin>editor>viewer）、数据结构，
// 差别仅在于：数据保存在 localStorage，openid 由「模拟微信账号」提供。
(function () {
  const DB = window.FamilyDB
  const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 }

  function ApiError(msg, code) {
    const e = new Error(msg)
    e.code = code || 'ERR'
    return e
  }
  function uid() {
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }
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
  function clone(x) { return JSON.parse(JSON.stringify(x)) }

  /* ================ 用户 ================ */

  function getUser(openid) {
    return DB.load().users.find(u => u.openid === openid) || null
  }
  function ensureUser(openid) {
    let u = getUser(openid)
    if (u) return u
    const nu = {
      _id: uid(), openid, nickname: '', avatarUrl: '',
      families: [], currentFamilyId: '', createdAt: Date.now(), lastLoginAt: Date.now()
    }
    DB.load().users.push(nu)
    return nu
  }
  function refOf(user, familyId) {
    return (user.families || []).find(f => f.familyId === familyId) || null
  }
  function requireRole(openid, familyId, minRole) {
    if (!familyId) throw ApiError('缺少家族参数')
    const u = getUser(openid)
    if (!u) throw ApiError('请先登录', 'NOUSER')
    const ref = refOf(u, familyId)
    if (!ref) throw ApiError('你还不是该家族成员', 'NOPERM')
    if ((ROLE_RANK[ref.role] || 0) < (ROLE_RANK[minRole] || 99)) throw ApiError('权限不足', 'NOPERM')
    return { user: u, ref }
  }
  function addLog(familyId, openid, action, detail) {
    DB.load().auditLogs.push({
      _id: uid(), familyId, openid,
      action, detail: String(detail || '').slice(0, 200),
      createdAt: Date.now()
    })
  }
  function inviteCode() {
    const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let c = ''
    for (let i = 0; i < 6; i++) c += s.charAt(Math.floor(Math.random() * s.length))
    return c
  }

  /* ================ 世代计算 ================ */

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
  function recalcGenerations(familyId) {
    const all = DB.load().members.filter(m => m.familyId === familyId)
    const byId = {}
    all.forEach(m => { byId[m._id] = m })
    const gen = {}
    all.forEach(m => { gen[m._id] = 0 })
    // 不动点迭代：父/母有谱则 +1；否则跟随配偶（嫁入/娶入者同世代）。必收敛
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
    all.forEach(m => { m.generation = gen[m._id] })
  }
  function pickMemberData(d) {
    const out = {}
    const strs = { name: 60, birthDate: 20, deathDate: 20, birthPlace: 60, occupation: 60, phone: 30, bio: 2000, photoFileId: 300000 }
    Object.keys(strs).forEach(k => {
      if (d[k] !== undefined) out[k] = String(d[k] || '').slice(0, strs[k])
    })
    if (d.gender !== undefined) out.gender = Number(d.gender) || 0
    if (d.isAlive !== undefined) out.isAlive = !!d.isAlive
    if (d.fatherId !== undefined) out.fatherId = d.fatherId ? String(d.fatherId) : ''
    if (d.motherId !== undefined) out.motherId = d.motherId ? String(d.motherId) : ''
    return out
  }
  function membersOf(familyId) {
    return DB.load().members.filter(m => m.familyId === familyId)
  }
  function familyUsers(familyId) {
    return DB.load().users.filter(u => refOf(u, familyId))
  }

  /* ================ 业务逻辑（与云函数一致） ================ */

  const handlers = {
    ping() { return { pong: Date.now() } },

    /* ---- 用户 ---- */
    login() {
      const openid = DB.load().session.currentOpenid
      if (!openid) throw ApiError('请先点击微信登录', 'NOLOGIN')
      const u = ensureUser(openid)
      u.lastLoginAt = Date.now()
      return {
        user: {
          _id: u._id, nickname: u.nickname || '', avatarUrl: u.avatarUrl || '',
          families: clone(u.families || []), currentFamilyId: u.currentFamilyId || ''
        }
      }
    },
    updateProfile(openid, d) {
      const u = ensureUser(openid)
      if (d.nickname !== undefined) u.nickname = String(d.nickname || '').slice(0, 30)
      if (d.avatarUrl !== undefined) u.avatarUrl = String(d.avatarUrl || '').slice(0, 300000)
      return {}
    },
    listMyFamilies(openid) {
      const u = ensureUser(openid)
      const refs = u.families || []
      const families = refs
        .map(r => {
          const f = DB.load().families.find(x => x._id === r.familyId)
          if (!f) return null
          return {
            familyId: r.familyId,
            role: r.role,
            memberId: r.memberId || '',
            name: f.name,
            surname: f.surname || '',
            memberCount: membersOf(r.familyId).length,
            isCurrent: u.currentFamilyId === r.familyId
          }
        })
        .filter(Boolean)
      return { families }
    },
    myPendingRequests(openid) {
      const u = ensureUser(openid)
      const reqs = DB.load().joinRequests.filter(r => r.openid === openid && r.status === 'pending')
      return {
        requests: reqs.map(r => {
          const f = DB.load().families.find(x => x._id === r.familyId)
          return { _id: r._id, familyName: f ? f.name : '未知家族', status: r.status, createdAt: r.createdAt }
        })
      }
    },

    /* ---- 家族 ---- */
    createFamily(openid, d) {
      const name = String(d.name || '').trim()
      if (!name) throw ApiError('请填写家族名称')
      const u = ensureUser(openid)
      const now = Date.now()
      const fam = {
        _id: uid(),
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
      DB.load().families.push(fam)
      ;(u.families = u.families || []).push({ familyId: fam._id, role: 'owner', memberId: '', joinedAt: now })
      u.currentFamilyId = fam._id
      addLog(fam._id, openid, 'createFamily', fam.name)
      return { familyId: fam._id }
    },
    getFamilyContext(openid, d) {
      const u = ensureUser(openid)
      const fid = d.familyId || u.currentFamilyId
      const base = { user: { nickname: u.nickname, avatarUrl: u.avatarUrl } }
      if (!fid) return Object.assign({ inFamily: false }, base)
      const ref = refOf(u, fid)
      if (!ref) return Object.assign({ inFamily: false }, base)
      const fam = DB.load().families.find(x => x._id === fid)
      if (!fam) return Object.assign({ inFamily: false }, base)
      let pendingCount = 0
      const isAdmin = (ROLE_RANK[ref.role] || 0) >= ROLE_RANK.admin
      if (isAdmin) {
        pendingCount = DB.load().joinRequests.filter(r => r.familyId === fid && r.status === 'pending').length
      }
      // 邀请码与创建者 openid 仅管理角色可见
      const family = clone(fam)
      if (!isAdmin) {
        delete family.inviteCode
        delete family.creatorOpenid
      }
      return {
        inFamily: true,
        family,
        role: ref.role,
        memberCount: membersOf(fid).length,
        pendingCount,
        selfMemberId: ref.memberId || ''
      }
    },
    switchFamily(openid, d) {
      const u = ensureUser(openid)
      if (!refOf(u, d.familyId)) throw ApiError('你还不是该家族成员', 'NOPERM')
      u.currentFamilyId = d.familyId
      return {}
    },
    updateFamily(openid, d) {
      requireRole(openid, d.familyId, 'admin')
      const fam = DB.load().families.find(x => x._id === d.familyId)
      if (!fam) throw ApiError('家族不存在')
      if (d.name !== undefined) {
        const name = String(d.name || '').trim()
        if (!name) throw ApiError('家族名称不能为空')
        fam.name = name.slice(0, 40)
      }
      if (d.surname !== undefined) fam.surname = String(d.surname || '').trim().slice(0, 10)
      if (d.description !== undefined) fam.description = String(d.description || '').slice(0, 300)
      if (d.autoApprove !== undefined) fam.autoApprove = !!d.autoApprove
      if (d.defaultRole !== undefined) {
        if (['viewer', 'editor'].indexOf(d.defaultRole) < 0) throw ApiError('默认角色不合法')
        fam.defaultRole = d.defaultRole
      }
      fam.updatedAt = Date.now()
      addLog(d.familyId, openid, 'updateFamily', fam.name)
      return {}
    },
    regenerateInviteCode(openid, d) {
      requireRole(openid, d.familyId, 'admin')
      const fam = DB.load().families.find(x => x._id === d.familyId)
      fam.inviteCode = inviteCode()
      fam.updatedAt = Date.now()
      addLog(d.familyId, openid, 'regenerateInviteCode', fam.inviteCode)
      return { inviteCode: fam.inviteCode }
    },
    previewInvite(openid, d) {
      const code = String(d.code || '').trim().toUpperCase()
      if (!code) throw ApiError('请输入邀请码')
      const fam = DB.load().families.find(x => x.inviteCode === code)
      if (!fam) throw ApiError('邀请码无效')
      return { familyId: fam._id, name: fam.name, surname: fam.surname || '' }
    },
    joinFamily(openid, d) {
      const code = String(d.code || '').trim().toUpperCase()
      if (!code) throw ApiError('请输入邀请码')
      const u = ensureUser(openid)
      const fam = DB.load().families.find(x => x.inviteCode === code)
      if (!fam) throw ApiError('邀请码无效')
      if (refOf(u, fam._id)) throw ApiError('你已经是该家族成员')
      const dup = DB.load().joinRequests.some(r => r.familyId === fam._id && r.openid === openid && r.status === 'pending')
      if (dup) throw ApiError('已提交过申请，请等待管理员审核')
      const now = Date.now()
      if (fam.autoApprove) {
        ;(u.families = u.families || []).push({ familyId: fam._id, role: fam.defaultRole || 'viewer', memberId: '', joinedAt: now })
        u.currentFamilyId = fam._id
        addLog(fam._id, openid, 'joinFamily', '自动通过')
        return { approved: true, familyId: fam._id }
      }
      DB.load().joinRequests.push({
        _id: uid(), familyId: fam._id, openid,
        nickname: u.nickname || '微信用户',
        avatarUrl: u.avatarUrl || '',
        message: String(d.message || '').slice(0, 200),
        status: 'pending',
        createdAt: now
      })
      addLog(fam._id, openid, 'joinFamily', '提交申请')
      return { approved: false, familyId: fam._id }
    },
    listJoinRequests(openid, d) {
      requireRole(openid, d.familyId, 'admin')
      const reqs = DB.load().joinRequests.filter(r => r.familyId === d.familyId && r.status === 'pending')
      reqs.sort((a, b) => b.createdAt - a.createdAt)
      return { requests: clone(reqs) }
    },
    handleJoinRequest(openid, d) {
      const req = DB.load().joinRequests.find(r => r._id === d.id)
      if (!req) throw ApiError('申请不存在')
      requireRole(openid, req.familyId, 'admin')
      if (req.status !== 'pending') throw ApiError('该申请已处理')
      if (d.approve) {
        const fam = DB.load().families.find(x => x._id === req.familyId)
        const role = (fam && fam.defaultRole) || 'viewer'
        const target = getUser(req.openid)
        if (target && !refOf(target, req.familyId)) {
          ;(target.families = target.families || []).push({ familyId: req.familyId, role, memberId: '', joinedAt: Date.now() })
          if (!target.currentFamilyId) target.currentFamilyId = req.familyId
        }
        req.status = 'approved'
        req.handledBy = openid
        req.handledAt = Date.now()
        addLog(req.familyId, openid, 'approveJoin', req.nickname)
      } else {
        req.status = 'rejected'
        req.handledBy = openid
        req.handledAt = Date.now()
        addLog(req.familyId, openid, 'rejectJoin', req.nickname)
      }
      return {}
    },
    listFamilyUsers(openid, d) {
      requireRole(openid, d.familyId, 'admin')
      const users = familyUsers(d.familyId).map(u => {
        const ref = refOf(u, d.familyId) || {}
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
    },
    setUserRole(openid, d) {
      const { ref } = requireRole(openid, d.familyId, 'admin')
      const role = d.role
      if (['viewer', 'editor', 'admin'].indexOf(role) < 0) throw ApiError('角色不合法')
      if (d.targetOpenid === openid) throw ApiError('不能修改自己的角色')
      const target = getUser(d.targetOpenid)
      if (!target) throw ApiError('用户不存在')
      const tref = refOf(target, d.familyId)
      if (!tref) throw ApiError('对方不是家族成员')
      if (tref.role === 'owner') throw ApiError('不能修改族主角色，请使用转让族主')
      if ((role === 'admin' || ROLE_RANK[tref.role] >= ROLE_RANK.admin) && ref.role !== 'owner') {
        throw ApiError('该操作需要族主执行')
      }
      tref.role = role
      addLog(d.familyId, openid, 'setUserRole', (target.nickname || d.targetOpenid) + ' → ' + role)
      return {}
    },
    removeFamilyUser(openid, d) {
      const { ref } = requireRole(openid, d.familyId, 'admin')
      if (d.targetOpenid === openid) throw ApiError('请使用「退出家族」')
      const target = getUser(d.targetOpenid)
      if (!target) throw ApiError('用户不存在')
      const tref = refOf(target, d.familyId)
      if (!tref) throw ApiError('对方不是家族成员')
      if (tref.role === 'owner') throw ApiError('不能移除族主')
      if (ROLE_RANK[tref.role] >= ROLE_RANK.admin && ref.role !== 'owner') throw ApiError('移除管理员需要族主执行')
      target.families = target.families.filter(f => f.familyId !== d.familyId)
      if (target.currentFamilyId === d.familyId) {
        target.currentFamilyId = target.families.length ? target.families[0].familyId : ''
      }
      addLog(d.familyId, openid, 'removeUser', target.nickname || d.targetOpenid)
      return {}
    },
    leaveFamily(openid, d) {
      const { user, ref } = requireRole(openid, d.familyId, 'viewer')
      if (ref.role === 'owner') throw ApiError('族主请先转让族主或解散家族')
      user.families = user.families.filter(f => f.familyId !== d.familyId)
      if (user.currentFamilyId === d.familyId) {
        user.currentFamilyId = user.families.length ? user.families[0].familyId : ''
      }
      addLog(d.familyId, openid, 'leaveFamily', user.nickname || '')
      return {}
    },
    transferOwner(openid, d) {
      const { user } = requireRole(openid, d.familyId, 'owner')
      if (d.targetOpenid === openid) throw ApiError('你已经是族主')
      const target = getUser(d.targetOpenid)
      if (!target || !refOf(target, d.familyId)) throw ApiError('对方不是家族成员')
      refOf(user, d.familyId).role = 'admin'
      refOf(target, d.familyId).role = 'owner'
      const fam = DB.load().families.find(x => x._id === d.familyId)
      if (fam) fam.creatorOpenid = d.targetOpenid
      addLog(d.familyId, openid, 'transferOwner', '→ ' + (target.nickname || d.targetOpenid))
      return {}
    },
    dissolveFamily(openid, d) {
      requireRole(openid, d.familyId, 'owner')
      const db = DB.load()
      db.members = db.members.filter(m => m.familyId !== d.familyId)
      db.events = db.events.filter(e => e.familyId !== d.familyId)
      db.joinRequests = db.joinRequests.filter(r => r.familyId !== d.familyId)
      db.auditLogs = db.auditLogs.filter(l => l.familyId !== d.familyId)
      familyUsers(d.familyId).forEach(u => {
        u.families = (u.families || []).filter(f => f.familyId !== d.familyId)
        if (u.currentFamilyId === d.familyId) {
          u.currentFamilyId = u.families.length ? u.families[0].familyId : ''
        }
      })
      db.families = db.families.filter(f => f._id !== d.familyId)
      return {}
    },
    setSelfMember(openid, d) {
      const { user } = requireRole(openid, d.familyId, 'viewer')
      if (d.memberId) {
        const m = DB.load().members.find(x => x._id === d.memberId)
        if (!m || m.familyId !== d.familyId) throw ApiError('成员不存在')
      }
      refOf(user, d.familyId).memberId = d.memberId || ''
      return {}
    },
    listAuditLogs(openid, d) {
      requireRole(openid, d.familyId, 'admin')
      const logs = DB.load().auditLogs.filter(l => l.familyId === d.familyId)
      logs.sort((a, b) => b.createdAt - a.createdAt)
      const nameMap = {}
      familyUsers(d.familyId).forEach(u => { nameMap[u.openid] = u.nickname || '微信用户' })
      return {
        logs: logs.slice(0, 100).map(l => ({
          _id: l._id, action: l.action, detail: l.detail,
          operator: nameMap[l.openid] || '成员', createdAt: l.createdAt
        }))
      }
    },
    exportFamily(openid, d) {
      requireRole(openid, d.familyId, 'owner')
      const fam = DB.load().families.find(x => x._id === d.familyId)
      return {
        family: clone(fam),
        members: clone(membersOf(d.familyId)),
        events: clone(DB.load().events.filter(e => e.familyId === d.familyId)),
        exportedAt: Date.now()
      }
    },

    /* ---- 族员 ---- */
    addMember(openid, d) {
      requireRole(openid, d.familyId, 'editor')
      const data = pickMemberData(d)
      if (!data.name) throw ApiError('请填写姓名')
      if (data.fatherId && data.fatherId === data.motherId) throw ApiError('父母不能是同一人')
      if (data.birthDate && data.deathDate && data.deathDate < data.birthDate) throw ApiError('逝世日期不能早于出生日期')
      const spouseIds = (Array.isArray(d.spouseIds) ? d.spouseIds : []).filter(Boolean).slice(0, 8)
      const linkIds = [data.fatherId, data.motherId].concat(spouseIds).filter(Boolean)
      let othersMap = {}
      if (linkIds.length) {
        const others = DB.load().members.filter(m => linkIds.indexOf(m._id) >= 0 && m.familyId === d.familyId)
        if (others.length !== linkIds.length) throw ApiError('关联的成员不存在或不属于本家族')
        othersMap = {}
        others.forEach(m => { othersMap[m._id] = m })
      }
      const now = Date.now()
      const m = Object.assign(data, {
        _id: uid(),
        spouseIds,
        familyId: d.familyId,
        createdBy: openid,
        createdAt: now,
        updatedAt: now,
        generation: computeGen(data, othersMap)
      })
      DB.load().members.push(m)
      spouseIds.forEach(sid => {
        const s = DB.load().members.find(x => x._id === sid)
        if (s) {
          s.spouseIds = s.spouseIds || []
          if (s.spouseIds.indexOf(m._id) < 0) s.spouseIds.push(m._id)
        }
      })
      recalcGenerations(d.familyId)
      addLog(d.familyId, openid, 'addMember', data.name)
      return { id: m._id }
    },
    updateMember(openid, d) {
      const m = DB.load().members.find(x => x._id === d.id)
      if (!m) throw ApiError('成员不存在')
      requireRole(openid, m.familyId, 'editor')
      const data = pickMemberData(d)
      if (data.name === '') throw ApiError('姓名不能为空')
      if (d.spouseIds !== undefined) {
        const next = (Array.isArray(d.spouseIds) ? d.spouseIds : []).filter(Boolean).slice(0, 8)
        const prev = m.spouseIds || []
        const removed = prev.filter(x => next.indexOf(x) < 0)
        const added = next.filter(x => prev.indexOf(x) < 0)
        if (added.length) {
          const o = DB.load().members.filter(x => added.indexOf(x._id) >= 0 && x.familyId === m.familyId)
          if (o.length !== added.length) throw ApiError('配偶不存在或不属于本家族')
        }
        removed.forEach(sid => {
          const s = DB.load().members.find(x => x._id === sid)
          if (s) s.spouseIds = (s.spouseIds || []).filter(x => x !== m._id)
        })
        added.forEach(sid => {
          const s = DB.load().members.find(x => x._id === sid)
          if (s) {
            s.spouseIds = s.spouseIds || []
            if (s.spouseIds.indexOf(m._id) < 0) s.spouseIds.push(m._id)
          }
        })
        m.spouseIds = next
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
        const byId = {}
        membersOf(m.familyId).forEach(x => { byId[x._id] = x })
        ;[nFather, nMother].forEach(pid => {
          if (pid && byId[pid] && createsCycle(m._id, pid, byId)) throw ApiError('不能把后代设为父母（存在循环）')
        })
      }
      Object.assign(m, data, { updatedAt: Date.now() })
      recalcGenerations(m.familyId)
      addLog(m.familyId, openid, 'updateMember', data.name || m.name)
      return { id: m._id }
    },
    removeMember(openid, d) {
      const m = DB.load().members.find(x => x._id === d.id)
      if (!m) throw ApiError('成员不存在')
      requireRole(openid, m.familyId, 'admin')
      const db = DB.load()
      db.members.forEach(c => {
        if (c.familyId === m.familyId && c.fatherId === m._id) c.fatherId = ''
        if (c.familyId === m.familyId && c.motherId === m._id) c.motherId = ''
      })
      ;(m.spouseIds || []).forEach(sid => {
        const s = db.members.find(x => x._id === sid)
        if (s) s.spouseIds = (s.spouseIds || []).filter(x => x !== m._id)
      })
      familyUsers(m.familyId).forEach(u => {
        (u.families || []).forEach(f => { if (f.memberId === m._id) f.memberId = '' })
      })
      db.members = db.members.filter(x => x._id !== m._id)
      recalcGenerations(m.familyId)
      addLog(m.familyId, openid, 'removeMember', m.name)
      return {}
    },
    getMember(openid, d) {
      const m = DB.load().members.find(x => x._id === d.id)
      if (!m) throw ApiError('成员不存在')
      requireRole(openid, m.familyId, 'viewer')
      const load = mid => {
        if (!mid) return null
        const r = DB.load().members.find(x => x._id === mid)
        return r ? slim(r) : null
      }
      const db = DB.load()
      const children = db.members.filter(x =>
        x.familyId === m.familyId && (x.fatherId === m._id || x.motherId === m._id))
      let siblings = []
      if (m.fatherId || m.motherId) {
        siblings = db.members.filter(x =>
          x.familyId === m.familyId && x._id !== m._id &&
          ((m.fatherId && x.fatherId === m.fatherId) || (m.motherId && x.motherId === m.motherId)))
      }
      const spouseRecs = (m.spouseIds || [])
        .map(sid => db.members.find(x => x._id === sid))
        .filter(Boolean)
      const u = getUser(openid)
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
        father: load(m.fatherId),
        mother: load(m.motherId),
        spouses: spouseRecs.map(slim),
        children: children.map(slim).sort(byBirth),
        siblings: siblings.map(slim).sort(byBirth),
        isSelf: !!(ref && ref.memberId === m._id)
      }
    },
    listMembers(openid, d) {
      requireRole(openid, d.familyId, 'viewer')
      const all = membersOf(d.familyId).slice()
      all.sort((a, b) => {
        const g = (a.generation || 0) - (b.generation || 0)
        if (g !== 0) return g
        return byBirth(a, b)
      })
      return { members: all.map(slim) }
    },
    getTree(openid, d) {
      requireRole(openid, d.familyId, 'viewer')
      const all = membersOf(d.familyId)
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
      if (d.rootId && byId[d.rootId]) {
        roots = [buildNode(d.rootId, 0, {})]
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
      const u = getUser(openid)
      const ref = u && refOf(u, d.familyId)
      return { roots, total: all.length, selfMemberId: (ref && ref.memberId) || '' }
    },
    getStats(openid, d) {
      requireRole(openid, d.familyId, 'viewer')
      const all = membersOf(d.familyId)
      let male = 0, female = 0, unknown = 0, alive = 0, deceased = 0
      const genMap = {}
      const decadeMap = {}
      let lifeSum = 0, lifeN = 0
      let oldest = null
      const thisYear = new Date().getFullYear()
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
        if (m.createdAt && new Date(m.createdAt).getFullYear() === thisYear) addedThisYear++
      })
      const gens = Object.keys(genMap).map(k => ({ gen: Number(k), count: genMap[k] })).sort((a, b) => a.gen - b.gen)
      const decades = Object.keys(decadeMap).map(k => ({ decade: k + 's', count: decadeMap[k] })).sort((a, b) => a.decade.localeCompare(b.decade))
      const fam = DB.load().families.find(x => x._id === d.familyId)
      return {
        total: all.length,
        male, female, unknown, alive, deceased,
        generations: gens.length ? gens[gens.length - 1].gen + 1 : 0,
        avgLifespan: lifeN ? Math.round(lifeSum / lifeN) : null,
        oldest,
        genDist: gens,
        decadeDist: decades,
        addedThisYear,
        familyName: (fam && fam.name) || '',
        surname: (fam && fam.surname) || ''
      }
    },

    /* ---- 大事记 ---- */
    listEvents(openid, d) {
      requireRole(openid, d.familyId, 'viewer')
      const all = DB.load().events.filter(e => e.familyId === d.familyId).slice()
      all.sort((a, b) => ((b.date || '') + (b.createdAt || '')).localeCompare((a.date || '') + (a.createdAt || '')))
      const nameMap = {}
      familyUsers(d.familyId).forEach(u => { nameMap[u.openid] = u.nickname || '微信用户' })
      return {
        events: all.map(e => ({
          _id: e._id, title: e.title || '', date: e.date || '',
          description: e.description || '', images: e.images || [],
          creator: nameMap[e.createdBy] || '', createdAt: e.createdAt
        }))
      }
    },
    getEvent(openid, d) {
      const e = DB.load().events.find(x => x._id === d.id)
      if (!e) throw ApiError('大事记不存在')
      requireRole(openid, e.familyId, 'viewer')
      return { event: clone(e) }
    },
    addEvent(openid, d) {
      requireRole(openid, d.familyId, 'editor')
      const title = String(d.title || '').trim().slice(0, 60)
      if (!title) throw ApiError('请填写标题')
      if (!d.date) throw ApiError('请选择日期')
      const e = {
        _id: uid(),
        familyId: d.familyId,
        title,
        date: String(d.date || '').slice(0, 20),
        description: String(d.description || '').slice(0, 2000),
        images: (Array.isArray(d.images) ? d.images : []).filter(Boolean).slice(0, 9),
        createdBy: openid,
        createdAt: Date.now()
      }
      DB.load().events.push(e)
      addLog(d.familyId, openid, 'addEvent', title)
      return { id: e._id }
    },
    updateEvent(openid, d) {
      const e = DB.load().events.find(x => x._id === d.id)
      if (!e) throw ApiError('大事记不存在')
      requireRole(openid, e.familyId, 'editor')
      if (d.title !== undefined) {
        const title = String(d.title || '').trim().slice(0, 60)
        if (!title) throw ApiError('标题不能为空')
        e.title = title
      }
      if (d.date !== undefined) e.date = String(d.date || '').slice(0, 20)
      if (d.description !== undefined) e.description = String(d.description || '').slice(0, 2000)
      if (d.images !== undefined) e.images = (Array.isArray(d.images) ? d.images : []).filter(Boolean).slice(0, 9)
      e.updatedAt = Date.now()
      addLog(e.familyId, openid, 'updateEvent', e.title)
      return {}
    },
    removeEvent(openid, d) {
      const e = DB.load().events.find(x => x._id === d.id)
      if (!e) throw ApiError('大事记不存在')
      const { ref } = requireRole(openid, e.familyId, 'viewer')
      const isAdmin = (ROLE_RANK[ref.role] || 0) >= ROLE_RANK.admin
      if (!isAdmin && e.createdBy !== openid) throw ApiError('只能删除自己发布的内容，或需要管理员权限')
      const db = DB.load()
      db.events = db.events.filter(x => x._id !== e._id)
      addLog(e.familyId, openid, 'removeEvent', e.title)
      return {}
    }
  }

  /* ================ 对外入口 ================ */

  window.FamilyAPI = {
    // 与 wx.cloud.callFunction 相同的调用约定：call(action, data) → Promise<data>
    call(action, data) {
      return new Promise((resolve, reject) => {
        try {
          const openid = DB.load().session.currentOpenid
          const fn = handlers[action]
          if (!fn) throw ApiError('未知操作: ' + action)
          const result = fn(openid, data || {})
          DB.save()
          resolve(clone(result))
        } catch (e) {
          reject(e)
        }
      })
    },
    // —— 演示辅助：模拟多个微信账号（对应真实环境中的多台手机） ——
    demo: {
      current() {
        return DB.load().session.currentOpenid || ''
      },
      accounts() {
        return clone(DB.load().users.map(u => ({
          openid: u.openid, nickname: u.nickname, avatarUrl: u.avatarUrl,
          familyCount: (u.families || []).length
        })))
      },
      createAccount(nickname) {
        const openid = 'demo_' + Math.random().toString(36).slice(2, 10)
        DB.load().session.currentOpenid = openid
        const u = ensureUser(openid)
        u.nickname = nickname || ('微信用户' + Math.floor(1000 + Math.random() * 9000))
        DB.save()
        return clone(u)
      },
      switchTo(openid) {
        DB.load().session.currentOpenid = openid
        DB.save()
      },
      logout() {
        DB.load().session.currentOpenid = ''
        DB.save()
      },
      reset() {
        DB.reset()
      }
    }
  }
})()
