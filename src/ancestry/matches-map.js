;(function () {
  'use strict'

  // Matches map: shows where the currently filtered matches' journeys are.
  //
  // Every stored match can have a journey tree (branches -> communities). Each
  // journey has a polygon hosted on Ancestry's CDN. This module aggregates the
  // journeys of all filtered matches, loads each polygon once (and caches it),
  // then draws them on a Leaflet map with one color per journey, matching the
  // journey map on the match detail page. Only main journeys are drawn at
  // first; clicking one hides the other main journeys and reveals its
  // subjourneys (dashed, each with its own color). Clicking a subjourney
  // filters the match list. By default only matches that belong to a single
  // journey are shown, since a multi-journey match would otherwise inflate
  // every journey it touches; a toggle includes them.
  //
  // Exposed as window.AncestryMatchesMap so app.js can render it without
  // owning any of the map/polygon logic.

  var COMMUNITY_ASSETS_HASH = '69e822bce1f93b7b430d4d681bf56938fc88c583'
  var POLYGON_BASE = 'https://www.ancestrycdn.com/dna/communities-assets/' + COMMUNITY_ASSETS_HASH + '/'
  var TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
  var MAX_CONCURRENT_FETCHES = 6

  // Same palette as the per-match journey map (match.js).
  var JOURNEY_PALETTE = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
    '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9'
  ]

  var geometryCache = {} // key -> Promise<geometry|null>
  var fetchQueue = []
  var activeFetches = 0

  var redrawTimer = null
  var lastRedraw = 0

  function pumpQueue() {
    while (activeFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length) {
      var job = fetchQueue.shift()
      activeFetches++
      job().then(function () {
        activeFetches--
        pumpQueue()
      }, function () {
        activeFetches--
        pumpQueue()
      })
    }
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      return r.ok ? r.json() : null
    }).catch(function () { return null })
  }

  // The polygon for a journey is <journeyId>/polygon.json, and for a
  // subjourney it is <parentJourneyId>/<subjourneyId>/polygon.json.
  function geometryFor(item) {
    if (geometryCache[item.key]) return geometryCache[item.key]
    var url = POLYGON_BASE + item.key + '/polygon.json'
    var promise = new Promise(function (resolve) {
      fetchQueue.push(function () {
        return fetchJson(url).then(function (data) {
          var geom = data && data.geometry ? data.geometry : data
          resolve(geom && geom.type && geom.coordinates ? geom : null)
        })
      })
      pumpQueue()
    })
    geometryCache[item.key] = promise
    return promise
  }

  function scheduleRedraw() {
    if (redrawTimer) return
    var wait = Math.max(0, 180 - (Date.now() - lastRedraw))
    redrawTimer = setTimeout(function () {
      redrawTimer = null
      lastRedraw = Date.now()
      if (typeof m !== 'undefined') m.redraw()
    }, wait)
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Aggregate journey trees across matches. Each journey is counted once per
  // match (so a match with two branches under the same journey isn't doubled).
  // With singleOnly, matches that belong to more than one top-level journey are
  // skipped: they can't be pinned to one place without inflating every journey
  // they touch. Subjourneys are always gathered; the map only draws them once a
  // journey has been drilled into.
  function buildStats(matches, getJourneys, nameFor, singleOnly) {
    var list = matches || []
    var byKey = {}
    var covered = 0
    var used = 0
    var multiJourney = 0

    function addNode(node, parent, seen) {
      var key = parent ? parent.id + '/' + node.id : node.id
      if (seen[key]) return
      seen[key] = true
      var st = byKey[key]
      if (!st) {
        st = byKey[key] = {
          key: key,
          id: node.id,
          parentId: parent ? parent.id : null,
          isSub: !!parent,
          name: String((nameFor && nameFor(node.id)) || node.displayName || node.id),
          parentName: parent ? String((nameFor && nameFor(parent.id)) || parent.displayName || parent.id) : null,
          matches: 0
        }
      }
      st.matches++
    }

    for (var mi = 0; mi < list.length; mi++) {
      var match = list[mi]
      var branches = match && match.sampleId && getJourneys ? getJourneys(match.sampleId) : null
      if (!branches || !branches.length) continue
      var valid = []
      for (var vi = 0; vi < branches.length; vi++) {
        if (branches[vi] && branches[vi].id) valid.push(branches[vi])
      }
      if (!valid.length) continue
      covered++
      if (singleOnly && valid.length > 1) {
        multiJourney++
        continue
      }
      used++
      var seen = {}
      for (var bi = 0; bi < valid.length; bi++) {
        var branch = valid[bi]
        addNode(branch, null, seen)
        if (branch.communities && branch.communities.length) {
          for (var ci = 0; ci < branch.communities.length; ci++) {
            var sub = branch.communities[ci]
            if (sub && sub.id) addNode(sub, branch, seen)
          }
        }
      }
    }

    var items = Object.keys(byKey).map(function (k) { return byKey[k] })

    // One color per top-level journey, assigned in the same spirit as the
    // match detail page: biggest journeys get the first palette colors.
    var roots = items.filter(function (it) { return !it.isSub })
    roots.sort(function (a, b) {
      if (b.matches !== a.matches) return b.matches - a.matches
      return a.name.localeCompare(b.name)
    })
    var rootColors = {}
    for (var ri = 0; ri < roots.length; ri++) {
      roots[ri].color = JOURNEY_PALETTE[ri % JOURNEY_PALETTE.length]
      roots[ri].opacity = 0.3
      rootColors[roots[ri].key] = roots[ri].color
    }

    // Subjourneys get their own colors when drilled into. Assign them in the
    // same order as the legend (biggest first) and skip the parent's color so
    // the drill-down stays visually distinct.
    var subsByParent = {}
    for (var sj = 0; sj < items.length; sj++) {
      var subItem = items[sj]
      if (!subItem.isSub) continue
      if (!subsByParent[subItem.parentId]) subsByParent[subItem.parentId] = []
      subsByParent[subItem.parentId].push(subItem)
    }
    Object.keys(subsByParent).forEach(function (parentId) {
      var parentColor = rootColors[parentId]
      var subs = subsByParent[parentId]
      subs.sort(function (a, b) {
        if (b.matches !== a.matches) return b.matches - a.matches
        return a.name.localeCompare(b.name)
      })
      var idx = 0
      for (var i = 0; i < subs.length; i++) {
        if (JOURNEY_PALETTE[idx % JOURNEY_PALETTE.length] === parentColor) idx++
        subs[i].color = JOURNEY_PALETTE[idx % JOURNEY_PALETTE.length]
        subs[i].opacity = 0.42
        idx++
      }
    })

    // Parent journeys draw first so subjourneys sit on top of them.
    items.sort(function (a, b) {
      if (a.isSub !== b.isSub) return a.isSub ? 1 : -1
      if (b.matches !== a.matches) return b.matches - a.matches
      return a.name.localeCompare(b.name)
    })

    return {
      items: items,
      roots: roots,
      byKey: byKey,
      total: list.length,
      covered: covered,
      used: used,
      multiJourney: multiJourney,
      withoutData: list.length - covered
    }
  }

  function statsSignature(items, singleOnly, drillKey) {
    return (drillKey || 'all') + '|' + (singleOnly ? 'single|' : 'all|') + items.map(function (it) {
      return it.key + ':' + it.matches + ':' + it.name + ':' + it.color
    }).join('|')
  }

  function tooltipHtml(item, drillable, pickable) {
    var count = item.isSub
      ? item.matches + (item.matches === 1 ? ' match includes this subjourney' : ' matches include this subjourney')
      : item.matches + (item.matches === 1 ? ' match' : ' matches')
    var action = pickable ? 'Click to filter matches' : drillable ? 'Click to see its subjourneys' : ''
    return '<div style="font-weight:700;font-size:12px;margin-bottom:2px">' + escapeHtml(item.name) + '</div>'
      + (item.isSub ? '<div style="font-size:10px;color:#94a3b8;margin-bottom:2px">Subjourney of ' + escapeHtml(item.parentName) + '</div>' : '')
      + '<div style="font-size:11px;color:#94a3b8">' + count + '</div>'
      + (action ? '<div style="font-size:10px;color:#64748b;margin-top:3px">' + action + '</div>' : '')
  }

  function destroyMap(st) {
    st.token++
    if (st.map) {
      try { st.map.remove() } catch (e) { }
      st.map = null
    }
    st.layerByKey = {}
    st.allBounds = null
    st.building = false
    st.pending = 0
    st.failed = 0
  }

  // Put the count label on the biggest part of a polygon, so journeys made up
  // of several separate areas don't get a label stranded between them.
  function largestPolygonCenter(geom) {
    var best = null

    function consider(ring) {
      if (!ring || !ring.length) return
      var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
      for (var i = 0; i < ring.length; i++) {
        var pt = ring[i]
        if (!pt || pt.length < 2) continue
        var lng = pt[0], lat = pt[1]
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
      }
      if (!isFinite(minLat) || !isFinite(minLng)) return
      var area = (maxLat - minLat) * (maxLng - minLng)
      if (!best || area > best.area) {
        best = { area: area, lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
      }
    }

    function walk(g) {
      if (!g || !g.type) return
      if (g.type === 'Feature') return walk(g.geometry)
      if (g.type === 'FeatureCollection') {
        for (var fi = 0; fi < (g.features || []).length; fi++) walk(g.features[fi])
        return
      }
      if (g.type === 'GeometryCollection') {
        for (var gi = 0; gi < (g.geometries || []).length; gi++) walk(g.geometries[gi])
        return
      }
      if (g.type === 'Polygon') return consider(g.coordinates && g.coordinates[0])
      if (g.type === 'MultiPolygon') {
        for (var pi = 0; pi < (g.coordinates || []).length; pi++) {
          var poly = g.coordinates[pi]
          if (poly && poly.length) consider(poly[0])
        }
      }
    }

    walk(geom)
    return best ? [best.lat, best.lng] : null
  }

  // In the overview, clicking a journey drills into its subjourneys and makes
  // it the current map selection, so switching to List can show its matches.
  // Once drilled in, clicking a journey filters the match list.
  function handleAreaClick(vnode, item) {
    var st = vnode.state
    if (!st.drillKey) {
      if (item && !item.isSub) {
        st.drillKey = item.key
        if (vnode.attrs.onSelectionChange) {
          vnode.attrs.onSelectionChange({ journeyId: item.id, subId: '' })
        }
        m.redraw()
      }
      return
    }
    if (vnode.attrs.onPick) vnode.attrs.onPick(item)
  }

  function rebuildMap(vnode, el) {
    var st = vnode.state
    var items = st.visibleItems || []
    var token = st.token

    st.building = true
    st.pending = items.length
    st.failed = 0
    st.layerByKey = {}
    st.allBounds = null

    var map = L.map(el, {
      zoomControl: true,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 12,
      worldCopyJump: true
    })
    L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map)
    map.setView([25, 0], 2)
    st.map = map

    function finishOne() {
      if (st.token !== token || st.map !== map) return
      st.pending--
      scheduleRedraw()
      if (st.pending > 0) return
      // When drilled in, focus on the subjourneys if there are any; the parent
      // polygon stays visible as context.
      var layers = items.map(function (it) { return st.layerByKey[it.key] }).filter(Boolean)
      var fitLayers = layers
      if (st.drillKey) {
        var subLayers = items.filter(function (it) { return it.isSub })
          .map(function (it) { return st.layerByKey[it.key] }).filter(Boolean)
        if (subLayers.length) fitLayers = subLayers
      }
      if (fitLayers.length) {
        try {
          st.allBounds = L.featureGroup(fitLayers).getBounds()
          if (st.allBounds.isValid()) map.fitBounds(st.allBounds.pad(0.12))
        } catch (e) { }
      }
    }

    items.forEach(function (item) {
      geometryFor(item).then(function (geom) {
        if (st.token !== token || st.map !== map) return
        if (!geom) {
          st.failed++
          item.missing = true
          finishOne()
          return
        }
        var baseOpacity = st.drillKey && !item.isSub ? 0.12 : item.opacity
        var layer = L.geoJSON(geom, {
          style: {
            color: item.color,
            weight: item.isSub ? 2 : 1.5,
            opacity: 0.9,
            fillColor: item.color,
            fillOpacity: baseOpacity,
            dashArray: item.isSub ? '4 3' : null,
            className: 'mf-map-area'
          }
        })
        layer.bindTooltip(tooltipHtml(item, !st.drillKey && !item.isSub, !!st.drillKey && !!vnode.attrs.onPick), { sticky: true })
        layer.on('click', function () { handleAreaClick(vnode, item) })
        layer.on('mouseover', function () {
          layer.setStyle({ weight: item.isSub ? 3 : 2.5, opacity: 1, fillOpacity: Math.min(0.8, baseOpacity + 0.15) })
        })
        layer.on('mouseout', function () {
          layer.setStyle({ weight: item.isSub ? 2 : 1.5, opacity: 0.9, fillOpacity: baseOpacity })
        })
        layer.addTo(map)
        st.layerByKey[item.key] = layer

        var labelAt = largestPolygonCenter(geom)
        if (labelAt && (!st.hideParentLabel || item.isSub)) {
          L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'mf-map-count' + (item.isSub ? ' mf-map-count-sub' : ''),
            interactive: false,
            opacity: 1
          }).setLatLng(labelAt).setContent(
            '<span class="mf-map-count-inner" style="border-color:' + item.color + '">' + item.matches + '</span>'
          ).addTo(map)
        }
        finishOne()
      })
    })
  }

  function ensureMapVisible(vnode) {
    var st = vnode.state
    if (!st.map || !st.el) return
    var el = st.el.querySelector('.mf-map-canvas')
    if (!el) return
    var width = el.clientWidth
    if (width > 0 && st.lastWidth !== width) {
      st.lastWidth = width
      st.map.invalidateSize()
    }
  }

  function legendRow(vnode, item) {
    return m('.mf-map-row', {
      key: item.key,
      title: item.name + ' \u2014 ' + item.matches + (item.matches === 1 ? ' match' : ' matches'),
      onclick: function () { handleAreaClick(vnode, item) }
    }, [
      m('span.mf-map-dot', { style: { background: item.color } }),
      m('span.mf-map-row-name', item.name),
      m('span.mf-map-row-count', String(item.matches))
    ])
  }

  var View = {
    oninit: function (vnode) {
      var st = vnode.state
      st.drillKey = null
      st.visibleItems = []
      st.hideParentLabel = false
      st.stats = null
      st.sig = ''
      st.map = null
      st.layerByKey = {}
      st.allBounds = null
      st.building = false
      st.pending = 0
      st.failed = 0
      st.token = 0
      st.el = null
      st.lastWidth = 0
      st._onResize = null
    },
    oncreate: function (vnode) {
      var st = vnode.state
      st.el = vnode.dom
      st._onResize = function () {
        if (st.map) {
          try { st.map.invalidateSize() } catch (e) { }
        }
      }
      window.addEventListener('resize', st._onResize)
      syncMap(vnode)
    },
    onupdate: function (vnode) {
      vnode.state.el = vnode.dom
      syncMap(vnode)
      ensureMapVisible(vnode)
    },
    onremove: function (vnode) {
      var st = vnode.state
      if (st._onResize) window.removeEventListener('resize', st._onResize)
      destroyMap(st)
    },
    view: function (vnode) {
      var st = vnode.state
      var singleOnly = vnode.attrs.singleOnly !== false
      var stats = buildStats(
        vnode.attrs.matches,
        vnode.attrs.getJourneys,
        vnode.attrs.nameFor,
        singleOnly
      )
      st.stats = stats

      // The drilled journey may disappear when filters change; fall back to
      // the overview rather than showing a stale selection.
      if (st.drillKey && !stats.byKey[st.drillKey]) {
        st.drillKey = null
        if (vnode.attrs.onSelectionChange) vnode.attrs.onSelectionChange(null)
      }
      var drillItem = st.drillKey ? stats.byKey[st.drillKey] : null
      var subItems = []
      if (drillItem) {
        for (var si = 0; si < stats.items.length; si++) {
          var sub = stats.items[si]
          if (sub.isSub && sub.parentId === st.drillKey) subItems.push(sub)
        }
      }
      var visibleItems = drillItem ? [drillItem].concat(subItems) : stats.roots
      st.visibleItems = visibleItems
      st.hideParentLabel = !!(drillItem && subItems.length)

      if (!stats.items.length) {
        var onlyMulti = singleOnly && stats.multiJourney > 0
        return m('.mf-map-empty', [
          m('div', onlyMulti
            ? 'No single-journey matches in this filtered set.'
            : 'No journey map data for these matches.'),
          m('.mf-map-empty-sub', onlyMulti
            ? stats.multiJourney + (stats.multiJourney === 1 ? ' match belongs' : ' matches belong') + ' to more than one journey.'
            : 'Journeys are only available for matches whose journey data has been fetched for this profile.'),
          onlyMulti ? m('button.mf-map-reset', {
            style: { marginTop: '12px' },
            onclick: function () {
              if (vnode.attrs.onSingleOnlyChange) vnode.attrs.onSingleOnlyChange(false)
            }
          }, 'Include matches with multiple journeys') : null
        ])
      }

      var visibleCount = visibleItems.length
      var loaded = st.building ? visibleCount - st.pending : 0
      var failed = st.failed || 0
      var mapped = st.building ? visibleCount - failed : visibleCount
      var progress = null
      if (st.building && st.pending > 0) {
        progress = m('.mf-map-progress', [
          m('.spinner-ring', { style: { width: '12px', height: '12px', borderWidth: '2px' } }),
          'Loading journeys\u2026 ' + loaded + '/' + visibleCount
        ])
      }

      var side = []
      if (!drillItem) {
        side.push(m('.mf-map-stat', [
          m('strong', String(stats.used)),
          ' of ',
          m('strong', String(stats.total)),
          stats.total === 1 ? ' match shown' : ' matches shown'
        ]))
        if (stats.multiJourney) {
          side.push(m('.mf-map-muted', stats.multiJourney + (stats.multiJourney === 1 ? ' match has' : ' matches have') + ' multiple journeys hidden'))
        }
        if (stats.withoutData) {
          side.push(m('.mf-map-muted', stats.withoutData + (stats.withoutData === 1 ? ' match has' : ' matches have') + ' no journey data'))
        }
      }

      if (drillItem) {
        side.push(m('button.mf-map-back', {
          onclick: function () {
            st.drillKey = null
            if (vnode.attrs.onSelectionChange) vnode.attrs.onSelectionChange(null)
            m.redraw()
          }
        }, '\u2190 All journeys'))
        side.push(m('.mf-map-drill-head', [
          m('span.mf-map-dot', { style: { background: drillItem.color } }),
          m('span.mf-map-drill-name', drillItem.name)
        ]))
        side.push(m('.mf-map-stat', [
          m('strong', String(drillItem.matches)),
          drillItem.matches === 1 ? ' match' : ' matches',
          subItems.length
            ? ' \u00b7 ' + subItems.length + (subItems.length === 1 ? ' subjourney' : ' subjourneys')
            : ' \u00b7 no subjourneys'
        ]))
        side.push(progress)
        side.push(failed ? m('.mf-map-muted', failed + ' without map data') : null)
        side.push(m('.mf-map-title', { style: { marginTop: '2px' } },
          subItems.length ? (subItems.length + (subItems.length === 1 ? ' subjourney' : ' subjourneys')) : 'Subjourneys'))
        if (subItems.length) {
          side.push(m('.mf-map-legend', subItems.map(function (item) {
            return legendRow(vnode, item)
          })))
        } else {
          side.push(m('.mf-map-muted', 'This journey has no subjourneys.'))
        }
      } else {
        side.push(progress)
        side.push(failed ? m('.mf-map-muted', failed + ' without map data') : null)
        side.push(m('.mf-map-title', { style: { marginTop: '2px' } }, mapped + (mapped === 1 ? ' journey' : ' journeys')))
        side.push(m('.mf-map-legend', stats.roots.map(function (item) {
          return legendRow(vnode, item)
        })))
      }

      side.push(st.allBounds ? m('button.mf-map-reset', {
        onclick: function () {
          st.drillKey = null
          if (vnode.attrs.onSelectionChange) vnode.attrs.onSelectionChange(null)
          try {
            if (st.map && st.allBounds) st.map.fitBounds(st.allBounds.pad(0.12))
          } catch (e) { }
          if (vnode.attrs.onResetView) vnode.attrs.onResetView()
          else m.redraw()
        }
      }, 'Reset view') : null)

      var hintText
      if (drillItem) {
        hintText = subItems.length
          ? 'Dashed outlines are subjourneys; a match can belong to more than one. Click one to filter, or switch to List for this journey.'
          : 'Click the journey to filter, or switch to List for this journey.'
      } else {
        hintText = 'Click a journey to explore it, then switch to List to see its matches.'
      }
      side.push(m('.mf-map-hint', hintText))

      return m('.mf-map', [
        m('.mf-map-layout', [
          m('.mf-map-canvas'),
          m('.mf-map-side', side)
        ])
      ])
    }
  }

  function syncMap(vnode) {
    var st = vnode.state
    if (!st.stats) return
    var singleOnly = vnode.attrs.singleOnly !== false
    var sig = statsSignature(st.visibleItems || [], singleOnly, st.drillKey)
    if (sig === st.sig && (st.map || !(st.visibleItems && st.visibleItems.length))) return
    st.sig = sig
    destroyMap(st)
    if (!st.visibleItems || !st.visibleItems.length || !st.el) return
    var el = st.el.querySelector('.mf-map-canvas')
    if (!el) return
    rebuildMap(vnode, el)
  }

  window.AncestryMatchesMap = {
    View: View,
    buildStats: buildStats
  }
})()
