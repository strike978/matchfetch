var AncestrySummarizer = (function () {
  var DEFAULTS = {
    onlyJourney: true,
    minConnectionPercent: 20,
    minMatches: 20,
    requireFullRegions: true,
    regionTotalTolerance: 0,
    year: '2026'
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

  function download(obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = filename || 'ancestry_journeys_summary.json'
    document.body.appendChild(a)
    a.click()
    setTimeout(function () {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 0)
  }

  return {
    DEFAULTS: DEFAULTS,
    summarize: summarize,
    build: build,
    detectVersion: detectVersion,
    profileId: profileId,
    download: download,
    titleize: titleize
  }
})()
