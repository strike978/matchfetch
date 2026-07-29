;(function () {
    var style = document.createElement('style')
    style.textContent = [
        '.topbar { display: flex; align-items: center; gap: 12px; padding: 16px 24px; background: #1a2332; border-bottom: 1px solid #253044; }',
        '.topbar-icon { width: 28px; height: 28px; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
        '.topbar-title { font-size: 15px; font-weight: 600; color: #f1f5f9; white-space: nowrap; }',
        '.topbar-home { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }',
        '.topbar-link { background: none; border: none; color: #64748b; cursor: pointer; padding: 4px; border-radius: 6px; display: flex; align-items: center; transition: color .2s, background .2s; }',
        '.topbar-link:hover { color: #f1f5f9; background: #253044; }',
        '.topbar-btn { background: none; border: 1px solid #253044; color: #94a3b8; cursor: pointer; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 8px; display: flex; align-items: center; gap: 4px; transition: background .2s, color .2s, border-color .2s; font-family: inherit; }',
        '.topbar-btn:hover { background: #253044; color: #f1f5f9; border-color: #475569; }',
        '.topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }',
        '.topbar-links { display: flex; align-items: center; gap: 6px; }',
        '.topbar-links::before { content: ""; display: block; width: 1px; height: 20px; background: #253044; margin-right: 6px; }',
        '.topbar-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #94a3b8; cursor: pointer; user-select: none; font-family: inherit; }',
        '.topbar-toggle input { display: none; }',
        '.topbar-toggle .slider { width: 26px; height: 14px; background: #253044; border-radius: 7px; position: relative; transition: background .2s; }',
        '.topbar-toggle .slider::after { content: ""; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; background: #64748b; border-radius: 50%; transition: transform .2s, background .2s; }',
        '.topbar-toggle input:checked + .slider { background: #3b82f6; }',
        '.topbar-toggle input:checked + .slider::after { transform: translateX(12px); background: #fff; }',
        '.service-toggle { display: flex; background: #0f1724; border-radius: 6px; overflow: hidden; border: 1px solid #253044; flex-shrink: 0; }',
        '.service-opt { padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s; display: flex; align-items: center; gap: 4px; }',
        '.service-opt.active { background: #1e293b; color: #f1f5f9; }',
        '.service-opt.disabled { color: #475569; cursor: default; }',
        '.service-opt:not(.active):not(.disabled):hover { background: #253044; color: #e2e8f0; }'
    ].join('')
    document.head.appendChild(style)

    var bar = document.createElement('div')
    bar.className = 'topbar'
    bar.innerHTML = '<a class="topbar-home" href="javascript:;"><div class="topbar-icon"><img src="../icons/logo.png" width="28" height="28" alt="M"></div>'
        + '<div class="topbar-title">MatchFetch</div></a>'
        + '<div class="service-toggle">'
        +   '<span class="service-opt active"><svg viewBox="0 0 250 190" width="14" height="14"><path d="M150.82 33.292c-17.654-19.168-35.307-16.14-38.334-15.637 1.513.504 3.027 33.796 21.69 51.45 12.61 11.6 38.335 7.565 38.335 7.565s-4.54-24.715-21.69-43.378m21.187 65.07c-5.55 0-28.248 2.018-43.38 20.68-15.637 19.673-15.133 35.31-18.664 38.84 3.027 1.01 34.805 4.035 48.424-16.645 13.114-19.17 13.62-39.85 13.62-42.876M33.797 84.74c3.53.506 15.637 16.143 37.327 18.16 23.707 2.524 31.777-9.582 32.283-9.582 0-1.514-19.168-22.194-40.353-22.194-14.63.503-29.257 13.617-29.257 13.617m86.254 10.594c-.504.504-20.175 26.734-66.582 19.672C16.142 108.954 2.523 88.272 0 87.768c3.027-4.036 31.275-26.734 64.06-26.23 32.284 1.01 55.99 19.168 55.99 19.168h20.68c-16.644-5.044-36.82-14.123-45.9-34.3-8.07-18.662-6.557-29.76-10.088-45.396 0 0 37.326-3.027 66.078 15.636 26.23 17.15 40.857 62.547 41.362 64.06h16.14L204.793 0l20.176.504c-3.53 21.186 1.01 172.51 0 172.51-2.017.503-19.168 1.51-20.68-2.524 0 0 4.035-74.148 4.54-75.662H193.19c0 1.01-1.513 42.875-33.29 65.07-31.78 22.194-77.68 15.636-77.68 15.636 5.55-8.575 0-17.654 16.14-42.37 18.664-28.247 43.38-38.336 42.877-38.336-1.513.506-20.68.506-21.186.506" fill="#9CBE30"/></svg> AncestryDNA</span>'
        +   '<span class="service-opt disabled" title="Coming Soon"><svg viewBox="0 0 90 180" width="14" height="14"><path d="M62.6275 8.07027C66.129 0.920008 74.7828-2.0301 81.936 1.48003 89.0891 4.99016 92.0304 13.6305 88.5189 20.7807L51.7427 95.6734 39.4273 55.302 62.6275 8.07027ZM8.07352 151.855C.920379 148.345-2.03092 139.705 1.48063 132.555L20.8191 93.1833 33.1345 133.555 27.382 145.265c-3.5115 7.15-12.1553 10.101-19.30848 6.59z" fill="#92C746"/><path d="M20.8191 93.1834L33.1345 133.565 51.7427 95.6735 39.4273 55.302z" fill="#3BA510"/><path d="M13.3156 19.1407C20.939 16.8206 29.0025 21.1107 31.3235 28.731L39.4271 55.302 20.8189 93.1933 3.72142 37.1413c-2.32102-7.6203 1.97086-15.6806 9.59418-18.0006zM62.1973 179.366c-7.6234 2.331-15.6869-1.96-18.0079-9.58L33.1345 133.555 51.7427 95.6634 71.7915 161.366c2.321 7.62-1.9709 15.68-9.5942 18z" fill="#D50F67"/></svg> 23andMe</span>'
        + '</div>'
        + '<div class="topbar-actions" id="topbar-actions">'
        + '<label class="topbar-toggle"><input type="checkbox" id="hideNamesToggle"><span class="slider"></span> Hide names</label>'
        + '<button class="topbar-btn" id="importBtn" title="Import database"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Import</button>'
        + '<button class="topbar-btn" id="exportBtn" title="Export database"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export</button>'
        + '</div>'
        + '<div class="topbar-links">'
        + '<button class="topbar-link" id="discordBtn" title="Discord"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></button>'
        + '<button class="topbar-btn" id="supportBtn" title="Support us on Ko-fi">Support Us <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>'
        + '</div>'
    document.body.insertBefore(bar, document.body.firstChild)

    ;['discordBtn','supportBtn'].forEach(function(id) {
        var el = document.getElementById(id)
        if (!el) return
        if (id === 'discordBtn') el.addEventListener('click', function() { chrome.tabs.create({ url: 'https://discord.com/invite/f5BtHTM2zZ' }) })
        else if (id === 'supportBtn') el.addEventListener('click', function() { chrome.tabs.create({ url: 'https://ko-fi.com/matchfetch' }) })
    })
})()
