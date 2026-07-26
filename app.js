(function() {
    var _regionMap = null;
    var _journeyNameMap = null;
    var _filterSelectFocused = false;

    function loadRegionMap() {
        return fetch(chrome.runtime.getURL('ancestry_region_names.json')).then(function(r) { return r.json(); }).then(function(data) {
            _regionMap = {};
            for (var i = 0; i < data.items.length; i++) {
                _regionMap[data.items[i].region] = data.items[i].name;
            }
        });
    }

    function loadJourneyNameMap() {
        return fetch(chrome.runtime.getURL('ancestry_journey_names.json')).then(function(r) { return r.json(); }).then(function(data) {
            _journeyNameMap = {};
            for (var id in data) {
                _journeyNameMap[id] = data[id].name;
                var subs = data[id].subjourneys;
                if (subs) {
                    for (var subId in subs) _journeyNameMap[subId] = subs[subId];
                }
            }
        });
    }

    function resolveJourneyNames(nodes) {
        if (!_journeyNameMap) return;
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            n.displayName = _journeyNameMap[n.id] || n.displayName || n.id;
            if (n.communities && n.communities.length > 0) {
                resolveJourneyNames(n.communities);
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
    var _sessionMatches = null;
    var _pageSize = 20;
    var _currentPage = 1;

    function storeMatchData(guid, matchList) {
        if (!_sessionMatches) _sessionMatches = {};
        if (matchList) {
            for (var mi = 0; mi < matchList.length; mi++) {
                var sid = matchList[mi].sampleId;
                if (!sid) continue;
                if (!_sessionMatches[sid]) _sessionMatches[sid] = {};
                if (_profileData && _profileData[sid]) {
                    _sessionMatches[sid].matchName = _profileData[sid].matchName;
                    _sessionMatches[sid].matchNameInitials = _profileData[sid].matchNameInitials;
                    _sessionMatches[sid].displayGender = _profileData[sid].displayGender;
                    _sessionMatches[sid].photoUrl = _profileData[sid].photoUrl;
                }
                if (_batchEthnicityData && _batchEthnicityData[sid]) _sessionMatches[sid].regions = _batchEthnicityData[sid].regions;
                if (_batchCommunitiesData && _batchCommunitiesData[sid]) _sessionMatches[sid].journeys = _batchCommunitiesData[sid].branches;
            }
        }
        if (typeof DB !== 'undefined') DB.saveSession(guid, matchList, _profileData, _batchEthnicityData, _batchCommunitiesData);
    }

    function matchesFilter(m) {
        var p = _profileData && _profileData[m.sampleId] || {};
        if (_filters.name) {
            var n = (p.matchName || '').toLowerCase();
            if (n.indexOf(_filters.name.toLowerCase()) === -1 && (p.matchNameInitials || '').toLowerCase().indexOf(_filters.name.toLowerCase()) === -1) return false;
        }
        if (_filters.cmMin != null || _filters.cmMax != null) {
            var cm = m.relationship && m.relationship.sharedCentimorgans;
            if (cm == null) return false;
            if (_filters.cmMin != null && cm < _filters.cmMin) return false;
            if (_filters.cmMax != null && cm > _filters.cmMax) return false;
        }
        if (_filters.journey) {
            var sm = _sessionMatches && _sessionMatches[m.sampleId];
            var branches = sm && sm.journeys;
            var found = false;
            if (branches) {
                var q = _filters.journey;
                for (var bi = 0; bi < branches.length; bi++) {
                    if ((branches[bi].displayName || '') === q) { found = true; break; }
                }
                if (_filters.journeyOnly && branches.length > 1) found = false;
            }
            if (!found) return false;
        }
        if (_filters.regions && _filters.regions.length) {
            var sm = _sessionMatches && _sessionMatches[m.sampleId];
            var regs = sm && sm.regions;
            for (var fi = 0; fi < _filters.regions.length; fi++) {
                var rf = _filters.regions[fi];
                if (!rf.region) continue;
                var ok = false;
                if (rf.region.indexOf('__macro__') === 0) {
                    var mkey = rf.region.slice(9);
                    var totalPct = 0;
                    if (regs) {
                        for (var ri = 0; ri < regs.length; ri++) {
                            if ((regs[ri].macroRegionKey || '') === mkey) {
                                totalPct += regs[ri].percentage || 0;
                            }
                        }
                    }
                    if (totalPct > 0) {
                        ok = true;
                        if (rf.pctMin != null && totalPct < rf.pctMin) ok = false;
                        if (rf.pctMax != null && totalPct > rf.pctMax) ok = false;
                    }
                } else {
                    if (regs) {
                        for (var ri = 0; ri < regs.length; ri++) {
                            if ((regs[ri].displayName || regs[ri].key || '') === rf.region) {
                                ok = true;
                                var pct = regs[ri].percentage;
                                if (rf.pctMin != null && (pct == null || pct < rf.pctMin)) ok = false;
                                if (rf.pctMax != null && (pct == null || pct > rf.pctMax)) ok = false;
                                if (ok) break;
                            }
                        }
                    }
                }
                if (!ok) return false;
            }
        }
        return true;
    }

    var _regionOptsSig = '';

    function buildRegionOptions() {
        var html = '<option value="">All</option>';
        if (!_sessionMatches) return html;
        var macroGroups = {};
        var sids = Object.keys(_sessionMatches);
        for (var i = 0; i < sids.length; i++) {
            var sm = _sessionMatches[sids[i]];
            var regs = sm && sm.regions;
            if (regs) {
                for (var ri = 0; ri < regs.length; ri++) {
                    var name = regs[ri].displayName || regs[ri].key;
                    var mkey = regs[ri].macroRegionKey || 'other';
                    if (!name) continue;
                    if (!macroGroups[mkey]) macroGroups[mkey] = {};
                    macroGroups[mkey][name] = true;
                }
            }
        }
        var macroKeys = Object.keys(macroGroups).sort();
        for (var mi = 0; mi < macroKeys.length; mi++) {
            var mkey = macroKeys[mi];
            var names = Object.keys(macroGroups[mkey]).sort();
            html += '<option value="__macro__' + mkey + '">' + titleize(mkey) + '</option>';
            for (var ni = 0; ni < names.length; ni++) {
                html += '<option value="' + names[ni] + '">\u00A0\u00A0' + names[ni] + '</option>';
            }
        }
        return html;
    }

    function renderRegionFilters(force) {
        if (!force && _filterSelectFocused) return;
        var container = document.getElementById('regionFilters');
        if (!container) return;
        if (!force && _regionOptsSig === buildRegionOptions() && container.children.length) return;
        _regionOptsSig = buildRegionOptions();
        var filters = _filters.regions && _filters.regions.length ? _filters.regions : [{ region: '', pctMin: null, pctMax: null }];
        var opts = buildRegionOptions();
        var html = '';
        for (var i = 0; i < filters.length; i++) {
            html += regionRowHtml(i, opts, filters[i]);
        }
        container.innerHTML = html;
        for (var i = 0; i < filters.length; i++) {
            restoreRegionRow(i, filters[i]);
        }
        var rows = container.querySelectorAll('.region-row');
        if (rows.length === 1) {
            var btn = rows[0].querySelector('.region-remove');
            if (btn) btn.style.display = 'none';
        }
    }

    function regionRowHtml(idx, opts, filter) {
        return '<span class="region-row" data-idx="' + idx + '">' +
            '<select class="region-select" data-idx="' + idx + '">' + opts + '</select>' +
            '<span class="filter-sep" style="margin:0 2px">%</span>' +
            '<input type="number" class="region-pct-min filter-input filter-cm" data-idx="' + idx + '" placeholder="Min" value="' + (filter.pctMin || '') + '">' +
            '<span class="filter-sep">–</span>' +
            '<input type="number" class="region-pct-max filter-input filter-cm" data-idx="' + idx + '" placeholder="Max" value="' + (filter.pctMax || '') + '">' +
            '<button class="region-remove topbar-btn" data-idx="' + idx + '" style="font-size:14px;padding:2px 8px">−</button>' +
            '</span>';
    }

    function restoreRegionRow(idx, filter) {
        if (!filter.region) return;
        var sel = document.querySelector('#regionFilters .region-select[data-idx="' + idx + '"]');
        if (sel) sel.value = filter.region;
    }

    function populateFilterSelects() {
        var journeySel = document.getElementById('filterJourney');
        if (!journeySel) return;
        if (_filterSelectFocused) return;
        if (!journeySel._tracking) {
            journeySel._tracking = true;
            journeySel.addEventListener('focus', function() { _filterSelectFocused = true; });
            journeySel.addEventListener('blur', function() { _filterSelectFocused = false; populateFilterSelects(); });
        }
        var currentJourney = journeySel.value;
        if (!journeySel.options.length || journeySel.options[0].value !== '') {
            journeySel.insertAdjacentHTML('afterbegin', '<option value="">All</option>');
        }
        var knownJourneys = {};
        for (var oi = 0; oi < journeySel.options.length; oi++) knownJourneys[journeySel.options[oi].value] = true;
        if (_sessionMatches) {
            var sids = Object.keys(_sessionMatches);
            for (var i = 0; i < sids.length; i++) {
                var sm = _sessionMatches[sids[i]];
                var branches = sm && sm.journeys;
                if (branches) {
                    for (var bi = 0; bi < branches.length; bi++) {
                        var name = branches[bi].displayName;
                        if (name && !knownJourneys[name]) {
                            knownJourneys[name] = true;
                            var opt = document.createElement('option');
                            opt.value = name;
                            opt.textContent = name;
                            var insertIdx = 1;
                            while (insertIdx < journeySel.options.length && journeySel.options[insertIdx].value < name) insertIdx++;
                            journeySel.insertBefore(opt, journeySel.options[insertIdx] || null);
                        }
                    }
                }
            }
        }
        journeySel.value = currentJourney && knownJourneys[currentJourney] ? currentJourney : '';
    }

    function renderCards(guid) {
        var list = _matchListData && _matchListData.matchList;
        if (!list) { var fb = document.getElementById('filterBar'); if (fb) fb.style.display = 'none'; return; }
        var fb = document.getElementById('filterBar');
        if (fb) fb.style.display = '';
        populateFilterSelects();
        renderRegionFilters();
        var filtered = list.filter(matchesFilter);
        var totalPages = Math.ceil(filtered.length / _pageSize);
        if (_currentPage > totalPages) _currentPage = totalPages || 1;
        var start = (_currentPage - 1) * _pageSize;
        var end = Math.min(start + _pageSize, filtered.length);
        var page = filtered.slice(start, end);
        var total = list.length;
        var shown = filtered.length;
        var html = '';
        if (shown < total) html += '<div class="match-count">Showing <strong>' + shown + '</strong> of <strong>' + total + '</strong> matches</div>';
        html += '<div class="cards">';
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
            html += '<span class="card-name">' + (_hideNames ? (p.matchNameInitials || '??') : (p.matchName || 'Unknown')) + '</span></div>';
            html += '<div class="card-details">';
            var relStr = '';
            if (r.sharedCentimorgans) relStr += '<span class="num">' + r.sharedCentimorgans + '</span> cM';
            if (r.sharedCentimorgans && r.numSharedSegments) relStr += ' across ';
            if (r.numSharedSegments) relStr += '<span class="num">' + r.numSharedSegments + '</span> segments';
            if (relStr) html += '<div class="rel-text">' + relStr + '</div>';
            html += '</div>';
            var sm = _sessionMatches && _sessionMatches[m.sampleId];
            var journeys = sm && sm.journeys;
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
    var _hideNames = false;
    var _filters = { name: '', cmMin: null, cmMax: null, journey: '', journeyOnly: false, regions: [] };

function titleize(str) {
    if (!str) return '';
    return str.replace(/_/g, ' ').replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

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

    function restoreFetchUI(guid) {
        var fetchGroupEl = document.getElementById('fetchGroup');
        if (fetchGroupEl) fetchGroupEl.style.display = '';
        DB.getFetchState(guid).then(function(fs) {
            var listBtn = document.getElementById('fetchListBtn');
            var countInput = document.getElementById('matchCountInput');
            var fsBadge = document.getElementById('fetchStateBadge');
            var fetchOptionsEl = document.getElementById('fetchOptions');
            if (fs && fs.status === 0) {
                if (fetchOptionsEl) fetchOptionsEl.style.display = 'none';
                var label = '';
                if (fs.mode === 'cmRange') {
                    var r = fs.params && fs.params.range || '';
                    label = r ? ' (' + r + ' cM)' : '';
                    var parts = r.split('-');
                    if (parts.length === 2) {
                        document.getElementById('cmRangeMin').value = parts[0];
                        document.getElementById('cmRangeMax').value = parts[1];
                    }
                } else {
                    var count = fs.params && fs.params.desiredCount || 0;
                    if (count > 0) label = ' (' + count + ' matches)';
                }
                if (label && listBtn) {
                    listBtn.innerHTML = '<span>&#x25B6;</span> Resume' + label;
                }
                if (countInput) countInput.style.display = 'none';
                var msgEl = document.getElementById('statusMsg');
                if (msgEl) msgEl.innerHTML = 'Previous fetch incomplete — click Resume to continue';
                DB.getSession(guid).then(function(s) {
                    var c = s && s.matches ? Object.keys(s.matches).length : 0;
                    if (fsBadge) fsBadge.textContent = '↻ ' + c + ' fetched (page ' + (fs.nextPage || 1) + ')';
                });
            } else {
                if (fetchOptionsEl) fetchOptionsEl.style.display = '';
                if (listBtn) listBtn.innerHTML = '<span>&#x25B6;</span> Fetch';
                if (countInput) countInput.style.display = '';
                if (fsBadge) fsBadge.textContent = '';
            }
        });
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
        var fetchGroupEl = document.getElementById('fetchGroup');
        if (fetchGroupEl) fetchGroupEl.style.display = 'none';



        var allMatches = [];
        var desiredCount = mode === 'cmRange' ? Infinity : (params.desiredCount || 100);
        var currentPage = 1;
        var nameCache = {};

        function setBadgeFetching() {
            try { chrome.action.setBadgeText({ text: '↻' }); chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' }); } catch(e) {}
        }

        function clearBadge() {
            try { chrome.action.setBadgeText({ text: '' }); } catch(e) {}
        }

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
                        _sessionMatches = session.matches;
                        var sids = Object.keys(session.matches);
                        for (var i = 0; i < sids.length; i++) {
                            var m = session.matches[sids[i]];
                            allMatches.push({ sampleId: sids[i], relationship: m.relationship || {}, createdDate: m.createdDate || null });
                            _profileData[sids[i]] = { matchName: m.matchName, matchNameInitials: m.matchNameInitials, displayGender: m.displayGender, photoUrl: m.photoUrl };
                            if (m.journeys && m.journeys.length) {
                                _batchCommunitiesData[sids[i]] = { branches: m.journeys };
                                resolveJourneyNames(_batchCommunitiesData[sids[i]].branches);
                                if (_sessionMatches && _sessionMatches[sids[i]]) {
                                    _sessionMatches[sids[i]].journeys = _batchCommunitiesData[sids[i]].branches;
                                }
                            }
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
                    var hasMore;
                    if (mode === 'cmRange') {
                        if (data.isLastPage === true) { hasMore = false; }
                        else if (data.isLastPage === undefined) { hasMore = matches.length >= 100; }
                        else { hasMore = matches.length > 0; }
                    } else {
                        hasMore = matches.length >= 100;
                    }
                    debugLog('  got ' + newSids.length + ' new, total=' + allMatches.length + ' next=' + (currentPage + 1) + ' hasMore=' + hasMore + ' isLastPage=' + data.isLastPage);
                    if (newSids.length === 0) {
                        currentPage++;
                        saveState();
                        return nextPage(false);
                    }
                    return fetchProfileData(guid, newSids).then(function() {
                        storeMatchData(guid, allMatches);
                        currentPage++;
                        saveState();
                        return processPageChunks(guid, newSids);
                    }).then(function() {
                        return nextPage(hasMore);
                    });
                });
        }

        function nextPage(hasMore) {
            var remaining = mode === 'cmRange' ? 1 : (desiredCount - allMatches.length);
            debugLog('nextPage: hasMore=' + hasMore + (mode === 'cmRange' ? '' : ' remaining=' + remaining));
            if (remaining > 0 && hasMore) return delay(1500).then(fetchPage);
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
            setStatus('Fetching regions for matches ' + rangeStart + '-' + (rangeStart + chunk.length - 1) + ' of ' + total + '...');
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
                return delay(1500);
            }).then(function() {
                setStatus('Fetching journeys for matches ' + rangeStart + '-' + (rangeStart + chunk.length - 1) + ' of ' + total + '...');
                return fetchBatchCommunities(guid, chunk);
            }).then(function(comData) {
                for (var k in comData) _batchCommunitiesData[k] = comData[k];
                var sKeys = Object.keys(_batchCommunitiesData);
                for (var si = 0; si < sKeys.length; si++) {
                    var branches = _batchCommunitiesData[sKeys[si]] && _batchCommunitiesData[sKeys[si]].branches;
                    if (branches) resolveJourneyNames(branches);
                }
                var list = _matchListData && _matchListData.matchList;
                storeMatchData(guid, list);
                renderCards(guid);
            });
        }

        function finishFetch() {
            clearBadge();
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
            setBadgeFetching();
            saveState();
            var incomplete = findIncompleteSampleIds();
            debugLog('resume: mode=' + mode + ' have=' + allMatches.length + (mode === 'cmRange' ? '' : ' target=' + desiredCount) + ' incomplete=' + incomplete.length);
            if (allMatches.length >= desiredCount) {
                if (incomplete.length === 0) return finishFetch();
                setStatus('Resuming: processing data for ' + incomplete.length + ' matches...');
                return processPageChunks(guid, incomplete).then(finishFetch).catch(function(err) {
                    clearBadge();
                    if (fetchBtn) fetchBtn.disabled = false;
                    restoreFetchUI(guid);
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
                clearBadge();
                if (fetchBtn) fetchBtn.disabled = false;
                restoreFetchUI(guid);
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
                    delay(1500).then(next);
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
        html += '<div id="fetchGroup">';
        html += '<div id="fetchOptions">';
        html += '<div class="label" style="margin-top:16px">Fetch Options</div>';
        html += '<div class="mode-toggle">';
        html += '<button class="mode-btn active" data-mode="count">Count</button>';
        html += '<button class="mode-btn" data-mode="cmRange">cM Range</button>';
        html += '</div>';
        html += '<div class="fetch-row" id="countModeRow"><label class="input-label">Matches <input type="number" id="matchCountInput" class="count-input" value="100" min="1" step="1"></label></div>';
        html += '<div class="fetch-row" id="cmRangeModeRow" style="display:none"><label class="input-label">Min <input type="number" id="cmRangeMin" class="count-input" value="90" min="0"></label><label class="input-label">Max <input type="number" id="cmRangeMax" class="count-input" value="400" min="0"></label></div>';
        html += '</div>';
        html += '<button class="btn fetch-list-btn" id="fetchListBtn" disabled><span>&#x25B6;</span> Fetch</button>';
        html += '</div>';
        html += '<div id="statusMsg" class="status-msg"></div>';
        html += '<pre id="debugLog" style="display:none"></pre>';
        html += '<div id="filterBar" style="display:none">';
        html += '<div class="filter-toggle" id="filterToggle"><span id="filterArrow">&#x25B6;</span> Filtering Options</div>';
        html += '<div id="filterBody" style="display:none">';
        html += '<div class="filter-row">';
        html += '<label class="filter-group">Name <input type="text" id="filterName" class="filter-input" placeholder="Filter by name"></label>';
        html += '<label class="filter-group">cM <input type="number" id="filterCmMin" class="filter-input filter-cm" placeholder="Min"><span class="filter-sep">–</span><input type="number" id="filterCmMax" class="filter-input filter-cm" placeholder="Max"></label>';
        html += '</div>';
        html += '<div class="filter-row">';
        html += '<span class="filter-group">Journey <select id="filterJourney" class="filter-select"><option value="">All</option></select><label class="filter-check"><input type="checkbox" id="filterJourneyOnly"><span class="check-mark"></span> Only this</label></span>';
        html += '<span class="filter-group">Region <span id="regionFilters"></span> <button id="addRegionRow" class="topbar-btn" style="font-size:14px;padding:2px 10px" title="Add region filter">+</button></span>';
        html += '<span id="filterReset" class="filter-clear">Clear filters</span>';
        html += '</div></div></div>';
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
        document.getElementById('hideNamesToggle').addEventListener('change', function() {
            _hideNames = this.checked;
            var sel = document.getElementById('testSelect');
            if (sel && sel.value) renderCards(sel.value);
        });

        function applyFiltersAndRender() {
            var sel = document.getElementById('testSelect');
            if (!sel || !sel.value) return;
            _filters.name = document.getElementById('filterName').value;
            _filters.cmMin = parseFloat(document.getElementById('filterCmMin').value) || null;
            _filters.cmMax = parseFloat(document.getElementById('filterCmMax').value) || null;
            _filters.journey = document.getElementById('filterJourney').value;
            _filters.journeyOnly = document.getElementById('filterJourneyOnly').checked;
            var rows = document.querySelectorAll('#regionFilters .region-row');
            _filters.regions = [];
            for (var ri = 0; ri < rows.length; ri++) {
                var rowSel = rows[ri].querySelector('.region-select');
                var pctMin = rows[ri].querySelector('.region-pct-min');
                var pctMax = rows[ri].querySelector('.region-pct-max');
                var region = rowSel ? rowSel.value : '';
                if (!region) continue;
                _filters.regions.push({ region: region, pctMin: parseFloat(pctMin.value) || null, pctMax: parseFloat(pctMax.value) || null });
            }
            _currentPage = 1;
            renderCards(sel.value);
        }

        document.getElementById('filterName').addEventListener('input', applyFiltersAndRender);
        document.getElementById('filterCmMin').addEventListener('input', applyFiltersAndRender);
        document.getElementById('filterCmMax').addEventListener('input', applyFiltersAndRender);
        document.getElementById('filterJourney').addEventListener('change', applyFiltersAndRender);
        document.getElementById('filterJourneyOnly').addEventListener('change', applyFiltersAndRender);
        document.getElementById('filterToggle').addEventListener('click', function() {
            var body = document.getElementById('filterBody');
            var arrow = document.getElementById('filterArrow');
            if (body.style.display === 'none') {
                body.style.display = '';
                arrow.classList.add('open');
            } else {
                body.style.display = 'none';
                arrow.classList.remove('open');
            }
        });

        document.getElementById('regionFilters').addEventListener('change', function(e) {
            if (e.target.classList.contains('region-select') || e.target.classList.contains('region-pct-min') || e.target.classList.contains('region-pct-max')) {
                applyFiltersAndRender();
            }
        });

        document.getElementById('regionFilters').addEventListener('focus', function(e) {
            if (e.target.classList.contains('region-select') || e.target.classList.contains('region-pct-min') || e.target.classList.contains('region-pct-max')) {
                _filterSelectFocused = true;
            }
        }, true);

        document.getElementById('regionFilters').addEventListener('blur', function(e) {
            if (e.target.classList.contains('region-select') || e.target.classList.contains('region-pct-min') || e.target.classList.contains('region-pct-max')) {
                _filterSelectFocused = false;
                setTimeout(function() { renderRegionFilters(); }, 0);
            }
        }, true);

        document.getElementById('regionFilters').addEventListener('click', function(e) {
            if (e.target.classList.contains('region-remove')) {
                var row = e.target.closest('.region-row');
                if (row) row.remove();
                var rows = document.querySelectorAll('#regionFilters .region-row');
                if (rows.length === 1) {
                    var btn = rows[0].querySelector('.region-remove');
                    if (btn) btn.style.display = 'none';
                }
                applyFiltersAndRender();
            }
        });

        document.getElementById('addRegionRow').addEventListener('click', function() {
            var opts = buildRegionOptions();
            var rows = document.querySelectorAll('#regionFilters .region-row');
            var idx = rows.length;
            _filters.regions.push({ region: '', pctMin: null, pctMax: null });
            document.getElementById('regionFilters').insertAdjacentHTML('beforeend', regionRowHtml(idx, opts, { region: '', pctMin: null, pctMax: null }));
            for (var ri = 0; ri <= idx; ri++) {
                var btn = document.querySelector('#regionFilters .region-row[data-idx="' + ri + '"] .region-remove');
                if (btn) btn.style.display = '';
            }
            applyFiltersAndRender();
        });

        document.getElementById('filterReset').addEventListener('click', function() {
            document.getElementById('filterName').value = '';
            document.getElementById('filterCmMin').value = '';
            document.getElementById('filterCmMax').value = '';
            document.getElementById('filterJourney').value = '';
            document.getElementById('filterJourneyOnly').checked = false;
            _filters.regions = [];
            _regionOptsSig = '';
            renderRegionFilters(true);
            applyFiltersAndRender();
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
            _sessionMatches = null;
            _regionOptsSig = '';
            _batchCommunitiesData = null;
            _batchEthnicityData = null;
            _profileData = null;
            if (matchListEl) matchListEl.innerHTML = '';
            var filterBar = document.getElementById('filterBar');
            if (filterBar) { filterBar.style.display = 'none'; document.getElementById('filterName').value = ''; document.getElementById('filterCmMin').value = ''; document.getElementById('filterCmMax').value = ''; document.getElementById('filterJourney').value = ''; document.getElementById('filterJourneyOnly').checked = false; _filters.regions = []; _regionOptsSig = ''; renderRegionFilters(true); }
            _filters = { name: '', cmMin: null, cmMax: null, journey: '', journeyOnly: false, regions: [] };
            if (selectedGuid) {
                listBtn.disabled = false;
                if (clearBtn) clearBtn.hidden = false;
                fetchMatchCount(selectedGuid);
                DB.getSession(selectedGuid).then(function(session) {
                    if (session && session.matches) {
                        _sessionMatches = session.matches;
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
                            _batchEthnicityData = {};
                            _profileData = {};
                            for (var si2 = 0; si2 < sampleIds.length; si2++) {
                                var m = session.matches[sampleIds[si2]];
                                if (m.journeys && m.journeys.length > 0) {
                                    _batchCommunitiesData[sampleIds[si2]] = { branches: m.journeys };
                                    resolveJourneyNames(_batchCommunitiesData[sampleIds[si2]].branches);
                                    if (_sessionMatches && _sessionMatches[sampleIds[si2]]) {
                                        _sessionMatches[sampleIds[si2]].journeys = _batchCommunitiesData[sampleIds[si2]].branches;
                                    }
                                }
                                if (m.regions && m.regions.length > 0) {
                                    _batchEthnicityData[sampleIds[si2]] = { regions: m.regions };
                                }
                            }
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
                        var fetchGroupEl = document.getElementById('fetchGroup');
                        if (fetchGroupEl) fetchGroupEl.style.display = '';
                        var fetchOptionsEl = document.getElementById('fetchOptions');
                        if (fetchOptionsEl) fetchOptionsEl.style.display = 'none';
                
                
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
                        var fetchGroupEl = document.getElementById('fetchGroup');
                        if (fetchGroupEl) fetchGroupEl.style.display = 'none';
                
                        DB.getSession(selectedGuid).then(function(s) {
                            if (fsBadge) fsBadge.textContent = s && s.matches ? '✓ ' + Object.keys(s.matches).length + ' matches' : '✓ done';
                        });
                    } else {
                        var fetchGroupEl = document.getElementById('fetchGroup');
                        if (fetchGroupEl) fetchGroupEl.style.display = '';
                        var fetchOptionsEl = document.getElementById('fetchOptions');
                        if (fetchOptionsEl) fetchOptionsEl.style.display = '';
                
                
                        listBtn.innerHTML = '<span>&#x25B6;</span> Fetch';
                        if (countInput) countInput.style.display = '';
                        if (fsBadge) fsBadge.textContent = '';
                    }
                });
            } else {
                document.getElementById('matchCountBadge').textContent = '';
                var fetchGroupEl = document.getElementById('fetchGroup');
                if (fetchGroupEl) fetchGroupEl.style.display = '';
                var fetchOptionsEl = document.getElementById('fetchOptions');
                if (fetchOptionsEl) fetchOptionsEl.style.display = '';
        
        
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
                    _sessionMatches = null;
                    _regionOptsSig = '';
                    _batchCommunitiesData = null;
                    _profileData = null;
                    _batchEthnicityData = null;
                    document.getElementById('matchListResult').innerHTML = '';
                    var fbClear = document.getElementById('filterBar');
                    if (fbClear) { fbClear.style.display = 'none'; document.getElementById('filterJourney').innerHTML = '<option value="">All</option>'; _filters.regions = []; _regionOptsSig = ''; renderRegionFilters(true); }
                    var fetchGroupEl = document.getElementById('fetchGroup');
                    if (fetchGroupEl) fetchGroupEl.style.display = '';
                    var fetchOptionsEl = document.getElementById('fetchOptions');
                    if (fetchOptionsEl) fetchOptionsEl.style.display = '';
            
            
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

    Promise.all([loadRegionMap(), loadJourneyNameMap()]).then(function() {
        fetchTests();
    });

    document.getElementById('exportBtn').addEventListener('click', function() {
        if (typeof DB !== 'undefined' && DB.exportDatabase) {
            DB.exportDatabase();
        }
    });

    document.getElementById('importBtn').addEventListener('click', function() {
        document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!file.name.endsWith('.json')) { e.target.value = ''; return; }
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var data = JSON.parse(ev.target.result);
                if (!Array.isArray(data)) throw new Error('Invalid format: expected an array');
                var overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.innerHTML = '<div class="modal"><div class="modal-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><div class="modal-title">Import database?</div><div class="modal-text">This will overwrite your entire database with ' + data.length + ' kit(s) from this file. This cannot be undone.</div><div class="modal-actions"><button class="modal-btn modal-cancel">Cancel</button><button class="modal-btn modal-confirm">Import</button></div></div>';
                document.body.appendChild(overlay);
                overlay.querySelector('.modal-cancel').addEventListener('click', function() { overlay.remove(); });
                overlay.querySelector('.modal-confirm').addEventListener('click', function() {
                    overlay.remove();
                    if (typeof DB !== 'undefined' && DB.importDatabase) {
                        var msg = document.getElementById('statusMsg');
                        if (msg) msg.textContent = 'Importing...';
                        DB.importDatabase(data).then(function(count) {
                            if (msg) msg.textContent = 'Imported ' + count + ' kit(s)';
                            fetchTests();
                        });
                    }
                });
            } catch (err) {
                var overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.innerHTML = '<div class="modal"><div class="modal-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><div class="modal-title">Import failed</div><div class="modal-text">' + err.message + '</div><div class="modal-actions"><button class="modal-btn modal-cancel">OK</button></div></div>';
                document.body.appendChild(overlay);
                overlay.querySelector('.modal-cancel').addEventListener('click', function() { overlay.remove(); });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    document.getElementById('githubBtn').addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://github.com/strike978/matchfetch_ext' });
    });

    document.getElementById('discordBtn').addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://discord.com/invite/f5BtHTM2zZ' });
    });

    document.getElementById('supportBtn').addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://ko-fi.com/matchfetch' });
    });
})();
