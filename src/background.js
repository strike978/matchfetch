var _fetchTabs = {}
var _queue = []
var _busy = false

var DOMAINS = {
  'ancestry.com': {
    tabUrl: '*://*.ancestry.com/*',
    landing: 'https://www.ancestry.com/dna/matches/list'
  },
  '23andme.com': {
    tabUrl: '*://you.23andme.com/*',
    landing: 'https://you.23andme.com/'
  }
}

function normalizeDomain(d) {
  return String(d || '').indexOf('23andme') !== -1 ? '23andme.com' : 'ancestry.com'
}

function waitForTab(id, cb) {
    var h = function(tabId, info) {
        if (tabId === id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(h); cb(id) }
    }
    chrome.tabs.onUpdated.addListener(h)
    setTimeout(function() { chrome.tabs.onUpdated.removeListener(h); cb(id) }, 15000)
}

function getTab(domain, cb) {
    if (_fetchTabs[domain]) {
        chrome.tabs.get(_fetchTabs[domain], function(tab) {
            if (chrome.runtime.lastError || !tab) { _fetchTabs[domain] = null; getTab(domain, cb); return }
            if (tab.status === 'complete') cb(_fetchTabs[domain])
            else waitForTab(_fetchTabs[domain], cb)
        })
        return
    }
    var cfg = DOMAINS[domain]
    chrome.tabs.query({ url: cfg.tabUrl }, function(tabs) {
        if (tabs && tabs.length) { _fetchTabs[domain] = tabs[0].id; getTab(domain, cb); return }
        chrome.tabs.create({ url: cfg.landing, active: false }, function(t) {
            _fetchTabs[domain] = t.id
            waitForTab(t.id, cb)
        })
    })
}

function doFetch(tabId, url, opts, sendResponse) {
    chrome.scripting.executeScript({
        target: { tabId: tabId }, world: 'MAIN',
        func: function(u, o) {
            if (!o.headers) o.headers = {}
            var meta = document.querySelector('meta[name="csrf-token"]')
            if (meta) o.headers['x-csrf-token'] = meta.content
            var csrf = (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1]
            if (csrf) o.headers['X-CSRFToken'] = csrf
            return fetch(u, o).then(function(r) {
                return r.text().then(function(body) {
                    if (r.ok) {
                        if (o.responseType === 'text') return { ok: true, data: body }
                        try { return { ok: true, data: JSON.parse(body) } }
                        catch(e) { return { ok: false, error: 'Bad JSON: ' + body.substring(0,200) } }
                    }
                    return { ok: false, error: 'Status ' + r.status + ' | Body: ' + body.substring(0,300) }
                })
            }).catch(function(e) {
                return { ok: false, error: 'Fetch failed: ' + e.message }
            })
        },
        args: [url, opts]
    }, function(results) {
        if (chrome.runtime.lastError) { sendResponse({ success: false, error: chrome.runtime.lastError.message }); return }
        var r = results && results[0] && results[0].result
        if (!r) { sendResponse({ success: false, error: 'No result' }); return }
        if (r.ok) sendResponse({ success: true, data: r.data })
        else sendResponse({ success: false, error: r.error })
    })
}

function processNext() {
    if (_queue.length === 0) { _busy = false; return }
    var item = _queue.shift()
    getTab(item.domain, function(tabId) {
        doFetch(tabId, item.url, item.opts, function(resp) {
            item.sr(resp)
            processNext()
        })
    })
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action !== 'apiFetch') return
    var domain = normalizeDomain(request.domain || request.url)
    var item = { url: request.url, opts: request.options, sr: sendResponse, domain: domain }
    if (_busy) { _queue.push(item); return true }
    _busy = true
    getTab(domain, function(tabId) {
        doFetch(tabId, item.url, item.opts, function(resp) {
            sendResponse(resp)
            processNext()
        })
    })
    return true
})

chrome.action.onClicked.addListener(function() {
    chrome.tabs.query({ url: chrome.runtime.getURL('src/ancestry/app.html') }, function(t) {
        if (t && t.length) chrome.tabs.update(t[0].id, { active: true })
        else chrome.tabs.create({ url: 'src/ancestry/app.html', pinned: true })
    })
});
