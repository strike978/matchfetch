(function() {
    var params = new URLSearchParams(location.search);
    var guid = params.get('guid');
    var sampleId = params.get('sampleId');

    if (!guid || !sampleId) {
        document.getElementById('content').innerHTML = '<div class="error">Missing guid or sampleId</div>';
        return;
    }

    document.getElementById('sampleId').textContent = sampleId;

    function render(d) {
        var p = d.profile || {};
        var md = d.matchData || {};
        var rel = md.relationship || {};
        var eth = d.ethnicity;
        var com = d.communities;

        document.title = p.matchName || 'Unknown';

        var html = '';

        html += '<div class="card profile-card">';
        html += '<div class="match-name">';
        var gc = 'gender-n';
        if (p.displayGender === 'M') gc = 'gender-m';
        else if (p.displayGender === 'F') gc = 'gender-f';
        if (p.photoUrl) {
            html += '<img src="' + p.photoUrl + '" class="avatar">';
        } else {
            html += '<div class="avatar avatar-initials ' + gc + '">' + (p.matchNameInitials || '?') + '</div>';
        }
        html += '<span>' + (p.matchName || 'Unknown') + '</span>';
        var profileUrl = 'https://www.ancestry.com/dna/matches/' + guid + '/compare/' + sampleId + '?returnUrl=' + encodeURIComponent('https://www.ancestry.com/dna/matches/' + guid + '/list');
        html += '<a href="' + profileUrl + '" target="_blank" class="profile-link" title="Open on Ancestry"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>';
        html += '</div>';
        html += '<div class="card-details" style="margin-top:12px;">';
        var relStr = '';
        if (rel.sharedCentimorgans) relStr += '<span class="num">' + rel.sharedCentimorgans + '</span> cM';
        if (rel.sharedCentimorgans && rel.numSharedSegments) relStr += ' across ';
        if (rel.numSharedSegments) relStr += '<span class="num">' + rel.numSharedSegments + '</span> segments';
        if (relStr) html += '<div class="rel-text">' + relStr + '</div>';


        html += '</div></div>';

        var regionsHtml = '';
        var journeysHtml = '';

        if (eth && eth.regions) {
            regionsHtml += '<div class="card">';
            regionsHtml += '<div class="label">Regions</div>';
            var grouped = {};
            for (var ri = 0; ri < eth.regions.length; ri++) {
                var reg = eth.regions[ri];
                var key = reg.macroRegionKey || 'other';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(reg);
            }
            var macroKeys = Object.keys(grouped);
            var macroTotals = {};
            for (var mi = 0; mi < macroKeys.length; mi++) {
                var regions = grouped[macroKeys[mi]];
                var total = 0;
                for (var ti = 0; ti < regions.length; ti++) total += regions[ti].percentage || 0;
                macroTotals[macroKeys[mi]] = total;
            }
            macroKeys.sort(function(a, b) { return (macroTotals[b] || 0) - (macroTotals[a] || 0); });
            for (var mi = 0; mi < macroKeys.length; mi++) {
                var regions = grouped[macroKeys[mi]];
                var total = macroTotals[macroKeys[mi]];
                regionsHtml += '<div class="ethnicity-group"><div class="section-title">' + macroKeys[mi] + ' <span class="total-pct">' + total + '%</span></div><div class="region-list">';
                for (var ri2 = 0; ri2 < regions.length; ri2++) {
                    var reg2 = regions[ri2];
                    regionsHtml += '<span class="detail ethnicity" style="border-left:3px solid ' + reg2.color + '"><span class="detail-label">' + (reg2.displayName || reg2.key || '') + '</span><span class="detail-value">' + reg2.percentage + '%';
                    if (reg2.lowerConfidence != null && reg2.upperConfidence != null) regionsHtml += ' <span class="range">(' + reg2.lowerConfidence + '–' + reg2.upperConfidence + '%)</span>';
                    regionsHtml += '</span></span>';
                }
                regionsHtml += '</div></div>';
            }
            regionsHtml += '</div>';
        }

        if (com && com.branches) {
            journeysHtml += '<div class="card">';
            journeysHtml += '<div class="label">Journeys</div>';
            function renderJourneyNodes(nodes, depth) {
                var sorted = nodes.slice().sort(function(a, b) { return (b.connectionPercent || 0) - (a.connectionPercent || 0); });
                var h = '';
                for (var ni = 0; ni < sorted.length; ni++) {
                    var n = sorted[ni];
                    var strength = '';
                    if (n.connection) {
                        var sc = 'strength-' + n.connection.toLowerCase();
                        strength = ' <span class="journey-strength ' + sc + '">' + n.connection + ' ' + (n.connectionPercent || '') + '%</span>';
                    }
                    h += '<div class="journey-item" style="padding-left:' + (depth * 20) + 'px"><span class="journey-name">' + (n.displayName || n.id || '') + '</span>' + strength + '</div>';
                    if (n.communities && n.communities.length > 0) {
                        h += renderJourneyNodes(n.communities, depth + 1);
                    }
                }
                return h;
            }
            journeysHtml += renderJourneyNodes(com.branches, 0);
            journeysHtml += '</div>';
        }

        html += '<div class="tabs"><button class="tab active" data-tab="regions">Regions</button><button class="tab" data-tab="journeys">Journeys</button></div>';
        html += '<div class="tab-content" id="tab-regions">' + regionsHtml + '</div>';
        html += '<div class="tab-content" id="tab-journeys" style="display:none">' + journeysHtml + '</div>';

        document.getElementById('content').innerHTML = html;

        var tabs = document.querySelectorAll('.tab');
        for (var ti = 0; ti < tabs.length; ti++) {
            tabs[ti].addEventListener('click', function() {
                var active = document.querySelector('.tab.active');
                if (active) active.classList.remove('active');
                this.classList.add('active');
                var panels = document.querySelectorAll('.tab-content');
                for (var pi = 0; pi < panels.length; pi++) panels[pi].style.display = 'none';
                document.getElementById('tab-' + this.getAttribute('data-tab')).style.display = '';
            });
        }
    }

    DB.getMatchData(guid, sampleId).then(function(data) {
        if (data) { render(data); return; }
        document.getElementById('content').innerHTML = '<div class="error">No data found for this match</div>';
    });
})();
