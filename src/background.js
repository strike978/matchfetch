var _fetchTabId = null
var _queue = []
var _busy = false

function waitForTab(id, cb) {
    var h = function(tabId, info) {
        if (tabId === id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(h); cb(id) }
    }
    chrome.tabs.onUpdated.addListener(h)
    setTimeout(function() { chrome.tabs.onUpdated.removeListener(h); cb(id) }, 15000)
}

function getTab(cb) {
    if (_fetchTabId) {
        chrome.tabs.get(_fetchTabId, function(tab) {
            if (chrome.runtime.lastError || !tab) { _fetchTabId = null; getTab(cb); return }
            if (tab.status === 'complete') cb(_fetchTabId)
            else waitForTab(_fetchTabId, cb)
        })
        return
    }
    chrome.tabs.query({}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].url && tabs[i].url.indexOf('ancestry.com') > -1) { _fetchTabId = tabs[i].id; getTab(cb); return }
        }
        chrome.tabs.create({ url: 'https://www.ancestry.com/dna/matches/list', active: false }, function(t) {
            _fetchTabId = t.id
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
            return fetch(u, o).then(function(r) {
                return r.text().then(function(body) {
                    if (r.ok) {
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
    getTab(function(tabId) {
        doFetch(tabId, item.url, item.opts, function(resp) {
            item.sr(resp)
            processNext()
        })
    })
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action !== 'apiFetch') return
    if (_busy) { _queue.push({ url: request.url, opts: request.options, sr: sendResponse }); return true }
    _busy = true
    getTab(function(tabId) {
        doFetch(tabId, request.url, request.options, function(resp) {
            sendResponse(resp)
            processNext()
        })
    })
    return true
})

chrome.action.onClicked.addListener(function() {
    chrome.tabs.create({ url: 'src/app.html' })
});
