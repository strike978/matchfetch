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
    activeTab: 'regions',
    regionCoords: null,
    journeyCoords: null,
    subjourneyCoords: null,
    regionNameData: null,
    journeyNameData: null,
    expandedRegionKey: null,
    expandedJourneyKey: null,
    modal: null,
  }

  function setState(o) { Object.assign(s, o); m.redraw() }

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
    fetch(chrome.runtime.getURL('data/ancestry/region_coordinates.json')).then(function (r) { return r.json() }).then(function (d) {
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
    fetch(chrome.runtime.getURL('data/ancestry/ancestry_region_names.json')).then(function (r) { return r.json() }).then(function (d) {
      var m = {};
      for (var i = 0; i < d.items.length; i++) m[d.items[i].region] = d.items[i];
      setState({ regionNameData: m })
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

  var InlineMap = {
    oncreate: function (vnode) {
      var itemKey = vnode.attrs.itemKey
      var type = vnode.attrs.type
      setTimeout(function () {
        var el = vnode.dom
        if (!el) return
        var entry = type === 'region' ? (s.regionCoords || {})[itemKey] : (s.journeyCoords || {})[itemKey] || (s.subjourneyCoords || {})[itemKey]
        if (!entry) return
        var gj = entry.type ? entry : { type: 'MultiPolygon', coordinates: entry.coordinates }
        if (!gj.coordinates || !gj.coordinates.length) return
        try {
          var map = L.map(el, { zoomControl: true, attributionControl: false })
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
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
      if (!eth || !eth.regions || !eth.regions.length) return null
      var grouped = {}
      for (var ri = 0; ri < eth.regions.length; ri++) {
        var reg = eth.regions[ri]
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
        m('.card', groups)
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
      return m('.card.profile-card', [
        m('.match-name', [
          p.photoUrl ? m('a', { href: p.photoUrl, target: '_blank', title: 'Open photo' }, m('img.avatar', { src: p.photoUrl })) : m('.avatar.avatar-initials.' + gc, p.matchNameInitials || '?'),
          m('span', hideNames ? (p.matchNameInitials || '??') : (p.matchName || 'Unknown')),
          m('a.profile-link', { href: profileUrl, target: '_blank', title: 'Open on Ancestry' }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'))
        ]),
        relParts.length ? m('.card-details', { style: { marginTop: '12px' } }, [m('.rel-text', relParts)]) : null
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
      DB.getMatchData(guid, sampleId).then(function (data) {
        if (!data) {
          document.getElementById('content').innerHTML = '<div class="error">No data found for this match</div>'
          return
        }
        setState({ matchData: data })
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
    var reader = new FileReader()
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result)
        if (!Array.isArray(data)) throw new Error('Invalid format')
        setState({ modal: { title: 'Import database?', text: 'This will overwrite your entire database with ' + data.length + ' profile(s) from this file. This cannot be undone.', confirmText: 'Import', cancelText: 'Cancel', onConfirm: function() { if (typeof DB !== 'undefined') DB.importDatabase(data).then(function() { m.redraw() }) } } })
      } catch(err) { alert('Import failed: ' + err.message) }
    }
    reader.readAsText(file)
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
      el.addEventListener('click', function() { if (typeof DB !== 'undefined' && DB.exportDatabase) DB.exportDatabase() })
    }
  })

  m.mount(document.getElementById('content'), MatchDetail)
})()