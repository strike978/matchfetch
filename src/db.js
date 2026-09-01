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

    function readFileInChunks(file, onText, onEnd, onError) {
        var CHUNK = 4 * 1024 * 1024;
        var offset = 0;
        var decoder = new TextDecoder('utf-8');
        function next() {
            if (offset >= file.size) { onEnd(); return; }
            var end = Math.min(offset + CHUNK, file.size);
            var last = end >= file.size;
            var slice = file.slice(offset, end);
            offset = end;
            var reader = new FileReader();
            reader.onload = function() {
                try { onText(decoder.decode(reader.result, { stream: !last })); setTimeout(next, 0); }
                catch (e) { onError(e); }
            };
            reader.onerror = function() { onError(reader.error || new Error('Could not read file')); };
            reader.readAsArrayBuffer(slice);
        }
        next();
    }

    function makeStreamParser(onElement, onError) {
        var buf = '';
        var pos = 0;
        var mode = 'outer';
        var section = null;
        var outerDepth = 0;
        var rel = 0;
        var inString = false;
        var escaped = false;
        var elemStart = -1;
        var keyStart = -1;
        var expectArray = false;
        var sawSection = false;
        var stopped = false;

        function process(text) {
            if (stopped) return;
            buf += text;
            var n = buf.length;
            while (pos < n) {
                var c = buf[pos];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (c === '\\') escaped = true;
                    else if (c === '"') {
                        inString = false;
                        if (mode === 'outer' && keyStart !== -1) {
                            var key = buf.substring(keyStart, pos);
                            keyStart = -1;
                            if (key === 'ancestry' || key === 'twentyThreeAndMe') {
                                section = key === 'ancestry' ? 'ancestry' : 'twentyThreeAndMe';
                                sawSection = true;
                                expectArray = true;
                            }
                        }
                    }
                    pos++;
                    continue;
                }
                if (c === '"') {
                    inString = true;
                    if (mode === 'outer' && outerDepth === 1) keyStart = pos + 1;
                    pos++;
                    continue;
                }
                if (expectArray) {
                    if (c === '[') { mode = 'array'; rel = 0; expectArray = false; }
                    pos++;
                    continue;
                }
                if (mode === 'array') {
                    if (c === '{') { if (rel === 0 && elemStart === -1) elemStart = pos; rel++; }
                    else if (c === '[') { rel++; }
                    else if (c === '}') {
                        rel--;
                        if (rel === 0 && elemStart !== -1) {
                            var raw = buf.substring(elemStart, pos + 1);
                            elemStart = -1;
                            try { onElement(section, raw); }
                            catch (e) { onError(e); stopped = true; return; }
                        }
                    }
                    else if (c === ']') {
                        rel--;
                        if (rel < 0) { mode = 'outer'; section = null; rel = 0; expectArray = false; }
                    }
                    pos++;
                    continue;
                }
                if (c === '{' || c === '[') {
                    if (c === '[' && outerDepth === 0) { mode = 'array'; section = 'array'; sawSection = true; rel = 0; }
                    else outerDepth++;
                }
                else if (c === '}' || c === ']') { outerDepth--; if (outerDepth < 0) outerDepth = 0; }
                pos++;
            }
            var keep = pos - 128;
            if (keep < 0) keep = 0;
            if (elemStart !== -1 && elemStart < keep) keep = elemStart;
            if (keyStart !== -1 && keyStart < keep) keep = keyStart;
            if (keep > 0) {
                buf = buf.substring(keep);
                pos -= keep;
                if (elemStart !== -1) elemStart -= keep;
                if (keyStart !== -1) keyStart -= keep;
            }
        }

        function isComplete() {
            return !stopped && mode === 'outer' && outerDepth === 0 && rel === 0 &&
                elemStart === -1 && keyStart === -1 && !expectArray && sawSection;
        }
        return { process: process, isComplete: isComplete };
    }

    function parseRecord(section, raw) {
        var rec = JSON.parse(raw);
        if (!rec || !rec.guid) return null;
        return { rec: rec, target: section === 'array' ? (rec.provider === '23andme' ? 'twentyThreeAndMe' : 'ancestry') : section };
    }

    function validateExport(file) {
        return new Promise(function(resolve, reject) {
            var total = 0;
            var scanner = makeStreamParser(function(section, raw) {
                try { if (parseRecord(section, raw)) total++; }
                catch (e) { throw new Error('Corrupt record in export file'); }
            }, function(e) { reject(e); });
            readFileInChunks(file, scanner.process, function() {
                if (!scanner.isComplete()) { reject(new Error('Invalid format: expected an export file')); return; }
                resolve(total);
            }, function(e) { reject(e); });
        });
    }

    function getCurrentRegions(m) {
        var r = m && m.regions;
        if (!r) return null;
        if (Array.isArray(r)) return r;
        var keys = Object.keys(r);
        return keys.length ? r[keys[keys.length - 1]] : null;
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
                    tags: m.tags ? m.tags : (em.tags || null),
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
                if (eth.version) {
                    if (!em.regions || Array.isArray(em.regions)) em.regions = {};
                    em.regions[String(eth.version)] = regions;
                } else {
                    em.regions = regions;
                }
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

    function streamTable(tbl, name, isFirst, write) {
        var PAGE = 1000;
        var first = true;
        var count = 0;
        function streamKeys(keys) {
            var i = 0;
            function next() {
                if (i >= keys.length) return write(']').then(function() { return count; });
                var chunk = keys.slice(i, i + PAGE);
                i += PAGE;
                return tbl.bulkGet(chunk).then(function(records) {
                    return records.reduce(function(p, rec) {
                        if (!rec) return p;
                        return p.then(function() {
                            count++;
                            var text = (first ? '' : ',') + JSON.stringify(rec);
                            first = false;
                            return write(text);
                        });
                    }, Promise.resolve()).then(next);
                });
            }
            return next();
        }
        return write((isFirst ? '' : ',') + JSON.stringify(name) + ':[')
            .then(function() { return tbl.toCollection().keys(); })
            .then(streamKeys);
    }

    function exportDatabase() {
        var pickerPromise = null;
        if (typeof window.showSaveFilePicker === 'function') {
            pickerPromise = window.showSaveFilePicker({
                suggestedName: 'matchfetch-export.json',
                types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }]
            });
        }

        var buffer = '';
        var writeChain = Promise.resolve();
        var blobParts = null;
        var pickerWritable = null;

        function writer(text) {
            buffer += text;
            if (buffer.length >= 1024 * 1024) {
                var chunk = buffer;
                buffer = '';
                writeChain = writeChain.then(function() {
                    if (pickerWritable) return pickerWritable.write(chunk);
                    blobParts.push(chunk);
                });
            }
            return writeChain;
        }
        function flush() {
            if (buffer) {
                var chunk = buffer;
                buffer = '';
                writeChain = writeChain.then(function() {
                    if (pickerWritable) return pickerWritable.write(chunk);
                    blobParts.push(chunk);
                });
            }
            return writeChain;
        }
        function close() {
            return flush().then(function() {
                if (pickerWritable) return pickerWritable.close().then(function() { return 0; });
                var blob = new Blob(blobParts, { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = 'matchfetch-export.json';
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
                return 0;
            });
        }

        var count = 0;
        if (pickerPromise) {
            pickerWritable = null;
            return pickerPromise.then(function(handle) {
                return handle.createWritable();
            }).then(function(w) {
                pickerWritable = w;
                return writer('{');
            }).then(function() {
                return streamTable(db.Ancestry, 'ancestry', true, writer);
            }).then(function(n) {
                count += n;
                return streamTable(db.TwentyThreeAndMe, 'twentyThreeAndMe', false, writer);
            }).then(function(n) {
                count += n;
                return writer('}');
            }).then(function() {
                return close().then(function() { return count; });
            });
        }
        blobParts = [];
        return writer('{').then(function() {
            return streamTable(db.Ancestry, 'ancestry', true, writer);
        }).then(function(n) {
            count += n;
            return streamTable(db.TwentyThreeAndMe, 'twentyThreeAndMe', false, writer);
        }).then(function(n) {
            count += n;
            return writer('}');
        }).then(function() {
            return close().then(function() { return count; });
        });
    }

    function migrateRecord(rec) {
        if (rec && rec.matches) {
            var sids = Object.keys(rec.matches);
            for (var i = 0; i < sids.length; i++) {
                var m = rec.matches[sids[i]];
                if (m && m.regions && Array.isArray(m.regions)) {
                    var v = String(m.version || '2025');
                    var arr = m.regions;
                    m.regions = {};
                    m.regions[v] = arr;
                }
            }
        }
        return rec;
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

        saveFetchOptions: function(guid, opts, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    var data = existing || { guid: guid, matches: {} };
                    data.guid = guid;
                    data.fetchOptions = opts;
                    return t.put(data);
                });
            });
        },

        setProfileName: function(guid, profileName, provider) {
            if (!profileName) return Promise.resolve();
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    if (!existing) return;
                    existing.profileName = profileName;
                    return t.put(existing);
                });
            });
        },

        toggleFavorite: function(guid, sampleId, add, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    if (!existing || !existing.matches || !existing.matches[sampleId]) return;
                    var m = existing.matches[sampleId];
                    if (!m.tags) m.tags = {};
                    if (add) m.tags['2'] = null;
                    else delete m.tags['2'];
                    return t.put(existing);
                });
            });
        },

        setMatchTag: function(guid, sampleId, tagId, add, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    if (!existing || !existing.matches || !existing.matches[sampleId]) return;
                    var m = existing.matches[sampleId];
                    if (!m.tags) m.tags = {};
                    if (add) m.tags[tagId] = null;
                    else delete m.tags[tagId];
                    return t.put(existing);
                });
            });
        },

        removeTagFromAllMatches: function(guid, tagId, provider) {
            var t = table(provider);
            return db.transaction('rw', t, function() {
                return t.get(guid).then(function(existing) {
                    if (!existing || !existing.matches) return;
                    var sids = Object.keys(existing.matches);
                    for (var i = 0; i < sids.length; i++) {
                        var m = existing.matches[sids[i]];
                        if (m && m.tags) delete m.tags[tagId];
                    }
                    return t.put(existing);
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
                    ethnicity: m.regions ? { regions: getCurrentRegions(m), regionsByVersion: m.regions } : null,
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

        exportDatabase: exportDatabase,

        countExport: function(file) {
            return validateExport(file);
        },

        importDatabase: function(file) {
            var BATCH = 5000;
            return validateExport(file).then(function() {
                return db.transaction('rw', db.Ancestry, db.TwentyThreeAndMe, function() {
                    return Promise.all([db.Ancestry.clear(), db.TwentyThreeAndMe.clear()]);
                });
            }).then(function() {
                return new Promise(function(resolve, reject) {
                    var batches = { ancestry: [], twentyThreeAndMe: [] };
                    var imported = 0;
                    var writeChain = Promise.resolve();

                    function flush(target) {
                        var b = batches[target];
                        if (!b.length) return;
                        batches[target] = [];
                        imported += b.length;
                        writeChain = writeChain.then(function() {
                            return db[target === 'twentyThreeAndMe' ? 'TwentyThreeAndMe' : 'Ancestry'].bulkPut(b);
                        });
                    }

                    var scanner = makeStreamParser(function(section, raw) {
                        var parsed = parseRecord(section, raw);
                        if (!parsed) return;
                        delete parsed.rec.provider;
                        migrateRecord(parsed.rec);
                        batches[parsed.target].push(parsed.rec);
                        if (batches[parsed.target].length >= BATCH) flush(parsed.target);
                    }, function(e) { reject(e); });

                    readFileInChunks(file, scanner.process, function() {
                        flush('ancestry');
                        flush('twentyThreeAndMe');
                        writeChain.then(function() { resolve(imported); }).catch(reject);
                    }, function(e) { reject(e); });
                });
            });
        }
    };
})();
