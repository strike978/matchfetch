(function () {
  var params = new URLSearchParams(location.search)
  var guid = params.get('guid')
  var sampleId = params.get('sampleId')
  var hideNames = params.get('hideNames') === '1'

  if (!guid || !sampleId) {
    document.getElementById('content').innerHTML = '<div class="error">Missing guid or sampleId</div>'
    return
  }

  var s = {
    matchData: null,
    expandedKeys: {},
    expandedTrace: false,
    hideNames: hideNames,
    modal: null,
    popTree: null,
    rootOf: null,
    popCoords: {},
    coordsLoading: {},
    countryNames: null,
  }

  function loadCountries() {
    fetch(chrome.runtime.getURL('data/23andme/countries.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ countryNames: d || {} })
    }, function () { })
  }

  function loadPopTree() {
    fetch(chrome.runtime.getURL('data/23andme/population_tree.json')).then(function (r) { return r.json() }).then(function (d) {
      var m = {}
      var rootOf = {}
      ;(function walk(nodes, rootId) {
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i]
          var r = rootId || n.id
          m[n.id] = n
          rootOf[n.id] = r
          if (n.children && n.children.length) walk(n.children, r)
        }
      })(d, null)
      setState({ popTree: m, rootOf: rootOf })
    }, function () { })
  }

  function ensureCoords(id) {
    var rootId = s.rootOf && s.rootOf[id]
    if (!rootId || s.coordsLoading[rootId] || s.popCoords[rootId]) return
    s.coordsLoading[rootId] = true
    fetch(chrome.runtime.getURL('data/23andme/population_tree_coordinates/' + rootId + '.json')).then(function (r) { return r.json() }).then(function (d) {
      var out = Object.assign({}, s.popCoords)
      if (d && d.features) {
        for (var i = 0; i < d.features.length; i++) {
          var feat = d.features[i]
          if (feat && feat.properties && feat.properties.id) out[feat.properties.id] = feat
        }
      }
      delete s.coordsLoading[rootId]
      setState({ popCoords: out })
    }, function () {
      delete s.coordsLoading[rootId]
      m.redraw()
    })
  }

  function setState(o) { Object.assign(s, o); m.redraw() }

  function titleize(str) {
    if (!str) return ''
    return String(str).replace(/_/g, ' ').replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase() })
  }

  function displayName(m) {
    if (s.hideNames) return m.initials || '??'
    var n = (m.first_name || '') + (m.last_name ? ' ' + m.last_name : '')
    return n.trim() || m.initials || 'Unknown'
  }

  function sexClass(m) {
    if (m.sex === 'male' || m.sex === 'male.' || m.sex === 'M') return 'gender-m'
    if (m.sex === 'female' || m.sex === 'female.' || m.sex === 'F') return 'gender-f'
    return 'gender-n'
  }

  function renderRegionTree(regions, depth) {
    var out = []
    var labels = Object.keys(regions)
    for (var li = 0; li < labels.length; li++) {
      var arr = regions[labels[li]]
      for (var ai = 0; ai < arr.length; ai++) {
        (function (node) {
          var childLabels = node.regions ? Object.keys(node.regions) : []
          var isExpanded = !!s.expandedKeys[node.id]
          out.push(m('.region-item' + (isExpanded ? '.expanded' : ''), { key: node.id }, [
            m('.region-header', {
              style: { paddingLeft: (depth * 20 + 12) + 'px', borderLeft: '3px solid ' + (node.color || '#3b82f6') },
              onclick: function () {
                var keys = Object.assign({}, s.expandedKeys)
                if (keys[node.id]) delete keys[node.id]
                else keys[node.id] = true
                setState({ expandedKeys: keys })
              }
            }, [
              m('span.region-toggle', isExpanded ? '\u25BC' : '\u25B6'),
              m('span.region-name', node.label),
              m('span.region-pct', node.totalPercent + '%')
            ]),
            isExpanded ? m('.region-expanded', childLabels.length ? m('.region-children', renderRegionTree(node.regions, depth + 1)) : renderRegionInfo(node, node.color)) : null
          ]))
        })(arr[ai])
      }
    }
    return out
  }

  var InlineMap = {
    oncreate: function (vnode) {
      var itemKey = vnode.attrs.itemKey
      var tries = 0
      ;(function init() {
        var el = vnode.dom
        if (!el) return
        var entry = (s.popCoords || {})[itemKey]
        if (!entry || !entry.geometry || !entry.geometry.coordinates) {
          ensureCoords(itemKey)
          if (tries++ < 60) setTimeout(init, 100)
          return
        }
        try {
          var map = L.map(el, { zoomControl: true, attributionControl: false })
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
          var color = vnode.attrs.color || '#3b82f6'
          var layer = L.geoJSON(entry, { style: { color: color, weight: 1.5, fillColor: color, fillOpacity: 0.25 } })
          layer.addTo(map)
          map.fitBounds(layer.getBounds().pad(0.1))
          vnode.state.map = map
        } catch (e) { console.log('Inline map error:', e) }
      })()
    },
    onremove: function (vnode) {
      if (vnode.state.map) { try { vnode.state.map.remove() } catch (e) { } }
    },
    view: function () {
      return m('div', { style: { height: '260px', borderRadius: '8px', overflow: 'hidden', marginTop: '8px' } })
    }
  }

  function renderRegionInfo(node, color) {
    var pop = s.popTree && s.popTree[node.id]
    var hasRef = !!(pop && pop.reference_ethnicities)
    return m('.region-expanded', [
      hasRef ? m('.region-exp-row', [
        m('span.region-exp-label', 'Reference ethnicities'),
        m('span.region-exp-value', pop.reference_ethnicities)
      ]) : null,
      pop && pop.description ? m('.region-exp-overview' + (hasRef ? '.has-ref' : ''), pop.description) : null,
      m(InlineMap, { itemKey: node.id, color: color || (pop && pop.color) || '#3b82f6' })
    ])
  }

  function renderGrandparentBoxes(locations) {
    if (!locations) return null
    var keys = [
      { k: 'maternal_gma', label: 'Maternal Grandmother' },
      { k: 'maternal_gpa', label: 'Maternal Grandfather' },
      { k: 'paternal_gma', label: 'Paternal Grandmother' },
      { k: 'paternal_gpa', label: 'Paternal Grandfather' }
    ]
    var boxes = []
    for (var i = 0; i < keys.length; i++) {
      var gp = locations[keys[i].k]
      var parts = []
      if (gp) {
        if (gp.city) parts.push(gp.city)
        if (gp.state) parts.push(gp.state)
        if (gp.country) {
          var code = String(gp.country).toUpperCase()
          var name = s.countryNames && s.countryNames[code] ? s.countryNames[code] : gp.country
          parts.push(name)
        }
      }
      var deduped = []
      for (var p = 0; p < parts.length; p++) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== parts[p]) deduped.push(parts[p])
      }
      var place = deduped.join(', ')
      if (!place) continue
      boxes.push(m('.gp-box', [
        m('.gp-title', keys[i].label),
        m('.gp-place', place)
      ]))
    }
    if (boxes.length === 0) return null
    return m('.gp-grid', boxes)
  }

  var ProfileCard = {
    view: function () {
      var m2 = s.matchData
      var cm = m2.ibd_proportion != null ? Math.round(m2.ibd_proportion * 6800) : null
      document.title = displayName(m2)
      var profileUrl = 'https://you.23andme.com/p/' + guid + '/profile/' + sampleId + '/'
      var relParts = []
      if (cm) relParts.push(m('span', [m('span.num', cm), ' cM']))
      if (cm && m2.num_segments != null) relParts.push(' across ')
      if (m2.num_segments != null) relParts.push(m('span', [m('span.num', m2.num_segments), ' segments']))
      var gpBoxes = renderGrandparentBoxes(m2.grandparent_birth_locations)
      return m('.card.profile-card', [
        m('.match-name', [
          m2.profile_image_url ? m('a', { href: m2.profile_image_url, target: '_blank', title: 'Open photo' }, m('img.avatar', { src: m2.profile_image_url })) : m('.avatar.avatar-initials.' + sexClass(m2), m2.initials || '?'),
          m('span', displayName(m2)),
          m('a.profile-link', { href: profileUrl, target: '_blank', title: 'Open on 23andMe' }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'))
        ]),
        m('.card-details', { style: { marginTop: '12px' } }, [
          relParts.length ? m('.rel-text', relParts) : null,
          m2.is_open_sharing === false ? m('span.detail', [m('span.detail-label', 'Sharing'), m('span.detail-value', 'Not sharing')]) : null
        ]),
        gpBoxes ? [
          m('.label', { style: { marginTop: '16px' } }, 'Grandparent Birth Locations'),
          gpBoxes
        ] : null
      ])
    }
  }

  var HaplogroupsPanel = {
    view: function () {
      var hg = s.matchData.ancestry && s.matchData.ancestry.haplogroups
      if (!hg || (!hg.ydna && !hg.mtdna)) return null
      return m('.card', [
        m('.hg-card', [
          hg.ydna ? m('.hg-box', [m('.hg-label', 'Y-DNA'), m('.hg-value', hg.ydna)]) : null,
          hg.mtdna ? m('.hg-box.mt', [m('.hg-label', 'mtDNA'), m('.hg-value', hg.mtdna)]) : null
        ])
      ])
    }
  }

  function renderTraceSection(trace) {
    var isExpanded = s.expandedTrace
    var total = 0
    for (var i = 0; i < trace.length; i++) total += parseFloat(trace[i].totalPercent)
    return m('.region-item.trace-group' + (isExpanded ? '.expanded' : ''), [
      m('.region-header', {
        style: { borderLeft: '3px solid #475569' },
        onclick: function () { setState({ expandedTrace: !isExpanded }) }
      }, [
        m('span.region-toggle', isExpanded ? '\u25BC' : '\u25B6'),
        m('span.region-name', 'Trace Ancestry'),
        m('span.region-pct', String(Math.round(total * 10) / 10) + '%')
      ]),
      isExpanded ? m('.region-expanded', trace.map(function (t) {
        var tExpanded = !!s.expandedKeys[t.id]
        return m('.region-item' + (tExpanded ? '.expanded' : ''), { key: t.id }, [
          m('.region-header', {
            style: { paddingLeft: '32px', borderLeft: '3px solid ' + (t.color || '#3b82f6') },
            onclick: function () {
              var keys = Object.assign({}, s.expandedKeys)
              if (keys[t.id]) delete keys[t.id]
              else keys[t.id] = true
              setState({ expandedKeys: keys })
            }
          }, [
            m('span.region-toggle', tExpanded ? '\u25BC' : '\u25B6'),
            m('span.region-name', t.label),
            m('span.region-pct', t.totalPercent + '%')
          ]),
          tExpanded ? renderRegionInfo(t, t.color) : null
        ])
      })) : null
    ])
  }

  var RegionsPanel = {
    view: function () {
      var ancestry = s.matchData.ancestry || {}
      var regions = ancestry.regions
      var trace = ancestry.trace
      if ((!regions || Object.keys(regions).length === 0) && (!trace || trace.length === 0)) return null
      return m('.card', [
        regions && Object.keys(regions).length > 0 ? renderRegionTree(regions, 0) : null,
        trace && trace.length > 0 ? renderTraceSection(trace) : null
      ])
    }
  }

  var Modal = {
    view: function () {
      if (!s.modal) return null
      return m('.modal-overlay', { onclick: function (e) { if (e.target === e.currentTarget) { s.modal = null; m.redraw() } } }, [
        m('.modal', [
          s.modal.icon ? m('.modal-icon', m.trust(s.modal.icon)) : null,
          s.modal.title ? m('.modal-title', s.modal.title) : null,
          s.modal.text ? m('.modal-text', s.modal.text) : null,
          m('.modal-actions', [
            s.modal.cancelText ? m('button.modal-btn.modal-cancel', { onclick: function () { s.modal = null; m.redraw() } }, s.modal.cancelText) : null,
            s.modal.confirmText ? m('button.modal-btn.modal-confirm', { onclick: function () { var cb = s.modal.onConfirm; s.modal = null; m.redraw(); if (cb) cb() } }, s.modal.confirmText) : null,
          ])
        ])
      ])
    }
  }

  var MatchDetail = {
    oninit: function () {
      DB.getSession(guid, '23andme').then(function (session) {
        var m2 = session && session.matches && session.matches[sampleId]
        if (!m2) {
          document.getElementById('content').innerHTML = '<div class="error">No data found for this match. Fetch match details from the 23andMe page first.</div>'
          return
        }
        setState({ matchData: m2 })
        loadPopTree()
        loadCountries()
      })
    },
    view: function () {
      if (!s.matchData) return m('.spinner', [m('.spinner-ring'), m('div', 'Loading...')])
      return [
        m(Modal),
        m(ProfileCard),
        m(HaplogroupsPanel),
        m(RegionsPanel)
      ]
    }
  }

  document.querySelector('.topbar-home').addEventListener('click', function (e) {
    e.preventDefault()
    chrome.tabs.query({ url: chrome.runtime.getURL('src/23andme/app.html') }, function (t) {
      if (t && t.length) chrome.tabs.update(t[0].id, { active: true })
    })
  })

  document.getElementById('importFileInput').addEventListener('change', function (e) {
    var file = e.target.files[0]
    if (!file || !file.name.endsWith('.json')) { e.target.value = ''; return }
    var reader = new FileReader()
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result)
        if (!data || typeof data !== 'object') throw new Error('Invalid format')
        var total = Array.isArray(data) ? data.length : (data.ancestry || []).length + (data.twentyThreeAndMe || []).length
        setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>', title: 'Import database?', text: 'Restore ' + total + ' profile(s) from this file? Existing data will be overwritten.', confirmText: 'Import', cancelText: 'Cancel', onConfirm: function () {
          if (typeof DB === 'undefined') return
          setState({ modal: { icon: '<div class="spinner-ring" style="margin:0 auto;width:28px;height:28px;border-width:3px"></div>', title: 'Importing your data', text: 'Restoring your database...' } })
          DB.importDatabase(data).then(function (count) {
            setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>', title: 'Import complete', text: 'Restored ' + count + ' record(s) from your file.', cancelText: 'OK' } })
          }).catch(function (err) {
            setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>', title: 'Import failed', text: 'Could not import your database. ' + (err && err.message || String(err)), cancelText: 'OK' } })
          })
        } } })
      } catch (err) {
        setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>', title: 'Import failed', text: err.message, cancelText: 'OK' } })
      }
    }
    reader.readAsText(file)
  })

  ;['hideNamesToggle', 'importBtn', 'exportBtn'].forEach(function (id) {
    var el = document.getElementById(id)
    if (!el) return
    if (id === 'hideNamesToggle') {
      el.checked = hideNames
      el.addEventListener('change', function () { setState({ hideNames: this.checked }) })
    } else if (id === 'importBtn') {
      el.addEventListener('click', function () { document.getElementById('importFileInput').click() })
    } else if (id === 'exportBtn') {
      el.addEventListener('click', function () {
        if (typeof DB === 'undefined' || !DB.exportDatabase) return
        setState({ modal: { icon: '<div class="spinner-ring" style="margin:0 auto;width:28px;height:28px;border-width:3px"></div>', title: 'Exporting your data', text: 'Preparing your database...' } })
        DB.exportDatabase().then(function (count) {
          setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>', title: 'Export complete', text: 'Saved ' + count + ' record(s) to your selected file.', cancelText: 'OK' } })
        }).catch(function (err) {
          if (err && err.name === 'AbortError') { setState({ modal: null }); return }
          setState({ modal: { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>', title: 'Export failed', text: 'Could not export your database. ' + (err && err.message || String(err)), cancelText: 'OK' } })
        })
      })
    }
  })

  m.mount(document.getElementById('content'), MatchDetail)
})()
