// Squig Target Analyzer Content Script
class SquigAnalyzer {
    constructor() {
        this.measurements = new Map();
        this.isSquigSite = false;
        this.analysisButton = null;
        this.init();
    }

    init() {
        // Check if we're on a Squig.link site
        this.detectSquigSite();
        
        if (this.isSquigSite) {
            this.injectAnalysisButton();
            this.setupDataInterception();
            this.observePageChanges();
        }
    }

    detectSquigSite() {
        // Check for Squig.link specific elements
        const indicators = [
            'div[id*="graph"]',
            'div[class*="squig"]',
            'script[src*="plotly"]',
            'div[class*="measurement"]'
        ];
        
        this.isSquigSite = indicators.some(selector => 
            document.querySelector(selector) !== null
        ) || window.location.hostname.includes('squig');
        
        console.log('Squig site detected:', this.isSquigSite);
    }

    injectAnalysisButton() {
        // Create floating analysis button
        this.analysisButton = document.createElement('div');
        this.analysisButton.id = 'squig-analyzer-button';
        this.analysisButton.innerHTML = `
            <button id="analyze-btn" title="Analyze Target Deviations">
                📊 Analyze
            </button>
        `;
        
        document.body.appendChild(this.analysisButton);
        
        // Add click handler
        document.getElementById('analyze-btn').addEventListener('click', () => {
            this.openAnalysisModal();
        });
    }

    setupDataInterception() {
        // Intercept network requests for measurement data
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            
            // Check if this is measurement data
            const url = args[0];
            if (typeof url === 'string' && this.isMeasurementData(url)) {
                const clonedResponse = response.clone();
                this.processMeasurementData(url, clonedResponse);
            }
            
            return response;
        };

