var DB = (function() {
    var db = new Dexie('MatchFetch');
    db.version(1).stores({
        Ancestry: 'guid',
    });

    function mergeMatchData(existing, matchList, profiles, ethnicity, communities) {
        if (!existing) existing = { guid: '', matches: {} };
        if (matchList) {
            for (var mi = 0; mi < matchList.length; mi++) {
                var m = matchList[mi];
                if (!m || !m.sampleId) continue;
                var r = m.relationship || {};
                var existingMatch = existing.matches[m.sampleId] || {};
                existing.matches[m.sampleId] = {
                    relationship: { sharedCentimorgans: r.sharedCentimorgans || null, numSharedSegments: r.numSharedSegments || null, meiosis: r.meiosis || null },
                    matchClusterCode: m.matchClusterCode || null,
                    tags: m.tags ? Object.keys(m.tags).filter(function(k) { return m.tags[k]; }).map(function(k) { return m.tags[k]; }) : null,
                    createdDate: m.createdDate || null,
                    matchName: existingMatch.matchName || null,
                    matchNameInitials: existingMatch.matchNameInitials || null,
                    displayGender: existingMatch.displayGender || null,
                    photoUrl: existingMatch.photoUrl || null,
                    regions: existingMatch.regions || null,
                    journeys: existingMatch.journeys || null
                };
            }
        }
        if (profiles) mergeProfiles(existing, profiles);
        if (ethnicity) mergeEthnicity(existing, ethnicity);
        if (communities) mergeCommunities(existing, communities);
        return existing;
    }

    function mergeProfiles(existing, profiles) {
        var keys = Object.keys(profiles);
        for (var i = 0; i < keys.length; i++) {
            var sid = keys[i];
            var p = profiles[sid];
            if (!p) continue;
            var em = existing.matches[sid] || {};
            em.matchName = p.matchName || null;
            em.matchNameInitials = p.matchNameInitials || null;
            em.displayGender = p.displayGender || null;
            em.photoUrl = p.photoUrl || null;
            existing.matches[sid] = em;
        }
    }

    function mergeEthnicity(existing, ethnicity) {
        var keys = Object.keys(ethnicity);
        for (var i = 0; i < keys.length; i++) {
            var sid = keys[i];
            var eth = ethnicity[sid];
            if (!eth) continue;
            var em = existing.matches[sid] || {};
            var regions = [];
            if (eth.regions) {
                for (var ri = 0; ri < eth.regions.length; ri++) {
                    var r = eth.regions[ri];
                    regions.push({ color: r.color, key: r.key, displayName: r.displayName || null, lowerConfidence: r.lowerConfidence, macroRegionKey: r.macroRegionKey, percentage: r.percentage, upperConfidence: r.upperConfidence });
                }
            }
            em.regions = regions;
            existing.matches[sid] = em;
        }
    }

    function mergeCommunities(existing, communities) {
        var keys = Object.keys(communities);
        for (var i = 0; i < keys.length; i++) {
            var sid = keys[i];
            var com = communities[sid];
            if (!com) continue;
            var em = existing.matches[sid] || {};
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
            em.journeys = branches;
            existing.matches[sid] = em;
        }
    }

    return {
        saveSession: function(guid, matchList, profiles, ethnicity, communities) {
            return db.transaction('rw', db.Ancestry, function() {
                return db.Ancestry.get(guid).then(function(existing) {
                    var data = mergeMatchData(existing || { guid: guid, matches: {} }, matchList, profiles, ethnicity, communities);
                    data.guid = guid;
                    return db.Ancestry.put(data);
                });
            });
        },

        saveFetchState: function(guid, status, mode, params, nextPage) {
            return db.transaction('rw', db.Ancestry, function() {
                return db.Ancestry.get(guid).then(function(existing) {
                    var data = existing || { guid: guid, matches: {} };
                    data.guid = guid;
                    data.fetchState = { status: status, mode: mode, params: params, nextPage: nextPage || null };
                    return db.Ancestry.put(data);
                });
            });
        },

        deleteFetchState: function(guid) {
            return db.transaction('rw', db.Ancestry, function() {
                return db.Ancestry.get(guid).then(function(existing) {
                    if (!existing) return;
                    delete existing.fetchState;
                    return db.Ancestry.put(existing);
                });
            });
        },

        getSession: function(guid) {
            return db.Ancestry.get(guid).then(function(r) { return r || null; });
        },

        getMatchData: function(guid, sampleId) {
            return db.Ancestry.get(guid).then(function(session) {
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

        getFetchState: function(guid) {
            return db.Ancestry.get(guid).then(function(r) {
                if (!r || !r.fetchState) return null;
                return { status: r.fetchState.status, mode: r.fetchState.mode, params: r.fetchState.params, nextPage: r.fetchState.nextPage };
            });
        },

        deleteSession: function(guid) {
            return db.Ancestry.delete(guid);
        },

        exportDatabase: function() {
            return db.Ancestry.toArray().then(function(all) {
                var blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = 'matchfetch-export.json';
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
            });
        },

        importDatabase: function(data) {
            return db.Ancestry.clear().then(function() {
                return db.Ancestry.bulkPut(data);
            }).then(function() {
                return data.length;
            });
        }
    };
})();
