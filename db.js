var DB = (function() {
    var _db = null;

    function _open() {
        return new Promise(function(resolve, reject) {
            if (_db) return resolve(_db);
            var req = indexedDB.open('MatchFetch', 1);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('Ancestry'))
                    db.createObjectStore('Ancestry', { keyPath: 'guid' });
            };
            req.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
            req.onerror = function() { reject(req.error); };
        });
    }

    return {
        saveSession: function(guid, matchList, profiles, ethnicity, communities) {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction('Ancestry', 'readwrite');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { reject(tx.error); };

                    var getReq = tx.objectStore('Ancestry').get(guid);
                    getReq.onsuccess = function() {
                        var trimmed = getReq.result || { guid: guid, matches: {} };

                        if (matchList) {
                            for (var mi = 0; mi < matchList.length; mi++) {
                                var m = matchList[mi];
                                if (!m || !m.sampleId) continue;
                                var r = m.relationship || {};
                                var tagCodes = [];
                                if (m.tags) {
                                    var tagKeys = Object.keys(m.tags);
                                    for (var ti = 0; ti < tagKeys.length; ti++) {
                                        if (m.tags[tagKeys[ti]]) tagCodes.push(m.tags[tagKeys[ti]]);
                                    }
                                }
                                var existing = trimmed.matches[m.sampleId] || {};
                                trimmed.matches[m.sampleId] = {
                                    relationship: { sharedCentimorgans: r.sharedCentimorgans || null, numSharedSegments: r.numSharedSegments || null, meiosis: r.meiosis || null },
                                    matchClusterCode: m.matchClusterCode || null,
                                    tags: tagCodes.length > 0 ? tagCodes : null,
                                    createdDate: m.createdDate || null,
                                    matchName: existing.matchName || null,
                                    matchNameInitials: existing.matchNameInitials || null,
                                    displayGender: existing.displayGender || null,
                                    photoUrl: existing.photoUrl || null,
                                    regions: existing.regions || null,
                                    journeys: existing.journeys || null
                                };
                            }
                        }

                        if (profiles) {
                            var pKeys = Object.keys(profiles);
                            for (var pi = 0; pi < pKeys.length; pi++) {
                                var sid = pKeys[pi];
                                var p = profiles[sid];
                                if (!p) continue;
                                var existing = trimmed.matches[sid] || {};
                                existing.matchName = p.matchName || null;
                                existing.matchNameInitials = p.matchNameInitials || null;
                                existing.displayGender = p.displayGender || null;
                                existing.photoUrl = p.photoUrl || null;
                                trimmed.matches[sid] = existing;
                            }
                        }

                        if (ethnicity) {
                            var eKeys = Object.keys(ethnicity);
                            for (var ei = 0; ei < eKeys.length; ei++) {
                                var sid = eKeys[ei];
                                var eth = ethnicity[sid];
                                if (!eth) continue;
                                var existing = trimmed.matches[sid] || {};
                                var regions = [];
                                if (eth.regions) {
                                    for (var ri = 0; ri < eth.regions.length; ri++) {
                                        var r = eth.regions[ri];
                                        regions.push({ color: r.color, key: r.key, displayName: r.displayName || null, lowerConfidence: r.lowerConfidence, macroRegionKey: r.macroRegionKey, percentage: r.percentage, upperConfidence: r.upperConfidence });
                                    }
                                }
                                existing.regions = regions;
                                trimmed.matches[sid] = existing;
                            }
                        }

                        if (communities) {
                            var cKeys = Object.keys(communities);
                            for (var ci = 0; ci < cKeys.length; ci++) {
                                var sid = cKeys[ci];
                                var com = communities[sid];
                                if (!com) continue;
                                var existing = trimmed.matches[sid] || {};
                                var branches = [];
                                if (com.branches) {
                                    for (var bi = 0; bi < com.branches.length; bi++) {
                                        var b = com.branches[bi];
                                        var comms = [];
                                        if (b.communities) {
                                            for (var cci = 0; cci < b.communities.length; cci++) {
                                                var co = b.communities[cci];
                                                comms.push({ id: co.id, displayName: co.displayName || null, connection: co.connection, connectionPercent: co.connectionPercent });
                                            }
                                        }
                                        branches.push({ id: b.id, displayName: b.displayName || null, connection: b.connection, connectionPercent: b.connectionPercent, communities: comms });
                                    }
                                }
                                existing.journeys = branches;
                                trimmed.matches[sid] = existing;
                            }
                        }

                        tx.objectStore('Ancestry').put(trimmed);
                    };
                });
            });
        },

        getSession: function(guid) {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var req = db.transaction('Ancestry', 'readonly').objectStore('Ancestry').get(guid);
                    req.onsuccess = function() { resolve(req.result || null); };
                    req.onerror = function() { reject(req.error); };
                });
            });
        },

        getMatchData: function(guid, sampleId) {
            return this.getSession(guid).then(function(session) {
                if (!session) return null;
                var m = session.matches && session.matches[sampleId] || null;
                if (!m) return null;
                return {
                    profile: { matchName: m.matchName, matchNameInitials: m.matchNameInitials, displayGender: m.displayGender, photoUrl: m.photoUrl },
                    matchData: { relationship: m.relationship, matchClusterCode: m.matchClusterCode, tags: m.tags, createdDate: m.createdDate },
                    ethnicity: m.regions ? { regions: m.regions } : null,
                    communities: m.journeys ? { branches: m.journeys } : null
                };
            });
        },

        exportDatabase: function() {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var req = db.transaction('Ancestry', 'readonly').objectStore('Ancestry').getAll();
                    req.onsuccess = function() {
                        var blob = new Blob([JSON.stringify(req.result, null, 2)], { type: 'application/json' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url; a.download = 'matchfetch-export.json';
                        document.body.appendChild(a); a.click();
                        document.body.removeChild(a); URL.revokeObjectURL(url);
                        resolve();
                    };
                    req.onerror = function() { reject(req.error); };
                });
            });
        },

        importDatabase: function(data) {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction('Ancestry', 'readwrite');
                    tx.oncomplete = function() { resolve(data.length); };
                    tx.onerror = function() { reject(tx.error); };
                    var clearReq = tx.objectStore('Ancestry').clear();
                    clearReq.onsuccess = function() {
                        for (var i = 0; i < data.length; i++) {
                            tx.objectStore('Ancestry').put(data[i]);
                        }
                    };
                    clearReq.onerror = function() { reject(clearReq.error); };
                });
            });
        },

        deleteSession: function(guid) {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction('Ancestry', 'readwrite');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { reject(tx.error); };
                    tx.objectStore('Ancestry').delete(guid);
                });
            });
        },

        saveFetchState: function(guid, status, mode, params, nextPage) {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction('Ancestry', 'readwrite');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { reject(tx.error); };
                    var getReq = tx.objectStore('Ancestry').get(guid);
                    getReq.onsuccess = function() {
                        var obj = getReq.result || { guid: guid, matches: {} };
                        obj.fetchState = { status: status, mode: mode, params: params, nextPage: nextPage || null };
                        tx.objectStore('Ancestry').put(obj);
                    };
                });
            });
        },

        getFetchState: function(guid) {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var req = db.transaction('Ancestry', 'readonly').objectStore('Ancestry').get(guid);
                    req.onsuccess = function() {
                        var r = req.result;
                        resolve(r && r.fetchState ? { status: r.fetchState.status, mode: r.fetchState.mode, params: r.fetchState.params, nextPage: r.fetchState.nextPage } : null);
                    };
                    req.onerror = function() { reject(req.error); };
                });
            });
        },

        deleteFetchState: function(guid) {
            return _open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction('Ancestry', 'readwrite');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { reject(tx.error); };
                    var getReq = tx.objectStore('Ancestry').get(guid);
                    getReq.onsuccess = function() {
                        var obj = getReq.result;
                        if (obj) { delete obj.fetchState; tx.objectStore('Ancestry').put(obj); }
                        else resolve();
                    };
                });
            });
        }
    };
})();
