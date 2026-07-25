(function() {
    var REPO = 'strike978/matchfetch_ext';

    function checkUpdate() {
        chrome.runtime.sendMessage({ action: 'checkUpdate', repo: REPO }, function(response) {
            if (!response || !response.latest) return;
            var current = chrome.runtime.getManifest().version;
            if (response.latest > current) {
                var btn = document.getElementById('updateBtn');
                btn.style.display = 'flex';
                btn.onclick = function() { chrome.tabs.create({ url: response.url }); };
                var badge = document.getElementById('versionBadge');
                badge.textContent = 'v' + current;
                badge.style.background = '#3b82f6';
                badge.style.color = '#fff';
            }
        });
    }

    var fetchBtn = document.getElementById('fetchBtn');
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
        fetchBtn.disabled = true;

        apiFetch('https://www.ancestry.com/dna/insights/api/dnaSubnav/tests', { credentials: 'include', mode: 'cors' })
            .then(function(data) { displayTests(data); })
            .catch(function(err) { showError(err.message); })
            .finally(function() { fetchBtn.disabled = false; });
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
            html += '</div></div>';
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
                var list = _matchListData && _matchListData.matchList;
                storeMatchData(guid, list);
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
        html += '<div class="guid-box" id="guidBox"><div class="guid-label">Test GUID</div><div class="guid-value" id="guidValue"></div></div>';
        html += '<div id="matchCountResult"></div>';
        html += '<button class="btn fetch-list-btn" id="fetchListBtn" disabled><span>&#x25B6;</span> Fetch</button>';
        html += '<div id="matchListResult"></div>';

        results.innerHTML = html;

        document.getElementById('testSelect').addEventListener('change', function() {
            var box = document.getElementById('guidBox');
            var val = document.getElementById('guidValue');
            var listBtn = document.getElementById('fetchListBtn');
            if (this.value) {
                val.textContent = this.value;
                box.classList.add('visible');
                listBtn.disabled = false;
                fetchMatchCount(this.value);
            } else {
                box.classList.remove('visible');
                document.getElementById('matchCountResult').innerHTML = '';
                listBtn.disabled = true;
            }
        });

        document.getElementById('fetchListBtn').addEventListener('click', function() {
            var sel = document.getElementById('testSelect');
            if (sel && sel.value) fetchMatchList(sel.value);
        });
    }

    checkUpdate();
    fetchBtn.addEventListener('click', fetchTests);
    fetchTests();

    document.getElementById('exportBtn').addEventListener('click', function() {
        if (typeof DB !== 'undefined' && DB.exportDatabase) {
            DB.exportDatabase();
        }
    });
})();
