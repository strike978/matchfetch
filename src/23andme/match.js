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
    expandedKey: null,
    hideNames: hideNames,
    modal: null,
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
          var isExpanded = s.expandedKey === node.id
          out.push(m('.region-item', { key: node.id }, [
            m('.region-header', {
              style: { paddingLeft: (depth * 20 + 12) + 'px', borderLeft: '3px solid ' + (node.color || '#3b82f6') },
              onclick: function () { setState({ expandedKey: isExpanded ? null : node.id }) }
            }, [
              m('span.region-toggle', childLabels.length ? '\u25BC' : ''),
              m('span.region-name', node.label),
              m('span.region-pct', node.totalPercent + '%')
            ]),
            isExpanded && childLabels.length ? m('.region-children', renderRegionTree(node.regions, depth + 1)) : null
          ]))
        })(arr[ai])
      }
    }
    return out
  }

  function renderGrandparentBoxes(locations) {
    if (!locations) return m('.empty', { style: { color: '#64748b', fontSize: '13px' } }, 'No grandparent birth location data')
    var keys = [
      { k: 'maternal_gma', label: 'Maternal Grandmother' },
      { k: 'maternal_gpa', label: 'Maternal Grandfather' },
      { k: 'paternal_gma', label: 'Paternal Grandmother' },
      { k: 'paternal_gpa', label: 'Paternal Grandfather' }
    ]
    return m('.gp-grid', keys.map(function (item) {
      var gp = locations[item.k]
      var place = gp ? [gp.city, gp.state, gp.country].filter(function (x) { return x }).join(', ') : ''
      return m('.gp-box', [
        m('.gp-title', item.label),
        m('.gp-place', place ? place : m('span.muted', 'Not provided'))
      ])
    }))
  }

  var ProfileCard = {
    view: function () {
      var m2 = s.matchData
      var pct = m2.ibd_proportion != null ? (m2.ibd_proportion * 100).toFixed(1) + '%' : null
      document.title = displayName(m2)
      var profileUrl = 'https://you.23andme.com/p/' + guid + '/profile/' + sampleId + '/'
      var relParts = []
      if (pct) relParts.push(m('span', [m('span.num', pct), ' shared']))
      if (pct && m2.num_segments != null) relParts.push(' across ')
      if (m2.num_segments != null) relParts.push(m('span', [m('span.num', m2.num_segments), ' segments']))
      return m('.card.profile-card', [
        m('.match-name', [
          m('.avatar.avatar-initials.' + sexClass(m2), m2.initials || '?'),
          m('span', displayName(m2)),
          m('a.profile-link', { href: profileUrl, target: '_blank', title: 'Open on 23andMe' }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'))
        ]),
        m('.card-details', { style: { marginTop: '12px' } }, [
          m('span.detail', [m('span.detail-label', 'Rel'), m('span.detail-value', titleize(m2.predicted_relationship_id))]),
          m('span.detail', [m('span.detail-label', 'Sex'), m('span.detail-value', titleize(m2.sex))]),
          m2.is_maternal_side ? m('span.detail', [m('span.detail-label', 'Side'), m('span.detail-value', 'Maternal')]) : null,
          m2.is_paternal_side ? m('span.detail', [m('span.detail-label', 'Side'), m('span.detail-value', 'Paternal')]) : null,
          m2.max_segment_length ? m('span.detail', [m('span.detail-label', 'Max seg'), m('span.detail-value', m2.max_segment_length.toFixed(1) + ' cM')]) : null,
          m2.date_opted_in ? m('span.detail', [m('span.detail-label', 'Opted in'), m('span.detail-value', m2.date_opted_in)]) : null,
          m2.is_open_sharing === false ? m('span.detail', [m('span.detail-label', 'Sharing'), m('span.detail-value', 'Not sharing')]) : null
        ]),
        relParts.length ? m('.rel-text', relParts) : null
      ])
    }
  }

  var HaplogroupsPanel = {
    view: function () {
      var hg = s.matchData.ancestry && s.matchData.ancestry.haplogroups
      if (!hg || (!hg.ydna && !hg.mtdna)) return null
      return m('.card', [
        m('.label', 'Haplogroups'),
        m('.hg-card', [
          hg.ydna ? m('.hg-box', [m('.hg-label', 'Y-DNA'), m('.hg-value', hg.ydna)]) : null,
          hg.mtdna ? m('.hg-box.mt', [m('.hg-label', 'mtDNA'), m('.hg-value', hg.mtdna)]) : null
        ])
      ])
    }
  }

  var RegionsPanel = {
    view: function () {
      var regions = s.matchData.ancestry && s.matchData.ancestry.regions
      if (!regions || Object.keys(regions).length === 0) return null
      return m('.card', [
        m('.label', 'Ancestry Composition'),
        renderRegionTree(regions, 0)
      ])
    }
  }

  var GrandparentsPanel = {
    view: function () {
      if (!s.matchData.grandparent_birth_locations) return null
      return m('.card', [
        m('.label', 'Grandparent Birth Locations'),
        renderGrandparentBoxes(s.matchData.grandparent_birth_locations)
      ])
    }
  }

  var Modal = {
    view: function () {
      if (!s.modal) return null
      return m('.modal-overlay', { onclick: function (e) { if (e.target === e.currentTarget) { s.modal = null; m.redraw() } } }, [
        m('.modal', [
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
      })
    },
    view: function () {
      if (!s.matchData) return m('.spinner', [m('.spinner-ring'), m('div', 'Loading...')])
      return [
        m(Modal),
        m(ProfileCard),
        m(HaplogroupsPanel),
        m(RegionsPanel),
        m(GrandparentsPanel)
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
        if (!Array.isArray(data)) throw new Error('Invalid format')
        setState({ modal: { title: 'Import database?', text: 'This will overwrite your entire database with ' + data.length + ' record(s) from this file. This cannot be undone.', confirmText: 'Import', cancelText: 'Cancel', onConfirm: function () { if (typeof DB !== 'undefined') DB.importDatabase(data).then(function () { m.redraw() }) } } })
      } catch (err) { alert('Import failed: ' + err.message) }
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
      el.addEventListener('click', function () { if (typeof DB !== 'undefined' && DB.exportDatabase) DB.exportDatabase() })
    }
  })

  m.mount(document.getElementById('content'), MatchDetail)
})()
