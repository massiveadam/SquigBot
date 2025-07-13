class SquiglinkAnalyzer {
    constructor() {
        this.measurements = new Map();
        this.analysisResults = new Map();
        this.iemDatabase = [];
        this.init();
    }

    init() {
        this.createUI();
        setTimeout(() => this.scanDatabase(), 2000);
    }

    createUI() {
        if (document.getElementById('target-deviation-extension')) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'target-deviation-extension';
        panel.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; width: 400px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); z-index: 10000; font-family: system-ui, -apple-system, sans-serif; color: white;">
                <div style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600;">IEM Analyzer</h3>
                    <button id="close-extension" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 4px;">×</button>
                </div>
                <div style="padding: 16px; background: rgba(0,0,0,0.2); border-radius: 0 0 12px 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; opacity: 0.8;">Target</label>
                            <select id="target-select" style="width: 100%; padding: 8px; border: none; border-radius: 6px; background: rgba(255,255,255,0.9); color: #333;">
                                <option value="harman">Harman 2018</option>
                                <option value="df">DF Neutral</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; opacity: 0.8;">Range</label>
                            <select id="freq-range" style="width: 100%; padding: 8px; border: none; border-radius: 6px; background: rgba(255,255,255,0.9); color: #333;">
                                <option value="full">Full (20Hz-20kHz)</option>
                                <option value="bass">Bass (20Hz-250Hz)</option>
                                <option value="mid">Mid (250Hz-4kHz)</option>
                                <option value="treble">Treble (4kHz-20kHz)</option>
                            </select>
                        </div>
                    </div>
                    
                    <button id="analyze-btn" style="width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-bottom: 12px;">📊 Analyze Loaded IEMs</button>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button id="refresh-btn" style="padding: 8px; background: #17a2b8; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">🔄 Refresh</button>
                        <button id="test-btn" style="padding: 8px; background: #ffc107; color: #333; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">🧪 Test</button>
                    </div>
                </div>
                <div id="analysis-results" style="max-height: 400px; overflow-y: auto;"></div>
            </div>
        `;

        document.body.appendChild(panel);
        this.attachEventListeners();
    }

    attachEventListeners() {
        document.getElementById('close-extension').addEventListener('click', () => {
            document.getElementById('target-deviation-extension').remove();
        });

        document.getElementById('analyze-btn').addEventListener('click', () => {
            this.analyzeCurrentlyLoaded();
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshData();
        });

        document.getElementById('test-btn').addEventListener('click', () => {
            this.testExtraction();
        });
    }

    refreshData() {
        console.log('🔄 Refreshing data...');
        setTimeout(() => {
            this.scanDatabase();
            this.testExtraction();
        }, 500);
    }

    testExtraction() {
        console.log('🧪 Testing extraction...');
        
        // Test console method
        const consoleTest = [];
        const svgPaths = document.querySelectorAll('svg path[d]');
        
        svgPaths.forEach((path, index) => {
            const d3Data = path.__data__;
            if (d3Data && typeof d3Data === 'object' && d3Data.l && Array.isArray(d3Data.l) && d3Data.l.length > 100) {
                const isTarget = d3Data.id && (
                    d3Data.id.toLowerCase().includes('target') ||
                    d3Data.id.toLowerCase().includes('df') ||
                    d3Data.id.startsWith('Δ')
                );
                
                if (!isTarget) {
                    consoleTest.push(d3Data.id);
                    console.log(`✅ Found: ${d3Data.id}`);
                }
            }
        });
        
        console.log(`Test result: ${consoleTest.length} measurements found`);
        
        this.showMessage(`
            <strong>🧪 Test Results:</strong><br>
            Found ${consoleTest.length} measurements<br><br>
            ${consoleTest.map(name => `• ${name}`).join('<br>') || 'None found'}
        `);
    }

    scanDatabase() {
        console.log('🔍 Scanning database...');
        const iems = [];
        
        const elements = document.querySelectorAll('div[name]');
        elements.forEach(element => {
            const name = element.getAttribute('name');
            if (name && name.length > 2) {
                iems.push({
                    name: name,
                    element: element
                });
            }
        });
        
        this.iemDatabase = iems;
        console.log(`Found ${this.iemDatabase.length} IEMs in database`);
    }

    analyzeCurrentlyLoaded() {
        console.log('📊 Starting analysis...');
        
        const measurements = this.extractMeasurements();
        
        if (measurements.length === 0) {
            this.showMessage('No IEMs found. Load some IEMs first, then click "🔄 Refresh"');
            return;
        }
        
        const targetType = document.getElementById('target-select').value;
        const freqRange = document.getElementById('freq-range').value;
        const target = this.getTarget(targetType);
        
        const results = [];
        
        measurements.forEach(measurement => {
            const deviation = this.calculateDeviation(
                measurement.frequencies,
                measurement.amplitudes,
                target,
                freqRange
            );
            
            results.push({
                name: measurement.name,
                deviation: deviation,
                dataPoints: measurement.frequencies.length
            });
            
            console.log(`✅ ${measurement.name}: ${deviation.toFixed(2)} dB`);
        });
        
        this.displayResults(results, targetType, freqRange);
    }

    extractMeasurements() {
        const measurements = [];
        const svgPaths = document.querySelectorAll('svg path[d]');
        
        svgPaths.forEach((path, index) => {
            const d3Data = path.__data__;
            
            if (d3Data && typeof d3Data === 'object' && d3Data.l && Array.isArray(d3Data.l) && d3Data.l.length > 100) {
                const isTarget = d3Data.id && (
                    d3Data.id.toLowerCase().includes('target') ||
                    d3Data.id.toLowerCase().includes('df') ||
                    d3Data.id.startsWith('Δ')
                );
                
                if (!isTarget) {
                    const frequencies = d3Data.l.map(point => point[0]);
                    const amplitudes = d3Data.l.map(point => point[1]);
                    
                    measurements.push({
                        name: d3Data.id.replace(/\s*\(AVG\)/g, ''),
                        frequencies: frequencies,
                        amplitudes: amplitudes
                    });
                }
            }
        });
        
        return measurements;
    }

    getTarget(targetType) {
        const target = [];
        
        for (let freq = 20; freq <= 20000; freq *= 1.05) {
            let amplitude = 0;
            
            if (targetType === 'harman') {
                if (freq >= 1000 && freq < 3000) {
                    amplitude = Math.log10(freq / 1000) * 6;
                } else if (freq >= 3000 && freq < 10000) {
                    amplitude = 6 - Math.log10(freq / 3000) * 3;
                } else if (freq >= 10000) {
                    amplitude = 3 - Math.log10(freq / 10000) * 8;
                }
            }
            
            target.push([freq, amplitude]);
        }
        
        return target;
    }

    calculateDeviation(frequencies, amplitudes, target, freqRange) {
        let startFreq = 20, endFreq = 20000;
        
        if (freqRange === 'bass') {
            startFreq = 20; endFreq = 250;
        } else if (freqRange === 'mid') {
            startFreq = 250; endFreq = 4000;
        } else if (freqRange === 'treble') {
            startFreq = 4000; endFreq = 20000;
        }
        
        const filteredIndices = frequencies
            .map((freq, index) => ({ freq, index }))
            .filter(({ freq }) => freq >= startFreq && freq <= endFreq)
            .map(({ index }) => index);
        
        if (filteredIndices.length === 0) return Infinity;
        
        let sumSquaredError = 0;
        let count = 0;
        
        filteredIndices.forEach(i => {
            const freq = frequencies[i];
            const amplitude = amplitudes[i];
            const targetAmp = this.interpolateTarget(freq, target);
            
            const error = amplitude - targetAmp;
            sumSquaredError += error * error;
            count++;
        });
        
        return count > 0 ? Math.sqrt(sumSquaredError / count) : Infinity;
    }

    interpolateTarget(frequency, target) {
        if (target.length === 0) return 0;
        
        let lowerIndex = 0;
        let upperIndex = target.length - 1;
        
        for (let i = 0; i < target.length - 1; i++) {
            if (target[i][0] <= frequency && target[i + 1][0] >= frequency) {
                lowerIndex = i;
                upperIndex = i + 1;
                break;
            }
        }
        
        const [freq1, amp1] = target[lowerIndex];
        const [freq2, amp2] = target[upperIndex];
        
        if (freq1 === freq2) return amp1;
        
        const ratio = (frequency - freq1) / (freq2 - freq1);
        return amp1 + ratio * (amp2 - amp1);
    }

    displayResults(results, targetType, freqRange) {
        results.sort((a, b) => a.deviation - b.deviation);
        
        const resultsDiv = document.getElementById('analysis-results');
        resultsDiv.innerHTML = `
            <div style="padding: 16px; background: rgba(255,255,255,0.95); color: #333;">
                <div style="margin-bottom: 12px; padding: 8px; background: #e3f2fd; border-radius: 6px; font-size: 14px;">
                    <strong>📊 Analysis Results</strong><br>
                    Target: ${targetType} | Range: ${freqRange}<br>
                    Found: ${results.length} IEMs
                </div>
                
                <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; font-size: 13px; font-weight: 600; padding: 8px; background: #f5f5f5; border-radius: 6px; margin-bottom: 8px;">
                    <span>Rank</span>
                    <span>IEM</span>
                    <span>Deviation (dB)</span>
                </div>
                
                ${results.map((result, index) => `
                    <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; padding: 6px; ${index % 2 === 0 ? 'background: #fafafa;' : ''} font-size: 12px;">
                        <span style="color: #007bff; font-weight: 600;">${index + 1}</span>
                        <span style="color: #333;">${result.name}</span>
                        <span style="font-weight: 600; color: ${result.deviation < 3 ? '#28a745' : result.deviation < 6 ? '#ffc107' : '#dc3545'};">
                            ${result.deviation.toFixed(2)}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    showMessage(message) {
        const resultsDiv = document.getElementById('analysis-results');
        resultsDiv.innerHTML = `
            <div style="padding: 16px; background: rgba(255,255,255,0.95); color: #333;">
                ${message}
            </div>
        `;
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new SquiglinkAnalyzer());
} else {
    new SquiglinkAnalyzer();
}