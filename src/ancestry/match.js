(function () {
  var params = new URLSearchParams(location.search)
  var guid = params.get('guid')
  var sampleId = params.get('sampleId')
  var hideNames = params.get('hideNames') === '1'
  var canEdit = params.get('canEdit') === '1'
  var version = params.get('version') || '2025'

  if (!guid || !sampleId) {
    document.getElementById('content').innerHTML = '<div class="error">Missing guid or sampleId</div>'
    return
  }

  var s = {
    matchData: null,
    activeTab: 'regions',
    regionCoords: null,
    journeyCoords: null,
    subjourneyCoords: null,
    regionNameData: null,
    journeyNameData: null,
    expandedRegionKey: null,
    expandedJourneyKey: null,
    modal: null,
    customTags: null,
    statusMsg: '',
    groupName: '',
    editingTagId: null,
    renameName: '',
    regionsVersion: null,
  }

  function setState(o) { Object.assign(s, o); m.redraw() }

  function apiFetch(url, options) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({
        action: 'apiFetch', url: url, options: options, domain: 'ancestry.com'
      }, function (response) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
        if (!response || !response.success) return reject(new Error(response ? response.error : 'No response'))
        resolve(response.data)
      })
    })
  }

  function friendlyError(msg) {
    if (/Status 30[137]/.test(msg)) return 'Make sure you are logged into Ancestry.com, then try again.'
    if (/Status 40[13]/.test(msg)) return 'Access denied. Make sure you are logged into Ancestry.com.'
    if (/Status 403/.test(msg)) return 'Access denied. You may not have permission to view this data.'
    if (/Status 404/.test(msg)) return 'Data not found. The test or match may no longer be available.'
    if (/Status 429/.test(msg)) return 'Too many requests. Please wait a moment and try again.'
    if (/Status 5\d\d/.test(msg)) return 'Ancestry server error. Please try again later.'
    if (/Fetch failed/.test(msg)) return 'Could not reach Ancestry. Check your internet connection.'
    return msg
  }

  function setMatchTag(guid, sampleId, tagId, add) {
    var url = add
      ? 'https://www.ancestry.com/discoveryui-matches/parents/list/api/tags/matches/update/' + guid + '/' + tagId
      : 'https://www.ancestry.com/discoveryui-matches/parents/list/api/tags/' + guid + '/' + tagId
    return apiFetch(url, {
      method: add ? 'POST' : 'DELETE', credentials: 'include', mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ matchingSampleIds: [sampleId] })
    })
  }

  function fetchCustomTags() {
    return apiFetch('https://www.ancestry.com/discoveryui-matches/parents/list/api/tags/custom/' + guid, {
      credentials: 'include', mode: 'cors',
      headers: { 'Accept': 'application/json' }
    }).then(function (data) {
      setState({ customTags: data })
    }).catch(function () { })
  }

  function createGroup() {
    var name = (s.groupName || '').trim()
    if (!name) return
    apiFetch('https://www.ancestry.com/discoveryui-matches/parents/list/api/tags/create/' + guid + '/customTag', {
      method: 'POST', credentials: 'include', mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ categoryId: 32, tagName: name })
    }).then(function () {
      s.groupName = ''
      setState({ statusMsg: '' })
      apiFetch('https://www.ancestry.com/discoveryui-matches/parents/list/api/tags/custom/' + guid, {
        credentials: 'include', mode: 'cors',
        headers: { 'Accept': 'application/json' }
      }).then(function (data) {
        setState({ customTags: data })
        var list = data || []
        var newId = null
        for (var i = 0; i < list.length; i++) {
          if ((list[i].tagName === name || list[i].label === name) && list[i].tagId != null) { newId = list[i].tagId; break }
        }
        if (newId != null) toggleMatchTag(newId)
      }).catch(function () { })
    }).catch(function (err) {
      setState({ statusMsg: 'Could not create group: ' + friendlyError(err.message) })
    })
  }

  function updateGroup(tagId) {
    var name = (s.renameName || '').trim()
    if (!name) return
    var categoryId = 32
    if (s.customTags) {
      for (var i = 0; i < s.customTags.length; i++) {
        if (s.customTags[i].tagId === tagId) { categoryId = s.customTags[i].categoryId || 32; break }
      }
    }
    apiFetch('https://www.ancestry.com/discoveryui-matches/parents/list/api/tags/update/' + guid + '/customTag/' + tagId, {
      method: 'PUT', credentials: 'include', mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ categoryId: categoryId, tagName: name })
    }).then(function () {
      s.renameName = ''
      s.editingTagId = null
      setState({ statusMsg: '' })
      fetchCustomTags()
    }).catch(function (err) {
      setState({ statusMsg: 'Could not rename group: ' + friendlyError(err.message) })
    })
  }

  function deleteGroup(tagId) {
    return apiFetch('https://www.ancestry.com/discoveryui-matches/parents/list/api/tags/delete/' + guid + '/customTag/' + tagId, {
      method: 'DELETE', credentials: 'include', mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    }).then(function () {
      setState({ statusMsg: '' })
      fetchCustomTags()
      if (typeof DB !== 'undefined' && DB.removeTagFromAllMatches) DB.removeTagFromAllMatches(guid, tagId)
      return true
    }).catch(function (err) {
      setState({ statusMsg: 'Could not delete group: ' + friendlyError(err.message) })
      return false
    })
  }

  function openGroupManager() {
    s.groupName = ''
    s.editingTagId = null
    s.renameName = ''
    s.modal = {
      title: 'Add / edit your groups',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
      body: renderGroupManager
    }
    m.redraw()
  }

  function toggleMatchTag(tagId, silent) {
    var md = s.matchData && s.matchData.matchData
    var add = !(md && md.tags && md.tags[tagId] !== undefined)
    setMatchTag(guid, sampleId, tagId, add).then(function () {
      if (!md.tags) md.tags = {}
      if (add) md.tags[tagId] = null
      else delete md.tags[tagId]
      if (typeof DB !== 'undefined' && DB.setMatchTag) DB.setMatchTag(guid, sampleId, tagId, add)
      m.redraw()
      if (!silent) setState({ statusMsg: '' })
    }).catch(function (err) {
      if (!silent) setState({ statusMsg: 'Could not ' + (add ? 'add' : 'remove') + ' match to group: ' + friendlyError(err.message) })
    })
  }

  function renderGroupManager() {
    var tags = s.customTags || []
    var mdTags = s.matchData && s.matchData.matchData && s.matchData.matchData.tags
    var plusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    var listIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
    var pencilIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
    var trashIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
    var checkIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    return [
      m('.group-section', [
        m('.group-section-title', [m.trust(plusIcon), ' Create group']),
        m('.group-manager-form', [
          m('input.group-input', {
            type: 'text',
            placeholder: 'New group name...',
            value: s.groupName,
            oninput: function (e) { s.groupName = e.target.value; m.redraw() }
          }),
          m('button.group-btn.group-btn-icon', { title: 'Add', onclick: function () { createGroup() } }, m.trust(plusIcon))
        ])
      ]),
      m('.group-section', [
        m('.group-section-title', [m.trust(listIcon), ' Groups (' + tags.length + ')']),
        tags.length > 0
          ? m('.group-manager-list', tags.map(function (t) {
              var inMatch = !!(mdTags && mdTags[t.tagId] !== undefined)
              if (s.editingTagId === t.tagId) {
                return m('.group-manager-row', { key: t.tagId }, [
                  m('input.group-input', {
                    type: 'text',
                    value: s.renameName,
                    oninput: function (e) { s.renameName = e.target.value; m.redraw() }
                  }),
                  m('button.group-btn', { title: 'Save', onclick: function () { updateGroup(t.tagId) } }, 'Save'),
                  m('button.group-btn.group-btn-cancel', { onclick: function () { s.editingTagId = null; s.renameName = ''; m.redraw() } }, 'Cancel')
                ])
              }
              return m('.group-manager-row', { key: t.tagId }, [
                m('button.group-row-check' + (inMatch ? '.active' : ''), {
                  title: inMatch ? 'Remove match from group' : 'Add match to group',
                  onclick: function () { toggleMatchTag(t.tagId) }
                }, inMatch ? m.trust(checkIcon) : null),
                m('span.group-manager-label', t.label),
                m('.group-manager-spacer'),
                m('button.group-btn.group-btn-icon', { title: 'Rename', onclick: function () { s.editingTagId = t.tagId; s.renameName = t.label; m.redraw() } }, m.trust(pencilIcon)),
                m('button.group-btn.group-btn-icon.group-btn-danger', { title: 'Delete', onclick: function () {
                  s.modal = {
                    title: 'Delete group?',
                    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
                    text: 'Delete the group "' + t.label + '"?',
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    onConfirm: function () { deleteGroup(t.tagId).then(function (ok) { if (ok) openGroupManager() }) }
                  }
                  m.redraw()
                } }, m.trust(trashIcon))
              ])
            }))
          : m('.group-manager-empty', 'No groups yet. Create one above.')
      ])
    ]
  }

  function titleize(str) {
    if (!str) return ''
    return str.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase() })
  }

  function strengthColor(connection) {
    if (!connection) return '#3b82f6'
    var c = connection.toLowerCase().replace(/[\s_]+/g, '_')
    if (c === 'very_likely') return '#4ade80'
    if (c === 'likely') return '#60a5fa'
    if (c === 'possible') return '#facc15'
    if (c === 'unlikely') return '#f87171'
    return '#3b82f6'
  }

  function loadRegionCoords() {
    fetch(chrome.runtime.getURL('data/ancestry/regions_' + (s.regionsVersion || version) + '.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ regionCoords: d })
    }, function () { })
  }

  function loadJourneyCoords() {
    fetch(chrome.runtime.getURL('data/ancestry/journey_coordinates.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ journeyCoords: d })
    }, function () { })
  }

  function loadSubjourneyCoords() {
    fetch(chrome.runtime.getURL('data/ancestry/subjourney_coordinates.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ subjourneyCoords: d })
    }, function () { })
  }

  function loadRegionNames() {
    fetch(chrome.runtime.getURL('data/ancestry/regions_' + (s.regionsVersion || version) + '.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ regionNameData: d })
    }, function () { })
  }

  function loadJourneyNames() {
    fetch(chrome.runtime.getURL('data/ancestry/ancestry_journey_names.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ journeyNameData: d })
    }, function () { })
  }

  var _inlineRegionMap = null
  var _inlineJourneyMap = null

  function zoomToRegion(key) {
    setState({ expandedRegionKey: s.expandedRegionKey === key ? null : key, expandedJourneyKey: null })
  }

  function zoomToJourney(key) {
    setState({ expandedJourneyKey: s.expandedJourneyKey === key ? null : key, expandedRegionKey: null })
  }

  function toMultiPolygon(coords) {
    if (!coords || !coords.length) return coords
    var third = coords[0] && coords[0][0] && coords[0][0][0]
    return Array.isArray(third) ? coords : [coords]
  }

  var InlineMap = {
    oncreate: function (vnode) {
      var itemKey = vnode.attrs.itemKey
      var type = vnode.attrs.type
      setTimeout(function () {
        var el = vnode.dom
        if (!el) return
        var entry = type === 'region' ? (s.regionCoords || {})[itemKey] : (s.journeyCoords || {})[itemKey] || (s.subjourneyCoords || {})[itemKey]
        if (!entry) return
        var gj = entry.type ? entry : { type: 'MultiPolygon', coordinates: toMultiPolygon(entry.coordinates) }
        if (!gj.coordinates || !gj.coordinates.length) return
        try {
          var map = L.map(el, { zoomControl: true, attributionControl: false })
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map)
          var color = vnode.attrs.color || '#3b82f6'
          if (!vnode.attrs.color && type === 'journey' && s.matchData) {
            ;(function findCol(nodes) {
              for (var fi = 0; fi < nodes.length; fi++) {
                if (nodes[fi].id === itemKey) { color = strengthColor(nodes[fi].connection); return }
                if (nodes[fi].communities) findCol(nodes[fi].communities)
              }
            })((s.matchData.communities || {}).branches || [])
          }
          var layer = L.geoJSON(gj, { style: { color: color, weight: 1.5, fillColor: color, fillOpacity: 0.2 } })
          layer.addTo(map)
          map.fitBounds(layer.getBounds().pad(0.1))
          if (type === 'region') { if (_inlineRegionMap) _inlineRegionMap.remove(); _inlineRegionMap = map }
          else { if (_inlineJourneyMap) _inlineJourneyMap.remove(); _inlineJourneyMap = map }
        } catch (e) { console.log('Inline map error:', e) }
      }, 100)
    },
    view: function () {
      return m('div', { style: { height: '260px', borderRadius: '8px', overflow: 'hidden', marginTop: '8px' } })
    }
  }

  var RegionsPanel = {
    view: function () {
      var d = s.matchData
      var eth = d.ethnicity
      var rbv = eth && eth.regionsByVersion
      var versions = rbv && typeof rbv === 'object' && !Array.isArray(rbv) ? Object.keys(rbv).sort(function (a, b) { return Number(b) - Number(a) }) : []
      var regions = eth && eth.regions
      if (versions.length) {
        var v = s.regionsVersion
        if (v && rbv[String(v)]) regions = rbv[String(v)]
        else regions = rbv[versions[0]]
      }
      if (!regions || !regions.length) return null
      var grouped = {}
      for (var ri = 0; ri < regions.length; ri++) {
        var reg = regions[ri]
        var key = reg.macroRegionKey || 'other'
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(reg)
      }
      var macroKeys = Object.keys(grouped)
      var macroTotals = {}
      for (var mi = 0; mi < macroKeys.length; mi++) {
        var regions = grouped[macroKeys[mi]]
        var total = 0
        for (var ti = 0; ti < regions.length; ti++) total += regions[ti].percentage || 0
        macroTotals[macroKeys[mi]] = total
      }
      macroKeys.sort(function (a, b) { return (macroTotals[b] || 0) - (macroTotals[a] || 0) })
      var groups = macroKeys.map(function (mk) {
        var regions = grouped[mk]
        return m('.ethnicity-group', [
          m('.section-title', [titleize(mk), ' ', m('span.total-pct', macroTotals[mk] + '%')]),
          m('.region-list', regions.map(function (reg) {
            var isExpanded = s.expandedRegionKey === reg.key
            var ni = s.regionNameData && s.regionNameData[reg.key]
            return m('.region-item' + (isExpanded ? '.expanded' : ''), { 'data-key': reg.key }, [
              m('.region-header', {
                style: { borderLeft: '3px solid ' + reg.color },
                onclick: function () { zoomToRegion(reg.key) }
              }, [
                m('span.detail-label', reg.displayName || reg.key || ''),
                m('span.detail-value', [
                  reg.percentage + '%',
                  reg.lowerConfidence != null && reg.upperConfidence != null ? m('span.range', ' (' + reg.lowerConfidence + '\u2013' + reg.upperConfidence + '%)') : null
                ])
              ]),
              isExpanded ? m('.region-expanded', [
                ni && ni.primaryLocated ? m('.region-exp-row', [
                  m('span.region-exp-label', 'Primarily located in:'),
                  m('span.region-exp-value', ni.primaryLocated)
                ]) : null,
                ni && ni.alsoLocated ? m('.region-exp-row', [
                  m('span.region-exp-label', 'Also found in:'),
                  m('span.region-exp-value', ni.alsoLocated)
                ]) : null,
                ni && ni.overview ? m('.region-exp-overview', (function () {
                  var txt = ni.overview.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                  return txt
                })()) : null,
                m(InlineMap, { itemKey: reg.key, type: 'region', color: reg.color || '#3b82f6' })
              ]) : null
            ])
          }))
        ])
      })
      return m('.regions-map-row', [
        m('.card', [
          versions.length > 0 ? m('.version-tabs', [
            m('span.version-tabs-label', 'Version'),
            versions.map(function (v) {
              return m('button.version-tab' + (s.regionsVersion === v ? '.active' : ''), {
                key: v,
                onclick: function () {
                  s.regionsVersion = v
                  setState({ expandedRegionKey: null })
                  loadRegionCoords()
                  loadRegionNames()
                  m.redraw()
                }
              }, v)
            })
          ]) : null,
          groups
        ])
      ])
    }
  }

  var JourneysPanel = {
    view: function () {
      var com = s.matchData && s.matchData.communities
      if (!com || !com.branches || !com.branches.length) return null
      return m('.regions-map-row', [
        m('.card', [m('.journey-tree', renderJourneyTree(com.branches, 0))])
      ])
    }
  }

  function renderJourneyTree(nodes, depth, fallbackOverview) {
    var sorted = nodes.slice().sort(function (a, b) { return (b.connectionPercent || 0) - (a.connectionPercent || 0) })
    return sorted.map(function (n) {
      var isExpanded = s.expandedJourneyKey === n.id
      var hasChildren = n.communities && n.communities.length > 0
      var sc = n.connection ? 'strength-' + n.connection.toLowerCase() : ''
      var strength = n.connection ? m('span.journey-strength.' + sc, [titleize(n.connection), ' ', (n.connectionPercent || '') + '%']) : null
      var raw = s.journeyNameData && s.journeyNameData[n.id]
      var ownOverview = raw && raw.overview ? raw.overview.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : null
      var overview = ownOverview || fallbackOverview
      var expContent = isExpanded ? m('.journey-expanded', [
        overview ? m('.journey-exp-overview', overview) : null,
        m(InlineMap, { itemKey: n.id, type: 'journey' })
      ]) : null
      if (depth === 0) {
        return m('.journey-node', { key: n.id }, [
          m('.journey-header', { 'data-key': n.id, onclick: function () { zoomToJourney(n.id) } }, [
            m('span.journey-toggle' + (hasChildren ? '' : '.journey-toggle-empty'), hasChildren ? '\u25BC' : ''),
            m('span.journey-name', n.displayName || n.id || ''),
            strength
          ]),
          expContent,
          hasChildren ? m('.journey-children', renderJourneyTree(n.communities, depth + 1, overview)) : null
        ])
      }
      if (hasChildren) {
        return m('.journey-sub-node', { key: n.id }, [
          m('.journey-header', { 'data-key': n.id, style: { paddingLeft: depth * 20 + 'px' }, onclick: function () { zoomToJourney(n.id) } }, [
            m('span.journey-toggle', '\u25BC'),
            m('span.journey-name', n.displayName || n.id || ''),
            strength
          ]),
          expContent,
          m('.journey-children', renderJourneyTree(n.communities, depth + 1, overview))
        ])
      }
      return m('.journey-sub-node', { key: n.id }, [
        m('.journey-item', { 'data-key': n.id, style: { paddingLeft: (depth * 20 + 20) + 'px' }, onclick: function () { zoomToJourney(n.id) } }, [
          m('span.journey-name', n.displayName || n.id || ''),
          strength
        ]),
        expContent
      ])
    })
  }

  var ProfileCard = {
    view: function () {
      var d = s.matchData
      var p = d.profile || {}
      var md = d.matchData || {}
      var rel = md.relationship || {}
      document.title = hideNames ? (p.matchNameInitials || '??') : (p.matchName || 'Unknown')
      var gc = 'gender-n'
      if (p.displayGender === 'M') gc = 'gender-m'
      else if (p.displayGender === 'F') gc = 'gender-f'
      var profileUrl = 'https://www.ancestry.com/dna/matches/' + guid + '/compare/' + sampleId + '?returnUrl=' + encodeURIComponent('https://www.ancestry.com/dna/matches/' + guid + '/list')
      var relParts = []
      if (rel.sharedCentimorgans) relParts.push(m('span', [m('span.num', rel.sharedCentimorgans), ' cM']))
      if (rel.sharedCentimorgans && rel.numSharedSegments) relParts.push(' across ')
      if (rel.numSharedSegments) relParts.push(m('span', [m('span.num', rel.numSharedSegments), ' segments']))
      var tags = md.tags
      var favorite = !!(tags && tags['2'] !== undefined)
      var tagLabels = []
      if (tags && s.customTags) {
        var seen = {}
        for (var tk in tags) {
          for (var ci = 0; ci < s.customTags.length; ci++) {
            if (String(s.customTags[ci].tagId) === tk) {
              var lbl = s.customTags[ci].label
              if (lbl && !seen[lbl]) { seen[lbl] = true; tagLabels.push(lbl) }
              break
            }
          }
        }
      }
      return m('.card.profile-card', [
        m('.match-name', [
          p.photoUrl ? m('a', { href: p.photoUrl, target: '_blank', title: 'Open photo' }, m('img.avatar', { src: p.photoUrl })) : m('.avatar.avatar-initials.' + gc, p.matchNameInitials || '?'),
          m('span', hideNames ? (p.matchNameInitials || '??') : (p.matchName || 'Unknown')),
          tagLabels.length > 0 ? tagLabels.map(function (l) { return m('span.tag-pill', l) }) : null,
          canEdit ? m('button.star-btn' + (favorite ? '.active' : ''), {
            title: favorite ? 'Remove from starred matches' : 'Add to starred matches',
            onclick: function (e) {
              e.stopPropagation()
              e.preventDefault()
              var willFav = !(tags && tags['2'] !== undefined)
              setMatchTag(guid, sampleId, '2', willFav).then(function () {
                if (!md.tags) md.tags = {}
                if (willFav) md.tags['2'] = null
                else delete md.tags['2']
                if (typeof DB !== 'undefined' && DB.toggleFavorite) DB.toggleFavorite(guid, sampleId, willFav)
                m.redraw()
              }).catch(function (err) {
                setState({ statusMsg: /Status 403/.test(err.message) ? 'You don\u2019t have permission to ' + (willFav ? 'add' : 'remove') + ' favorites for this match.' : 'Could not ' + (willFav ? 'add to' : 'remove from') + ' favorites: ' + friendlyError(err.message) })
              })
            }
          }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>')) : null,
          canEdit ? m('button.group-mgmt-btn', {
            title: s.customTags === null ? 'Loading groups...' : 'Manage groups',
            disabled: s.customTags === null,
            onclick: function (e) {
              e.stopPropagation()
              openGroupManager()
            }
          }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>')) : null,
          m('a.profile-link', { href: profileUrl, target: '_blank', title: 'Open on Ancestry' }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'))
        ]),
        relParts.length ? m('.card-details', { style: { marginTop: '12px' } }, [m('.rel-text', relParts)]) : null,
        s.statusMsg ? m('.status-msg', s.statusMsg) : null
      ])
    }
  }

  var Tabs = {
    view: function () {
      return m('.tabs', ['regions', 'journeys'].map(function (tab) {
        return m('button.tab' + (s.activeTab === tab ? '.active' : ''), {
          'data-tab': tab,
          onclick: function () {
            setState({ activeTab: tab })
          }
        }, tab === 'regions' ? 'Regions' : 'Journeys')
      }))
    }
  }

  var Modal = {
    view: function () {
      if (!s.modal) return null
      return m('.modal-overlay', { onclick: function (e) { if (e.target === e.currentTarget) { s.modal = null; m.redraw() } } }, [
        m('.modal', [
          m('button.modal-close', { title: 'Close', onclick: function () { s.modal = null; m.redraw() } }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>')),
          s.modal.icon ? m('.modal-icon', m.trust(s.modal.icon)) : null,
          s.modal.title ? m('.modal-title', s.modal.title) : null,
          s.modal.text ? m('.modal-text', s.modal.text) : null,
          s.modal.body ? m('.modal-body', (typeof s.modal.body === 'function' ? s.modal.body() : s.modal.body)) : null,
          (s.modal.cancelText || s.modal.confirmText) ? m('.modal-actions', [
            s.modal.cancelText ? m('button.modal-btn.modal-cancel', { onclick: function () { s.modal = null; m.redraw() } }, s.modal.cancelText) : null,
            s.modal.confirmText ? m('button.modal-btn.modal-confirm', { onclick: function () { var cb = s.modal.onConfirm; s.modal = null; m.redraw(); if (cb) cb() } }, s.modal.confirmText) : null,
          ]) : null
        ])
      ])
    }
  }

  var MatchDetail = {
    oninit: function () {
      DB.getMatchData(guid, sampleId).then(function (data) {
        if (!data) {
          document.getElementById('content').innerHTML = '<div class="error">No data found for this match</div>'
          return
        }
        setState({ matchData: data })
        var rbv = data.ethnicity && data.ethnicity.regionsByVersion
        var rvKeys = rbv && typeof rbv === 'object' && !Array.isArray(rbv) ? Object.keys(rbv) : []
        if (rvKeys.length) {
          rvKeys.sort(function (a, b) { return Number(b) - Number(a) })
          setState({ regionsVersion: rvKeys[0] })
        }
        fetchCustomTags()
        loadRegionCoords()
        loadJourneyCoords()
        loadSubjourneyCoords()
        loadRegionNames()
        loadJourneyNames()
      })
    },
    view: function () {
      if (!s.matchData) return m('.spinner', [m('.spinner-ring'), m('div', 'Loading...')])
      return [
        m(Modal),
        m(ProfileCard),
        m(Tabs),
        m('.tab-content#tab-regions', { style: { display: s.activeTab === 'regions' ? '' : 'none' } },
          s.matchData && s.matchData.ethnicity && s.matchData.ethnicity.regions && s.matchData.ethnicity.regions.length ? m(RegionsPanel) : null),
        m('.tab-content#tab-journeys', { style: { display: s.activeTab === 'journeys' ? '' : 'none' } },
          s.matchData && s.matchData.communities && s.matchData.communities.branches && s.matchData.communities.branches.length ? m(JourneysPanel) : null)
      ]
    }
  }

  document.querySelector('.topbar-home').addEventListener('click', function(e) {
    e.preventDefault()
    chrome.tabs.query({ url: chrome.runtime.getURL('src/ancestry/app.html') }, function(t) {
      if (t && t.length) chrome.tabs.update(t[0].id, { active: true })
    })
  })

  document.getElementById('importFileInput').addEventListener('change', function(e) {
    var file = e.target.files[0]
    if (!file || !file.name.endsWith('.json')) { e.target.value = ''; return }
    if (typeof DB === 'undefined') return
    DB.countExport(file).then(function(total) {
      setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>', title: 'Import database?', text: 'Restore ' + total + ' profile(s) from this file? Existing data will be overwritten.', confirmText: 'Import', cancelText: 'Cancel', onConfirm: function() {
        setState({ modal: { icon: '<div class="spinner-ring" style="margin:0 auto;width:28px;height:28px;border-width:3px"></div>', title: 'Importing your data', text: 'Restoring your database...' } })
        DB.importDatabase(file).then(function(count) {
          setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>', title: 'Import complete', text: 'Restored ' + count + ' profile(s) from your file.', cancelText: 'OK' } })
        }).catch(function(err) {
          setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>', title: 'Import failed', text: 'Could not import your database. ' + (err && err.message || String(err)), cancelText: 'OK' } })
        })
      } } })
    }).catch(function(err) {
      setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>', title: 'Import failed', text: 'Could not read your database file. ' + (err && err.message || String(err)), cancelText: 'OK' } })
    })
    e.target.value = ''
  })

  ;['hideNamesToggle','importBtn','exportBtn'].forEach(function(id) {
    var el = document.getElementById(id)
    if (!el) return
    if (id === 'hideNamesToggle') {
      el.checked = hideNames
      el.addEventListener('change', function() { hideNames = this.checked; m.redraw() })
    } else if (id === 'importBtn') {
      el.addEventListener('click', function() { document.getElementById('importFileInput').click() })
    } else if (id === 'exportBtn') {
      el.addEventListener('click', function() {
        if (typeof DB === 'undefined' || !DB.exportDatabase) return
        setState({ modal: { icon: '<div class="spinner-ring" style="margin:0 auto;width:28px;height:28px;border-width:3px"></div>', title: 'Exporting your data', text: 'Preparing your database...' } })
        DB.exportDatabase().then(function(count) {
          setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>', title: 'Export complete', text: 'Saved ' + count + ' profile(s) to your selected file.', cancelText: 'OK' } })
        }).catch(function(err) {
          if (err && err.name === 'AbortError') { setState({ modal: null }); return }
          setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>', title: 'Export failed', text: 'Could not export your database. ' + (err && err.message || String(err)), cancelText: 'OK' } })
        })
      })
    }
  })

  m.mount(document.getElementById('content'), MatchDetail)
})()