// Popup script for Squig Target Analyzer
document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const statusIcon = statusDiv.querySelector('.status-icon');
    const statusText = statusDiv.querySelector('.status-text');
    const analyzeBtn = document.getElementById('analyze-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const measurementsCount = document.getElementById('measurements-count');

    // Check if we're on a Squig.link site
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.url.includes('squig.link') || tab.url.includes('squig')) {
            // Active on Squig.link
            statusDiv.className = 'status active';
            statusIcon.textContent = '✅';
            statusText.textContent = 'Active on Squig.link';
            analyzeBtn.disabled = false;
            
            // Get measurement count from content script
            chrome.tabs.sendMessage(tab.id, { action: 'getMeasurementCount' }, (response) => {
                if (response && response.count !== undefined) {
                    measurementsCount.textContent = `${response.count} measurements found`;
                    if (response.count === 0) {
                        measurementsCount.textContent += ' (try refreshing if data should be available)';
                    }
                } else {
                    measurementsCount.textContent = 'Scanning for measurements...';
                }
            });
        } else {
            // Not on Squig.link
            statusDiv.className = 'status inactive';
            statusIcon.textContent = '❌';
            statusText.textContent = 'Not on Squig.link';
            analyzeBtn.disabled = true;
            measurementsCount.textContent = 'Navigate to a Squig.link site to use this extension';
        }
    } catch (error) {
        console.error('Error checking tab:', error);
        statusDiv.className = 'status inactive';
        statusIcon.textContent = '⚠️';
        statusText.textContent = 'Error checking page';
    }

    // Event listeners
    analyzeBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'openAnalysisModal' });
            window.close(); // Close popup after opening analysis
        } catch (error) {
            console.error('Error opening analysis:', error);
        }
    });

    refreshBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.reload(tab.id);
            window.close();
        } catch (error) {
            console.error('Error refreshing page:', error);
        }
    });

    settingsBtn.addEventListener('click', () => {
        // Open settings or show info
        chrome.tabs.create({ url: 'https://github.com/yourusername/squig-target-analyzer' });
        window.close();
    });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateMeasurementCount') {
        const measurementsCount = document.getElementById('measurements-count');
        if (measurementsCount) {
            measurementsCount.textContent = `${request.count} measurements found`;
        }
    }
});