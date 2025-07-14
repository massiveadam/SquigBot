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
        
        if (isSquigSite(tab.url)) {
            // Active on Squig.link
            statusDiv.className = 'status active';
            statusIcon.textContent = '✅';
            statusText.textContent = 'Active on Squig site';
            analyzeBtn.disabled = false;
            
            // Get measurement count from content script
            chrome.tabs.sendMessage(tab.id, { action: 'getMeasurementCount' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Content script not ready:', chrome.runtime.lastError.message);
                    measurementsCount.textContent = 'Extension is initializing...';
                    
                    // Try again after a delay
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, { action: 'getMeasurementCount' }, (retryResponse) => {
                            if (chrome.runtime.lastError) {
                                measurementsCount.textContent = 'Click refresh to initialize extension';
                            } else {
                                updateMeasurementDisplay(retryResponse);
                            }
                        });
                    }, 2000);
                } else {
                    updateMeasurementDisplay(response);
                }
            });
        } else {
            // Not on Squig site
            statusDiv.className = 'status inactive';
            statusIcon.textContent = '❌';
            statusText.textContent = 'Not on a Squig site';
            analyzeBtn.disabled = true;
            measurementsCount.textContent = 'Navigate to a Squig site to use this extension';
        }
    } catch (error) {
        console.error('Error checking tab:', error);
        statusDiv.className = 'status inactive';
        statusIcon.textContent = '⚠️';
        statusText.textContent = 'Error checking page';
    }

    function isSquigSite(url) {
        if (!url) return false;
        
        const squigPatterns = [
            'squig.link',
            'crinacle.com',
            'headphones.com',
            'graph.headphones.com',
            'crin.squig.link',
            'antdroid.squig.link',
            'precog.squig.link',
            'graph-lab.com'
        ];
        
        return squigPatterns.some(pattern => url.includes(pattern));
    }

    function updateMeasurementDisplay(response) {
        if (response && response.count !== undefined) {
            const count = response.count;
            const withData = response.withData || 0;
            
            measurementsCount.textContent = `${count} measurements found (${withData} with data)`;
            
            if (count === 0) {
                measurementsCount.innerHTML = `
                    No measurements found yet. The extension is actively scanning for data.
                    <br><br>
                    <strong style="color: #dc3545;">If you believe data should be available:</strong>
                    <ul style="margin-top: 5px; padding-left: 20px; text-align: left; font-size: 12px;">
                        <li>Click the "Refresh Page" button below</li>
                        <li>Wait for the page to fully load</li>
                        <li>Add headphones to the graph</li>
                        <li>Try scrolling or interacting with the graph</li>
                    </ul>
                `;
            } else if (withData === 0) {
                measurementsCount.innerHTML = `
                    Found ${count} measurement names but no frequency data yet.
                    <br><br>
                    <strong style="color: #ffc107;">Try these steps:</strong>
                    <ul style="margin-top: 5px; padding-left: 20px; text-align: left; font-size: 12px;">
                        <li>Add some headphones to the graph</li>
                        <li>Wait for the data to load</li>
                        <li>Click "Refresh Page" and try again</li>
                    </ul>
                `;
            }
        } else {
            measurementsCount.textContent = 'Scanning for measurements...';
        }
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
        chrome.tabs.create({ url: 'https://github.com/your-username/squig-target-analyzer' });
        window.close();
    });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateMeasurementCount') {
        const measurementsCount = document.getElementById('measurements-count');
        if (measurementsCount) {
            const count = request.count || 0;
            const withData = request.withData || 0;
            measurementsCount.textContent = `${count} measurements found (${withData} with data)`;
        }
    }
});