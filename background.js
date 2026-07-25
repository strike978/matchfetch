function waitForTab(tabId, cb) {
    var h = function(id, info) {
        if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(h); cb(tabId); }
    };
    chrome.tabs.onUpdated.addListener(h);
    setTimeout(function() { chrome.tabs.onUpdated.removeListener(h); cb(tabId); }, 15000);
}

function injectFetch(tabId, url, opts, sendResponse) {
    chrome.scripting.executeScript({
        target: { tabId: tabId }, world: 'MAIN',
        func: function(u, o) {
            var meta = document.querySelector('meta[name="csrf-token"]');
            var csrf = meta ? meta.content : '';
            if (csrf) {
                if (!o.headers) o.headers = {};
                o.headers['x-csrf-token'] = csrf;
            }
            return fetch(u, o).then(function(r) {
                return r.text().then(function(body) {
                    if (r.ok) {
                        try { return { ok: true, data: JSON.parse(body) }; }
                        catch(e) { return { ok: false, error: 'Bad JSON: ' + body.substring(0,200) }; }
                    }
                    return { ok: false, error: 'Status ' + r.status + ' | Body: ' + body.substring(0,300) };
                });
            }).catch(function(e) {
                return { ok: false, error: 'Fetch failed: ' + e.message };
            });
        },
        args: [url, opts]
    }, function(results) {
        if (chrome.runtime.lastError) { sendResponse({ success: false, error: chrome.runtime.lastError.message }); return; }
        var r = results && results[0] && results[0].result;
        if (!r) { sendResponse({ success: false, error: 'No result' }); return; }
        sendResponse(r.ok ? { success: true, data: r.data } : { success: false, error: r.error });
    });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'checkUpdate') {
        fetch('https://raw.githubusercontent.com/' + request.repo + '/main/version.json', { cache: 'no-cache' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                sendResponse({ latest: data.version, url: data.url });
            })
            .catch(function() { sendResponse({ latest: null }); });
        return true;
    }
    if (request.action !== 'apiFetch') return;
    var pattern = '*://www.' + request.domain + '/*';
    chrome.tabs.query({ url: pattern }, function(tabs) {
        if (tabs.length > 0) {
            if (tabs[0].status === 'complete') injectFetch(tabs[0].id, request.url, request.options, sendResponse);
            else waitForTab(tabs[0].id, function(id) { injectFetch(id, request.url, request.options, sendResponse); });
        } else {
            chrome.tabs.create({ url: 'https://www.' + request.domain + '/dna/matches/list', active: false, pinned: true }, function(tab) {
                waitForTab(tab.id, function(id) { injectFetch(id, request.url, request.options, sendResponse); });
            });
        }
    });
    return true;
});

chrome.action.onClicked.addListener(function() {
    chrome.tabs.create({ url: 'app.html' });
});
