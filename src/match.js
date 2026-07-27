(function () {
  var params = new URLSearchParams(location.search)
  var guid = params.get('guid')
  var sampleId = params.get('sampleId')

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
    selectedRegionInfo: null,
    selectedJourneyInfo: null,
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
    fetch(chrome.runtime.getURL('data/region_coordinates.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ regionCoords: d })
    }, function () { })
  }

  function loadJourneyCoords() {
    fetch(chrome.runtime.getURL('data/journey_coordinates.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ journeyCoords: d })
      if (s.activeTab === 'journeys') setTimeout(initJourneyMap, 100)
    }, function () { })
  }

  function loadSubjourneyCoords() {
    fetch(chrome.runtime.getURL('data/subjourney_coordinates.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ subjourneyCoords: d })
    }, function () { })
  }

  function loadRegionNames() {
    fetch(chrome.runtime.getURL('data/ancestry_region_names.json')).then(function (r) { return r.json() }).then(function (d) {
      var m = {};
      for (var i = 0; i < d.items.length; i++) m[d.items[i].region] = d.items[i];
      setState({ regionNameData: m })
    }, function () { })
  }

  function loadJourneyNames() {
    fetch(chrome.runtime.getURL('data/ancestry_journey_names.json')).then(function (r) { return r.json() }).then(function (d) {
      setState({ journeyNameData: d })
    }, function () { })
  }

  var _regionMap = null
  var _regionLayers = {}
  var _regionData = {}

  function zoomToRegion(key) {
    if (!_regionMap || !_regionLayers[key]) return
    _regionMap.fitBounds(_regionLayers[key].getBounds().pad(0.1))
    _regionMap.getContainer().blur()
    var rd = _regionData[key]
    if (!rd) return
    var pct = rd.percentage != null ? rd.percentage + '%' : ''
    var range = ''
    if (rd.lowerConfidence != null && rd.upperConfidence != null) range = rd.lowerConfidence + '\u2013' + rd.upperConfidence + '%'
    var popupHtml = '<div style="font-size:13px;font-weight:600;color:#e2e8f0">' + (rd.displayName || key) + '</div>'
    if (pct) popupHtml += '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + pct + (range ? ' (' + range + ')' : '') + '</div>'
    _regionLayers[key].bindPopup(popupHtml, { closeButton: true, offset: L.point(0, -4) }).openPopup()
    var ni = rd._nameInfo
    if (!ni && s.regionNameData) {
      var raw = s.regionNameData[key]
      if (raw) {
        ni = {}
        if (raw.primaryLocated) ni.primaryLocated = raw.primaryLocated
        if (raw.alsoLocated) ni.alsoLocated = raw.alsoLocated
        if (raw.overview) ni.overview = raw.overview.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        rd._nameInfo = ni
      }
    }
    var sinfo = { key: key, displayName: rd.displayName, percentage: rd.percentage, lowerConfidence: rd.lowerConfidence, upperConfidence: rd.upperConfidence }
    if (ni) {
      sinfo.primaryLocated = ni.primaryLocated
      sinfo.alsoLocated = ni.alsoLocated
      sinfo.overview = ni.overview
    }
    setState({ selectedRegionInfo: sinfo, selectedJourneyInfo: null })
  }

  function addRegionsToMap() {
    if (!_regionMap || !s.matchData) return
    var eth = s.matchData.ethnicity
    if (!eth || !eth.regions || !eth.regions.length) return
    if (!s.regionCoords) return
    _regionLayers = {}
    _regionData = {}
    var bounds = L.latLngBounds()
    var count = 0
    for (var ri = 0; ri < eth.regions.length; ri++) {
      var reg = eth.regions[ri]
      var key = reg.key
      var name = reg.displayName || key
      if (!s.regionCoords[key]) continue
      var entry = s.regionCoords[key]
      var gj = entry.type ? entry : { type: 'MultiPolygon', coordinates: entry.coordinates }
      if (!gj.coordinates || !gj.coordinates.length) continue
      var col = reg.color || '#3b82f6'
      var layer = L.geoJSON(gj, { style: { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.2 } })
      layer.bindTooltip(name, { sticky: true })
      layer.addTo(_regionMap)
      _regionLayers[key] = layer
      var raw = s.regionNameData && s.regionNameData[key]
      var ni = null
      if (raw) {
        ni = {}
        if (raw.primaryLocated) ni.primaryLocated = raw.primaryLocated
        if (raw.alsoLocated) ni.alsoLocated = raw.alsoLocated
        if (raw.overview) ni.overview = raw.overview.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      }
      reg._nameInfo = ni
      _regionData[key] = reg
      layer.on('click', (function (k) { return function (e) { if (e && e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation() } zoomToRegion(k); if (document.activeElement) document.activeElement.blur() } })(key))
      bounds.extend(layer.getBounds())
      count++
    }
    if (count && bounds.isValid()) _regionMap.fitBounds(bounds.pad(0.1))
  }

  function initRegionMap() {
    var mapEl = document.getElementById('map')
    if (!mapEl || typeof L === 'undefined') return
    if (!s.matchData) return
    var eth = s.matchData.ethnicity
    if (!eth || !eth.regions || !eth.regions.length) return
    if (!s.regionCoords) return
    if (_regionMap) return
    try {
      _regionMap = L.map('map', { zoomControl: true, attributionControl: false })
      _regionMap.getContainer().setAttribute('tabindex', '-1')
      _regionMap.getContainer().style.userSelect = 'none'
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(_regionMap)
      addRegionsToMap()
    } catch (e) { console.log('Map init error:', e) }
  }

  var _journeyMap = null
  var _journeyLayers = {}

  function zoomToJourney(key) {
    if (!_journeyMap || !key) return
    for (var k in _journeyLayers) { if (_journeyLayers.hasOwnProperty(k)) _journeyMap.removeLayer(_journeyLayers[k]) }
    _journeyLayers = {}
    if (!s.journeyCoords && !s.subjourneyCoords) return
    var entry = (s.journeyCoords || {})[key] || (s.subjourneyCoords || {})[key]
    if (!entry) return
    var gj = entry.type ? entry : { type: 'MultiPolygon', coordinates: entry.coordinates }
    if (!gj.coordinates || !gj.coordinates.length) return
    var nodeData = null
    var com = s.matchData && s.matchData.communities
    if (com && com.branches) {
      ;(function findNode(nodes) {
        for (var fi = 0; fi < nodes.length; fi++) {
          if (nodes[fi].id === key) { nodeData = nodes[fi]; return }
          if (nodes[fi].communities) findNode(nodes[fi].communities)
        }
      })(com.branches)
    }
    if (!nodeData) return
    try {
      var col = strengthColor(nodeData.connection)
      var layer = L.geoJSON(gj, { style: { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.2 } })
      layer.bindTooltip(nodeData.displayName || key, { sticky: true })
      layer.addTo(_journeyMap)
      _journeyLayers[key] = layer
      layer.on('click', (function (k) { return function (e) { if (e && e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation() } zoomToJourney(k); if (document.activeElement) document.activeElement.blur() } })(key))
      _journeyMap.fitBounds(layer.getBounds().pad(0.1))
      _journeyMap.getContainer().blur()
      var pct = nodeData.connectionPercent != null ? nodeData.connectionPercent + '%' : ''
      var strength = nodeData.connection || ''
      var popupHtml = '<div style="font-size:13px;font-weight:600;color:#e2e8f0">' + (nodeData.displayName || key) + '</div>'
      if (pct || strength) popupHtml += '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + (strength ? titleize(strength) + ' ' : '') + pct + '</div>'
      layer.bindPopup(popupHtml, { closeButton: true, offset: L.point(0, -4) }).openPopup()
      var ni = nodeData._nameInfo
      if (!ni && s.journeyNameData) {
        var raw = s.journeyNameData[key]
        if (raw && raw.overview) {
          ni = { overview: raw.overview.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") }
          nodeData._nameInfo = ni
        }
      }
      var jinfo = { key: key, displayName: nodeData.displayName, connection: nodeData.connection, connectionPercent: nodeData.connectionPercent }
      if (ni) { jinfo.overview = ni.overview }
      setState({ selectedJourneyInfo: jinfo, selectedRegionInfo: null })
    } catch (e) { }
  }

  function addJourneysToMap() {
    if (!_journeyMap || !s.matchData) return
    var com = s.matchData.communities
    if (!com || !com.branches) return
    if (!s.journeyCoords) return
    _journeyLayers = {}
    var bounds = L.latLngBounds()
    var count = 0
    for (var bi = 0; bi < com.branches.length; bi++) {
      var n = com.branches[bi]
      var key = n.id
      if (!key) continue
      var entry = s.journeyCoords[key]
      if (!entry) continue
      var gj = entry.type ? entry : { type: 'MultiPolygon', coordinates: entry.coordinates }
      if (!gj.coordinates || !gj.coordinates.length) continue
      var col = strengthColor(n.connection)
      var layer = L.geoJSON(gj, { style: { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.2 } })
      layer.bindTooltip(n.displayName || key, { sticky: true })
      layer.addTo(_journeyMap)
      _journeyLayers[key] = layer
      ;(function resolveJourneyNameInfo(node) {
        var raw = s.journeyNameData && s.journeyNameData[node.id]
        if (raw && raw.overview) {
          node._nameInfo = { overview: raw.overview.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") }
        }
        if (node.communities) { for (var ci = 0; ci < node.communities.length; ci++) resolveJourneyNameInfo(node.communities[ci]) }
      })(n)
      layer.on('click', (function (k) { return function (e) { if (e && e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation() } zoomToJourney(k); if (document.activeElement) document.activeElement.blur() } })(key))
      bounds.extend(layer.getBounds())
      count++
    }
    if (count && bounds.isValid()) _journeyMap.fitBounds(bounds.pad(0.1))
  }

  function initJourneyMap() {
    var mapEl = document.getElementById('journey-map')
    if (!mapEl || typeof L === 'undefined') return
    if (!s.matchData) return
    var com = s.matchData.communities
    if (!com || !com.branches) return
    if (!s.journeyCoords) return
    if (_journeyMap) return
    try {
      _journeyMap = L.map('journey-map', { zoomControl: true, attributionControl: false })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(_journeyMap)
      addJourneysToMap()
    } catch (e) { console.log('Journey map init error:', e) }
  }

  var RegionsPanel = {
    oncreate: function () { setTimeout(initRegionMap, 50) },
    onupdate: function () { if (!_regionMap) setTimeout(initRegionMap, 50) },
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
            return m('span.detail.ethnicity', {
              style: { borderLeft: '3px solid ' + reg.color, cursor: 'pointer' },
              'data-key': reg.key,
              title: (function () {
                var ni = s.regionNameData && s.regionNameData[reg.key]
                if (!ni) return ''
                var parts = []
                if (ni.primaryLocated) parts.push('Primarily located in: ' + ni.primaryLocated)
                if (ni.alsoLocated) parts.push('Also found in: ' + ni.alsoLocated)
                return parts.join(' | ')
              })(),
              onclick: function () { zoomToRegion(reg.key) }
            }, [
              m('span.detail-label', reg.displayName || reg.key || ''),
              m('span.detail-value', [
                reg.percentage + '%',
                reg.lowerConfidence != null && reg.upperConfidence != null ? m('span.range', ' (' + reg.lowerConfidence + '\u2013' + reg.upperConfidence + '%)') : null
              ])
            ])
          }))
        ])
      })
      return m('.regions-map-row', [
        m('.card', groups),
        m('.card.map-card', [
          s.selectedRegionInfo ? m('.detail-info', [
            m('.detail-info-header', [
              m('span.detail-info-name', s.selectedRegionInfo.displayName || s.selectedRegionInfo.key || ''),
              m('span.detail-info-pct', s.selectedRegionInfo.percentage + '%' + (s.selectedRegionInfo.lowerConfidence != null ? ' (' + s.selectedRegionInfo.lowerConfidence + '\u2013' + s.selectedRegionInfo.upperConfidence + '%)' : ''))
            ]),
            s.selectedRegionInfo.primaryLocated ? m('.detail-info-row', [
              m('span.detail-info-label', 'Primarily located in:'),
              m('span.detail-info-value', s.selectedRegionInfo.primaryLocated)
            ]) : null,
            s.selectedRegionInfo.alsoLocated ? m('.detail-info-row', [
              m('span.detail-info-label', 'Also found in:'),
              m('span.detail-info-value', s.selectedRegionInfo.alsoLocated)
            ]) : null,
            s.selectedRegionInfo.overview ? m('.detail-info-overview', s.selectedRegionInfo.overview) : null
          ]) : null,
          m('#map', { style: { height: '420px', borderRadius: '10px', overflow: 'hidden' } })
        ])
      ])
    }
  }

  var JourneysPanel = {
    view: function () {
      var com = s.matchData && s.matchData.communities
      if (!com || !com.branches || !com.branches.length) return null
      return m('.regions-map-row', [
        m('.card', [m('.journey-tree', renderJourneyTree(com.branches, 0))]),
        m('.card.map-card', [
          s.selectedJourneyInfo ? m('.detail-info', [
            m('.detail-info-header', [
              m('span.detail-info-name', s.selectedJourneyInfo.displayName || s.selectedJourneyInfo.key || ''),
              s.selectedJourneyInfo.connection ? m('span.detail-info-strength.' + (s.selectedJourneyInfo.connection || '').toLowerCase(), [
                titleize(s.selectedJourneyInfo.connection),
                s.selectedJourneyInfo.connectionPercent != null ? ' ' + s.selectedJourneyInfo.connectionPercent + '%' : ''
              ]) : null
            ]),
            s.selectedJourneyInfo.overview ? m('.detail-info-overview', s.selectedJourneyInfo.overview) : null
          ]) : null,
          m('#journey-map', { style: { height: '420px', borderRadius: '10px', overflow: 'hidden' } })
        ])
      ])
    }
  }

  function renderJourneyTree(nodes, depth) {
    var sorted = nodes.slice().sort(function (a, b) { return (b.connectionPercent || 0) - (a.connectionPercent || 0) })
    return sorted.map(function (n) {
      var hasChildren = n.communities && n.communities.length > 0
      var sc = n.connection ? 'strength-' + n.connection.toLowerCase() : ''
      var strength = n.connection ? m('span.journey-strength.' + sc, [titleize(n.connection), ' ', (n.connectionPercent || '') + '%']) : null
      if (depth === 0) {
        return m('.journey-node', { key: n.id }, [
          m('.journey-header', { 'data-key': n.id, onclick: function () { zoomToJourney(n.id) } }, [
            m('span.journey-toggle' + (hasChildren ? '' : '.journey-toggle-empty'), hasChildren ? '\u25BC' : ''),
            m('span.journey-name', n.displayName || n.id || ''),
            strength
          ]),
          hasChildren ? m('.journey-children', renderJourneyTree(n.communities, depth + 1)) : null
        ])
      }
      if (hasChildren) {
        return m('.journey-sub-node', { key: n.id }, [
          m('.journey-header', { 'data-key': n.id, style: { paddingLeft: depth * 20 + 'px' }, onclick: function () { zoomToJourney(n.id) } }, [
            m('span.journey-toggle', '\u25BC'),
            m('span.journey-name', n.displayName || n.id || ''),
            strength
          ]),
          m('.journey-children', renderJourneyTree(n.communities, depth + 1))
        ])
      }
      return m('.journey-sub-node', { key: n.id }, [
        m('.journey-item', { 'data-key': n.id, style: { paddingLeft: (depth * 20 + 20) + 'px' }, onclick: function () { zoomToJourney(n.id) } }, [
          m('span.journey-name', n.displayName || n.id || ''),
          strength
        ])
      ])
    })
  }

  var ProfileCard = {
    view: function () {
      var d = s.matchData
      var p = d.profile || {}
      var md = d.matchData || {}
      var rel = md.relationship || {}
      document.title = p.matchName || 'Unknown'
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
          m('span', p.matchName || 'Unknown'),
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
            if (tab === 'regions') { setTimeout(function () { if (_regionMap) _regionMap.invalidateSize(); else initRegionMap() }, 50) }
            if (tab === 'journeys') { setTimeout(function () { if (_journeyMap) _journeyMap.invalidateSize(); else if (s.journeyCoords) initJourneyMap() }, 100) }
          }
        }, tab === 'regions' ? 'Regions' : 'Journeys')
      }))
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
        m(ProfileCard),
        m(Tabs),
        m('.tab-content#tab-regions', { style: { display: s.activeTab === 'regions' ? '' : 'none' } },
          s.matchData && s.matchData.ethnicity && s.matchData.ethnicity.regions && s.matchData.ethnicity.regions.length ? m(RegionsPanel) : null),
        m('.tab-content#tab-journeys', { style: { display: s.activeTab === 'journeys' ? '' : 'none' } },
          s.matchData && s.matchData.communities && s.matchData.communities.branches && s.matchData.communities.branches.length ? m(JourneysPanel) : null)
      ]
    }
  }

  m.mount(document.getElementById('content'), MatchDetail)
})()