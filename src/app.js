(function () {
  var s = {
    regionMap: null,
    journeyNameMap: null,
    tests: [],
    selectedGuid: '',
    matchListData: null,
    profileData: {},
    batchEthnicityData: {},
    batchCommunitiesData: {},
    sessionMatches: null,
    filters: { name: '', cmMin: null, cmMax: null, journey: '', journeyOnly: false, regions: [{ region: '', pctMin: null, pctMax: null }] },
    currentPage: 1,
    pageSize: 20,
    hideNames: false,
    showFilterBody: false,
    fetchMsg: '',
    fetchPct: '',
    fetchProgress: 0,
    isFetching: false,
    mode: 'all',
    matchCount: null,
    fetchStateBadge: '',
    showFetchOptions: false,
    fetchComplete: false,
    sortBy: 'cm',
    buttonLabel: null,
    modal: null,
    cmRangeMin: '90',
    cmRangeMax: '400',
    desiredCount: '100',
    statusMsg: '',
    testsLoading: true,
  }

  function setState(o) { Object.assign(s, o); m.redraw() }

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

  function titleize(str) {
    if (!str) return ''
    return str.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase() })
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

  function chunkArray(arr, size) { var c = []; for (var i = 0; i < arr.length; i += size) c.push(arr.slice(i, i + size)); return c }

  function loadRegionMap() {
    return fetch(chrome.runtime.getURL('data/ancestry_region_names.json')).then(function (r) { return r.json() }).then(function (data) {
      var m = {};
      for (var i = 0; i < data.items.length; i++) m[data.items[i].region] = data.items[i].name
      setState({ regionMap: m })
    })
  }

  function loadJourneyNameMap() {
    return fetch(chrome.runtime.getURL('data/ancestry_journey_names.json')).then(function (r) { return r.json() }).then(function (data) {
      var m = {};
      for (var id in data) {
        m[id] = data[id].name
        var subs = data[id].subjourneys
        if (subs) { for (var subId in subs) m[subId] = subs[subId] }
      }
      setState({ journeyNameMap: m })
    })
  }

  function resolveJourneyNames(nodes) {
    if (!s.journeyNameMap) return
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      n.displayName = s.journeyNameMap[n.id] || n.displayName || n.id
      if (n.communities && n.communities.length > 0) resolveJourneyNames(n.communities)
    }
  }

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

  function fetchTests() {
    setState({ tests: [], testsLoading: true, statusMsg: '', matchCount: null, fetchStateBadge: '', fetchMsg: '', isFetching: false })
    apiFetch('https://www.ancestry.com/dna/insights/api/dnaSubnav/tests', { credentials: 'include', mode: 'cors' })
      .then(function (data) { setState({ tests: Array.isArray(data) ? data : [], testsLoading: false }) })
      .catch(function (err) { setState({ statusMsg: friendlyError(err.message), testsLoading: false }) })
  }

  function fetchMatchCount(guid) {
    var url = 'https://www.ancestry.com/discoveryui-matches/parents/list/api/matchCount/' + guid
    var opts = {
      method: 'POST', credentials: 'include', mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ lower: 0, upper: 10 })
    }
    setState({ matchCount: null, matchCountLoading: true })
    apiFetch(url, opts)
      .then(function (data) { setState({ matchCount: data, matchCountLoading: false }) })
      .catch(function (err) { setState({ matchCount: { error: friendlyError(err.message) }, matchCountLoading: false }) })
  }

  var FETCH_DELAY = 500

  function fetchMatchList(guid, mode, params) {
    s.currentPage = 1
    s.matchListData = null
    s.profileData = {}
    s.batchEthnicityData = {}
    s.batchCommunitiesData = {}
    s.sessionMatches = null
    var allMatches = []
    var desiredCount = mode === 'cmRange' || mode === 'all' ? Infinity : (params.desiredCount || 100)
    var currentPage = 1
    var _progressDone = 0
    var _progressTotal = mode === 'cmRange' || mode === 'all' ? 300 : desiredCount * 3

    function setBadgeFetching() { try { chrome.action.setBadgeText({ text: '\u21bb' }); chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' }) } catch (e) { } }

    function clearBadge() { try { chrome.action.setBadgeText({ text: '' }) } catch (e) { } }

    function saveState() {
      DB.saveFetchState(guid, 0, mode, params, currentPage)
      var label = mode === 'cmRange' ? allMatches.length + ' [' + params.range + ' cM] page ' + (currentPage - 1) : mode === 'all' ? allMatches.length + ' all page ' + (currentPage - 1) : allMatches.length + '/' + desiredCount + ' page ' + (currentPage - 1)
      setState({ fetchStateBadge: '\u21bb ' + label })
    }

    function findIncompleteSampleIds() {
      var result = []
      for (var i = 0; i < allMatches.length; i++) {
        var sid = allMatches[i].sampleId
        if (!sid) continue
        if (!s.batchEthnicityData[sid] || !s.batchCommunitiesData[sid]) result.push(sid)
      }
      return result
    }

    var resumePromise = DB.getFetchState(guid).then(function (fs) {
      if (fs && fs.status === 0) {
        return DB.getSession(guid).then(function (session) {
          if (session && session.matches) {
            var sm = session.matches
            var sids = Object.keys(sm)
            for (var i = 0; i < sids.length; i++) {
              var m = sm[sids[i]]
              allMatches.push({ sampleId: sids[i], relationship: m.relationship || {}, createdDate: m.createdDate || null })
              s.profileData[sids[i]] = { matchName: m.matchName, matchNameInitials: m.matchNameInitials, displayGender: m.displayGender, photoUrl: m.photoUrl }
              if (m.journeys && m.journeys.length) {
                s.batchCommunitiesData[sids[i]] = { branches: m.journeys }
                resolveJourneyNames(s.batchCommunitiesData[sids[i]].branches)
                if (sm[sids[i]]) sm[sids[i]].journeys = s.batchCommunitiesData[sids[i]].branches
              }
              if (m.regions) s.batchEthnicityData[sids[i]] = { regions: m.regions }
            }
            s.matchListData = { matchList: allMatches }
            s.sessionMatches = sm
            currentPage = fs.nextPage || 1
            mode = fs.mode || mode
            params = fs.params || params
            desiredCount = mode === 'cmRange' || mode === 'all' ? Infinity : (params.desiredCount || 100)
            setState({ matchListData: s.matchListData, profileData: s.profileData, batchEthnicityData: s.batchEthnicityData, batchCommunitiesData: s.batchCommunitiesData, sessionMatches: s.sessionMatches })
          }
        })
      }
    })

    function fetchPage() {
      var msg = mode === 'cmRange' ? 'Fetching match list for range ' + params.range + ' cM... (' + allMatches.length + ' matches)' : mode === 'all' ? 'Fetching all matches... (' + allMatches.length + ' matches)' : 'Fetching match list... (' + allMatches.length + '/' + desiredCount + ')'
      setState({ fetchMsg: msg })
      var url = 'https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/' + guid + '?itemsPerPage=100&currentPage=' + currentPage
      if (mode === 'cmRange') url += '&sharedDna=' + params.range
      debugLog('page ' + currentPage + ' mode=' + mode + ' url=' + url)
      return apiFetch(url, { credentials: 'include', mode: 'cors', headers: { 'Accept': 'application/json' } })
        .then(function (data) {
          var matches = data.matchList
          if (!Array.isArray(matches)) return nextPage(false)
          var newSids = []
          var sidIndex = {}
          for (var i = 0; i < allMatches.length; i++) sidIndex[allMatches[i].sampleId] = true
          var limit = mode === 'cmRange' || mode === 'all' ? Infinity : desiredCount
          for (var i = 0; i < matches.length && allMatches.length < limit; i++) {
            var sid = matches[i].sampleId
            if (!sid || sidIndex[sid]) continue
            sidIndex[sid] = true
            allMatches.push(matches[i])
            newSids.push(sid)
          }
          if (allMatches.length > desiredCount) allMatches = allMatches.slice(0, desiredCount)
          s.matchListData = { matchList: allMatches }
          setState({ matchListData: s.matchListData })
          if (mode === 'count') { _progressDone += newSids.length; setProgress(_progressDone, _progressTotal) }
          var hasMore
          if (mode === 'cmRange' || mode === 'all') {
            if (data.isLastPage === true) hasMore = false
            else if (data.isLastPage === undefined) hasMore = matches.length >= 100
            else hasMore = matches.length > 0
          } else {
            hasMore = matches.length >= 100
          }
          debugLog('  got ' + newSids.length + ' new, total=' + allMatches.length + ' next=' + (currentPage + 1) + ' hasMore=' + hasMore + ' isLastPage=' + data.isLastPage)
          if (newSids.length === 0) {
            currentPage++
            saveState()
            return nextPage(false)
          }
          return fetchProfileData(guid, newSids).then(function () {
            storeMatchData(guid, allMatches)
            currentPage++
            saveState()
            return processPageChunks(guid, newSids)
          }).then(function () {
            return nextPage(hasMore)
          })
        })
    }

    function nextPage(hasMore) {
      var remaining = mode === 'cmRange' || mode === 'all' ? 1 : (desiredCount - allMatches.length)
      debugLog('nextPage: hasMore=' + hasMore + (mode === 'cmRange' ? '' : ' remaining=' + remaining))
      if (remaining > 0 && hasMore) return delay(FETCH_DELAY).then(fetchPage)
    }

    function processPageChunks(guid, pageSampleIds) {
      var chunks = chunkArray(pageSampleIds, 24)
      var chain = Promise.resolve()
      for (var ci = 0; ci < chunks.length; ci++) {
        chain = chain.then((function (chunk, idx) {
          return function () { return processChunk24(guid, chunk, idx * 24 + 1, pageSampleIds.length) }
        })(chunks[ci], ci))
      }
      return chain
    }

    function processChunk24(guid, chunk, rangeStart, total) {
      setState({ fetchMsg: 'Fetching regions for matches ' + rangeStart + '-' + (rangeStart + chunk.length - 1) + ' of ' + total + '...' })
      return fetchBatchEthnicity(guid, chunk).then(function (ethData) {
        for (var k in ethData) s.batchEthnicityData[k] = ethData[k]
        if (s.regionMap) {
          for (var k in ethData) {
            var regions = ethData[k] && ethData[k].regions
            if (!regions) continue
            for (var ri = 0; ri < regions.length; ri++) regions[ri].displayName = s.regionMap[regions[ri].key] || regions[ri].key
          }
        }
        setState({ batchEthnicityData: s.batchEthnicityData })
        if (mode === 'count') { _progressDone += chunk.length; setProgress(_progressDone, _progressTotal) }
        return delay(FETCH_DELAY)
      }).then(function () {
        setState({ fetchMsg: 'Fetching journeys for matches ' + rangeStart + '-' + (rangeStart + chunk.length - 1) + ' of ' + total + '...' })
        return fetchBatchCommunities(guid, chunk)
      }).then(function (comData) {
        for (var k in comData) s.batchCommunitiesData[k] = comData[k]
        var sKeys = Object.keys(s.batchCommunitiesData)
        for (var si = 0; si < sKeys.length; si++) {
          var branches = s.batchCommunitiesData[sKeys[si]] && s.batchCommunitiesData[sKeys[si]].branches
          if (branches) resolveJourneyNames(branches)
        }
        storeMatchData(guid, s.matchListData && s.matchListData.matchList)
        if (mode === 'count') { _progressDone += chunk.length; setProgress(_progressDone, _progressTotal) }
        setState({ batchCommunitiesData: s.batchCommunitiesData })
      })
    }

  function storeMatchData(guid, matchList) {
    if (!s.sessionMatches) s.sessionMatches = {}
    if (matchList) {
      for (var mi = 0; mi < matchList.length; mi++) {
        var sid = matchList[mi].sampleId
        if (!sid) continue
        if (!s.sessionMatches[sid]) s.sessionMatches[sid] = {}
        if (s.profileData && s.profileData[sid]) {
          s.sessionMatches[sid].matchName = s.profileData[sid].matchName
          s.sessionMatches[sid].matchNameInitials = s.profileData[sid].matchNameInitials
          s.sessionMatches[sid].displayGender = s.profileData[sid].displayGender
          s.sessionMatches[sid].photoUrl = s.profileData[sid].photoUrl
        }
        if (s.batchEthnicityData && s.batchEthnicityData[sid]) s.sessionMatches[sid].regions = s.batchEthnicityData[sid].regions
        if (s.batchCommunitiesData && s.batchCommunitiesData[sid]) s.sessionMatches[sid].journeys = s.batchCommunitiesData[sid].branches
      }
    }
    setState({ sessionMatches: s.sessionMatches })
    if (typeof DB !== 'undefined') DB.saveSession(guid, matchList, s.profileData, s.batchEthnicityData, s.batchCommunitiesData)
  }

    function finishFetch() {
      clearBadge()
      setState({ fetchMsg: '', fetchPct: '', isFetching: false, fetchComplete: true, buttonLabel: null })
      DB.saveFetchState(guid, 1, mode, params)
      var label = mode === 'cmRange' ? '\u2713 ' + allMatches.length + ' [' + params.range + ' cM]' : mode === 'all' ? '\u2713 ' + allMatches.length + ' all matches' : '\u2713 ' + allMatches.length + '/' + (params.desiredCount || '?') + ' matches'
      setState({ fetchStateBadge: label })
      try {
        chrome.notifications.create({
          type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: 'MatchFetch',
          message: mode === 'cmRange' ? 'Finished fetching ' + allMatches.length + ' matches in range ' + params.range + ' cM' : 'Finished fetching ' + allMatches.length + ' matches'
        })
      } catch (e) { console.log('Notification error:', e) }
    }

    resumePromise.then(function () {
      setBadgeFetching()
      saveState()
      if (mode === 'count') { _progressDone = allMatches.length; setProgress(_progressDone, _progressTotal) }
      var incomplete = findIncompleteSampleIds()
      debugLog('resume: mode=' + mode + ' have=' + allMatches.length + (mode === 'cmRange' ? '' : ' target=' + desiredCount) + ' incomplete=' + incomplete.length)
      if (allMatches.length >= desiredCount) {
        if (incomplete.length === 0) return finishFetch()
        setState({ fetchMsg: 'Resuming: processing data for ' + incomplete.length + ' matches...' })
        return processPageChunks(guid, incomplete).then(finishFetch).catch(function (err) {
          clearBadge(); setState({ isFetching: false, fetchMsg: '' }); restoreFetchUI(guid)
        })
      }
      var chain = Promise.resolve()
      if (incomplete.length > 0) {
        setState({ fetchMsg: 'Resuming: processing ' + incomplete.length + ' existing matches first...' })
        chain = processPageChunks(guid, incomplete)
      }
      return chain.then(function () { return fetchPage() }).then(finishFetch).catch(function (err) {
        clearBadge(); setState({ isFetching: false, fetchMsg: '' }); restoreFetchUI(guid)
      })
    })
  }

  function restoreFetchUI(guid) {
    DB.getFetchState(guid).then(function (fs) {
      if (fs && fs.status === 0) {
        if (fs.mode === 'cmRange') {
          setState({ mode: 'cmRange', cmRangeMin: '', cmRangeMax: '' })
          var parts = (fs.params && fs.params.range || '').split('-')
          if (parts.length === 2) setState({ cmRangeMin: parts[0], cmRangeMax: parts[1] })
        } else if (fs.mode === 'all') {
          setState({ mode: 'all' })
        } else {
          var count = fs.params && fs.params.desiredCount || 0
          if (count > 0) setState({ mode: 'count', desiredCount: String(count) })
        }
        setState({ showFetchOptions: false, buttonLabel: 'Resume', statusMsg: 'Previous fetch incomplete \u2014 click Resume to continue' })
        DB.getSession(guid).then(function (session) {
          var c = session && session.matches ? Object.keys(session.matches).length : 0
          setState({ fetchStateBadge: '\u21bb ' + c + ' fetched (page ' + (fs.nextPage || 1) + ')' })
        })
      } else if (fs && fs.status === 1) {
        DB.getSession(guid).then(function (session) {
          var c = session && session.matches ? Object.keys(session.matches).length : 0
          setState({ showFetchOptions: false, fetchComplete: true, fetchStateBadge: '\u2713 ' + c + ' matches' })
        })
      } else {
        setState({ showFetchOptions: false, fetchComplete: false, buttonLabel: null, fetchStateBadge: '' })
      }
    })
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

  function fetchProfileData(guid, sampleIds) {
    return new Promise(function (resolve, reject) {
      var chunks = chunkArray(sampleIds, 100)
      var allProfiles = {}
      var idx = 0

      function next() {
        if (idx >= chunks.length) {
          for (var k in allProfiles) s.profileData[k] = allProfiles[k]
          setState({ profileData: s.profileData })
          resolve()
          return
        }
        setState({ fetchMsg: 'Fetching profile data... (' + (idx * 100 + 1) + '-' + Math.min((idx + 1) * 100, sampleIds.length) + ' of ' + sampleIds.length + ')' })
        apiFetch('https://www.ancestry.com/discoveryui-matches/cluster/api/profileData/' + guid, {
          method: 'POST', credentials: 'include', mode: 'cors',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ matchSampleIds: chunks[idx] })
        }).then(function (profiles) {
          for (var k in profiles) allProfiles[k] = profiles[k]
          idx++
          delay(FETCH_DELAY).then(next)
        }).catch(reject)
      }
      next()
    })
  }

  function fetchBatchEthnicity(guid, sampleIds) {
    return apiFetch('https://www.ancestry.com/dna/origins/secure/compare/' + guid + '/batchEthnicity', {
      method: 'PUT', credentials: 'include', mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(sampleIds)
    })
  }

  function fetchBatchCommunities(guid, sampleIds) {
    return apiFetch('https://www.ancestry.com/dna/origins/secure/compare/' + guid + '/batchCommunities', {
      method: 'POST', credentials: 'include', mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(sampleIds)
    })
  }

  function debugLog(msg) {
    console.log('[MatchFetch] ' + msg)
  }

  function matchesFilter(m) {
    var p = s.profileData && s.profileData[m.sampleId] || {}
    var f = s.filters
    if (f.name) {
      var n = (p.matchName || '').toLowerCase()
      if (n.indexOf(f.name.toLowerCase()) === -1 && (p.matchNameInitials || '').toLowerCase().indexOf(f.name.toLowerCase()) === -1) return false
    }
    if (f.cmMin != null || f.cmMax != null) {
      var cm = m.relationship && m.relationship.sharedCentimorgans
      if (cm == null) return false
      if (f.cmMin != null && cm < f.cmMin) return false
      if (f.cmMax != null && cm > f.cmMax) return false
    }
    if (f.journey) {
      var sm = s.sessionMatches && s.sessionMatches[m.sampleId]
      var branches = sm && sm.journeys
      var found = false
      if (branches) {
        for (var bi = 0; bi < branches.length; bi++) {
          if ((branches[bi].displayName || '') === f.journey) { found = true; break }
        }
        if (f.journeyOnly && branches.length > 1) found = false
      }
      if (!found) return false
    }
    var activeRegions = s._activeRegionFilters
    if (activeRegions && activeRegions.length) {
      var sm = s.sessionMatches && s.sessionMatches[m.sampleId]
      var regs = sm && sm.regions
      for (var fi = 0; fi < activeRegions.length; fi++) {
        var rf = activeRegions[fi]
        if (!rf.region) continue
        var ok = false
        if (rf.region.indexOf('__macro__') === 0) {
          var mkey = rf.region.slice(9)
          var totalPct = 0
          if (regs) {
            for (var ri = 0; ri < regs.length; ri++) {
              if ((regs[ri].macroRegionKey || '') === mkey) totalPct += regs[ri].percentage || 0
            }
          }
          if (totalPct > 0) {
            ok = true
            if (rf.pctMin != null && totalPct < rf.pctMin) ok = false
            if (rf.pctMax != null && totalPct > rf.pctMax) ok = false
          }
        } else {
          if (regs) {
            for (var ri = 0; ri < regs.length; ri++) {
              if ((regs[ri].displayName || regs[ri].key || '') === rf.region) {
                ok = true
                var pct = regs[ri].percentage
                if (rf.pctMin != null && (pct == null || pct < rf.pctMin)) ok = false
                if (rf.pctMax != null && (pct == null || pct > rf.pctMax)) ok = false
                if (ok) break
              }
            }
          }
        }
        if (!ok) return false
      }
    }
    return true
  }

  var _cachedRegionOpts = null

  function buildRegionOptions() {
    var opts = [{ value: '', label: 'All' }]
    if (!s.sessionMatches) return opts
    var macroGroups = {}
    var sids = Object.keys(s.sessionMatches)
    for (var i = 0; i < sids.length; i++) {
      var sm = s.sessionMatches[sids[i]]
      var regs = sm && sm.regions
      if (regs) {
        for (var ri = 0; ri < regs.length; ri++) {
          var name = regs[ri].displayName || regs[ri].key
          var mkey = regs[ri].macroRegionKey || 'other'
          if (!name) continue
          if (!macroGroups[mkey]) macroGroups[mkey] = {}
          macroGroups[mkey][name] = true
        }
      }
    }
    var macroKeys = Object.keys(macroGroups).sort()
    for (var mi = 0; mi < macroKeys.length; mi++) {
      var mkey = macroKeys[mi]
      var names = Object.keys(macroGroups[mkey]).sort()
      opts.push({ value: '__macro__' + mkey, label: titleize(mkey), isMacro: true })
      for (var ni = 0; ni < names.length; ni++) opts.push({ value: names[ni], label: '\u00A0\u00A0' + names[ni] })
    }
    return opts
  }

  function getRegionOptions() {
    if (!_cachedRegionOpts) _cachedRegionOpts = buildRegionOptions()
    return _cachedRegionOpts
  }

  function refreshRegionOptions() {
    _cachedRegionOpts = buildRegionOptions()
  }

  var _cachedJourneyOpts = null

  function buildJourneyOptions() {
    var opts = [{ value: '', label: 'All' }]
    if (!s.sessionMatches) return opts
    var known = {}
    var sids = Object.keys(s.sessionMatches)
    for (var i = 0; i < sids.length; i++) {
      var branches = s.sessionMatches[sids[i]] && s.sessionMatches[sids[i]].journeys
      if (branches) {
        for (var bi = 0; bi < branches.length; bi++) {
          var name = branches[bi].displayName
          if (name && !known[name]) { known[name] = true; opts.push({ value: name, label: name }) }
        }
      }
    }
    if (opts.length > 1) {
      var all = opts.shift()
      opts.sort(function (a, b) { return a.label.localeCompare(b.label) })
      opts.unshift(all)
    }
    return opts
  }

  function getJourneyOptions() {
    if (!_cachedJourneyOpts) _cachedJourneyOpts = buildJourneyOptions()
    return _cachedJourneyOpts
  }

  function refreshJourneyOptions() {
    _cachedJourneyOpts = buildJourneyOptions()
  }

  function readFilters() {
    var el = document.getElementById('filterName')
    var f = s.filters
    f.name = el ? el.value : ''
    f.cmMin = parseFloat(document.getElementById('filterCmMin') ? document.getElementById('filterCmMin').value : '') || null
    f.cmMax = parseFloat(document.getElementById('filterCmMax') ? document.getElementById('filterCmMax').value : '') || null
    var journeyEl = document.getElementById('filterJourney')
    f.journey = journeyEl ? journeyEl.value : ''
    f.journeyOnly = document.getElementById('filterJourneyOnly') ? document.getElementById('filterJourneyOnly').checked : false
    var rows = document.querySelectorAll('#regionFilters .region-row')
    s._activeRegionFilters = []
    for (var ri = 0; ri < rows.length; ri++) {
      var rowSel = rows[ri].querySelector('.region-select')
      var pctMin = rows[ri].querySelector('.region-pct-min')
      var pctMax = rows[ri].querySelector('.region-pct-max')
      var region = rowSel ? rowSel.value : ''
      if (!region) continue
      s._activeRegionFilters.push({ region: region, pctMin: parseFloat(pctMin.value) || null, pctMax: parseFloat(pctMax.value) || null })
    }
  }

  function applyFilterChange() {
    readFilters()
    s.currentPage = 1
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
              text: 'This will overwrite your entire database with ' + data.length + ' kit(s) from this file. This cannot be undone.',
              confirmText: 'Import',
              cancelText: 'Cancel',
              onConfirm: function () {
                setState({ statusMsg: 'Importing...' })
                DB.importDatabase(data).then(function (count) {
                  setState({ statusMsg: 'Imported ' + count + ' kit(s)' })
                  fetchTests()
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
        m.redraw()
      })
      Promise.all([loadRegionMap(), loadJourneyNameMap()]).then(fetchTests)
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
      if (s.testsLoading) return m('.spinner', [m('.spinner-ring'), m('.spinner-text', 'Loading...')])
      if (s.tests.length === 0 && s.statusMsg) return m('.error', s.statusMsg)
      if (s.tests.length === 0) return m('.empty', 'No tests found')
      return [
        m('.label', [
          'Select a kit',
          s.matchCount ? m('.badge', [
            m.trust('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="16" height="16" fill="none"><circle cx="10" cy="9" r="3.5" stroke="#94a3b8" stroke-width="2"/><circle cx="18" cy="9" r="3.5" stroke="#94a3b8" stroke-width="2"/><path d="M4 23c0-4 2-6.5 6-6.5s6 2.5 6 6.5" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/><path d="M14 23c0-4 2-6.5 6-6.5s6 2.5 6 6.5" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/></svg>'),
            m('span.count', s.matchCount.count ? s.matchCount.count.toLocaleString() : '?'),
            ' MATCHES'
          ]) : null,
          s.matchCount && s.matchCount.error ? m('.badge', { style: { color: '#f87171' } }, s.matchCount.error) : null,
          s.matchCountLoading ? m('.badge', m('.spinner-ring', { style: { width: '12px', height: '12px', borderWidth: '2px', display: 'inline-block', verticalAlign: 'middle' } })) : null,
          s.fetchStateBadge ? m('.badge#fetchStateBadge', s.fetchStateBadge) : null
        ]),
        m('.select-row', [
          m('select#testSelect', {
            value: s.selectedGuid,
            onchange: function (e) { onKitSelect(e.target.value) }
          }, [
            m('option', { value: '' }, 'Choose a kit...'),
            s.tests.map(function (t, i) {
              var name = t.subjectName || t.displayName || t.name || 'Kit ' + (i + 1)
              var guid = t.testGuid || t.testId || t.guid || t.id || ''
              return m('option', { value: guid }, name)
            })
          ]),
          s.selectedGuid ? m('button.clear-btn#clearKitBtn', {
            title: 'Clear kit data',
            onclick: function () {
              s.modal = {
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
                title: 'Clear kit data?',
                text: 'This will remove all matches, regions, and journeys for this kit from local storage.',
                confirmText: 'Clear',
                cancelText: 'Cancel',
                onConfirm: function () {
                  DB.deleteSession(s.selectedGuid).then(function () { return DB.deleteFetchState(s.selectedGuid) }).then(function () {
                    s.matchListData = null
                    s.sessionMatches = null
                    s.profileData = {}
                    s.batchEthnicityData = {}
                    s.batchCommunitiesData = {}
                    s.filters.regions = []
                    s.fetchStateBadge = ''
                    s.showFetchOptions = false
                    s.currentPage = 1
                    setState({ matchListData: null, sessionMatches: null, profileData: {}, batchEthnicityData: {}, batchCommunitiesData: {}, filters: { name: '', cmMin: null, cmMax: null, journey: '', journeyOnly: false, regions: [{ region: '', pctMin: null, pctMax: null }] }, fetchStateBadge: '', showFetchOptions: false, fetchComplete: false, buttonLabel: null, currentPage: 1, statusMsg: '' })
                    document.getElementById('filterJourney').innerHTML = '<option value="">All</option>'
                  })
                }
              }
              m.redraw()
            }
          }, m.trust('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>')) : null
        ]),
        m('#fetchGroup', s.selectedGuid && !s.isFetching && !s.fetchComplete ? [
          !s.buttonLabel ? m('.fetch-toggle', {
            onclick: function () { setState({ showFetchOptions: !s.showFetchOptions, mode: s.showFetchOptions ? 'all' : s.mode }) }
          }, [
            m('span.fetch-arrow', { style: { transform: s.showFetchOptions ? 'rotate(90deg)' : '' } }, '\u25B6'),
            ' Fetch options'
          ]) : null,
          s.showFetchOptions ? m('#fetchOptions', [
            m('.mode-toggle', [
              m('button.mode-btn', { class: s.mode === 'count' ? 'active' : '', 'data-mode': 'count', onclick: function () { setState({ mode: 'count' }) } }, 'Count'),
              m('button.mode-btn', { class: s.mode === 'cmRange' ? 'active' : '', 'data-mode': 'cmRange', onclick: function () { setState({ mode: 'cmRange' }) } }, 'cM Range'),
            ]),
            m('.fetch-row#countModeRow', { style: { display: s.mode === 'count' ? '' : 'none' } }, [
              m('label.input-label', ['Matches ', m('input#matchCountInput.count-input', { type: 'number', value: s.desiredCount, min: '1', step: '1', oninput: function (e) { s.desiredCount = e.target.value } })])
            ]),
            m('.fetch-row#cmRangeModeRow', { style: { display: s.mode === 'cmRange' ? '' : 'none' } }, [
              m('label.input-label', ['Min ', m('input#cmRangeMin.count-input', { type: 'number', value: s.cmRangeMin, min: '0', oninput: function (e) { s.cmRangeMin = e.target.value } })]),
              m('label.input-label', ['Max ', m('input#cmRangeMax.count-input', { type: 'number', value: s.cmRangeMax, min: '0', oninput: function (e) { s.cmRangeMax = e.target.value } })]),
            ]),
          ]) : null,
          m('button.btn.fetch-list-btn#fetchListBtn', {
            disabled: s.isFetching,
            onclick: function () {
              if (s.isFetching) return
              s.isFetching = true
              s.statusMsg = ''
              m.redraw()
              if (s.mode === 'cmRange') {
                var min = s.cmRangeMin
                var max = s.cmRangeMax
                if (min && max) fetchMatchList(s.selectedGuid, 'cmRange', { range: min + '-' + max })
              } else if (s.mode === 'all') {
                fetchMatchList(s.selectedGuid, 'all', {})
              } else {
                fetchMatchList(s.selectedGuid, 'count', { desiredCount: parseInt(s.desiredCount, 10) || 100 })
              }
            }
          }, s.isFetching ? [m('.spinner-ring', { style: { width: '16px', height: '16px', borderWidth: '2px' } }), ' Fetching...'] : [m.trust('<span>&#x25B6;</span>'), ' ' + (s.buttonLabel || 'Fetch')]),
        ] : null),
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
      var list = s.matchListData && s.matchListData.matchList
      if (!list) return null
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
            m('label.filter-group', ['Name ',         m('input#filterName.filter-input', { type: 'text', placeholder: 'Filter by name', oninput: function () { applyFilterChange(); m.redraw() } })]),
            m('label.filter-group', [
              'cM ',
              m('input#filterCmMin.filter-input.filter-cm', { type: 'number', placeholder: 'Min', oninput: function () { applyFilterChange(); m.redraw() } }),
              m('span.filter-sep', '\u2013'),
              m('input#filterCmMax.filter-input.filter-cm', { type: 'number', placeholder: 'Max', oninput: function () { applyFilterChange(); m.redraw() } })
            ])
          ]),
          m('.filter-row', [
            m('span.filter-group', [
              'Journey ',
              m('select#filterJourney.filter-select', { value: s.filters.journey, onfocus: function () { refreshJourneyOptions(); m.redraw() }, onchange: function (e) { s.filters.journey = e.target.value; applyFilterChange(); m.redraw() } }, [
                getJourneyOptions().map(function (o) { return m('option', { value: o.value }, o.label) })
              ]),
              m('label.filter-check', [
                m('input#filterJourneyOnly', { type: 'checkbox', onchange: function () { applyFilterChange(); m.redraw() } }),
                m('span.check-mark'),
                ' Only this'
              ])
            ]),
            m('span.filter-group', [
              'Region ',
              m('span#regionFilters', renderRegionFilterRows()),
              m('button#addRegionRow.topbar-btn', {
                style: { fontSize: '14px', padding: '2px 10px' },
                onclick: function () {
                  s.filters.regions.push({ region: '', pctMin: null, pctMax: null })
                  m.redraw()
                }
              }, '+')
            ]),
            m('span#filterReset.filter-clear', {
              onclick: function () {
                document.getElementById('filterName').value = ''
                document.getElementById('filterCmMin').value = ''
                document.getElementById('filterCmMax').value = ''
                document.getElementById('filterJourney').value = ''
                document.getElementById('filterJourneyOnly').checked = false
                _cachedJourneyOpts = null
                readFilters()
                s.filters.regions = [{ region: '', pctMin: null, pctMax: null }]
                s.currentPage = 1
                m.redraw()
              }
            }, 'Clear filters')
          ])
        ])
      ])
    }
  }

  function renderRegionFilterRows() {
    var filters = s.filters.regions && s.filters.regions.length ? s.filters.regions : [{ region: '', pctMin: null, pctMax: null }]
    var opts = getRegionOptions()
    return filters.map(function (f, idx) {
      return m('span.region-row', { key: idx, 'data-idx': idx }, [
        m('select.region-select', {
          'data-idx': idx,
          value: f.region,
          onfocus: function () { refreshRegionOptions(); m.redraw() },
          onchange: function (e) {
            s.filters.regions[idx] = s.filters.regions[idx] || { region: '', pctMin: null, pctMax: null }
            s.filters.regions[idx].region = e.target.value
            applyFilterChange()
            m.redraw()
          }
        }, opts.map(function (o) { return m('option', { value: o.value }, o.label) })),
        m('span.filter-sep', { style: { margin: '0 2px' } }, '%'),
        m('input.region-pct-min.filter-input.filter-cm', {
          type: 'number', placeholder: 'Min',
          value: f.pctMin || '',
          oninput: function (e) {
            s.filters.regions[idx] = s.filters.regions[idx] || { region: '', pctMin: null, pctMax: null }
            s.filters.regions[idx].pctMin = parseFloat(e.target.value) || null
            applyFilterChange()
            m.redraw()
          }
        }),
        m('span.filter-sep', '\u2013'),
        m('input.region-pct-max.filter-input.filter-cm', {
          type: 'number', placeholder: 'Max',
          value: f.pctMax || '',
          oninput: function (e) {
            s.filters.regions[idx] = s.filters.regions[idx] || { region: '', pctMin: null, pctMax: null }
            s.filters.regions[idx].pctMax = parseFloat(e.target.value) || null
            applyFilterChange()
            m.redraw()
          }
        }),
        m('button.region-remove.topbar-btn', {
          'data-idx': idx,
          style: { fontSize: '14px', padding: '2px 8px', display: filters.length === 1 ? 'none' : '' },
          onclick: function () {
            s.filters.regions.splice(idx, 1)
            s.currentPage = 1
            m.redraw()
          }
        }, '\u2212')
      ])
    })
  }

  function sortMatches(a, b) {
    if (s.sortBy === 'cm') return (b.relationship && b.relationship.sharedCentimorgans || 0) - (a.relationship && a.relationship.sharedCentimorgans || 0)
    return (b.createdDate || 0) - (a.createdDate || 0)
  }

  var MatchList = {
    view: function () {
      var list = s.matchListData && s.matchListData.matchList
      if (!list) return m('#matchListResult')
      readFilters()
      var sorted = list.slice().sort(sortMatches)
      var filtered = sorted.filter(matchesFilter)
      var start = (s.currentPage - 1) * s.pageSize
      var end = Math.min(start + s.pageSize, filtered.length)
      var total = list.length
      var shown = filtered.length
      var page = filtered.slice(start, end)
      var totalPages = Math.max(1, Math.ceil(filtered.length / s.pageSize))
      if (s.currentPage > totalPages) s.currentPage = totalPages
      var cards = page.map(function (match) { return m(MatchCard, { match: match, guid: s.selectedGuid }) })
      return m('#matchListResult', [
        m('.sort-bar', [
          m('span.sort-label', 'Sort by:'),
          m('button.sort-btn' + (s.sortBy === 'cm' ? '.active' : ''), { onclick: function () { setState({ sortBy: 'cm', currentPage: 1 }) } }, 'Relationship'),
          m('button.sort-btn' + (s.sortBy === 'date' ? '.active' : ''), { onclick: function () { setState({ sortBy: 'date', currentPage: 1 }) } }, 'Date')
        ]),
        shown < total ? m('.match-count', ['Showing ', m('strong', shown), ' of ', m('strong', total), ' matches']) : null,
        m('.cards', cards),
        totalPages > 1 ? m(Pagination, { currentPage: s.currentPage, totalPages: totalPages }) : null
      ])
    }
  }

  var MatchCard = {
    view: function (vnode) {
      var matchObj = vnode.attrs.match
      var guid = vnode.attrs.guid
      var p = s.profileData && s.profileData[matchObj.sampleId] || {}
      var date = new Date(matchObj.createdDate)
      var dateStr = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear()
      var r = matchObj.relationship || {}
      var gc = 'gender-n'
      if (p.displayGender === 'M') gc = 'gender-m'
      else if (p.displayGender === 'F') gc = 'gender-f'
      var sm = s.sessionMatches && s.sessionMatches[matchObj.sampleId]
      var journeys = sm && sm.journeys
      return m('.card.match-card', {
        'data-guid': guid,
        'data-sample': matchObj.sampleId,
        onclick: function () { if (guid && matchObj.sampleId) window.open('match.html?guid=' + guid + '&sampleId=' + matchObj.sampleId + (s.hideNames ? '&hideNames=1' : ''), '_blank') }
      }, [
        m('.card-top', [
          p.photoUrl ? m('img.avatar', { src: p.photoUrl }) : m('.avatar.avatar-initials.' + gc, p.matchNameInitials || '?'),
          m('span.card-name', s.hideNames ? (p.matchNameInitials || '??') : (p.matchName || 'Unknown'))
        ]),
        m('.card-details', buildRelText(r)),
        journeys && journeys.length > 0 ? m('.journey-strip', renderJourneyPills(journeys)) : null
      ])
    }
  }

  function buildRelText(r) {
    var parts = []
    if (r.sharedCentimorgans) parts.push(m('span', [m('span.num', r.sharedCentimorgans), ' cM']))
    if (r.sharedCentimorgans && r.numSharedSegments) parts.push(' across ')
    if (r.numSharedSegments) parts.push(m('span', [m('span.num', r.numSharedSegments), ' segments']))
    return parts.length ? m('.rel-text', parts) : null
  }

  function renderJourneyPills(journeys) {
    var sorted = journeys.slice().sort(function (a, b) { return (b.connectionPercent || 0) - (a.connectionPercent || 0) })
    var maxPills = 3
    var pills = sorted.slice(0, maxPills).map(function (j) {
      return m('span.journey-pill.' + (j.connection || '').toLowerCase(), [
        m('span.jp-name', j.displayName || j.id || ''),
        ' ',
        m('span.jp-pct', (j.connectionPercent || '?') + '%')
      ])
    })
    if (sorted.length > maxPills) pills.push(m('span', { style: { fontSize: '10px', color: '#64748b', padding: '1px 4px' } }, '+' + (sorted.length - maxPills) + ' more'))
    return pills
  }

  function onKitSelect(guid) {
    s.selectedGuid = guid
    s.matchListData = null
    s.sessionMatches = null
    s.profileData = {}
    s.batchEthnicityData = {}
    s.batchCommunitiesData = {}
    s.fetchStateBadge = ''
    s.statusMsg = ''
    s.currentPage = 1
    s.filters = { name: '', cmMin: null, cmMax: null, journey: '', journeyOnly: false, regions: [{ region: '', pctMin: null, pctMax: null }] }
    s.buttonLabel = null
    s.fetchComplete = false
    m.redraw()
    if (guid) {
      fetchMatchCount(guid)
      DB.getSession(guid).then(function (session) {
        if (session && session.matches) {
          s.sessionMatches = session.matches
          var matchList = []
          var sampleIds = Object.keys(session.matches)
          for (var si = 0; si < sampleIds.length; si++) {
            var m2 = session.matches[sampleIds[si]]
            matchList.push({ sampleId: sampleIds[si], relationship: m2.relationship || {}, createdDate: m2.createdDate || null })
          }
          if (matchList.length > 0) {
            s.matchListData = { matchList: matchList }
            s.batchCommunitiesData = {}
            s.batchEthnicityData = {}
            s.profileData = {}
            for (var si = 0; si < sampleIds.length; si++) {
              var m2 = session.matches[sampleIds[si]]
              if (m2.journeys && m2.journeys.length > 0) {
                s.batchCommunitiesData[sampleIds[si]] = { branches: m2.journeys }
                resolveJourneyNames(s.batchCommunitiesData[sampleIds[si]].branches)
                if (s.sessionMatches && s.sessionMatches[sampleIds[si]]) s.sessionMatches[sampleIds[si]].journeys = s.batchCommunitiesData[sampleIds[si]].branches
              }
              if (m2.regions && m2.regions.length > 0) s.batchEthnicityData[sampleIds[si]] = { regions: m2.regions }
            }
            for (var si = 0; si < sampleIds.length; si++) {
              var m2 = session.matches[sampleIds[si]]
              s.profileData[sampleIds[si]] = { matchName: m2.matchName, matchNameInitials: m2.matchNameInitials, displayGender: m2.displayGender, photoUrl: m2.photoUrl }
            }
            setState({ sessionMatches: s.sessionMatches, matchListData: s.matchListData, batchCommunitiesData: s.batchCommunitiesData, batchEthnicityData: s.batchEthnicityData, profileData: s.profileData })
          }
        }
      })
      restoreFetchUI(guid)
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