        // Also check for existing data in the page
        this.scanExistingData();
    }

    isMeasurementData(url) {
        const patterns = [
            /\.csv$/i,
            /\.json$/i,
            /data/i,
            /measurement/i,
            /frequency/i
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }

    async processMeasurementData(url, response) {
        try {
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            const parsed = this.parseFrequencyData(data, url);
            if (parsed) {
                this.measurements.set(url, parsed);
                console.log('Captured measurement data:', url);
                this.updateMeasurementCount();
            }
        } catch (error) {
            console.error('Error processing measurement data:', error);
        }
    }

    parseFrequencyData(data, url) {
        try {
            // Handle JSON format
            if (typeof data === 'object') {
                return this.parseJSONData(data, url);
            }
            
            // Handle CSV format
            if (typeof data === 'string') {
                return this.parseCSVData(data, url);
            }
        } catch (error) {
            console.error('Error parsing frequency data:', error);
        }
        
        return null;
    }

    parseJSONData(data, url) {
        // Common JSON structures in Squig.link
        const result = {
            url: url,
            name: this.extractModelName(url),
            frequencies: [],
            amplitudes: [],
            metadata: {}
        };

        // Try different JSON structures
        if (data.data && Array.isArray(data.data)) {
            // Plotly format
            const trace = data.data[0];
            if (trace.x && trace.y) {
                result.frequencies = trace.x;
                result.amplitudes = trace.y;
                result.name = trace.name || result.name;
            }
        } else if (data.frequency && data.amplitude) {
            // Direct format
            result.frequencies = data.frequency;
            result.amplitudes = data.amplitude;
        } else if (Array.isArray(data)) {
            // Array of points
            data.forEach(point => {
                if (point.freq !== undefined && point.amp !== undefined) {
                    result.frequencies.push(point.freq);
                    result.amplitudes.push(point.amp);
                }
            });
        }

        return result.frequencies.length > 0 ? result : null;
    }

    parseCSVData(data, url) {
        const result = {
            url: url,
            name: this.extractModelName(url),
            frequencies: [],
            amplitudes: [],
            metadata: {}
        };

        const lines = data.split('\n');
        let headerSkipped = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Skip header row
            if (!headerSkipped && (trimmed.includes('frequency') || trimmed.includes('Hz'))) {
                headerSkipped = true;
                continue;
            }

            const values = trimmed.split(',').map(v => v.trim());
            if (values.length >= 2) {
                const freq = parseFloat(values[0]);
                const amp = parseFloat(values[1]);
                
                if (!isNaN(freq) && !isNaN(amp)) {
                    result.frequencies.push(freq);
                    result.amplitudes.push(amp);
                }
            }
        }

        return result.frequencies.length > 0 ? result : null;
    }

    extractModelName(url) {
        // Extract model name from URL or filename
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        return filename.replace(/\.(csv|json)$/i, '').replace(/[_-]/g, ' ');
    }

    scanExistingData() {
        // Look for existing measurement data in the page
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            if (script.textContent.includes('frequency') || script.textContent.includes('Plotly')) {
                this.extractInlineData(script.textContent);
            }
        });
    }

    extractInlineData(scriptContent) {
        // Extract data from inline JavaScript
        try {
            // Look for Plotly data
            const plotlyMatch = scriptContent.match(/Plotly\.newPlot\([^,]+,\s*(\[.*?\])/s);
            if (plotlyMatch) {
                const data = eval(plotlyMatch[1]);
                if (Array.isArray(data)) {
                    data.forEach((trace, index) => {
                        if (trace.x && trace.y) {
                            const measurement = {
                                url: `inline-${index}`,
                                name: trace.name || `Measurement ${index + 1}`,
                                frequencies: trace.x,
                                amplitudes: trace.y,
                                metadata: { source: 'inline' }
                            };
                            this.measurements.set(`inline-${index}`, measurement);
                        }
                    });
                    this.updateMeasurementCount();
                }
            }
        } catch (error) {
            console.error('Error extracting inline data:', error);
        }
    }

    observePageChanges() {
        // Watch for dynamic content changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Check for new measurement data
                    this.scanExistingData();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    openAnalysisModal() {
        // Remove existing modal if present
        const existingModal = document.getElementById('squig-analysis-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create analysis modal
        const modal = document.createElement('div');
        modal.id = 'squig-analysis-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Target Deviation Analysis</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="controls">
                        <label for="target-select">Target Curve:</label>
                        <select id="target-select">
                            <option value="harman">Harman Target</option>
                            <option value="diffuse">Diffuse Field</option>
                            <option value="flat">Flat Response</option>
                        </select>
                        
                        <label for="freq-range">Frequency Range:</label>
                        <select id="freq-range">
                            <option value="20-20000">Full Range (20Hz-20kHz)</option>
                            <option value="200-2000">Midrange (200Hz-2kHz)</option>
                            <option value="20-200">Bass (20Hz-200Hz)</option>
                            <option value="2000-20000">Treble (2kHz-20kHz)</option>
                        </select>
                        
                        <button id="analyze-all-btn">Analyze All Measurements</button>
                    </div>
                    
                    <div class="results">
                        <div class="measurements-found">
                            Found ${this.measurements.size} measurements
                        </div>
                        <div id="analysis-results"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listeners
        modal.querySelector('.close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('#analyze-all-btn').addEventListener('click', () => {
            this.performAnalysis();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    async performAnalysis() {
        const targetType = document.getElementById('target-select').value;
        const freqRange = document.getElementById('freq-range').value;
        const resultsDiv = document.getElementById('analysis-results');

        resultsDiv.innerHTML = '<div class="loading">Analyzing measurements...</div>';

        try {
            const targetCurve = await this.getTargetCurve(targetType);
            const [minFreq, maxFreq] = freqRange.split('-').map(Number);
            
            const results = [];
            
            for (const [url, measurement] of this.measurements) {
                const deviation = this.calculateDeviation(
                    measurement,
                    targetCurve,
                    minFreq,
                    maxFreq
                );
                
                results.push({
                    name: measurement.name,
                    deviation: deviation,
                    url: url
                });
            }

            // Sort by deviation (lowest first)
            results.sort((a, b) => a.deviation - b.deviation);

            this.displayResults(results, resultsDiv);
        } catch (error) {
            resultsDiv.innerHTML = `<div class="error">Error during analysis: ${error.message}</div>`;
        }
    }

    async getTargetCurve(targetType) {
        // Return target curve data
        const targets = {
            harman: this.generateHarmanTarget(),
            diffuse: this.generateDiffuseFieldTarget(),
            flat: this.generateFlatTarget()
        };

        return targets[targetType] || targets.harman;
    }

    generateHarmanTarget() {
        // Simplified Harman target curve
        const frequencies = [];
        const amplitudes = [];

        for (let freq = 20; freq <= 20000; freq *= 1.1) {
            frequencies.push(freq);
            
            let amp = 0;
            if (freq < 100) {
                amp = 2; // Bass boost
            } else if (freq < 1000) {
                amp = 0;
            } else if (freq < 3000) {
                amp = 1; // Mild presence boost
            } else if (freq < 8000) {
                amp = -2; // Treble dip
            } else {
                amp = 0;
            }
            
            amplitudes.push(amp);
        }

        return { frequencies, amplitudes };
    }

    generateDiffuseFieldTarget() {
        // Simplified diffuse field target
        const frequencies = [];
        const amplitudes = [];

        for (let freq = 20; freq <= 20000; freq *= 1.1) {
            frequencies.push(freq);
            amplitudes.push(0); // Flat for simplicity
        }

        return { frequencies, amplitudes };
    }

    generateFlatTarget() {
        // Flat response target
        const frequencies = [];
        const amplitudes = [];

        for (let freq = 20; freq <= 20000; freq *= 1.1) {
            frequencies.push(freq);
            amplitudes.push(0);
        }

        return { frequencies, amplitudes };
    }

    calculateDeviation(measurement, targetCurve, minFreq, maxFreq) {
        // Calculate RMS deviation between measurement and target
        const { frequencies: measFreqs, amplitudes: measAmps } = measurement;
        const { frequencies: targetFreqs, amplitudes: targetAmps } = targetCurve;

        let sumSquaredDiffs = 0;
        let count = 0;

        for (let i = 0; i < measFreqs.length; i++) {
            const freq = measFreqs[i];
            
            if (freq < minFreq || freq > maxFreq) continue;

            const measAmp = measAmps[i];
            const targetAmp = this.interpolateTarget(freq, targetFreqs, targetAmps);

            const diff = measAmp - targetAmp;
            sumSquaredDiffs += diff * diff;
            count++;
        }

        return count > 0 ? Math.sqrt(sumSquaredDiffs / count) : Infinity;
    }

    interpolateTarget(frequency, targetFreqs, targetAmps) {
        // Linear interpolation of target curve
        for (let i = 0; i < targetFreqs.length - 1; i++) {
            if (frequency >= targetFreqs[i] && frequency <= targetFreqs[i + 1]) {
                const ratio = (frequency - targetFreqs[i]) / (targetFreqs[i + 1] - targetFreqs[i]);
                return targetAmps[i] + ratio * (targetAmps[i + 1] - targetAmps[i]);
            }
        }

        // If outside range, return nearest value
        if (frequency < targetFreqs[0]) return targetAmps[0];
        if (frequency > targetFreqs[targetFreqs.length - 1]) return targetAmps[targetAmps.length - 1];

        return 0;
    }

    displayResults(results, container) {
        let html = '<div class="results-header">Results (sorted by deviation):</div>';
        html += '<div class="results-table">';
        html += '<div class="table-header"><span>Rank</span><span>Model</span><span>Deviation (dB RMS)</span></div>';

        results.forEach((result, index) => {
            html += `
                <div class="table-row">
                    <span>${index + 1}</span>
                    <span>${result.name}</span>
                    <span>${result.deviation.toFixed(2)}</span>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    updateMeasurementCount() {
        // Update extension badge
        try {
            chrome.runtime.sendMessage({
                action: 'updateBadge',
                count: this.measurements.size
            });
        } catch (error) {
            console.log('Chrome extension context not available');
        }
    }
}

// Message listener for popup communication
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getMeasurementCount') {
            const analyzer = window.squigAnalyzer;
            sendResponse({ count: analyzer ? analyzer.measurements.size : 0 });
        } else if (request.action === 'openAnalysisModal') {
            const analyzer = window.squigAnalyzer;
            if (analyzer) {
                analyzer.openAnalysisModal();
            }
        }
    });
}

// Initialize the analyzer when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.squigAnalyzer = new SquigAnalyzer();
    });
} else {
    window.squigAnalyzer = new SquigAnalyzer();
}