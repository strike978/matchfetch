var _queue = []
var _busy = false
var _autoTabs = {}

var DOMAINS = {
  'ancestry.com': {
    name: 'Ancestry.com',
    tabUrl: '*://*.ancestry.com/*',
    pages: [
      'https://www.ancestry.com/dna/matches',
      'https://www.ancestry.com/discoveryui-matches/'
    ],
    landing: 'https://www.ancestry.com/dna/matches/list'
  },
  '23andme.com': {
    name: '23andMe',
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
    var cfg = DOMAINS[domain]
    var pages = cfg.pages || [cfg.landing]
    chrome.tabs.query({ url: cfg.tabUrl }, function(tabs) {
        // Only use a tab that is actually on a matches page. The list URL
        // redirects to /discoveryui-matches/list/<guid>, so accept both.
        var landing = (tabs || []).filter(function(t) {
            if (t.discarded) return false
            var url = t.url || t.pendingUrl || ''
            for (var i = 0; i < pages.length; i++) {
                if (url.indexOf(pages[i]) === 0) return true
            }
            return false
        })
        if (landing.length) {
            delete _autoTabs[domain]
            landing.sort(function(a, b) { return (b.lastAccessed || 0) - (a.lastAccessed || 0) })
            var tab = landing[0]
            if (tab.status === 'complete') cb(tab.id)
            else waitForTab(tab.id, cb)
            return
        }
        // If we already opened a tab for this domain and it's sitting on a
        // sign-in page, keep using it instead of piling up new tabs.
        var autoId = _autoTabs[domain]
        if (autoId != null) {
            chrome.tabs.get(autoId, function(auto) {
                if (!chrome.runtime.lastError && auto && isLoginTab(auto)) {
                    if (auto.status === 'complete') cb(auto.id)
                    else waitForTab(auto.id, cb)
                } else {
                    // The tab was closed or navigated somewhere else (e.g. a
                    // traits/origins page), so open the required page again.
                    delete _autoTabs[domain]
                    openTab(domain, cb)
                }
            })
            return
        }
        openTab(domain, cb)
    })
}

function isLoginTab(tab) {
    var url = (tab && (tab.url || tab.pendingUrl)) || ''
    if (!url) return true
    return /signin|sign-in|login/i.test(url)
}

function openTab(domain, cb) {
    // Open in the background so the user stays on the MatchFetch page.
    chrome.tabs.create({ url: DOMAINS[domain].landing, active: false }, function(t) {
        if (chrome.runtime.lastError || !t) { cb(null); return }
        _autoTabs[domain] = t.id
        waitForTab(t.id, cb)
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

function noTabError(domain) {
    var cfg = DOMAINS[domain]
    return 'Please log in to ' + cfg.name + ' and keep a tab open at ' + cfg.landing + ', then refresh MatchFetch.'
}

function processNext() {
    if (_queue.length === 0) { _busy = false; return }
    var item = _queue.shift()
    getTab(item.domain, function(tabId) {
        if (tabId == null) {
            item.sr({ success: false, error: noTabError(item.domain) })
            processNext()
            return
        }
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
        if (tabId == null) {
            sendResponse({ success: false, error: noTabError(domain) })
            processNext()
            return
        }
        doFetch(tabId, item.url, item.opts, function(resp) {
            sendResponse(resp)
            processNext()
        })
    })
    return true
})

chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome.html') })
    }
});

chrome.action.onClicked.addListener(function() {
    chrome.tabs.query({ url: chrome.runtime.getURL('src/ancestry/app.html') }, function(t) {
        if (t && t.length) chrome.tabs.update(t[0].id, { active: true })
        else chrome.tabs.create({ url: 'src/ancestry/app.html', pinned: true })
    })
});
