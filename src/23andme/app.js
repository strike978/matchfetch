(function () {
  var s = {
    profiles: [],
    selectedProfileId: '',
    loading: true,
    statusMsg: '',
    relatives: [],
    matches: {},
    isFetching: false,
    fetchMsg: '',
    fetchPct: '',
    fetchProgress: 0,
    fetchComplete: false,
    showFilterBody: false,
    filters: { name: '', pctMin: null, pctMax: null, segMin: null, side: '' },
    currentPage: 1,
    pageSize: 20,
    hideNames: false,
    sortBy: 'pct',
    modal: null,
  }

  function setState(o) { Object.assign(s, o); m.redraw() }

  var _filterCache = { key: '', sorted: [], filtered: [] }
  var _dataVersion = 0

  function friendlyError(msg) {
    if (/Status 30[137]/.test(msg)) return 'Make sure you are logged into 23andMe, then try again.'
    if (/Status 40[13]/.test(msg)) return 'Access denied. Make sure you are logged into 23andMe.'
    if (/Status 403/.test(msg)) return 'Access denied. You may not have permission to view this data.'
    if (/Status 404/.test(msg)) return 'Data not found. The profile or match may no longer be available.'
    if (/Status 429/.test(msg)) return 'Too many requests. Please wait a moment and try again.'
    if (/Status 5\d\d/.test(msg)) return '23andMe server error. Please try again later.'
    if (/Bad JSON/.test(msg)) return 'Unexpected response from 23andMe. Reload the MatchFetch extension and make sure you are logged into 23andMe.'
    if (/Fetch failed/.test(msg)) return 'Could not reach 23andMe. Check your internet connection.'
    return msg
  }

  function titleize(str) {
    if (!str) return ''
    return String(str).replace(/_/g, ' ').replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase() })
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

  var FETCH_DELAY = 1200

  function apiFetch(url, options) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({
        action: 'apiFetch', url: url, options: options, domain: '23andme.com'
      }, function (response) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
        if (!response || !response.success) return reject(new Error(response ? response.error : 'No response'))
        resolve(response.data)
      })
    })
  }

  function extractProfiles(html) {
    var idx = html.indexOf("'profiles':")
    if (idx === -1) idx = html.indexOf('"profiles":')
    if (idx === -1) return null
    var start = html.indexOf('[', idx)
    if (start === -1) return null
    var depth = 0, inStr = false, quote = '', i = start
    for (; i < html.length; i++) {
      var ch = html.charAt(i)
      if (inStr) {
        if (ch === '\\') { i++; continue }
        if (ch === quote) inStr = false
        continue
      }
      if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue }
      if (ch === '[') depth++
      else if (ch === ']') { depth--; if (depth === 0) break }
    }
    try { return JSON.parse(html.substring(start, i + 1)) } catch (e) { return null }
  }

  function profileName(p) {
    if (!p) return ''
    var n = (p.first_name || '') + (p.last_name ? ' ' + p.last_name : '')
    return n.trim() || p.initials || 'Profile'
  }

  async function loadAccount() {
    setState({ loading: true, statusMsg: '' })
    try {
      var html = await apiFetch('https://you.23andme.com/', {
        credentials: 'include', headers: { 'Accept': 'text/html' }, responseType: 'text'
      })
      var m = String(html).match(/window\.TTAM\.currentProfileId\s*=\s*["']([a-f0-9]+)["']/)
      var currentId = m && m[1] ? m[1] : ''
      var profiles = extractProfiles(String(html))
      console.log('[MatchFetch 23] HTML length:', String(html).length, 'current:', currentId, 'profiles:', profiles ? profiles.length : null)
      if (!Array.isArray(profiles) || profiles.length === 0) {
        if (!currentId) throw new Error('Could not find profile. Make sure you are logged into 23andMe.')
        profiles = [{ id: currentId, first_name: '', last_name: '', initials: '' }]
      }
      var selected = profiles.some(function (p) { return p.id === currentId }) ? currentId : (profiles[0].id || '')
      setState({ profiles: profiles, selectedProfileId: selected, loading: false })
      await loadSaved()
    } catch (err) {
      setState({ statusMsg: friendlyError(err.message), loading: false })
    }
  }

  async function onProfileSelect(id) {
    if (!id) return
    setState({ selectedProfileId: id, relatives: [], matches: {}, isFetching: false, fetchComplete: false, statusMsg: '', fetchMsg: '', fetchProgress: 0, fetchPct: '', currentPage: 1 })
    await loadSaved()
  }

  async function loadSaved() {
    if (!s.selectedProfileId) return
    try {
      var session = await DB.getSession(s.selectedProfileId, '23andme')
      var rel = (session && session.relatives) || []
      setState({ matches: (session && session.matches) || {}, relatives: rel, fetchComplete: Array.isArray(rel) && rel.length > 0 })
    } catch (e) { console.log('loadSaved error:', e) }
  }

  function extractNodes(node, allNodes) {
    if (node.totalPercent && parseFloat(node.totalPercent) > 0 && node.id !== 'root') {
      allNodes.push({ id: node.id, label: node.label, totalPercent: node.totalPercent, color: node.color, parent_id: node.parent_id })
    }
    if (node.children && Array.isArray(node.children)) {
      for (var i = 0; i < node.children.length; i++) extractNodes(node.children[i], allNodes)
    }
    return allNodes
  }

  function buildHierarchy(nodes) {
    var nodeMap = {}
    var result = {}
    for (var i = 0; i < nodes.length; i++) {
      nodeMap[nodes[i].id] = { id: nodes[i].id, label: nodes[i].label, totalPercent: nodes[i].totalPercent, color: nodes[i].color, parent_id: nodes[i].parent_id, regions: {} }
    }
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j]
      var hn = nodeMap[node.id]
      if (node.parent_id === 'root') {
        result[node.label] = [hn]
      } else if (nodeMap[node.parent_id]) {
        var parent = nodeMap[node.parent_id]
        if (!parent.regions[node.label]) parent.regions[node.label] = []
        parent.regions[node.label].push(hn)
      }
    }
    for (var id in nodeMap) {
      if (Object.keys(nodeMap[id].regions).length === 0) delete nodeMap[id].regions
    }
    return result
  }

  function findPopulationTree(data, targetProfileId) {
    if (!data || !data.population_trees || !Array.isArray(data.population_trees)) return null
    for (var i = 0; i < data.population_trees.length; i++) {
      if (data.population_trees[i].profile_id === targetProfileId) return data.population_trees[i]
    }
    return null
  }

  async function fetchHaplogroups(targetProfileId) {
    try {
      await delay(FETCH_DELAY)
      var url = 'https://you.23andme.com/p/' + s.selectedProfileId + '/ancestry/compute-result/?profile_id=' + targetProfileId + '%2C' + s.selectedProfileId + '&name=mthaplo_build_7%3Ahaplogroup%2Cyhaplo_2023%3Ahaplogroup'
      var data = await apiFetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      })
      var h = {}
      if (Array.isArray(data)) {
        for (var i = 0; i < data.length; i++) {
          var item = data[i]
          if (!item || item.profile_id !== targetProfileId || !item.result || !item.result.haplogroup_id) continue
          var v = item.result.haplogroup_id
          var colonIndex = v.indexOf(':')
          if (item.name === 'yhaplo_2023:haplogroup') {
            if (v.indexOf('FEMALE') !== -1) h.ydna = ''
            else h.ydna = colonIndex !== -1 ? v.substring(colonIndex + 1) : v
          } else if (item.name === 'mthaplo_build_7:haplogroup') {
            h.mtdna = colonIndex !== -1 ? v.substring(colonIndex + 1) : v
          }
        }
      }
      return Object.keys(h).length ? h : null
    } catch (e) {
      return null
    }
  }

  async function fetchMatchDetails(match) {
    var enriched = {}
    for (var k in match) enriched[k] = match[k]
    try {
      await delay(FETCH_DELAY)
      var ancestryUrl = 'https://you.23andme.com/p/' + s.selectedProfileId + '/profile/' + match.relative_profile_id + '/ancestry_composition/?sort_by=remote&include_ibd_countries=false'
      var data = await apiFetch(ancestryUrl, {
        credentials: 'include',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      })
      var tree = findPopulationTree(data, match.relative_profile_id)
      if (tree) {
        var nodes = extractNodes(tree.population_tree, [])
        var regions = buildHierarchy(nodes)
        var haplogroups = await fetchHaplogroups(match.relative_profile_id)
        enriched.ancestry = { using_latest_compute: tree.using_latest_compute, haplogroups: haplogroups, regions: regions }
      } else {
        enriched.ancestry_error = 'No ancestry composition data for this match'
      }
    } catch (err) {
      enriched.ancestry_error = err.message
    }
    return enriched
  }

  function setProgress(current, total) {
    var pct = total > 0 ? Math.min(current / total * 100, 100) : 0
    var t = pct / 100
    var r, g, b
    if (t < 0.5) { var f = t * 2; r = 239; g = Math.round(68 + f * (168 - 68)); b = Math.round(68 + f * (129 - 68)) }
    else { var f = (t - 0.5) * 2; r = Math.round(239 - f * (239 - 34)); g = Math.round(168 + f * (197 - 168)); b = Math.round(129 - f * (129 - 94)) }
    setState({ fetchProgress: pct, fetchPct: 'progress' })
    var el = document.getElementById('fetchBarFill')
    if (el) { el.style.width = pct + '%'; el.style.background = 'rgb(' + r + ',' + g + ',' + b + ')' }
    var pctEl = document.getElementById('fetchPct')
    if (pctEl) { pctEl.textContent = Math.round(pct) + '%'; pctEl.style.color = 'rgb(' + r + ',' + g + ',' + b + ')' }
  }

  async function doFetch() {
    if (!s.selectedProfileId || s.isFetching) return
    setState({ isFetching: true, fetchComplete: false, statusMsg: '', fetchMsg: 'Fetching relatives...', fetchProgress: 0, fetchPct: '' })
    try {
      var data = await apiFetch('https://you.23andme.com/p/' + s.selectedProfileId + '/family/relatives/ajax/', {
        credentials: 'include',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      })
      console.log('[MatchFetch 23] relatives type:', Array.isArray(data) ? 'array(' + data.length + ')' : typeof data)
      s.relatives = Array.isArray(data) ? data : []
      setState({ relatives: s.relatives })
      if (typeof DB !== 'undefined') DB.saveRelatives(s.selectedProfileId, s.relatives, '23andme')
    } catch (err) {
      setState({ isFetching: false, statusMsg: friendlyError(err.message) })
      return
    }
    var targets = s.relatives.filter(function (r) {
      return r.is_open_sharing === true && !(s.matches[r.relative_profile_id] && s.matches[r.relative_profile_id].ancestry)
    })
    var total = targets.length
    if (total === 0) {
      setState({ isFetching: false, fetchComplete: true, statusMsg: 'No new match details to fetch' })
      return
    }
    for (var i = 0; i < total; i++) {
      var match = targets[i]
      setState({ fetchMsg: 'Fetching details ' + (i + 1) + ' of ' + total + (match.initials ? ' (' + match.initials + ')' : '') + '...' })
      var enriched = await fetchMatchDetails(match)
      s.matches[match.relative_profile_id] = enriched
      if (typeof DB !== 'undefined') DB.saveMatches(s.selectedProfileId, [enriched], '23andme')
      _dataVersion++
      setProgress(i + 1, total)
      await delay(FETCH_DELAY)
    }
    setState({ isFetching: false, fetchMsg: '', fetchPct: '', fetchComplete: true, statusMsg: 'Fetched details for ' + total + ' match(es)' })
  }

  function matchesFilter(m) {
    var f = s.filters
    if (f.name) {
      var n = ((m.first_name || '') + ' ' + (m.last_name || '') + ' ' + (m.initials || '')).toLowerCase()
      if (n.indexOf(f.name.toLowerCase()) === -1) return false
    }
    var pct = (m.ibd_proportion || 0) * 100
    if (f.pctMin != null && pct < f.pctMin) return false
    if (f.pctMax != null && pct > f.pctMax) return false
    if (f.segMin != null && (m.num_segments || 0) < f.segMin) return false
    if (f.side) {
      if (f.side === 'maternal' && m.is_maternal_side !== true) return false
      if (f.side === 'paternal' && m.is_paternal_side !== true) return false
    }
    return true
  }

  function sortMatches(a, b) {
    if (s.sortBy === 'pct') return (b.ibd_proportion || 0) - (a.ibd_proportion || 0)
    if (s.sortBy === 'segments') return (b.num_segments || 0) - (a.num_segments || 0)
    return String(b.date_opted_in || '').localeCompare(String(a.date_opted_in || ''))
  }

  function buildMatchList() {
    var list
    if (Array.isArray(s.relatives) && s.relatives.length > 0) {
      list = s.relatives
    } else {
      list = Object.keys(s.matches).map(function (id) { return s.matches[id] })
    }
    return list.map(function (r) {
      var en = s.matches[r.relative_profile_id]
      var merged = {}
      for (var k in r) merged[k] = r[k]
      if (en) for (var k2 in en) merged[k2] = en[k2]
      return merged
    })
  }

  function computeFilterKey(list) {
    var f = s.filters
    return s.sortBy + '|' + (list ? list.length : 0) + '|' + (f.name || '') + '|' + (f.pctMin || '') + '|' + (f.pctMax || '') + '|' + (f.segMin || '') + '|' + (f.side || '') + '|v' + _dataVersion
  }

  function readFilters() {
    var f = s.filters
    f.name = document.getElementById('filterName') ? document.getElementById('filterName').value : ''
    f.pctMin = parseFloat(document.getElementById('filterPctMin') ? document.getElementById('filterPctMin').value : '') || null
    f.pctMax = parseFloat(document.getElementById('filterPctMax') ? document.getElementById('filterPctMax').value : '') || null
    f.segMin = parseFloat(document.getElementById('filterSegMin') ? document.getElementById('filterSegMin').value : '') || null
    f.side = document.getElementById('filterSide') ? document.getElementById('filterSide').value : ''
  }

  function applyFilterChange() {
    readFilters()
    s.currentPage = 1
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

  var App = {
    oninit: function () {
      document.getElementById('exportBtn').addEventListener('click', function () { if (typeof DB !== 'undefined' && DB.exportDatabase) DB.exportDatabase() })
      document.getElementById('importBtn').addEventListener('click', function () { document.getElementById('importFileInput').click() })
      document.getElementById('importFileInput').addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !file.name.endsWith('.json')) { e.target.value = ''; return }
        var reader = new FileReader()
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result)
            if (!Array.isArray(data)) throw new Error('Invalid format: expected an array')
            s.modal = {
              title: 'Import database?',
              text: 'This will overwrite your entire database with ' + data.length + ' record(s) from this file. This cannot be undone.',
              confirmText: 'Import',
              cancelText: 'Cancel',
              onConfirm: function () {
                setState({ statusMsg: 'Importing...' })
                DB.importDatabase(data).then(function (count) {
                  setState({ statusMsg: 'Imported ' + count + ' record(s)' })
                  loadSaved()
                })
              }
            }
            m.redraw()
          } catch (err) {
            s.modal = { title: 'Import failed', text: err.message, cancelText: 'OK' }
            m.redraw()
          }
        }
        reader.readAsText(file)
        e.target.value = ''
      })
      document.getElementById('hideNamesToggle').addEventListener('change', function () {
        setState({ hideNames: this.checked })
      })
      loadAccount()
    },
    view: function () {
      return [m(KitSelector), m(FilterBar), m(MatchList), m(Modal)]
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

  var KitSelector = {
    view: function () {
      if (s.loading) return m('.spinner', [m('.spinner-ring'), m('.spinner-text', 'Loading...')])
      if (s.profiles.length === 0 && s.statusMsg) return m('.error', s.statusMsg)
      if (s.profiles.length === 0) return m('.empty', 'No profiles found. Make sure you are logged into 23andMe.')
      var sel = null
      for (var pi = 0; pi < s.profiles.length; pi++) { if (s.profiles[pi].id === s.selectedProfileId) sel = s.profiles[pi] }
      var total = Array.isArray(s.relatives) ? s.relatives.length : 0
      var sharing = Array.isArray(s.relatives) ? s.relatives.filter(function (r) { return r.is_open_sharing === true }).length : 0
      var enriched = Object.keys(s.matches).filter(function (id) { return s.matches[id] && s.matches[id].ancestry }).length
      return [
        m('.label', [
          'Select a profile',
          m('.badge', [m('span.count', sel ? (sel.initials || '?') : '?'), ' PROFILE']),
          m('.badge', [m('span.count', total), ' RELATIVES']),
          m('.badge', [m('span.count', sharing), ' SHARING']),
          m('.badge', [m('span.count', enriched), ' DETAILS'])
        ]),
        m('.select-row', [
          m('select#testSelect', {
            value: s.selectedProfileId,
            onchange: function (e) { onProfileSelect(e.target.value) }
          }, [
            m('option', { value: '' }, 'Choose a profile...'),
            s.profiles.map(function (p) {
              return m('option', { value: p.id }, profileName(p))
            })
          ]),
          s.selectedProfileId ? m('button.clear-btn', {
            title: 'Clear profile data',
            onclick: function () {
              s.modal = {
                title: 'Clear profile data?',
                text: 'This will remove all matches and details for this profile from local storage.',
                confirmText: 'Clear',
                cancelText: 'Cancel',
                onConfirm: function () {
                  DB.deleteSession(s.selectedProfileId, '23andme').then(function () {
                    setState({ matches: {}, fetchComplete: false, currentPage: 1, statusMsg: '' })
                  })
                }
              }
              m.redraw()
            }
          }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>')) : null
        ]),
        m('.fetch-row', [
          m('button.btn.fetch-list-btn', {
            disabled: s.isFetching,
            onclick: function () { if (!s.isFetching) doFetch() }
          }, s.isFetching ? [m('.spinner-ring', { style: { width: '16px', height: '16px', borderWidth: '2px' } }), ' Fetching...'] : [m.trust('<span>&#x25B6;</span>'), ' ' + (s.fetchComplete ? 'Check for new matches' : 'Fetch')])
        ]),
        s.fetchMsg ? m('#fetchStatus', { style: { textAlign: 'center', padding: '6px 0' } }, [
          m('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' } }, [
            m.trust('<svg class="helix-svg" viewBox="0 0 18 18" width="18" height="18"><g><animateTransform attributeName="transform" type="rotate" from="0 9 9" to="360 9 9" dur="2s" repeatCount="indefinite"/><path d="M2,4 C4,1 7,1 9,4 C11,7 14,7 16,4" stroke="#3b82f6" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M2,14 C4,17 7,17 9,14 C11,11 14,11 16,14" stroke="#60a5fa" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".6"/><line x1="2" y1="4" x2="2" y2="14" stroke="#60a5fa" stroke-width=".7" opacity=".35"/><line x1="5.5" y1="2.5" x2="5.5" y2="15.5" stroke="#60a5fa" stroke-width=".7" opacity=".35"/><line x1="9" y1="4" x2="9" y2="14" stroke="#60a5fa" stroke-width=".7" opacity=".35"/><line x1="12.5" y1="5.5" x2="12.5" y2="12.5" stroke="#60a5fa" stroke-width=".7" opacity=".35"/><line x1="16" y1="4" x2="16" y2="14" stroke="#60a5fa" stroke-width=".7" opacity=".35"/></g></svg>'),
            m('span#fetchMsg', { style: { fontSize: '12px', color: '#94a3b8' } }, s.fetchMsg),
            s.fetchPct ? m('span#fetchPct', { style: { fontSize: '12px', fontWeight: '700', color: '#e2e8f0' } }) : null
          ]),
          m('#fetchBarWrap', { style: { height: '4px', background: '#0f1724', borderRadius: '4px', overflow: 'hidden', marginTop: '6px', maxWidth: '300px', marginLeft: 'auto', marginRight: 'auto' } }, [
            m('#fetchBarFill', { style: { height: '100%', width: s.fetchProgress + '%', borderRadius: '4px', transition: 'width .3s, background .3s' } })
          ])
        ]) : null,
        s.statusMsg ? m('.status-msg', s.statusMsg) : null
      ]
    }
  }

  var FilterBar = {
    view: function () {
      var list = buildMatchList()
      if (list.length === 0) return null
      return m('#filterBar', [
        m('.filter-toggle#filterToggle', {
          onclick: function () {
            s.showFilterBody = !s.showFilterBody
            var arrow = document.getElementById('filterArrow')
            if (arrow) arrow.classList.toggle('open')
          }
        }, [
          m('span#filterArrow', { style: { fontSize: '10px', transition: 'transform .2s' } }, '\u25B6'),
          ' Filtering Options'
        ]),
        m('#filterBody', { style: { display: s.showFilterBody ? '' : 'none' } }, [
          m('.filter-row', [
            m('label.filter-group', ['Name ', m('input#filterName.filter-input', { type: 'text', placeholder: 'Filter by name', oninput: function () { applyFilterChange(); m.redraw() } })]),
            m('label.filter-group', [
              'Shared % ',
              m('input#filterPctMin.filter-input.filter-cm', { type: 'number', placeholder: 'min', min: 0, oninput: function () { applyFilterChange(); m.redraw() } }),
              m('span.filter-sep', '\u2013'),
              m('input#filterPctMax.filter-input.filter-cm', { type: 'number', placeholder: 'max', max: 100, oninput: function () { applyFilterChange(); m.redraw() } })
            ]),
            m('label.filter-group', ['Segments \u2265 ', m('input#filterSegMin.filter-input.filter-cm', { type: 'number', placeholder: '0', min: 0, oninput: function () { applyFilterChange(); m.redraw() } })]),
            m('span.filter-group', [
              'Side ',
              m('select#filterSide.filter-select', { style: { width: '120px' }, value: s.filters.side, onchange: function (e) { s.filters.side = e.target.value; applyFilterChange(); m.redraw() } }, [
                m('option', { value: '' }, 'All'),
                m('option', { value: 'maternal' }, 'Maternal'),
                m('option', { value: 'paternal' }, 'Paternal')
              ])
            ]),
            m('span#filterReset.filter-clear', {
              onclick: function () {
                if (document.getElementById('filterName')) document.getElementById('filterName').value = ''
                if (document.getElementById('filterPctMin')) document.getElementById('filterPctMin').value = ''
                if (document.getElementById('filterPctMax')) document.getElementById('filterPctMax').value = ''
                if (document.getElementById('filterSegMin')) document.getElementById('filterSegMin').value = ''
                if (document.getElementById('filterSide')) document.getElementById('filterSide').value = ''
                s.filters = { name: '', pctMin: null, pctMax: null, segMin: null, side: '' }
                s.currentPage = 1
                m.redraw()
              }
            }, 'Clear filters')
          ])
        ])
      ])
    }
  }

  var MatchList = {
    view: function () {
      var list = buildMatchList()
      if (list.length === 0) return m('.empty', s.isFetching ? 'Fetching...' : (s.fetchComplete ? 'No relatives found for this profile.' : 'Select a profile and click Fetch to get started.'))
      var key = computeFilterKey(list)
      if (key !== _filterCache.key || list !== _filterCache.list) {
        _filterCache.key = key
        _filterCache.list = list
        _filterCache.sorted = list.slice().sort(sortMatches)
        _filterCache.filtered = _filterCache.sorted.filter(matchesFilter)
      }
      var filtered = _filterCache.filtered
      var start = (s.currentPage - 1) * s.pageSize
      var end = Math.min(start + s.pageSize, filtered.length)
      var total = list.length
      var shown = filtered.length
      var page = filtered.slice(start, end)
      var totalPages = Math.max(1, Math.ceil(filtered.length / s.pageSize))
      if (s.currentPage > totalPages) s.currentPage = totalPages
      var cards = page.map(function (match) { return m(MatchCard, { match: match }) })
      return m('#matchListResult', [
        m('.sort-bar', [
          m('span.sort-label', 'Sort by:'),
          m('button.sort-btn' + (s.sortBy === 'pct' ? '.active' : ''), { onclick: function () { setState({ sortBy: 'pct', currentPage: 1 }) } }, 'Shared %'),
          m('button.sort-btn' + (s.sortBy === 'segments' ? '.active' : ''), { onclick: function () { setState({ sortBy: 'segments', currentPage: 1 }) } }, 'Segments'),
          m('button.sort-btn' + (s.sortBy === 'date' ? '.active' : ''), { onclick: function () { setState({ sortBy: 'date', currentPage: 1 }) } }, 'Date')
        ]),
        shown < total ? m('.match-count', ['Showing ', m('strong', shown), ' of ', m('strong', total), ' relatives']) : null,
        m('.cards', cards),
        totalPages > 1 ? m(Pagination, { currentPage: s.currentPage, totalPages: totalPages }) : null
      ])
    }
  }

  var MatchCard = {
    view: function (vnode) {
      var m2 = vnode.attrs.match
      var a = m2.ancestry
      var hg = a && a.haplogroups
      var pct = m2.ibd_proportion != null ? (m2.ibd_proportion * 100).toFixed(1) + '%' : null
      return m('.card.match-card', {
        onclick: function () { if (s.selectedProfileId && m2.relative_profile_id) window.open('match.html?guid=' + s.selectedProfileId + '&sampleId=' + m2.relative_profile_id + (s.hideNames ? '&hideNames=1' : ''), '_blank') }
      }, [
        m('.card-top', [
          m('.avatar.avatar-initials.' + sexClass(m2), m2.initials || '?'),
          m('span.card-name', displayName(m2)),
          m2.is_open_sharing === false ? m('span.card-initials', 'Not sharing') : null
        ]),
        m('.card-details', [
          m('span.detail', [m('span.detail-label', 'Rel'), m('span.detail-value', titleize(m2.predicted_relationship_id))]),
          pct ? m('span.detail', [m('span.detail-label', 'Shared'), m('span.detail-value', pct)]) : null,
          m2.num_segments != null ? m('span.detail', [m('span.detail-label', 'Segments'), m('span.detail-value', m2.num_segments)]) : null,
          m2.max_segment_length ? m('span.detail', [m('span.detail-label', 'Max seg'), m('span.detail-value', m2.max_segment_length.toFixed(1))]) : null
        ]),
        m('.journey-strip', [
          m2.is_maternal_side ? m('span.journey-pill.side-m', 'Maternal') : null,
          m2.is_paternal_side ? m('span.journey-pill.side-p', 'Paternal') : null,
          hg && hg.ydna ? m('span.journey-pill', [m('span.jp-name', 'Y'), ' ', m('span.jp-pct', hg.ydna)]) : null,
          hg && hg.mtdna ? m('span.journey-pill', [m('span.jp-name', 'mt'), ' ', m('span.jp-pct', hg.mtdna)]) : null
        ])
      ])
    }
  }

  var Pagination = {
    view: function (vnode) {
      var cp = vnode.attrs.currentPage
      var tp = vnode.attrs.totalPages
      var range = []
      var startPage = Math.max(1, cp - 2)
      var endPage = Math.min(tp, cp + 2)
      if (startPage > 1) { range.push(1); if (startPage > 2) range.push('...') }
      for (var pi = startPage; pi <= endPage; pi++) range.push(pi)
      if (endPage < tp) { if (endPage < tp - 1) range.push('...'); range.push(tp) }
      return m('.pagination', [
        m('button.page-btn', { disabled: cp <= 1, onclick: function () { s.currentPage = cp - 1; m.redraw() } }, '\u25C0'),
        range.map(function (p) {
          if (p === '...') return m('span.page-dots', '...')
          return m('button.page-btn' + (p === cp ? '.page-active' : ''), { onclick: function () { s.currentPage = p; m.redraw() } }, String(p))
        }),
        m('button.page-btn', { disabled: cp >= tp, onclick: function () { s.currentPage = cp + 1; m.redraw() } }, '\u25B6')
      ])
    }
  }

  m.mount(document.getElementById('results'), App)
})()
