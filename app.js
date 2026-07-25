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

    function showError(msg) {
        results.innerHTML = '<div class="error">' + msg + '</div>';
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
        var el = document.getElementById('matchCountResult');
        if (el) el.innerHTML = '<div class="spinner" style="padding:24px"><div class="spinner-ring"></div></div>';
        apiFetch(url, opts)
            .then(function(data) {
                var el = document.getElementById('matchCountResult');
                if (el) el.innerHTML = '<div class="match-row"><div class="match-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32"><circle cx="14" cy="13" r="4.5" fill="none" stroke="#3b82f6" stroke-width="2.5"/><circle cx="26" cy="13" r="4.5" fill="none" stroke="#60a5fa" stroke-width="2.5"/><path d="M8 32c0-5 2.7-9 6-9s6 4 6 9" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/><path d="M20 32c0-5 2.7-9 6-9s6 4 6 9" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"/></svg></div><div class="count-big">' + data.count.toLocaleString() + '</div></div>';
            })
            .catch(function(err) {
                var el = document.getElementById('matchCountResult');
                if (el) el.innerHTML = '<div class="error">' + err.message + '</div>';
            });
    }

    var _matchListData = null;
    var _profileData = null;
    var _batchEthnicityData = null;
    var _batchCommunitiesData = null;

    function storeMatchData(guid, matchList) {
        if (typeof DB !== 'undefined') DB.saveSession(guid, matchList, _profileData, _batchEthnicityData, _batchCommunitiesData);
    }

    function renderCards(guid) {
        var list = _matchListData && _matchListData.matchList;
        if (!list) return;
        var html = '<div class="cards">';
        for (var i = 0; i < list.length; i++) {
            var m = list[i];
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
        var el = document.getElementById('matchListResult');
        if (el) el.innerHTML = html;
        if (el) el.addEventListener('click', function(e) {
            var card = e.target.closest('.match-card');
            if (card) {
                var g = card.getAttribute('data-guid');
                var s = card.getAttribute('data-sample');
                if (g && s) window.open('match.html?guid=' + g + '&sampleId=' + s, '_blank');
            }
        });
    }

    function fetchMatchList(guid) {
        var url = 'https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/' + guid;
        var el = document.getElementById('matchListResult');
        if (el) el.innerHTML = '<div class="spinner" style="padding:24px"><div class="spinner-ring"></div></div>';
        _profileData = null;
        _batchEthnicityData = null;
        _batchCommunitiesData = null;
        apiFetch(url, { credentials: 'include', mode: 'cors', headers: { 'Accept': 'application/json' } })
            .then(function(data) {
                _matchListData = data;
                var sampleIds = [];
                if (data.matchList && data.matchList.length > 0) {
                    for (var i = 0; i < data.matchList.length; i++) {
                        if (data.matchList[i].sampleId) sampleIds.push(data.matchList[i].sampleId);
                    }
                    if (sampleIds.length > 0) fetchProfileData(guid, sampleIds);
                }
            })
            .catch(function(err) {
                var el = document.getElementById('matchListResult');
                if (el) el.innerHTML = '<div class="error">' + err.message + '</div>';
            });
    }

    function fetchProfileData(guid, sampleIds) {
        var url = 'https://www.ancestry.com/discoveryui-matches/cluster/api/profileData/' + guid;
        var opts = {
            method: 'POST',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ matchSampleIds: sampleIds })
        };
        apiFetch(url, opts)
            .then(function(profiles) {
                _profileData = profiles;
                var list = _matchListData && _matchListData.matchList;
                renderCards(guid);
                storeMatchData(guid, list);
                fetchBatchEthnicity(guid, sampleIds);
                fetchBatchCommunities(guid, sampleIds);
            })
            .catch(function(err) {
                var el = document.getElementById('matchListResult');
                if (el) el.innerHTML = '<div class="error">' + err.message + '</div>';
            });
    }

    function fetchBatchEthnicity(guid, sampleIds) {
        var url = 'https://www.ancestry.com/dna/origins/secure/compare/' + guid + '/batchEthnicity';
        var opts = {
            method: 'PUT',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(sampleIds)
        };
        apiFetch(url, opts)
            .then(function(data) {
                _batchEthnicityData = data;
                if (_regionMap) {
                    var sKeys = Object.keys(data);
                    for (var si = 0; si < sKeys.length; si++) {
                        var regions = data[sKeys[si]] && data[sKeys[si]].regions;
                        if (!regions) continue;
                        for (var ri = 0; ri < regions.length; ri++) {
                            regions[ri].displayName = _regionMap[regions[ri].key] || regions[ri].key;
                        }
                    }
                }
                var list = _matchListData && _matchListData.matchList;
                storeMatchData(guid, list);
            })
            .catch(function(err) {});
    }

    function fetchBatchCommunities(guid, sampleIds) {
        var url = 'https://www.ancestry.com/dna/origins/secure/compare/' + guid + '/batchCommunities';
        var opts = {
            method: 'POST',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(sampleIds)
        };
        apiFetch(url, opts)
            .then(function(data) {
                _batchCommunitiesData = data;
                var allBranchIds = [];
                var sKeys = Object.keys(data);
                for (var si = 0; si < sKeys.length; si++) {
                    var branches = data[sKeys[si]] && data[sKeys[si]].branches;
                    if (!branches) continue;
                    for (var bi = 0; bi < branches.length; bi++) {
                        if (allBranchIds.indexOf(branches[bi].id) === -1) {
                            allBranchIds.push(branches[bi].id);
                        }
                    }
                }
                if (allBranchIds.length > 0) {
                    var namesUrl = 'https://www.ancestry.com/dna/origins/communities/names';
                    var namesOpts = {
                        method: 'POST', credentials: 'include', mode: 'cors',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(allBranchIds)
                    };
                    apiFetch(namesUrl, namesOpts).then(function(nameData) {
                        var nameMap = {};
                        for (var ghostId in nameData) {
                            var subDict = nameData[ghostId];
                            for (var subId in subDict) {
                                nameMap[subId] = subDict[subId];
                            }
                        }
                        for (var si2 = 0; si2 < sKeys.length; si2++) {
                            var branches = data[sKeys[si2]] && data[sKeys[si2]].branches;
                            if (branches) resolveJourneyNames(branches, nameMap);
                        }
                        var list = _matchListData && _matchListData.matchList;
                        storeMatchData(guid, list);
                        renderCards(guid);
                    }).catch(function() {
                        var list = _matchListData && _matchListData.matchList;
                        storeMatchData(guid, list);
                        renderCards(guid);
                    });
                } else {
                    var list = _matchListData && _matchListData.matchList;
                    storeMatchData(guid, list);
                    renderCards(guid);
                }
            })
            .catch(function(err) {});
    }

    function displayTests(data) {
        if (!Array.isArray(data) || data.length === 0) {
            results.innerHTML = '<div class="empty">No tests found</div>';
            return;
        }

        var html = '<div class="label">Select a kit</div>';
        html += '<select id="testSelect">';
        html += '<option value="">Choose a kit...</option>';
        for (var i = 0; i < data.length; i++) {
            var t = data[i];
            var name = t.subjectName || t.displayName || t.name || 'Kit ' + (i + 1);
            var guid = t.testGuid || t.testId || t.guid || t.id || '';
            html += '<option value="' + guid + '">' + name + '</option>';
        }
        html += '</select>';
        html += '<div id="matchCountResult"></div>';
        html += '<button class="btn fetch-list-btn" id="fetchListBtn" disabled><span>&#x25B6;</span> Fetch</button>';
        html += '<div id="matchListResult"></div>';

        results.innerHTML = html;

        document.getElementById('testSelect').addEventListener('change', function() {
            var listBtn = document.getElementById('fetchListBtn');
            var selectedGuid = this.value;
            if (selectedGuid) {
                listBtn.disabled = false;
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
            } else {
                document.getElementById('matchCountResult').innerHTML = '';
                listBtn.disabled = true;
            }
        });

        document.getElementById('fetchListBtn').addEventListener('click', function() {
            var sel = document.getElementById('testSelect');
            if (sel && sel.value) fetchMatchList(sel.value);
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
