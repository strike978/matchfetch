var AncestryShare = (function () {
  var DEFAULTS = {
    onlyJourney: true,
    minConnectionPercent: 20,
    minMatches: 20,
    requireFullRegions: true,
    regionTotalTolerance: 0,
    year: '2026'
  }

  var REMOTE = {
    url: 'https://retvsehqusqfbpxywkxf.supabase.co',
    publishableKey: 'sb_publishable_DJudcXGWpEUpWVGDF-GLwg_FRJabT0q',
    schemaVersion: 1
  }

  function cyrb128(str) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
    for (var i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i)
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
  }

  function hex8(n) {
    return ('00000000' + (n >>> 0).toString(16)).slice(-8)
  }

  function profileId(guid) {
    var h = cyrb128('mf-ancestry-' + String(guid || ''))
    var hex = hex8(h[0]) + hex8(h[1]) + hex8(h[2]) + hex8(h[3])
    var bytes = []
    for (var i = 0; i < 16; i++) bytes.push(parseInt(hex.substr(i * 2, 2), 16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    var s = ''
    for (var j = 0; j < 16; j++) s += (bytes[j] + 0x100).toString(16).slice(1)
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20)
  }

  function titleize(str) {
    if (!str) return ''
    return str.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase() })
  }

  function round2(n) {
    return Math.round(n * 100) / 100
  }

  function pickRegions(match, version) {
    if (!match) return null
    var r = match.regions
    if (!r) return null
    if (Array.isArray(r)) {
      if (!version) return r
      return String(match.version || '2025') === version ? r : null
    }
    if (!version) {
      var keys = Object.keys(r)
      if (!keys.length) return null
      keys.sort(function (a, b) { return Number(b) - Number(a) })
      return r[keys[0]]
    }
    return r[version] || null
  }

  function coverageTotal(match, version) {
    var regs = pickRegions(match, version)
    var total = 0
    if (regs) {
      for (var i = 0; i < regs.length; i++) {
        var pct = regs[i] && regs[i].percentage
        if (pct > 0) total += pct
      }
    }
    return total
  }

  function candidateScore(match, version, tol) {
    var cov = coverageTotal(match, version)
    var full = cov >= (100 - tol) ? 1 : 0
    var regs = pickRegions(match, version)
    var regionLen = regs ? regs.length : 0
    var journeys = (match.journeys && match.journeys.length) || 0
    return full * 1e9 + Math.min(cov, 100) * 1e6 + regionLen * 1000 + journeys
  }

  function detectVersion(sessions) {
    var counts = {}
    for (var i = 0; i < sessions.length; i++) {
      var session = sessions[i]
      if (!session || !session.matches) continue
      var sids = Object.keys(session.matches)
      for (var j = 0; j < sids.length; j++) {
        var match = session.matches[sids[j]]
        var r = match && match.regions
        if (!r) continue
        if (Array.isArray(r)) {
          var v = String(match.version || '2025')
          counts[v] = (counts[v] || 0) + 1
        } else {
          var keys = Object.keys(r)
          for (var k = 0; k < keys.length; k++) {
            if (r[keys[k]] && r[keys[k]].length) counts[keys[k]] = (counts[keys[k]] || 0) + 1
          }
        }
      }
    }
    var best = null
    var bestCount = -1
    for (var key in counts) {
      if (counts[key] > bestCount || (counts[key] === bestCount && best != null && Number(key) > Number(best))) {
        best = key
        bestCount = counts[key]
      }
    }
    return best
  }

  function addStat(agg, value) {
    agg.n++
    agg.sum += value
    if (agg.min == null || value < agg.min) agg.min = value
    if (agg.max == null || value > agg.max) agg.max = value
  }

  function finalize(agg) {
    return {
      mean: round2(agg.sum / agg.n),
      min: agg.min,
      max: agg.max,
      n: agg.n,
      sum: round2(agg.sum)
    }
  }

  function summarize(matches, opts) {
    opts = opts || {}
    var onlyJourney = opts.onlyJourney !== false
    var minConnectionPercent = opts.minConnectionPercent != null ? opts.minConnectionPercent : DEFAULTS.minConnectionPercent
    var minMatches = opts.minMatches != null ? opts.minMatches : DEFAULTS.minMatches
    var requireFullRegions = opts.requireFullRegions !== false
    var regionTotalTolerance = opts.regionTotalTolerance != null ? opts.regionTotalTolerance : DEFAULTS.regionTotalTolerance
    var version = opts.version != null ? String(opts.version) : null
    var journeyNames = opts.journeyNames || {}
    var regionNames = opts.regionNames || {}
    var stats = opts.stats || null

    var journeyMap = {}
    var journeyOrder = []
    var matchJourneys = {}
    var sids = Object.keys(matches || {})

    for (var i = 0; i < sids.length; i++) {
      var sid = sids[i]
      var match = matches[sid]
      if (!match) continue
      var branches = match.journeys
      if (!branches || !branches.length) continue
      if (onlyJourney && branches.length !== 1) continue

      var regs = pickRegions(match, version)
      var macroTotals = {}
      var regTotal = 0
      if (regs && regs.length) {
        for (var ri = 0; ri < regs.length; ri++) {
          var reg = regs[ri]
          var pct = reg && reg.percentage
          if (!(pct > 0)) continue
          regTotal += pct
          var mkey = reg.macroRegionKey || 'other'
          macroTotals[mkey] = (macroTotals[mkey] || 0) + pct
        }
      }
      if (requireFullRegions && regTotal < (100 - regionTotalTolerance)) continue

      var contributedTo = matchJourneys[sid]
      if (!contributedTo) contributedTo = matchJourneys[sid] = []

      for (var bi = 0; bi < branches.length; bi++) {
        var br = branches[bi]
        if (!br || !br.id) continue
        if (br.connectionPercent == null || br.connectionPercent < minConnectionPercent) continue
        contributedTo.push(br.id)

        var journey = journeyMap[br.id]
        if (!journey) {
          journey = journeyMap[br.id] = {
            id: br.id,
            displayName: journeyNames[br.id] || br.displayName || br.id,
            matches: 0,
            _macros: {}
          }
          journeyOrder.push(journey)
        }
        journey.matches++

        if (regs && regs.length) {
          for (var ri2 = 0; ri2 < regs.length; ri2++) {
            var reg2 = regs[ri2]
            var pct2 = reg2 && reg2.percentage
            if (!(pct2 > 0)) continue
            var mkey2 = reg2.macroRegionKey || 'other'
            var macro = journey._macros[mkey2]
            if (!macro) macro = journey._macros[mkey2] = { displayName: titleize(mkey2), _agg: { n: 0, sum: 0, min: null, max: null }, _regions: {} }
            var rkey = reg2.key
            var region = macro._regions[rkey]
            if (!region) region = macro._regions[rkey] = { displayName: reg2.displayName || regionNames[rkey] || rkey, _agg: { n: 0, sum: 0, min: null, max: null } }
            addStat(region._agg, pct2)
          }
          for (var mk in macroTotals) {
            var macroT = journey._macros[mk]
            if (!macroT) macroT = journey._macros[mk] = { displayName: titleize(mk), _agg: { n: 0, sum: 0, min: null, max: null }, _regions: {} }
            addStat(macroT._agg, macroTotals[mk])
          }
        }
      }
    }

    var journeys = []
    var surviving = {}
    for (var ji = 0; ji < journeyOrder.length; ji++) {
      var j = journeyOrder[ji]
      if (j.matches < minMatches) continue
      surviving[j.id] = true
      var macroRegions = []
      var mkeys = Object.keys(j._macros)
      for (var mi = 0; mi < mkeys.length; mi++) {
        var mObj = j._macros[mkeys[mi]]
        var mStat = finalize(mObj._agg)
        var subRegions = []
        var rkeys = Object.keys(mObj._regions)
        for (var rki = 0; rki < rkeys.length; rki++) {
          var rObj = mObj._regions[rkeys[rki]]
          var rStat = finalize(rObj._agg)
          subRegions.push({ region: rObj.displayName, mean: rStat.mean, min: rStat.min, max: rStat.max, n: rStat.n, sum: rStat.sum })
        }
        subRegions.sort(function (a, b) { return b.mean - a.mean })
        macroRegions.push({ macroRegion: mObj.displayName, mean: mStat.mean, min: mStat.min, max: mStat.max, n: mStat.n, sum: mStat.sum, regions: subRegions })
      }
      macroRegions.sort(function (a, b) { return b.mean - a.mean })
      journeys.push({ id: j.id, displayName: j.displayName, matches: j.matches, regions: macroRegions })
    }
    journeys.sort(function (a, b) { return b.matches - a.matches })

    if (stats) {
      var included = 0
      for (var sidKey in matchJourneys) {
        var contributedTo = matchJourneys[sidKey]
        for (var ci = 0; ci < contributedTo.length; ci++) {
          if (surviving[contributedTo[ci]]) { included++; break }
        }
      }
      stats.matches = included
    }

    return {
      provider: 'ancestry',
      year: String(opts.year || version || DEFAULTS.year),
      rule: {
        onlyJourney: onlyJourney,
        minConnectionPercent: minConnectionPercent,
        minMatches: minMatches
      },
      journeys: journeys
    }
  }

  function build(sessions, opts) {
    opts = opts || {}
    var version = opts.version != null ? String(opts.version) : detectVersion(sessions)
    var onlyJourney = opts.onlyJourney !== false
    var minConnectionPercent = opts.minConnectionPercent != null ? opts.minConnectionPercent : DEFAULTS.minConnectionPercent
    var minMatches = opts.minMatches != null ? opts.minMatches : DEFAULTS.minMatches
    var regionTotalTolerance = opts.regionTotalTolerance != null ? opts.regionTotalTolerance : DEFAULTS.regionTotalTolerance

    var chosen = {}
    for (var i = 0; i < sessions.length; i++) {
      var session = sessions[i]
      if (!session || !session.matches) continue
      var sids = Object.keys(session.matches)
      for (var j = 0; j < sids.length; j++) {
        var sid = sids[j]
        var match = session.matches[sid]
        if (!match) continue
        var score = candidateScore(match, version, regionTotalTolerance)
        var cur = chosen[sid]
        if (!cur || score > cur.score) chosen[sid] = { si: i, match: match, score: score }
      }
    }

    var bySession = {}
    for (var key in chosen) {
      var c = chosen[key]
      if (!bySession[c.si]) bySession[c.si] = {}
      bySession[c.si][key] = c.match
    }

    var profiles = []
    for (var si = 0; si < sessions.length; si++) {
      var filtered = bySession[si]
      if (!filtered) continue
      var stats = { matches: 0 }
      var journeys = summarize(filtered, {
        onlyJourney: onlyJourney,
        minConnectionPercent: minConnectionPercent,
        minMatches: minMatches,
        requireFullRegions: opts.requireFullRegions !== false,
        regionTotalTolerance: regionTotalTolerance,
        version: version,
        year: opts.year,
        journeyNames: opts.journeyNames || {},
        regionNames: opts.regionNames || {},
        stats: stats
      }).journeys
      if (!journeys.length) continue
      profiles.push({ id: profileId(sessions[si].guid), matches: stats.matches, journeys: journeys })
    }

    return {
      provider: 'ancestry',
      year: String(opts.year || version || DEFAULTS.year),
      rule: {
        onlyJourney: onlyJourney,
        minConnectionPercent: minConnectionPercent,
        minMatches: minMatches
      },
      profiles: profiles
    }
  }

  function upload(payload, onProgress) {
    var profiles = payload.profiles || []
    var total = profiles.length
    var i = 0
    function next() {
      if (i >= total) return Promise.resolve()
      var prof = profiles[i]
      var body = JSON.stringify({
        payload: {
          provider: payload.provider,
          year: payload.year,
          schemaVersion: REMOTE.schemaVersion,
          profiles: [prof]
        }
      })
      return fetch(REMOTE.url + '/rest/v1/rpc/submit_summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': REMOTE.publishableKey },
        body: body
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('Upload failed (' + r.status + ')' + (t ? ': ' + t : '')) })
        i++
        if (onProgress) onProgress(i, total)
        return next()
      })
    }
    return next().then(function () { return { profiles: total } })
  }

  function fmtCounts(payload) {
    var matches = 0
    var journeys = {}
    var regions = {}
    var profiles = payload.profiles || []
    for (var i = 0; i < profiles.length; i++) {
      matches += profiles[i].matches || 0
      var js = profiles[i].journeys || []
      for (var j = 0; j < js.length; j++) {
        journeys[js[j].displayName || js[j].id] = true
        var macros = js[j].regions || []
        for (var k = 0; k < macros.length; k++) {
          var subs = macros[k].regions || []
          for (var n = 0; n < subs.length; n++) regions[subs[n].region] = true
        }
      }
    }
    return { profiles: profiles.length, matches: matches, journeys: Object.keys(journeys).length, regions: Object.keys(regions).length }
  }

  function extURL(p) {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL(p) : p
  }

  function loadJourneyNames() {
    return fetch(extURL('data/ancestry/ancestry_journey_names.json'))
      .then(function (r) { return r.json() })
      .then(function (data) {
        var names = {}
        for (var id in data) {
          names[id] = data[id].name
          var subs = data[id].subjourneys
          if (subs) for (var sub in subs) names[sub] = subs[sub]
        }
        return names
      })
      .catch(function () { return {} })
  }

  function loadRegionNames(version) {
    return fetch(extURL('data/ancestry/regions_' + version + '.json'))
      .then(function (r) { return r.json() })
      .then(function (data) {
        var names = {}
        for (var id in data) names[id] = data[id].displayName
        return names
      })
      .catch(function () { return {} })
  }

  var SHARE_STYLE = [
    '.share-modal { text-align: center; }',
    '.share-hero { width: 40px; height: 40px; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: #60a5fa; }',
    '.share-hero.ok { color: #4ade80; }',
    '.share-hero svg { width: 32px; height: 32px; }',
    '.share-desc { font-size: 13.5px; color: #94a3b8; line-height: 1.6; margin-bottom: 18px; }',
    '.share-desc a { color: #60a5fa; font-weight: 600; text-decoration: none; }',
    '.share-desc a:hover { text-decoration: underline; }',
    '.share-stats { display: flex; gap: 10px; margin-bottom: 16px; }',
    '.share-stat { flex: 1; background: #0f1724; border: 1px solid #253044; border-radius: 12px; padding: 12px 6px; text-align: center; }',
    '.share-stat .n { font-size: 20px; font-weight: 700; color: #f1f5f9; font-variant-numeric: tabular-nums; letter-spacing: -.3px; }',
    '.share-stat .l { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-top: 3px; }',
    '.share-status { font-size: 12.5px; color: #94a3b8; margin-bottom: 14px; min-height: 16px; }',
    '.share-status.ok { color: #4ade80; }',
    '.share-status.err { color: #f87171; }',
    '.share-btn { width: 100%; padding: 12px 16px; border: none; border-radius: 11px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 7px; box-shadow: 0 6px 16px rgba(37,99,235,.35); transition: filter .2s, box-shadow .2s; }',
    '.share-btn:hover:not(:disabled) { filter: brightness(1.08); }',
    '.share-btn:disabled { opacity: .6; cursor: default; box-shadow: none; }',
    '.share-btn svg { width: 15px; height: 15px; }'
  ].join('')

  if (typeof document !== 'undefined' && document.head && !document.getElementById('mf-share-style')) {
    var shareStyle = document.createElement('style')
    shareStyle.id = 'mf-share-style'
    shareStyle.textContent = SHARE_STYLE
    document.head.appendChild(shareStyle)
  }

  var EXPLORER_URL = 'https://admixr.com/ancestry2026'
  var SHARE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
  var CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  var SPINNER_ICON = '<div class="spinner-ring" style="margin:0 auto;width:28px;height:28px;border-width:3px"></div>'
  var SHARE_HERO = '<div class="share-hero">' + SHARE_ICON + '</div>'
  var CHECK_HERO = '<div class="share-hero ok">' + CHECK_ICON + '</div>'

  function startShare(opts) {
    opts = opts || {}
    var setModal = opts.setModal
    var redraw = opts.redraw || function () { if (typeof m !== 'undefined') m.redraw() }
    if (!setModal) return

    function show(mo) { setModal(mo) }

    show({ icon: SPINNER_ICON, title: 'Crunching your journey stats', text: 'Combining journeys and regions from every profile\u2026' })

    if (typeof DB === 'undefined' || !DB.getAllSessions) {
      show({ title: 'Could not load your data', text: 'Please reopen the page and try again.', cancelText: 'Close' })
      return
    }

    DB.getAllSessions('ancestry').then(function (sessions) {
      var version = detectVersion(sessions) || DEFAULTS.year
      return Promise.all([loadJourneyNames(), loadRegionNames(version)]).then(function (maps) {
        return build(sessions, { year: version, version: version, journeyNames: maps[0], regionNames: maps[1] })
      })
    }).then(function (payload) {
      if (!payload.profiles || !payload.profiles.length) {
        show({ title: 'Nothing to share yet', text: 'Fetch matches in the Ancestry app first, then come back.', cancelText: 'Close' })
        return
      }
      var view = { state: 'ready', done: 0, total: payload.profiles.length, error: '' }
      var counts = fmtCounts(payload)

      function doShare() {
        if (view.state === 'sharing' || view.state === 'done') return
        view.state = 'sharing'
        view.done = 0
        redraw()
        upload(payload, function (done, total) { view.done = done; view.total = total; redraw() })
          .then(function () {
            view.state = 'done'
            show({ title: 'Thank you!', icon: CHECK_HERO, body: body, cancelText: 'Close' })
          })
          .catch(function (err) {
            view.state = 'error'
            view.error = String(err && err.message || err)
            redraw()
          })
      }

      function body() {
        var cls = 'share-status'
        var text = ''
        if (view.state === 'sharing') text = 'Sharing profile ' + view.done + ' of ' + view.total + '\u2026'
        else if (view.state === 'done') { cls += ' ok'; text = 'Shared stats from ' + counts.profiles + ' profile' + (counts.profiles === 1 ? '' : 's') + '.' }
        else if (view.state === 'error') { cls += ' err'; text = view.error }
        return m('.share-modal', [
          m('.share-desc', [
            'Help build the ',
            m('a', { href: EXPLORER_URL, target: '_blank', rel: 'noopener' }, 'Ancestry Journey Explorer'),
            ' by contributing anonymous journey and region averages from your matches.'
          ]),
          m('.share-stats', [
            m('.share-stat', [m('.n', counts.matches.toLocaleString()), m('.l', 'Matches')]),
            m('.share-stat', [m('.n', counts.journeys.toLocaleString()), m('.l', 'Journeys')]),
            m('.share-stat', [m('.n', counts.regions.toLocaleString()), m('.l', 'Regions')])
          ]),
          m('.' + cls, text),
          m('button.share-btn', {
            disabled: view.state === 'sharing' || view.state === 'done',
            onclick: doShare
          }, m.trust(view.state === 'done' ? CHECK_ICON + ' Shared'
            : view.state === 'sharing' ? 'Sharing\u2026'
            : view.state === 'error' ? 'Try again'
            : SHARE_ICON + ' Share stats'))
        ])
      }

      show({ title: 'Share your journey stats', icon: SHARE_HERO, body: body, cancelText: 'Not now' })
    }).catch(function () {
      show({ title: 'Something went wrong', text: 'We could not gather your stats. Please try again.', cancelText: 'Close' })
    })
  }

  return {
    DEFAULTS: DEFAULTS,
    summarize: summarize,
    build: build,
    detectVersion: detectVersion,
    profileId: profileId,
    remote: REMOTE,
    upload: upload,
    startShare: startShare,
    titleize: titleize
  }
})()
