// Background script for Squig Target Analyzer
chrome.runtime.onInstalled.addListener(() => {
    console.log('Squig Target Analyzer installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateBadge') {
        // Update extension badge with measurement count
        chrome.action.setBadgeText({
            text: request.count > 0 ? request.count.toString() : '',
            tabId: sender.tab.id
        });
        
        chrome.action.setBadgeBackgroundColor({
            color: request.count > 0 ? '#28a745' : '#dc3545'
        });
    }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Clear badge when navigating away from Squig.link
        if (!tab.url.includes('squig.link') && !tab.url.includes('squig')) {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
        }
    }
});

// Handle tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url && !tab.url.includes('squig.link') && !tab.url.includes('squig')) {
            chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
        }
    });
});