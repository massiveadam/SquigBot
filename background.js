// Background script for Squig Target Analyzer
chrome.runtime.onInstalled.addListener(() => {
    console.log('Squig Target Analyzer installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateBadge') {
        // Update extension badge with measurement count
        const count = request.count || 0;
        
        chrome.action.setBadgeText({
            text: count > 0 ? count.toString() : '',
            tabId: sender.tab?.id
        });
        
        chrome.action.setBadgeBackgroundColor({
            color: count > 0 ? '#28a745' : '#dc3545'
        });
    }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Clear badge when navigating away from Squig sites
        if (!isSquigSite(tab.url)) {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
        }
    }
});

// Handle tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url && !isSquigSite(tab.url)) {
            chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
        }
    });
});

function isSquigSite(url) {
    if (!url) return false;
    
    const squigPatterns = [
        'squig.link',
        'crinacle.com',
        'headphones.com',
        'graph.headphones.com',
        'graph-lab.com'
    ];
    
    return squigPatterns.some(pattern => url.includes(pattern));
}