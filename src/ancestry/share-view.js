(function () {
  var content = document.getElementById('content')

  function getURL(p) {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL(p) : p
  }

  function loadJourneyNames() {
    return fetch(getURL('data/ancestry/ancestry_journey_names.json'))
      .then(function (r) { return r.json() })
      .then(function (data) {
        var m = {}
        for (var id in data) {
          m[id] = data[id].name
          var subs = data[id].subjourneys
          if (subs) for (var s in subs) m[s] = subs[s]
        }
        return m
      })
      .catch(function () { return {} })
  }

  function loadRegionNames(version) {
    return fetch(getURL('data/ancestry/regions_' + version + '.json'))
      .then(function (r) { return r.json() })
      .then(function (data) {
        var m = {}
        for (var id in data) m[id] = data[id].displayName
        return m
      })
      .catch(function () { return {} })
  }

  function fmtCounts(payload) {
    var matches = 0
    var journeys = {}
    var macroRegions = {}
    var regions = {}
    var profiles = payload.profiles || []
    for (var i = 0; i < profiles.length; i++) {
      matches += profiles[i].matches || 0
      var js = profiles[i].journeys || []
      for (var j = 0; j < js.length; j++) {
        journeys[js[j].displayName || js[j].id] = true
        var macros = js[j].regions || []
        for (var k = 0; k < macros.length; k++) {
          macroRegions[macros[k].macroRegion] = true
          var subs = macros[k].regions || []
          for (var m = 0; m < subs.length; m++) regions[subs[m].region] = true
        }
      }
    }
    return {
      profiles: profiles.length,
      matches: matches,
      journeys: Object.keys(journeys).length,
      macroRegions: Object.keys(macroRegions).length,
      regions: Object.keys(regions).length
    }
  }

  function el(tag, className, text) {
    var e = document.createElement(tag)
    if (className) e.className = className
    if (text != null) e.textContent = text
    return e
  }

  function stat(num, lbl) {
    var d = el('div', 'stat')
    d.appendChild(el('div', 'num', Number(num).toLocaleString()))
    d.appendChild(el('div', 'lbl', lbl))
    return d
  }

  function button(label, className, onClick) {
    var b = el('button', 'btn-sm' + (className ? ' ' + className : ''))
    b.innerHTML = label
    b.addEventListener('click', onClick)
    return b
  }

  function download(json) {
    var blob = new Blob([json], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'ancestry_journeys_summary.json'
    document.body.appendChild(a)
    a.click()
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url) }, 0)
  }

  function renderEmpty(title, message) {
    content.innerHTML = ''
    var e = el('div', 'empty')
    e.appendChild(el('b', null, title))
    e.appendChild(document.createTextNode(message))
    content.appendChild(e)
  }

  var ICON_DOWNLOAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  var ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'

  function render(payload) {
    content.innerHTML = ''
    if (!payload || !payload.profiles || !payload.profiles.length) {
      renderEmpty('Nothing to share yet', 'Fetch matches in the Ancestry app first, then come back.')
      return
    }

    var json = JSON.stringify(payload, null, 2)
    var counts = fmtCounts(payload)

    var stats = el('div', 'stats')
    stats.appendChild(stat(counts.profiles, 'Profiles'))
    stats.appendChild(stat(counts.matches, 'Matches'))
    stats.appendChild(stat(counts.journeys, 'Unique journeys'))
    stats.appendChild(stat(counts.macroRegions, 'Unique macro-regions'))
    stats.appendChild(stat(counts.regions, 'Unique regions'))
    content.appendChild(stats)

    if (payload.rule) {
      var rule = el('div', 'rule')
      rule.appendChild(ruleItem('Only this journey', payload.rule.onlyJourney))
      rule.appendChild(ruleItem('Min connection', payload.rule.minConnectionPercent + '%'))
      rule.appendChild(ruleItem('Min matches', payload.rule.minMatches))
      rule.appendChild(ruleItem('Build', payload.year))
      content.appendChild(rule)
    }

    var panel = el('div', 'panel')
    var head = el('div', 'panel-head')
    head.appendChild(el('div', 'panel-title', 'Shared data'))
    var actions = el('div', 'panel-actions')
    actions.appendChild(button(ICON_COPY + ' Copy', '', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json)
    }))
    actions.appendChild(button(ICON_DOWNLOAD + ' Download', 'primary', function () { download(json) }))
    head.appendChild(actions)
    panel.appendChild(head)
    var pre = el('pre', null, json)
    panel.appendChild(pre)
    content.appendChild(panel)
  }

  function ruleItem(label, value) {
    var s = el('span')
    s.appendChild(el('b', null, label + ':'))
    s.appendChild(document.createTextNode(' ' + value))
    return s
  }

  function wireToolbar() {
    var hideNames = document.getElementById('hideNamesToggle')
    if (hideNames) hideNames.addEventListener('change', function () { })
    var hideRanges = document.getElementById('hideRangesToggle')
    if (hideRanges) hideRanges.addEventListener('change', function () { })
    var fileInput = document.getElementById('importFileInput')
    var importBtn = document.getElementById('importBtn')
    var exportBtn = document.getElementById('exportBtn')
    if (importBtn && fileInput) importBtn.addEventListener('click', function () { fileInput.click() })
    if (fileInput) fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0]
      e.target.value = ''
      if (!file || typeof DB === 'undefined' || !DB.importDatabase) return
      if (!confirm('Restore "' + file.name + '"? Existing data will be overwritten.')) return
      DB.importDatabase(file).then(function () { location.reload() }).catch(function (err) { alert('Import failed: ' + (err && err.message || err)) })
    })
    if (exportBtn) exportBtn.addEventListener('click', function () {
      if (typeof DB !== 'undefined' && DB.exportDatabase) DB.exportDatabase().catch(function () { })
    })
  }

  function run() {
    wireToolbar()
    content.innerHTML = ''
    var loading = el('div', 'loading')
    loading.appendChild(el('div', 'spinner-ring'))
    loading.appendChild(el('div', 'loading-title', 'Gathering your journey stats'))
    loading.appendChild(el('div', 'loading-sub', 'Reading matches from every profile\u2026'))
    loading.appendChild(el('div', 'progress'))
    content.appendChild(loading)

    if (typeof DB === 'undefined' || !DB.getAllSessions || typeof AncestrySummarizer === 'undefined') {
      renderEmpty('Could not load your data', 'Please reopen the page and try again.')
      return
    }
    DB.getAllSessions('ancestry').then(function (sessions) {
      var version = AncestrySummarizer.detectVersion(sessions) || '2026'
      return Promise.all([loadJourneyNames(), loadRegionNames(version)]).then(function (maps) {
        return AncestrySummarizer.build(sessions, {
          year: version,
          version: version,
          journeyNames: maps[0],
          regionNames: maps[1]
        })
      })
    }).then(render).catch(function () {
      renderEmpty('Something went wrong', 'We could not gather your stats. Please try again.')
    })
  }

  run()
})()
