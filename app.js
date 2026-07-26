(function() {
    var _regionMap = null;

    function loadRegionMap() {
        return fetch(chrome.runtime.getURL('ancestry_region_names.json')).then(function(r) { return r.json(); }).then(function(data) {
            _regionMap = {};
            for (var i = 0; i < data.items.length; i++) {
                _regionMap[data.items[i].region] = data.items[i].name;
            }
        });
    }

    function resolveJourneyNames(nodes, nameMap) {
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            n.displayName = nameMap[n.id] || n.id;
            if (n.communities && n.communities.length > 0) {
                resolveJourneyNames(n.communities, nameMap);
            }
        }
    }

    var results = document.getElementById('results');

    function showSpinner() {
        results.innerHTML = '<div class="spinner"><div class="spinner-ring"></div><div class="spinner-text">Loading...</div></div>';
    }

    function friendlyError(msg) {
        if (/Status 30[137]/.test(msg)) return 'Make sure you are logged into Ancestry.com, then try again.';
        if (/Status 40[13]/.test(msg)) return 'Access denied. Make sure you are logged into Ancestry.com.';
        if (/Status 403/.test(msg)) return 'Access denied. You may not have permission to view this data.';
        if (/Status 404/.test(msg)) return 'Data not found. The test or match may no longer be available.';
        if (/Status 429/.test(msg)) return 'Too many requests. Please wait a moment and try again.';
        if (/Status 5\d\d/.test(msg)) return 'Ancestry server error. Please try again later.';
        if (/Fetch failed/.test(msg)) return 'Could not reach Ancestry. Check your internet connection.';
        return msg;
    }

    function showError(msg) {
        results.innerHTML = '<div class="error">' + friendlyError(msg) + '</div>';
    }

    function apiFetch(url, options) {
        return new Promise(function(resolve, reject) {
            chrome.runtime.sendMessage({
                action: 'apiFetch', url: url, options: options, domain: 'ancestry.com'
            }, function(response) {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!response || !response.success) return reject(new Error(response ? response.error : 'No response'));
                resolve(response.data);
            });
        });
    }

    function fetchTests() {
        showSpinner();

        apiFetch('https://www.ancestry.com/dna/insights/api/dnaSubnav/tests', { credentials: 'include', mode: 'cors' })
            .then(function(data) { displayTests(data); })
            .catch(function(err) { showError(err.message); });
    }

    function fetchMatchCount(guid) {
        var url = 'https://www.ancestry.com/discoveryui-matches/parents/list/api/matchCount/' + guid;
        var opts = {
            method: 'POST',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ lower: 0, upper: 10 })
        };
        var el = document.getElementById('matchCountBadge');
        if (el) el.innerHTML = '<span class="spinner-ring" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle"></span>';
        apiFetch(url, opts)
            .then(function(data) {
                var el = document.getElementById('matchCountBadge');
                if (el) el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="16" height="16" fill="none"><circle cx="10" cy="9" r="3.5" stroke="#94a3b8" stroke-width="2"/><circle cx="18" cy="9" r="3.5" stroke="#94a3b8" stroke-width="2"/><path d="M4 23c0-4 2-6.5 6-6.5s6 2.5 6 6.5" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/><path d="M14 23c0-4 2-6.5 6-6.5s6 2.5 6 6.5" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/></svg><span class="count">' + data.count.toLocaleString() + '</span> MATCHES';
            })
            .catch(function(err) {
                var el = document.getElementById('matchCountBadge');
                if (el) el.innerHTML = '<span style="color:#f87171">' + friendlyError(err.message) + '</span>';
            });
    }

    var _matchListData = null;
    var _profileData = null;
    var _batchEthnicityData = null;
    var _batchCommunitiesData = null;
    var _pageSize = 20;
    var _currentPage = 1;

    function storeMatchData(guid, matchList) {
        if (typeof DB !== 'undefined') DB.saveSession(guid, matchList, _profileData, _batchEthnicityData, _batchCommunitiesData);
    }

    function renderCards(guid) {
        var list = _matchListData && _matchListData.matchList;
        if (!list) return;
        var totalPages = Math.ceil(list.length / _pageSize);
        if (_currentPage > totalPages) _currentPage = totalPages || 1;
        var start = (_currentPage - 1) * _pageSize;
        var end = Math.min(start + _pageSize, list.length);
        var page = list.slice(start, end);
        var html = '<div class="cards">';
        for (var i = 0; i < page.length; i++) {
            var m = page[i];
            var p = _profileData && _profileData[m.sampleId] || {};
            var date = new Date(m.createdDate);
            var dateStr = (date.getMonth()+1) + '/' + date.getDate() + '/' + date.getFullYear();
            var r = m.relationship || {};
            var tagCodes = [];
            if (m.tags) {
                var tagKeys = Object.keys(m.tags);
                for (var ti = 0; ti < tagKeys.length; ti++) {
                    if (m.tags[tagKeys[ti]]) tagCodes.push(m.tags[tagKeys[ti]]);
                }
            }
            html += '<div class="card match-card" data-guid="' + guid + '" data-sample="' + m.sampleId + '">';
            html += '<div class="card-top">';
            var gc = 'gender-n';
            if (p.displayGender === 'M') gc = 'gender-m';
            else if (p.displayGender === 'F') gc = 'gender-f';
            if (p.photoUrl) {
                html += '<img src="' + p.photoUrl + '" class="avatar">';
            } else {
                html += '<div class="avatar avatar-initials ' + gc + '">' + (p.matchNameInitials || '?') + '</div>';
            }
            html += '<span class="card-name">' + (p.matchName || 'Unknown') + '</span></div>';
            html += '<div class="card-details">';
            var relStr = '';
            if (r.sharedCentimorgans) relStr += '<span class="num">' + r.sharedCentimorgans + '</span> cM';
            if (r.sharedCentimorgans && r.numSharedSegments) relStr += ' across ';
            if (r.numSharedSegments) relStr += '<span class="num">' + r.numSharedSegments + '</span> segments';
            if (relStr) html += '<div class="rel-text">' + relStr + '</div>';
            html += '</div>';
            var journeys = _batchCommunitiesData && _batchCommunitiesData[m.sampleId] && _batchCommunitiesData[m.sampleId].branches;
            if (journeys && journeys.length > 0) {
                var sorted = journeys.slice().sort(function(a, b) { return (b.connectionPercent || 0) - (a.connectionPercent || 0); });
                var maxPills = 3;
                var showCount = Math.min(sorted.length, maxPills);
                html += '<div class="journey-strip">';
                for (var ji = 0; ji < showCount; ji++) {
                    var j = sorted[ji];
                    html += '<span class="journey-pill ' + (j.connection || '').toLowerCase() + '"><span class="jp-name">' + (j.displayName || j.id || '') + '</span> <span class="jp-pct">' + (j.connectionPercent || '?') + '%</span></span>';
                }
                if (sorted.length > maxPills) html += '<span style="font-size:10px;color:#64748b;padding:1px 4px;">+' + (sorted.length - maxPills) + ' more</span>';
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        if (totalPages > 1) {
            html += '<div class="pagination">';
            html += '<button class="page-btn" data-page="' + (_currentPage - 1) + '"' + (_currentPage <= 1 ? ' disabled' : '') + '>&#9664;</button>';
            var pageRange = [];
            var startPage = Math.max(1, _currentPage - 2);
            var endPage = Math.min(totalPages, _currentPage + 2);
            if (startPage > 1) { pageRange.push(1); if (startPage > 2) pageRange.push('...'); }
            for (var pi = startPage; pi <= endPage; pi++) pageRange.push(pi);
            if (endPage < totalPages) { if (endPage < totalPages - 1) pageRange.push('...'); pageRange.push(totalPages); }
            for (var pi2 = 0; pi2 < pageRange.length; pi2++) {
                var p = pageRange[pi2];
                if (p === '...') {
                    html += '<span class="page-dots">...</span>';
                } else {
                    html += '<button class="page-btn' + (p === _currentPage ? ' page-active' : '') + '" data-page="' + p + '">' + p + '</button>';
                }
            }
            html += '<button class="page-btn" data-page="' + (_currentPage + 1) + '"' + (_currentPage >= totalPages ? ' disabled' : '') + '>&#9654;</button>';
            html += '</div>';
        }
        var el = document.getElementById('matchListResult');
        if (el) el.innerHTML = html;
        if (el) {
            el.onclick = function(e) {
                var btn = e.target.closest('.page-btn');
                if (btn && !btn.disabled) {
                    _currentPage = parseInt(btn.getAttribute('data-page'), 10);
                    renderCards(guid);
                    return;
                }
                var card = e.target.closest('.match-card');
                if (card) {
                    var g = card.getAttribute('data-guid');
                    var s = card.getAttribute('data-sample');
                    if (g && s) window.open('match.html?guid=' + g + '&sampleId=' + s, '_blank');
                }
            };
        }
    }

    function delay(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }

    function chunkArray(arr, size) {
        var chunks = [];
        for (var i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
        return chunks;
    }

    function setStatus(msg) {
        var el = document.getElementById('statusMsg');
        if (!el) return;
        if (!msg) { el.innerHTML = ''; return; }
        el.innerHTML = '<span class="spinner-ring" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></span>' + msg;
    }

    var _debugEnabled = false;

    function debugLog(msg) {
        if (!_debugEnabled) return;
        var el = document.getElementById('debugLog');
        if (!el) return;
        el.style.display = 'block';
        var t = new Date();
        var ts = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0') + ':' + t.getSeconds().toString().padStart(2,'0');
        el.textContent += '[' + ts + '] ' + msg + '\n';
        el.scrollTop = el.scrollHeight;
    }

    function fetchMatchList(guid, mode, params) {
        _currentPage = 1;
        var el = document.getElementById('matchListResult');
        if (el) el.innerHTML = '';
        var dl = document.getElementById('debugLog');
        if (dl) dl.textContent = '';
        _profileData = {};
        _batchEthnicityData = {};
        _batchCommunitiesData = {};
        _matchListData = null;

        var allMatches = [];
        var desiredCount = mode === 'cmRange' ? Infinity : (params.desiredCount || 100);
        var currentPage = 1;
        var nameCache = {};

        function saveState() {
            DB.saveFetchState(guid, 0, mode, params, currentPage);
            var pageJustFetched = currentPage - 1;
            var b = document.getElementById('fetchStateBadge');
            if (!b) return;
            if (mode === 'cmRange') {
                b.textContent = '↻ ' + allMatches.length + ' [' + params.range + ' cM] page ' + pageJustFetched;
            } else {
                b.textContent = '↻ ' + allMatches.length + '/' + desiredCount + ' page ' + pageJustFetched;
            }
        }

        var fetchBtn = document.getElementById('fetchListBtn');
        if (fetchBtn) fetchBtn.disabled = true;

        function anyMissingName(nodes) {
            for (var i = 0; i < nodes.length; i++) {
                if (!nodes[i].displayName) return true;
                if (nodes[i].communities && anyMissingName(nodes[i].communities)) return true;
            }
            return false;
        }

        function findIncompleteSampleIds() {
            var result = [];
            for (var i = 0; i < allMatches.length; i++) {
                var sid = allMatches[i].sampleId;
                if (!sid) continue;
                if (!_batchEthnicityData[sid] || !_batchCommunitiesData[sid]) { result.push(sid); continue; }
                var branches = _batchCommunitiesData[sid].branches;
                if (branches && anyMissingName(branches)) { result.push(sid); }
            }
            return result;
        }

        var resumePromise = DB.getFetchState(guid).then(function(fs) {
            if (fs && fs.status === 0) {
                return DB.getSession(guid).then(function(session) {
                    if (session && session.matches) {
                        var sids = Object.keys(session.matches);
                        for (var i = 0; i < sids.length; i++) {
                            var m = session.matches[sids[i]];
                            allMatches.push({ sampleId: sids[i], relationship: m.relationship || {}, createdDate: m.createdDate || null });
                            _profileData[sids[i]] = { matchName: m.matchName, matchNameInitials: m.matchNameInitials, displayGender: m.displayGender, photoUrl: m.photoUrl };
                            if (m.journeys && m.journeys.length) _batchCommunitiesData[sids[i]] = { branches: m.journeys };
                            if (m.regions) _batchEthnicityData[sids[i]] = { regions: m.regions };
                        }
                        _matchListData = { matchList: allMatches };
                        currentPage = fs.nextPage || 1;
                        mode = fs.mode || mode;
                        params = fs.params || params;
                        desiredCount = mode === 'cmRange' ? Infinity : (params.desiredCount || 100);
                    }
                });
            }
        });

        function fetchPage() {
            if (mode === 'cmRange') {
                setStatus('Fetching match list for range ' + params.range + ' cM... (' + allMatches.length + ' matches)');
            } else {
                setStatus('Fetching match list... (' + allMatches.length + '/' + desiredCount + ')');
            }
            var url;
            url = 'https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/' + guid + '?itemsPerPage=100&currentPage=' + currentPage;
            if (mode === 'cmRange') {
                url += '&sharedDna=' + params.range;
            }
            debugLog('page ' + currentPage + ' mode=' + mode + ' url=' + url);
            return apiFetch(url, { credentials: 'include', mode: 'cors', headers: { 'Accept': 'application/json' } })
                .then(function(data) {
                    var matches = data.matchList;
                    if (!Array.isArray(matches)) return nextPage(false);
                    var newSids = [];
                    var sidIndex = {};
                    for (var i = 0; i < allMatches.length; i++) sidIndex[allMatches[i].sampleId] = true;
                    var limit = mode === 'cmRange' ? Infinity : desiredCount;
                    for (var i = 0; i < matches.length && allMatches.length < limit; i++) {
                        var sid = matches[i].sampleId;
                        if (!sid || sidIndex[sid]) continue;
                        sidIndex[sid] = true;
                        allMatches.push(matches[i]);
                        newSids.push(sid);
                    }
                    if (allMatches.length > desiredCount) allMatches = allMatches.slice(0, desiredCount);
                    _matchListData = { matchList: allMatches };
                    currentPage++;
                    saveState();
                    var hasMore;
                    if (mode === 'cmRange') {
                        if (data.isLastPage === true) { hasMore = false; }
                        else if (data.isLastPage === undefined) { hasMore = matches.length >= 100; }
                        else { hasMore = matches.length > 0; }
                    } else {
                        hasMore = matches.length >= 100;
                    }
                    debugLog('  got ' + newSids.length + ' new, total=' + allMatches.length + ' next=' + currentPage + ' hasMore=' + hasMore + ' isLastPage=' + data.isLastPage);
                    if (newSids.length === 0) return nextPage(false);
                    return fetchProfileData(guid, newSids).then(function() {
                        storeMatchData(guid, allMatches);
                        return processPageChunks(guid, newSids);
                    }).then(function() {
                        return nextPage(hasMore);
                    });
                });
        }

        function nextPage(hasMore) {
            var remaining = mode === 'cmRange' ? 1 : (desiredCount - allMatches.length);
            debugLog('nextPage: hasMore=' + hasMore + (mode === 'cmRange' ? '' : ' remaining=' + remaining));
            if (remaining > 0 && hasMore) return delay(500).then(fetchPage);
        }

        function processPageChunks(guid, pageSampleIds) {
            var chunks = chunkArray(pageSampleIds, 24);
            var chain = Promise.resolve();
            for (var ci = 0; ci < chunks.length; ci++) {
                chain = chain.then((function(chunk, idx) {
                    return function() {
                        return processChunk24(guid, chunk, idx * 24 + 1, pageSampleIds.length);
                    };
                })(chunks[ci], ci));
            }
            return chain;
        }

        function processChunk24(guid, chunk, rangeStart, total) {
            setStatus('Fetching ethnicity for matches ' + rangeStart + '-' + (rangeStart + chunk.length - 1) + ' of ' + total + '...');
            return fetchBatchEthnicity(guid, chunk).then(function(ethData) {
                for (var k in ethData) _batchEthnicityData[k] = ethData[k];
                if (_regionMap) {
                    for (var k in ethData) {
                        var regions = ethData[k] && ethData[k].regions;
                        if (!regions) continue;
                        for (var ri = 0; ri < regions.length; ri++) {
                            regions[ri].displayName = _regionMap[regions[ri].key] || regions[ri].key;
                        }
                    }
                }
                return delay(500);
            }).then(function() {
                setStatus('Fetching communities for matches ' + rangeStart + '-' + (rangeStart + chunk.length - 1) + ' of ' + total + '...');
                return fetchBatchCommunities(guid, chunk);
            }).then(function(comData) {
                for (var k in comData) _batchCommunitiesData[k] = comData[k];
                var newBranchIds = [];
                for (var k in comData) {
                    var branches = comData[k] && comData[k].branches;
                    if (!branches) continue;
                    for (var bi = 0; bi < branches.length; bi++) {
                        if (!nameCache[branches[bi].id]) {
                            nameCache[branches[bi].id] = null;
                            newBranchIds.push(branches[bi].id);
                        }
                    }
                }
                if (newBranchIds.length === 0) return;
                return delay(500).then(function() {
                    var namesUrl = 'https://www.ancestry.com/dna/origins/communities/names';
                    return apiFetch(namesUrl, {
                        method: 'POST', credentials: 'include', mode: 'cors',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(newBranchIds)
                    }).then(function(nameData) {
                        for (var ghostId in nameData) {
                            var subDict = nameData[ghostId];
                            for (var subId in subDict) nameCache[subId] = subDict[subId];
                        }
                    });
                });
            }).then(function() {
                var sKeys = Object.keys(_batchCommunitiesData);
                for (var si = 0; si < sKeys.length; si++) {
                    var branches = _batchCommunitiesData[sKeys[si]] && _batchCommunitiesData[sKeys[si]].branches;
                    if (branches) resolveJourneyNames(branches, nameCache);
                }
                var list = _matchListData && _matchListData.matchList;
                storeMatchData(guid, list);
                renderCards(guid);
            });
        }

        function finishFetch() {
            debugLog('finishFetch: total=' + allMatches.length + ' mode=' + mode);
            setStatus('');
            if (fetchBtn) { fetchBtn.disabled = false; fetchBtn.innerHTML = '<span>&#x25B6;</span> Fetch'; }
            var ci = document.getElementById('matchCountInput');
            if (ci) ci.style.display = '';
            DB.saveFetchState(guid, 1, mode, params);
            var b = document.getElementById('fetchStateBadge');
            if (b) {
                if (mode === 'cmRange') {
                    b.textContent = '✓ ' + allMatches.length + ' [' + params.range + ' cM]';
                } else {
                    b.textContent = '✓ ' + allMatches.length + '/' + (params.desiredCount || '?') + ' matches';
                }
            }
            try {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                    title: 'MatchFetch',
                    message: mode === 'cmRange' ? 'Finished fetching ' + allMatches.length + ' matches in range ' + params.range + ' cM' : 'Finished fetching ' + allMatches.length + ' matches'
                }, function() {
                    if (chrome.runtime.lastError) console.log('Notification error:', chrome.runtime.lastError.message);
                });
            } catch(e) {
                console.log('Notification error:', e);
            }
        }

        resumePromise.then(function() {
            saveState();
            var incomplete = findIncompleteSampleIds();
            debugLog('resume: mode=' + mode + ' have=' + allMatches.length + (mode === 'cmRange' ? '' : ' target=' + desiredCount) + ' incomplete=' + incomplete.length);
            if (allMatches.length >= desiredCount) {
                if (incomplete.length === 0) return finishFetch();
                setStatus('Resuming: processing data for ' + incomplete.length + ' matches...');
                return processPageChunks(guid, incomplete).then(finishFetch).catch(function(err) {
                    if (fetchBtn) fetchBtn.disabled = false;
                    var el = document.getElementById('matchListResult');
                    if (el) el.innerHTML = '<div class="error">' + friendlyError(err.message) + '</div>';
                    setStatus('');
                });
            }
            var chain = Promise.resolve();
            if (incomplete.length > 0) {
                setStatus('Resuming: processing ' + incomplete.length + ' existing matches first...');
                chain = processPageChunks(guid, incomplete);
            }
            return chain.then(function() {
                return fetchPage();
            }).then(finishFetch).catch(function(err) {
                if (fetchBtn) fetchBtn.disabled = false;
                var el = document.getElementById('matchListResult');
                if (el) el.innerHTML = '<div class="error">' + friendlyError(err.message) + '</div>';
                setStatus('');
            });
        });
    }

    function fetchProfileData(guid, sampleIds) {
        return new Promise(function(resolve, reject) {
            var chunks = chunkArray(sampleIds, 100);
            var allProfiles = {};
            var idx = 0;

            function next() {
                if (idx >= chunks.length) {
                    for (var k in allProfiles) _profileData[k] = allProfiles[k];
                    resolve();
                    return;
                }
                setStatus('Fetching profile data... (' + (idx * 100 + 1) + '-' + Math.min((idx + 1) * 100, sampleIds.length) + ' of ' + sampleIds.length + ')');
                var url = 'https://www.ancestry.com/discoveryui-matches/cluster/api/profileData/' + guid;
                apiFetch(url, {
                    method: 'POST', credentials: 'include', mode: 'cors',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ matchSampleIds: chunks[idx] })
                }).then(function(profiles) {
                    for (var k in profiles) allProfiles[k] = profiles[k];
                    idx++;
                    delay(500).then(next);
                }).catch(function(err) {
                    var el = document.getElementById('matchListResult');
                    if (el) el.innerHTML = '<div class="error">' + friendlyError(err.message) + '</div>';
                    reject(err);
                });
            }
            next();
        });
    }

    function fetchBatchEthnicity(guid, sampleIds) {
        return apiFetch('https://www.ancestry.com/dna/origins/secure/compare/' + guid + '/batchEthnicity', {
            method: 'PUT', credentials: 'include', mode: 'cors',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(sampleIds)
        });
    }

    function fetchBatchCommunities(guid, sampleIds) {
        return apiFetch('https://www.ancestry.com/dna/origins/secure/compare/' + guid + '/batchCommunities', {
            method: 'POST', credentials: 'include', mode: 'cors',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(sampleIds)
        });
    }

    function displayTests(data) {
        if (!Array.isArray(data) || data.length === 0) {
            results.innerHTML = '<div class="empty">No tests found</div>';
            return;
        }

        var html = '<div class="label">Select a kit <span id="matchCountBadge" class="badge"></span><span id="fetchStateBadge" class="badge"></span></div>';
        html += '<div class="select-row"><select id="testSelect">';
        html += '<option value="">Choose a kit...</option>';
        for (var i = 0; i < data.length; i++) {
            var t = data[i];
            var name = t.subjectName || t.displayName || t.name || 'Kit ' + (i + 1);
            var guid = t.testGuid || t.testId || t.guid || t.id || '';
            html += '<option value="' + guid + '">' + name + '</option>';
        }
        html += '</select><button id="clearKitBtn" class="clear-btn" title="Clear kit data" hidden><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';
        html += '<div class="label" style="margin-top:16px">Fetch Options</div>';
        html += '<div class="mode-toggle">';
        html += '<button class="mode-btn active" data-mode="count">Count</button>';
        html += '<button class="mode-btn" data-mode="cmRange">cM Range</button>';
        html += '</div>';
        html += '<div class="fetch-row" id="countModeRow"><label class="input-label">Matches <input type="number" id="matchCountInput" class="count-input" value="100" min="1" step="1"></label></div>';
        html += '<div class="fetch-row" id="cmRangeModeRow" style="display:none"><label class="input-label">Min <input type="number" id="cmRangeMin" class="count-input" value="90" min="0"></label><label class="input-label">Max <input type="number" id="cmRangeMax" class="count-input" value="400" min="0"></label></div>';
        html += '<button class="btn fetch-list-btn" id="fetchListBtn" disabled><span>&#x25B6;</span> Fetch</button>';
        html += '<div id="statusMsg" class="status-msg"></div>';
        html += '<label class="debug-toggle"><input type="checkbox" id="debugToggle"><span class="slider"></span> Debug log</label>';
        html += '<pre id="debugLog" style="display:none"></pre>';
        html += '<div id="matchListResult"></div>';

        results.innerHTML = html;

        function setMode(mode) {
            var btns = document.querySelectorAll('.mode-btn');
            for (var bi = 0; bi < btns.length; bi++) btns[bi].classList.toggle('active', btns[bi].getAttribute('data-mode') === mode);
            document.getElementById('countModeRow').style.display = mode === 'count' ? '' : 'none';
            document.getElementById('cmRangeModeRow').style.display = mode === 'cmRange' ? '' : 'none';
        }

        var modeBtns = document.querySelectorAll('.mode-btn');
        for (var mi = 0; mi < modeBtns.length; mi++) {
            modeBtns[mi].addEventListener('click', function() {
                setMode(this.getAttribute('data-mode'));
            });
        }

        document.getElementById('debugToggle').addEventListener('change', function() {
            _debugEnabled = this.checked;
            var dl = document.getElementById('debugLog');
            if (dl) dl.style.display = this.checked ? 'block' : 'none';
        });

        document.getElementById('testSelect').addEventListener('change', function() {
            var listBtn = document.getElementById('fetchListBtn');
            var clearBtn = document.getElementById('clearKitBtn');
            var countInput = document.getElementById('matchCountInput');
            var selectedGuid = this.value;
            var matchListEl = document.getElementById('matchListResult');
            var debugEl = document.getElementById('debugLog');
            if (debugEl) debugEl.textContent = '';
            _matchListData = null;
            _batchCommunitiesData = null;
            _profileData = null;
            if (matchListEl) matchListEl.innerHTML = '';
            if (selectedGuid) {
                listBtn.disabled = false;
                if (clearBtn) clearBtn.hidden = false;
                fetchMatchCount(selectedGuid);
                DB.getSession(selectedGuid).then(function(session) {
                    if (session && session.matches) {
                        var matchList = [];
                        var sampleIds = Object.keys(session.matches);
                        for (var si = 0; si < sampleIds.length; si++) {
                            var m = session.matches[sampleIds[si]];
                            matchList.push({
                                sampleId: sampleIds[si],
                                relationship: m.relationship || {},
                                createdDate: m.createdDate || null
                            });
                        }
                        if (matchList.length > 0) {
                            _matchListData = { matchList: matchList };
                            _batchCommunitiesData = {};
                            for (var si2 = 0; si2 < sampleIds.length; si2++) {
                                var m = session.matches[sampleIds[si2]];
                                if (m.journeys && m.journeys.length > 0) {
                                    _batchCommunitiesData[sampleIds[si2]] = { branches: m.journeys };
                                }
                            }
                            _profileData = {};
                            for (var si3 = 0; si3 < sampleIds.length; si3++) {
                                var m = session.matches[sampleIds[si3]];
                                _profileData[sampleIds[si3]] = {
                                    matchName: m.matchName,
                                    matchNameInitials: m.matchNameInitials,
                                    displayGender: m.displayGender,
                                    photoUrl: m.photoUrl
                                };
                            }
                            renderCards(selectedGuid);
                        }
                    }
                });
                DB.getFetchState(selectedGuid).then(function(fs) {
                    var fsBadge = document.getElementById('fetchStateBadge');
                    if (fs && fs.status === 0) {
                        var label = '';
                        if (fs.mode === 'cmRange') {
                            var r = fs.params && fs.params.range || '';
                            label = r ? ' (' + r + ' cM)' : '';
                            setMode('cmRange');
                            var parts = r.split('-');
                            if (parts.length === 2) {
                                document.getElementById('cmRangeMin').value = parts[0];
                                document.getElementById('cmRangeMax').value = parts[1];
                            }
                        } else {
                            var count = fs.params && fs.params.desiredCount || 0;
                            if (count > 0) label = ' (' + count + ' matches)';
                        }
                        if (label) {
                            listBtn.innerHTML = '<span>&#x25B6;</span> Resume' + label;
                            if (countInput) countInput.style.display = 'none';
                            var msgEl = document.getElementById('statusMsg');
                            if (msgEl) msgEl.innerHTML = 'Previous fetch incomplete — click Resume to continue';
                        }
                        DB.getSession(selectedGuid).then(function(s) {
                            var count = s && s.matches ? Object.keys(s.matches).length : 0;
                            if (fsBadge) fsBadge.textContent = '↻ ' + count + ' fetched (page ' + (fs.nextPage || 1) + ')';
                        });
                    } else if (fs && fs.status === 1) {
                        listBtn.innerHTML = '<span>&#x25B6;</span> Fetch';
                        if (countInput) countInput.style.display = '';
                        DB.getSession(selectedGuid).then(function(s) {
                            if (fsBadge) fsBadge.textContent = s && s.matches ? '✓ ' + Object.keys(s.matches).length + ' matches' : '✓ done';
                        });
                    } else {
                        listBtn.innerHTML = '<span>&#x25B6;</span> Fetch';
                        if (countInput) countInput.style.display = '';
                        if (fsBadge) fsBadge.textContent = '';
                    }
                });
            } else {
                document.getElementById('matchCountBadge').textContent = '';
                listBtn.disabled = true;
                if (clearBtn) clearBtn.hidden = true;
                listBtn.innerHTML = '<span>&#x25B6;</span> Fetch';
                if (countInput) countInput.style.display = '';
            }
        });

        document.getElementById('fetchListBtn').addEventListener('click', function() {
            var sel = document.getElementById('testSelect');
            if (!sel || !sel.value) return;
            var activeMode = document.querySelector('.mode-btn.active');
            var mode = activeMode ? activeMode.getAttribute('data-mode') : 'count';
            if (mode === 'cmRange') {
                var min = document.getElementById('cmRangeMin').value;
                var max = document.getElementById('cmRangeMax').value;
                if (!min || !max) return;
                var range = min + '-' + max;
                if (!range) return;
                fetchMatchList(sel.value, 'cmRange', { range: range });
            } else {
                var input = document.getElementById('matchCountInput');
                var count = parseInt(input && input.value, 10) || 100;
                fetchMatchList(sel.value, 'count', { desiredCount: count });
            }
        });

        document.getElementById('clearKitBtn').addEventListener('click', function() {
            var sel = document.getElementById('testSelect');
            var guid = sel && sel.value;
            if (!guid) return;
            var overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = '<div class="modal"><div class="modal-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div><div class="modal-title">Clear kit data?</div><div class="modal-text">This will remove all matches, regions, and journeys for this kit from local storage.</div><div class="modal-actions"><button class="modal-btn modal-cancel">Cancel</button><button class="modal-btn modal-confirm">Clear</button></div></div>';
            document.body.appendChild(overlay);
            overlay.querySelector('.modal-cancel').addEventListener('click', function() { overlay.remove(); });
            overlay.querySelector('.modal-confirm').addEventListener('click', function() {
                overlay.remove();
                DB.deleteSession(guid).then(function() {
                    return DB.deleteFetchState(guid);
                }).then(function() {
                    _matchListData = null;
                    _batchCommunitiesData = null;
                    _profileData = null;
                    _batchEthnicityData = null;
                    document.getElementById('matchListResult').innerHTML = '';
                    var listBtn = document.getElementById('fetchListBtn');
                    if (listBtn) listBtn.innerHTML = '<span>&#x25B6;</span> Fetch';
                    var countInput = document.getElementById('matchCountInput');
                    if (countInput) countInput.style.display = '';
                    var msgEl = document.getElementById('statusMsg');
                    if (msgEl) msgEl.innerHTML = '';
                    setMode('count');
                });
            });
        });
    }

    loadRegionMap().then(function() {
        fetchTests();
    });

    document.getElementById('exportBtn').addEventListener('click', function() {
        if (typeof DB !== 'undefined' && DB.exportDatabase) {
            DB.exportDatabase();
        }
    });

    document.getElementById('githubBtn').addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://github.com/strike978/matchfetch_ext' });
    });

    document.getElementById('discordBtn').addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://discord.com/invite/f5BtHTM2zZ' });
    });
})();
