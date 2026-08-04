var DB = (function() {
    var db = new Dexie('MatchFetch');
    db.version(1).stores({
        Ancestry: 'guid',
    });
    db.version(2).stores({
        Ancestry: 'guid',
        TwentyThreeAndMe: 'guid',
    });

    function table(provider) {
        return provider === '23andme' ? db.TwentyThreeAndMe : db.Ancestry;
    }

    function mergeSessions(existingArr, incomingArr) {
        var map = {};
        var written = 0;
        existingArr.forEach(function(r) { if (r && r.guid) map[r.guid] = r; });
        incomingArr.forEach(function(r) {
            if (!r || !r.guid) return;
            map[r.guid] = r;
            written++;
        });
        return { records: Object.keys(map).map(function(k) { return map[k]; }), written: written };
    }

    function mergeMatchData(existing, matchList, profiles, ethnicity, communities) {
        if (!existing) existing = { guid: '', matches: {} };
        if (matchList) {
            for (var mi = 0; mi < matchList.length; mi++) {
                var m = matchList[mi];
                if (!m || !m.sampleId) continue;
                var r = m.relationship || {};
                var em = existing.matches[m.sampleId] || {};
                existing.matches[m.sampleId] = {
                    relationship: { sharedCentimorgans: r.sharedCentimorgans || null, numSharedSegments: r.numSharedSegments || null, meiosis: r.meiosis || null },
                    matchClusterCode: m.matchClusterCode || null,
                    tags: m.tags ? Object.keys(m.tags).filter(function(k) { return m.tags[k]; }).map(function(k) { return m.tags[k]; }) : null,
                    createdDate: m.createdDate || null,
                    matchName: em.matchName || null,
                    matchNameInitials: em.matchNameInitials || null,
                    displayGender: em.displayGender || null,
                    photoUrl: em.photoUrl || null,
                    regions: em.regions || null,
                    journeys: em.journeys || null
                };
            }
        }
        if (profiles) {
            var pKeys = Object.keys(profiles);
            for (var pi = 0; pi < pKeys.length; pi++) {
                var sid = pKeys[pi];
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
        if (ethnicity) {
            var eKeys = Object.keys(ethnicity);
            for (var ei = 0; ei < eKeys.length; ei++) {
                var sid = eKeys[ei];
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
        if (communities) {
            var cKeys = Object.keys(communities);
            for (var ci = 0; ci < cKeys.length; ci++) {
                var sid = cKeys[ci];
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
        return existing;
    }

    return {
        saveSession: function(guid, matchList, profiles, ethnicity, communities, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    var data = mergeMatchData(existing || { guid: guid, matches: {} }, matchList, profiles, ethnicity, communities);
                    data.guid = guid;
                    return t.put(data);
                });
            });
        },

        saveMatches: function(guid, matches, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    var data = existing || { guid: guid, matches: {} };
                    data.guid = guid;
                    if (matches) {
                        for (var mi = 0; mi < matches.length; mi++) {
                            var m = matches[mi];
                            if (!m || !m.relative_profile_id) continue;
                            data.matches[m.relative_profile_id] = m;
                        }
                    }
                    return t.put(data);
                });
            });
        },

        saveFetchState: function(guid, status, mode, params, nextPage, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    var data = existing || { guid: guid, matches: {} };
                    data.guid = guid;
                    data.fetchState = { status: status, mode: mode, params: params, nextPage: nextPage || null };
                    return t.put(data);
                });
            });
        },

        deleteFetchState: function(guid, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    if (!existing) return;
                    delete existing.fetchState;
                    return t.put(existing);
                });
            });
        },

        getSession: function(guid, provider) {
            return table(provider).get(guid).then(function(r) { return r || null; });
        },

        getMatchData: function(guid, sampleId, provider) {
            return table(provider).get(guid).then(function(session) {
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

        getFetchState: function(guid, provider) {
            return table(provider).get(guid).then(function(r) {
                if (!r || !r.fetchState) return null;
                return { status: r.fetchState.status, mode: r.fetchState.mode, params: r.fetchState.params, nextPage: r.fetchState.nextPage };
            });
        },

        deleteSession: function(guid, provider) {
            return table(provider).delete(guid);
        },

        exportDatabase: function() {
            return Promise.all([db.Ancestry.toArray(), db.TwentyThreeAndMe.toArray()]).then(function(results) {
                var data = { ancestry: results[0], twentyThreeAndMe: results[1] };
                var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = 'matchfetch-export.json';
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
            });
        },

        importDatabase: function(data) {
            var ancestry = [];
            var t23 = [];
            (data.ancestry || []).forEach(function(r) { if (r) { delete r.provider; ancestry.push(r); } });
            (data.twentyThreeAndMe || []).forEach(function(r) { if (r) { delete r.provider; t23.push(r); } });
            return db.transaction('rw', db.Ancestry, db.TwentyThreeAndMe, function() {
                return Promise.all([db.Ancestry.toArray(), db.TwentyThreeAndMe.toArray()]).then(function(existing) {
                    var mAncestry = mergeSessions(existing[0], ancestry);
                    var mT23 = mergeSessions(existing[1], t23);
                    return Promise.all([
                        db.Ancestry.bulkPut(mAncestry.records),
                        db.TwentyThreeAndMe.bulkPut(mT23.records)
                    ]).then(function() {
                        return mAncestry.written + mT23.written;
                    });
                });
            });
        }
    };
})();
