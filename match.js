(function() {
    var params = new URLSearchParams(location.search);
    var guid = params.get('guid');
    var sampleId = params.get('sampleId');

    if (!guid || !sampleId) {
        document.getElementById('content').innerHTML = '<div class="error">Missing guid or sampleId</div>';
        return;
    }

    document.getElementById('sampleId').textContent = sampleId;

    var _regionCoords = null;
    var _map = null;
    var _mapInitialized = false;
    var _matchData = null;
    var _mapRegionsPending = false;
    var _regionLayers = {};
    var _regionData = {};

    var _journeyCoords = null;
    var _subjourneyCoords = null;
    var _journeyMap = null;
    var _journeyMapInit = false;
    var _journeyLayers = {};
    var _journeyData = {};
    var _journeyPolygonsPending = false;

    function loadRegionCoords() {
        fetch(chrome.runtime.getURL('region_coordinates.json')).then(function(r) { return r.json(); }).then(function(d) {
            _regionCoords = d;
            if (_mapRegionsPending) addRegionsToMap();
        }, function() {});
    }

    function loadJourneyCoords() {
        fetch(chrome.runtime.getURL('journey_coordinates.json')).then(function(r) { return r.json(); }).then(function(d) {
            _journeyCoords = d;
            if (_journeyPolygonsPending) addJourneysToMap();
        }, function() {});
    }

    function loadSubjourneyCoords() {
        fetch(chrome.runtime.getURL('subjourney_coordinates.json')).then(function(r) { return r.json(); }).then(function(d) {
            _subjourneyCoords = d;
            if (_journeyPolygonsPending) addJourneysToMap();
        }, function() {});
    }

    function zoomToRegion(key) {
        if (!_map || !_regionLayers[key]) return;
        _map.fitBounds(_regionLayers[key].getBounds().pad(0.1));
        _map.getContainer().blur();
        var rd = _regionData[key];
        if (!rd) return;
        var pct = rd.percentage != null ? rd.percentage + '%' : '';
        var range = '';
        if (rd.lowerConfidence != null && rd.upperConfidence != null) range = rd.lowerConfidence + '–' + rd.upperConfidence + '%';
        var popupHtml = '<div style="font-size:13px;font-weight:600;color:#e2e8f0">' + (rd.displayName || key) + '</div>';
        if (pct) popupHtml += '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + pct + (range ? ' (' + range + ')' : '') + '</div>';
        _regionLayers[key].bindPopup(popupHtml, { closeButton: true, offset: L.point(0, -4) }).openPopup();
    }

    function initMap() {
        var mapEl = document.getElementById('map');
        if (!mapEl) { document.getElementById('content').insertAdjacentHTML('beforeend', '<div style="color:#f87171;padding:8px">✕ map element not found</div>'); return; }
        mapEl.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b">⏳ Loading map...</div>';
        if (typeof L === 'undefined') { mapEl.innerHTML = '<div style="padding:20px;color:#f87171">Leaflet library not loaded</div>'; return; }
        try {
            mapEl.innerHTML = '';
            _map = L.map('map', { zoomControl: true, attributionControl: false });
            _map.getContainer().setAttribute('tabindex', '-1');
            _map.getContainer().style.userSelect = 'none';
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(_map);
            _mapInitialized = true;
            _map.invalidateSize();
            addRegionsToMap();
        } catch(e) {
            mapEl.innerHTML = '<div style="padding:20px;color:#f87171">Map error: ' + e.message + '</div>';
        }
    }

    function addRegionsToMap() {
        if (!_map || !_matchData) return;
        var eth = _matchData.ethnicity;
        if (!eth || !eth.regions || !eth.regions.length) return;
        if (!_regionCoords) { _mapRegionsPending = true; return; }

                _regionLayers = {};
        _regionData = {};
        var bounds = L.latLngBounds();
        var count = 0;
        var errors = [];
        for (var ri = 0; ri < eth.regions.length; ri++) {
            var reg = eth.regions[ri];
            var key = reg.key;
            var name = reg.displayName || key;
            if (!_regionCoords[key]) continue;
            var entry = _regionCoords[key];
            var gj;
            if (entry.type) {
                gj = entry;
            } else {
                gj = { type: 'MultiPolygon', coordinates: entry.coordinates };
            }
            if (!gj.coordinates || !gj.coordinates.length) continue;
            try {
                var col = reg.color || '#3b82f6';
                var layer = L.geoJSON(gj, {
                    style: { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.2 },
                });
                layer.bindTooltip(name, { sticky: true });
                layer.addTo(_map);
                _regionLayers[key] = layer;
                _regionData[key] = reg;
                layer.on('click', function(k) { return function(e) { if (e && e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation(); } zoomToRegion(k); if (document.activeElement) document.activeElement.blur(); }; }(key));
                bounds.extend(layer.getBounds());
                count++;
            } catch(e) {
                errors.push(key + ': ' + e.message);
            }
        }
        if (errors.length) {
            var errDiv = document.createElement('div');
            errDiv.style.cssText = 'padding:8px 12px;color:#f87171;font-size:11px;background:rgba(239,68,68,.1);border-radius:6px;margin:8px';
            errDiv.textContent = 'Region errors: ' + errors.join('; ');
            document.querySelector('#tab-regions .card:last-child').appendChild(errDiv);
        }
        if (count && bounds.isValid()) {
            _map.fitBounds(bounds.pad(0.1));
        } else if (!count) {
            var msg = document.createElement('div');
            msg.style.cssText = 'padding:20px;text-align:center;color:#64748b';
            msg.textContent = 'No region coordinates found for this match';
            document.querySelector('#tab-regions .card:last-child').appendChild(msg);
        }
    }

    function titleize(str) {
        if (!str) return '';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }

    function strengthColor(connection) {
        if (!connection) return '#3b82f6';
        var c = connection.toLowerCase().replace(/[\s_]+/g, '_');
        if (c === 'very_likely') return '#4ade80';
        if (c === 'likely') return '#60a5fa';
        if (c === 'possible') return '#facc15';
        if (c === 'unlikely') return '#f87171';
        return '#3b82f6';
    }

    function zoomToJourney(key) {
        if (!_journeyMap || !key) return;

        // remove all existing layers
        for (var k in _journeyLayers) {
            if (_journeyLayers.hasOwnProperty(k)) _journeyMap.removeLayer(_journeyLayers[k]);
        }
        _journeyLayers = {};
        _journeyData = {};

        // add this one
        if (!_journeyCoords && !_subjourneyCoords) return;
        var entry = _journeyCoords[key] || _subjourneyCoords[key];
        if (!entry) return;
        var gj = entry.type ? entry : { type: 'MultiPolygon', coordinates: entry.coordinates };
        if (!gj.coordinates || !gj.coordinates.length) return;

        var nodeData = null;
        var com = _matchData.communities;
        if (com && com.branches) {
            (function findNode(nodes) {
                for (var fi = 0; fi < nodes.length; fi++) {
                    if (nodes[fi].id === key) { nodeData = nodes[fi]; return; }
                    if (nodes[fi].communities) findNode(nodes[fi].communities);
                }
            })(com.branches);
        }
        if (!nodeData) return;

        try {
            var col = strengthColor(nodeData.connection);
            var layer = L.geoJSON(gj, {
                style: { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.2 },
            });
            layer.bindTooltip(nodeData.displayName || key, { sticky: true });
            layer.addTo(_journeyMap);
            _journeyLayers[key] = layer;
            _journeyData[key] = nodeData;
            layer.on('click', function(k) { return function(e) { if (e && e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation(); } zoomToJourney(k); if (document.activeElement) document.activeElement.blur(); }; }(key));

            _journeyMap.fitBounds(layer.getBounds().pad(0.1));
            _journeyMap.getContainer().blur();

            var pct = nodeData.connectionPercent != null ? nodeData.connectionPercent + '%' : '';
            var strength = nodeData.connection || '';
            var popupHtml = '<div style="font-size:13px;font-weight:600;color:#e2e8f0">' + (nodeData.displayName || key) + '</div>';
            if (pct || strength) popupHtml += '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + (strength ? titleize(strength) + ' ' : '') + pct + '</div>';
            layer.bindPopup(popupHtml, { closeButton: true, offset: L.point(0, -4) }).openPopup();
        } catch(e) {}
    }

    function initJourneyMap() {
        var mapEl = document.getElementById('journey-map');
        if (!mapEl) return;
        if (typeof L === 'undefined') return;
        try {
            _journeyMap = L.map('journey-map', { zoomControl: true, attributionControl: false });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(_journeyMap);
            _journeyMapInit = true;
            _journeyMap.invalidateSize();
            addJourneysToMap();
        } catch(e) {
            mapEl.innerHTML = '<div style="padding:20px;color:#f87171">Map error: ' + e.message + '</div>';
        }
    }

    function addJourneysToMap() {
        if (!_journeyMap || !_matchData) return;
        var com = _matchData.communities;
        if (!com || !com.branches) return;
        if (!_journeyCoords || !_subjourneyCoords) { _journeyPolygonsPending = true; return; }
        _journeyPolygonsPending = false;
        _journeyLayers = {};
        _journeyData = {};
        var bounds = L.latLngBounds();
        var count = 0;
        var errors = [];
        for (var bi = 0; bi < com.branches.length; bi++) {
            var n = com.branches[bi];
            var key = n.id;
            if (!key) continue;
            var entry = _journeyCoords[key] || _subjourneyCoords[key];
            if (!entry) continue;
            var gj = entry.type ? entry : { type: 'MultiPolygon', coordinates: entry.coordinates };
            if (!gj.coordinates || !gj.coordinates.length) continue;
            try {
                var col = strengthColor(n.connection);
                var layer = L.geoJSON(gj, {
                    style: { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.2 },
                });
                layer.bindTooltip(n.displayName || key, { sticky: true });
                layer.addTo(_journeyMap);
                _journeyLayers[key] = layer;
                _journeyData[key] = n;
                layer.on('click', function(k) { return function(e) { if (e && e.originalEvent) { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation(); } zoomToJourney(k); if (document.activeElement) document.activeElement.blur(); }; }(key));
                bounds.extend(layer.getBounds());
                count++;
            } catch(e) {
                errors.push(key + ': ' + e.message);
            }
        }
        if (errors.length) {
            var errDiv = document.createElement('div');
            errDiv.style.cssText = 'padding:8px 12px;color:#f87171;font-size:11px;background:rgba(239,68,68,.1);border-radius:6px;margin:8px';
            errDiv.textContent = 'Journey map errors: ' + errors.join('; ');
            document.querySelector('#tab-journeys .map-card').appendChild(errDiv);
        }
        if (count && bounds.isValid()) {
            _journeyMap.fitBounds(bounds.pad(0.1));
        } else if (!count) {
            var msg = document.createElement('div');
            msg.style.cssText = 'padding:20px;text-align:center;color:#64748b';
            msg.textContent = 'No journey coordinates found';
            document.querySelector('#tab-journeys .map-card').appendChild(msg);
        }
    }

    function render(d) {
        _matchData = d;
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
                regionsHtml += '<div class="ethnicity-group"><div class="section-title">' + titleize(macroKeys[mi]) + ' <span class="total-pct">' + total + '%</span></div><div class="region-list">';
                for (var ri2 = 0; ri2 < regions.length; ri2++) {
                    var reg2 = regions[ri2];
                    regionsHtml += '<span class="detail ethnicity" style="border-left:3px solid ' + reg2.color + ';cursor:pointer" data-key="' + reg2.key + '"><span class="detail-label">' + (reg2.displayName || reg2.key || '') + '</span><span class="detail-value">' + reg2.percentage + '%';
                    if (reg2.lowerConfidence != null && reg2.upperConfidence != null) regionsHtml += ' <span class="range">(' + reg2.lowerConfidence + '–' + reg2.upperConfidence + '%)</span>';
                    regionsHtml += '</span></span>';
                }
                regionsHtml += '</div></div>';
            }
            regionsHtml += '</div>';
            regionsHtml += '<div class="card map-card"><div id="map"></div></div>';
            regionsHtml = '<div class="regions-map-row">' + regionsHtml + '</div>';
        }

        if (com && com.branches) {
            journeysHtml += '<div class="card">';
            journeysHtml += '<div class="journey-tree">';
            (function renderJourneyTree(nodes, depth) {
                var sorted = nodes.slice().sort(function(a, b) { return (b.connectionPercent || 0) - (a.connectionPercent || 0); });
                for (var ni = 0; ni < sorted.length; ni++) {
                    var n = sorted[ni];
                    var hasChildren = n.communities && n.communities.length > 0;
                    var strength = '';
                    if (n.connection) {
                        var sc = 'strength-' + n.connection.toLowerCase();
                        strength = ' <span class="journey-strength ' + sc + '">' + titleize(n.connection) + ' ' + (n.connectionPercent || '') + '%</span>';
                    }
                    if (depth === 0) {
                        journeysHtml += '<div class="journey-node">';
                        journeysHtml += '<div class="journey-header" data-key="' + (n.id || '') + '">';
                        journeysHtml += '<span class="journey-toggle' + (hasChildren ? '' : ' journey-toggle-empty') + '">';
                        if (hasChildren) journeysHtml += '▼';
                        journeysHtml += '</span>';
                        journeysHtml += '<span class="journey-name">' + (n.displayName || n.id || '') + '</span>' + strength;
                        journeysHtml += '</div>';
                        if (hasChildren) {
                            journeysHtml += '<div class="journey-children">';
                            renderJourneyTree(n.communities, depth + 1);
                            journeysHtml += '</div>';
                        }
                        journeysHtml += '</div>';
                    } else {
                        if (hasChildren) {
                            journeysHtml += '<div class="journey-sub-node">';
                            journeysHtml += '<div class="journey-header" data-key="' + (n.id || '') + '" style="padding-left:' + (depth * 20) + 'px">';
                            journeysHtml += '<span class="journey-toggle">▼</span>';
                            journeysHtml += '<span class="journey-name">' + (n.displayName || n.id || '') + '</span>' + strength;
                            journeysHtml += '</div>';
                            journeysHtml += '<div class="journey-children">';
                            renderJourneyTree(n.communities, depth + 1);
                            journeysHtml += '</div>';
                            journeysHtml += '</div>';
                        } else {
                            journeysHtml += '<div class="journey-sub-node">';
                            journeysHtml += '<div class="journey-item" data-key="' + (n.id || '') + '" style="padding-left:' + (depth * 20 + 20) + 'px">';
                            journeysHtml += '<span class="journey-name">' + (n.displayName || n.id || '') + '</span>' + strength;
                            journeysHtml += '</div>';
                            journeysHtml += '</div>';
                        }
                    }
                }
            })(com.branches, 0);
            journeysHtml += '</div>';
            journeysHtml += '</div>';
            journeysHtml += '<div class="card map-card"><div id="journey-map"></div></div>';
            journeysHtml = '<div class="regions-map-row">' + journeysHtml + '</div>';
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
                if (this.getAttribute('data-tab') === 'regions' && _map) _map.invalidateSize();
                if (this.getAttribute('data-tab') === 'journeys') {
                    if (_journeyMap) _journeyMap.invalidateSize();
                    else if (com && com.branches) initJourneyMap();
                }
            });
        }

        var regionItems = document.querySelectorAll('.detail.ethnicity[data-key]');
        for (var rki = 0; rki < regionItems.length; rki++) {
            regionItems[rki].addEventListener('click', function() {
                zoomToRegion(this.getAttribute('data-key'));
            });
        }

        var journeyHeaders = document.querySelectorAll('.journey-header[data-key]');
        for (var jhi = 0; jhi < journeyHeaders.length; jhi++) {
            journeyHeaders[jhi].addEventListener('click', function() {
                zoomToJourney(this.getAttribute('data-key'));
            });
        }

        var journeyItems = document.querySelectorAll('.journey-item[data-key]');
        for (var jii = 0; jii < journeyItems.length; jii++) {
            journeyItems[jii].addEventListener('click', function() {
                zoomToJourney(this.getAttribute('data-key'));
            });
        }

        var toggles = document.querySelectorAll('.journey-toggle:not(.journey-toggle-empty)');
        for (var tgi = 0; tgi < toggles.length; tgi++) {
            toggles[tgi].addEventListener('click', function(e) {
                e.stopPropagation();
                var parent = this.closest('.journey-header');
                if (!parent) return;
                var children = parent.nextElementSibling;
                if (children && children.classList.contains('journey-children')) {
                    var expanded = children.style.display !== 'none';
                    children.style.display = expanded ? 'none' : '';
                    this.textContent = expanded ? '▶' : '▼';
                }
            });
        }

        if (eth && eth.regions && eth.regions.length) initMap();
    }

    DB.getMatchData(guid, sampleId).then(function(data) {
        if (!data) {
            document.getElementById('content').innerHTML = '<div class="error">No data found for this match</div>';
            return;
        }
        render(data);
        loadRegionCoords();
        loadJourneyCoords();
        loadSubjourneyCoords();
    });
})();