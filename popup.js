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
                        measurementsCount.textContent = 'No measurements found yet. The extension is actively scanning for data.';
                        measurementsCount.innerHTML += '<br><br><span style="color: #dc3545;">If you believe data should be available, try these steps:</span>';
                        measurementsCount.innerHTML += '<ul style="margin-top: 5px; padding-left: 20px; text-align: left;">';
                        measurementsCount.innerHTML += '<li>Click the "Refresh Page" button below</li>';
                        measurementsCount.innerHTML += '<li>Wait for the page to fully load</li>';
                        measurementsCount.innerHTML += '<li>Try scrolling down to load more content</li>';
                        measurementsCount.innerHTML += '<li>Click on different headphones to load their data</li>';
                        measurementsCount.innerHTML += '</ul>';
                    }
                } else {
                    measurementsCount.textContent = 'Scanning for measurements...';
                    
                    // If we didn't get a response, the content script might not be fully initialized
                    // Try again after a short delay
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, { action: 'getMeasurementCount' }, (retryResponse) => {
                            if (retryResponse && retryResponse.count !== undefined) {
                                measurementsCount.textContent = `${retryResponse.count} measurements found`;
                                if (retryResponse.count === 0) {
                                    measurementsCount.textContent = 'Still scanning for measurements...';
                                }
                            }
                        });
                    }, 1500);
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
        chrome.tabs.create({ url: 'https://github.com/massiveadam/SquigBot' });
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