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

    function fetchMatchList(guid, desiredCount) {
        _currentPage = 1;
        var el = document.getElementById('matchListResult');
        if (el) el.innerHTML = '';
        _profileData = {};
        _batchEthnicityData = {};
        _batchCommunitiesData = {};
        _matchListData = null;

        var allMatches = [];
        var pageSize = 100;
        var currentPage = 1;
        var nameCache = {};

        function saveState(pageIdx) {
            DB.saveFetchState(guid, { status: 0, mode: 'count', params: { desiredCount: desiredCount }, pageIndex: pageIdx });
        }

        var fetchBtn = document.getElementById('fetchListBtn');
        if (fetchBtn) fetchBtn.disabled = true;

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
                        currentPage = (fs.pageIndex || 0) + 1;
                        desiredCount = fs.params && fs.params.desiredCount || desiredCount;
                        if (el) el.innerHTML = '<div class="status-msg">Resuming from page ' + currentPage + '...</div>';
                    }
                });
            }
        });

        function fetchPage() {
            saveState(currentPage - 1);
            setStatus('Fetching match list... (' + allMatches.length + '/' + desiredCount + ')');
            var url = 'https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/' + guid + '?itemsPerPage=' + pageSize + '&currentPage=' + currentPage;
            return apiFetch(url, { credentials: 'include', mode: 'cors', headers: { 'Accept': 'application/json' } })
                .then(function(data) {
                    var matches = data.matchList;
                    if (Array.isArray(matches)) {
                        var prevCount = allMatches.length;
                        var sidIndex = {};
                        for (var ei = 0; ei < allMatches.length; ei++) sidIndex[allMatches[ei].sampleId] = true;
                        var pageSampleIds = [];
                        for (var mi = 0; mi < matches.length; mi++) {
                            if (!sidIndex[matches[mi].sampleId]) {
                                allMatches.push(matches[mi]);
                                sidIndex[matches[mi].sampleId] = true;
                                if (matches[mi].sampleId) pageSampleIds.push(matches[mi].sampleId);
                            }
                        }
                        if (allMatches.length > desiredCount) allMatches = allMatches.slice(0, desiredCount);
                        // trim new sampleIds if sliced
                        if (allMatches.length < prevCount + pageSampleIds.length) {
                            pageSampleIds = pageSampleIds.slice(0, allMatches.length - prevCount);
                        }
                        // also re-process existing matches from this page that are missing ethnicity/journeys
                        for (var mi = 0; mi < matches.length; mi++) {
                            var sid = matches[mi].sampleId;
                            if (sid && sidIndex[sid] && (!_batchEthnicityData[sid] || !_batchCommunitiesData[sid]) && pageSampleIds.indexOf(sid) === -1) pageSampleIds.push(sid);
                        }
                        _matchListData = { matchList: allMatches };
                        currentPage++;
                        var matchesFromThisPage = allMatches.length - prevCount;
                        if (pageSampleIds.length === 0 && matches.length < pageSize) return nextPage(false);
                        if (pageSampleIds.length === 0) return nextPage(matches.length >= pageSize);
                        return fetchProfileData(guid, pageSampleIds).then(function() {
                            var list = _matchListData && _matchListData.matchList;
                            storeMatchData(guid, list);
                            return processPageChunks(guid, pageSampleIds);
                        }).then(function() {
                            saveState(currentPage - 1);
                            return nextPage(matches.length >= pageSize);
                        });
                    } else {
                        nextPage(false);
                    }
                });
        }

        function nextPage(hasMore) {
            var remaining = desiredCount - allMatches.length;
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
            setStatus('');
            if (fetchBtn) { fetchBtn.disabled = false; fetchBtn.innerHTML = '<span>&#x25B6;</span> Fetch'; }
            var ci = document.getElementById('matchCountInput');
            if (ci) ci.style.display = '';
            DB.saveFetchState(guid, { status: 1, mode: 'count', params: { desiredCount: desiredCount }, pageIndex: currentPage - 1 });
            try {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                    title: 'MatchFetch',
                    message: 'Finished fetching ' + allMatches.length + ' matches'
                }, function() {
                    if (chrome.runtime.lastError) console.log('Notification error:', chrome.runtime.lastError.message);
                });
            } catch(e) {
                console.log('Notification error:', e);
            }
        }

        resumePromise.then(function() {
            if (allMatches.length >= desiredCount) {
                var sids = [];
                for (var ri = 0; ri < allMatches.length; ri++) {
                    if (allMatches[ri].sampleId) sids.push(allMatches[ri].sampleId);
                }
                setStatus('Resuming: processing data for ' + sids.length + ' matches...');
                return processPageChunks(guid, sids).then(finishFetch).catch(function(err) {
                    if (fetchBtn) fetchBtn.disabled = false;
                    var el = document.getElementById('matchListResult');
                    if (el) el.innerHTML = '<div class="error">' + friendlyError(err.message) + '</div>';
                    setStatus('');
                });
            }
            fetchPage().then(finishFetch).catch(function(err) {
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

        var html = '<div class="label">Select a kit <span id="matchCountBadge" class="badge"></span></div>';
        html += '<div class="select-row"><select id="testSelect">';
        html += '<option value="">Choose a kit...</option>';
        for (var i = 0; i < data.length; i++) {
            var t = data[i];
            var name = t.subjectName || t.displayName || t.name || 'Kit ' + (i + 1);
            var guid = t.testGuid || t.testId || t.guid || t.id || '';
            html += '<option value="' + guid + '">' + name + '</option>';
        }
        html += '</select><button id="clearKitBtn" class="clear-btn" title="Clear kit data" hidden><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';
        html += '<div class="label" style="margin-top:16px">Fetch Options</div><div class="fetch-row"><label class="input-label">Matches <input type="number" id="matchCountInput" class="count-input" value="100" min="1" step="1"></label><button class="btn fetch-list-btn" id="fetchListBtn" disabled><span>&#x25B6;</span> Fetch</button></div>';
        html += '<div id="statusMsg" class="status-msg"></div>';
        html += '<div id="matchListResult"></div>';

        results.innerHTML = html;

        document.getElementById('testSelect').addEventListener('change', function() {
            var listBtn = document.getElementById('fetchListBtn');
            var clearBtn = document.getElementById('clearKitBtn');
            var countInput = document.getElementById('matchCountInput');
            var selectedGuid = this.value;
            var matchListEl = document.getElementById('matchListResult');
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
                    var count = fs && fs.params && fs.params.desiredCount || 0;
                    if (fs && fs.status === 0 && count > 0) {
                        listBtn.innerHTML = '<span>&#x25B6;</span> Resume (' + count + ' matches)';
                        if (countInput) countInput.style.display = 'none';
                        var msgEl = document.getElementById('statusMsg');
                        if (msgEl) msgEl.innerHTML = 'Previous fetch incomplete — click Resume to continue';
                    } else {
                        listBtn.innerHTML = '<span>&#x25B6;</span> Fetch';
                        if (countInput) countInput.style.display = '';
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
            var input = document.getElementById('matchCountInput');
            var count = parseInt(input && input.value, 10) || 100;
            if (sel && sel.value) fetchMatchList(sel.value, count);
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
