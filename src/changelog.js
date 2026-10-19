// Changelog: shows a one-time "What's new" popup.
//
// Notes live in data/changelog.json, ordered newest first. The version the user
// last saw is kept in localStorage, so each version's notes are shown once and
// then never again. Anyone with nothing stored yet (a brand new install, or an
// update from a build before this feature) sees the current version's notes.
var Changelog = (function () {
  var STORAGE_KEY = 'mfLastSeenVersion'

  function manifestVersion() {
    try { return chrome.runtime.getManifest().version || '' } catch (e) { return '' }
  }

  function loadEntries() {
    return fetch(chrome.runtime.getURL('data/changelog.json'))
      .then(function (r) { return r.json() })
      .then(function (data) { return (data && data.entries) || [] })
      .catch(function () { return [] })
  }

  function getLastSeen() {
    try { return localStorage.getItem(STORAGE_KEY) || '' } catch (e) { return '' }
  }

  function setLastSeen(version) {
    try { localStorage.setItem(STORAGE_KEY, version) } catch (e) {}
  }

  // Entries the user hasn't seen yet. When we know their last seen version we
  // take everything listed above it; otherwise (first run with the feature, or
  // a build that shipped without notes) we fall back to the current build's
  // entry only.
  function unseen(entries, lastSeen, current) {
    var i
    if (lastSeen) {
      for (i = 0; i < entries.length; i++) {
        if (entries[i].version === lastSeen) return entries.slice(0, i)
      }
    }
    for (i = 0; i < entries.length; i++) {
      if (entries[i].version === current) return [entries[i]]
    }
    return []
  }

  function bulletList(items) {
    return m('ul.cl-list', (items || []).map(function (text) { return m('li', text) }))
  }

  function meta(entry) {
    return m('.cl-meta', [
      m('span.cl-pill', 'Version ' + entry.version),
      entry.date ? m('span.cl-date', entry.date) : null
    ])
  }

  var ICON = '<div class="cl-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg></div>'

  function buildModal(items) {
    return {
      className: 'cl-modal',
      blocking: true,
      icon: ICON,
      title: 'What\u2019s new',
      body: function () {
        if (items.length === 1) {
          return m('.cl-body', [meta(items[0]), bulletList(items[0].changes)])
        }
        return m('.cl-body', items.map(function (entry) {
          return m('.cl-entry', [meta(entry), bulletList(entry.changes)])
        }))
      },
      cancelText: 'Got it'
    }
  }

  // Resolves to a modal-ready object when there is something new to show,
  // otherwise null. The current version is always recorded as seen.
  function check() {
    var current = manifestVersion()
    var lastSeen = getLastSeen()
    if (current) setLastSeen(current)
    return loadEntries().then(function (entries) {
      if (!current || lastSeen === current) return null
      var items = unseen(entries, lastSeen, current)
      if (!items.length) return null
      return buildModal(items)
    }).catch(function () { return null })
  }

  return { check: check }
})()
