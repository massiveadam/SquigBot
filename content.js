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
            'svg#fr-graph',
            'script[src*="d3"]',
            'div[class*="measurement"]'
        ];
        
        this.isSquigSite = indicators.some(selector => 
            document.querySelector(selector) !== null
        ) || window.location.hostname.includes('squig') || window.location.hostname.includes('crin');
        
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
        // Scan for existing data immediately
        this.scanExistingData();
        
        // Set up a more conservative periodic scanning
        this.scanCount = 0;
        this.maxScans = 10; // Limit the number of automatic scans
        
        this.scanInterval = setInterval(() => {
            this.scanCount++;
            
            // Stop scanning after max attempts
            if (this.scanCount >= this.maxScans) {
                console.log('🛑 Stopping automatic scanning after', this.maxScans, 'attempts');
                clearInterval(this.scanInterval);
                return;
            }
            
            // Only scan if we haven't found data yet
            const withData = Array.from(this.measurements.values()).filter(m => m.frequencies.length > 0).length;
            if (withData === 0) {
                console.log(`🔄 Periodic scan ${this.scanCount}/${this.maxScans}...`);
                this.scanForSquiglinkD3Data();
            } else {
                console.log('✅ Data found, stopping automatic scanning');
                clearInterval(this.scanInterval);
            }
        }, 3000); // Increased to 3 seconds

        // Update results when we find data
        this.updateResults();
    }

    scanExistingData() {
        console.log('🔍 Scanning for measurement data...');
        
        // Primary method: Squiglink D3 data
        this.scanForSquiglinkD3Data();
        
        // Backup method: Check global variables
        this.scanGlobalVariables();
        
        // Additional method: Look for Plotly data
        this.scanForPlotlyData();
        
        // Debug method: Check for any data on window object
        this.debugDataSearch();
    }

    debugDataSearch() {
        console.log('🔍 Debug: Searching for data patterns...');
        
        // Check for common Squiglink global variables
        const dataVars = ['phones', 'phoneData', 'measurements', 'data', 'traces', 'plotData'];
        
        dataVars.forEach(varName => {
            if (window[varName]) {
                console.log(`📦 Found global variable: ${varName}`, window[varName]);
                this.processAnyData(window[varName], varName);
            }
        });
        
        // Check all SVG elements for any attached data
        const allSvgs = document.querySelectorAll('svg');
        console.log(`🔍 Checking ${allSvgs.length} SVG elements for attached data...`);
        
        allSvgs.forEach((svg, svgIndex) => {
            const paths = svg.querySelectorAll('path');
            console.log(`SVG ${svgIndex}: ${paths.length} paths`);
            
            paths.forEach((path, pathIndex) => {
                // Check all possible data attachment points
                const dataSources = [
                    path.__data__,
                    path.data,
                    path._data,
                    path.dataset,
                    svg.__data__,
                    svg.data,
                    svg._data
                ];
                
                dataSources.forEach((dataSource, sourceIndex) => {
                    if (dataSource && typeof dataSource === 'object') {
                        console.log(`📊 SVG ${svgIndex}, Path ${pathIndex}, Source ${sourceIndex}:`, dataSource);
                        this.processAnyData(dataSource, `svg-${svgIndex}-path-${pathIndex}-${sourceIndex}`);
                    }
                });
            });
        });
    }

    processAnyData(data, source) {
        if (!data || typeof data !== 'object') return;
        
        // Try to extract measurement data from any structure
        if (data.id && data.l && Array.isArray(data.l)) {
            console.log(`✅ Found measurement in ${source}: ${data.id}`);
            this.extractMeasurementFromStructure(data, source);
        } else if (data.x && data.y && Array.isArray(data.x) && Array.isArray(data.y)) {
            console.log(`✅ Found x/y data in ${source}`);
            this.extractMeasurementFromStructure(data, source);
        } else if (Array.isArray(data)) {
            // Check if it's an array of measurements
            data.forEach((item, index) => {
                if (item && typeof item === 'object') {
                    this.processAnyData(item, `${source}-${index}`);
                }
            });
        } else if (typeof data === 'object') {
            // Check if it's an object containing measurements
            Object.keys(data).forEach(key => {
                if (data[key] && typeof data[key] === 'object') {
                    this.processAnyData(data[key], `${source}-${key}`);
                }
            });
        }
    }

    extractMeasurementFromStructure(data, source) {
        let frequencies = [];
        let amplitudes = [];
        let name = 'Unknown';
        
        if (data.id && data.l && Array.isArray(data.l)) {
            // Squiglink format
            name = data.id;
            if (data.l[0] && Array.isArray(data.l[0])) {
                frequencies = data.l.map(point => point[0]);
                amplitudes = data.l.map(point => point[1]);
            }
        } else if (data.x && data.y && Array.isArray(data.x) && Array.isArray(data.y)) {
            // Plotly format
            name = data.name || data.trace || source;
            frequencies = data.x;
            amplitudes = data.y;
        }
        
        if (frequencies.length > 10 && amplitudes.length === frequencies.length) {
            // Filter out target curves
            const nameLower = name.toLowerCase();
            if (nameLower.includes('target') || nameLower.includes('harman') || 
                nameLower.includes('df') || nameLower.startsWith('δ')) {
                console.log(`⏭️ Skipping target curve: ${name}`);
                return;
            }
            
            console.log(`✅ Extracted measurement: ${name} (${frequencies.length} points)`);
            this.createOrUpdateMeasurement(name, frequencies, amplitudes, `extracted-${source}`);
        }
    }

    scanForPlotlyData() {
        console.log('🔍 Scanning for Plotly data...');
        
        // Check for Plotly graph elements
        const plotlySelectors = [
            '.plotly-graph-div',
            '[id*="plotly"]',
            '[id*="graph"]',
            'div[class*="plotly"]'
        ];
        
        plotlySelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element, index) => {
                if (element.data || element._fullData) {
                    console.log(`📊 Found Plotly data in ${selector}[${index}]`);
                    const plotData = element.data || element._fullData;
                    this.processPlotlyTraces(plotData, `plotly-${index}`);
                }
            });
        });
    }

    processPlotlyTraces(traces, source) {
        if (!Array.isArray(traces)) return;
        
        traces.forEach((trace, index) => {
            if (trace.x && trace.y && Array.isArray(trace.x) && Array.isArray(trace.y)) {
                const name = trace.name || `Trace ${index}`;
                console.log(`📈 Found Plotly trace: ${name} (${trace.x.length} points)`);
                this.extractMeasurementFromStructure(trace, `${source}-trace-${index}`);
            }
        });
    }

    scanForSquiglinkD3Data() {
        console.log('🔍 Scanning for Squiglink D3 frequency response data...');
        
        // Try multiple selectors for the SVG graph
        const svgSelectors = [
            '#fr-graph',
            'svg[id*="graph"]',
            'svg[id*="fr"]',
            'svg.main-svg',
            'div[id*="graph"] svg',
            '.plotly-graph-div svg'
        ];
        
        let svgGraph = null;
        for (const selector of svgSelectors) {
            svgGraph = document.querySelector(selector);
            if (svgGraph) {
                console.log(`📍 Found SVG using selector: ${selector}`);
                break;
            }
        }
        
        if (!svgGraph) {
            console.log('❌ No SVG graph found with any selector');
            return;
        }
        
        const paths = svgGraph.querySelectorAll('path[d]');
        console.log(`📊 Found ${paths.length} path elements in SVG`);
        
        let foundData = 0;
        let pathsWithData = 0;
        
        // Check if any paths have data attached
        let hasAnyData = false;
        paths.forEach((path) => {
            const d3Data = path.__data__ || path.data || path._data;
            if (d3Data && typeof d3Data === 'object' && Object.keys(d3Data).length > 0) {
                hasAnyData = true;
            }
        });
        
        if (!hasAnyData) {
            console.log('⏳ No D3 data attached to paths yet - graphs may still be loading');
            return;
        }
        
        paths.forEach((path, index) => {
            // Check for D3.js data in multiple ways
            const d3Data = path.__data__ || path.data || path._data;
            
            if (d3Data && typeof d3Data === 'object' && Object.keys(d3Data).length > 0) {
                pathsWithData++;
                console.log(`🔍 Path ${index} data:`, {
                    keys: Object.keys(d3Data),
                    id: d3Data.id,
                    hasL: !!d3Data.l,
                    lLength: d3Data.l?.length,
                    hasXY: !!(d3Data.x && d3Data.y),
                    xyLength: d3Data.x?.length
                });
                
                // Check different data structures
                let frequencies = null;
                let amplitudes = null;
                let name = null;
                
                // Structure 1: {id: "name", l: [[freq, amp], ...]}
                if (d3Data.id && d3Data.l && Array.isArray(d3Data.l) && d3Data.l.length > 50) {
                    console.log(`📈 Found structure 1 for: ${d3Data.id} (${d3Data.l.length} points)`);
                    
                    // Filter out target curves and delta measurements
                    const id = d3Data.id.toLowerCase();
                    if (id.includes('target') || id.includes('df') || id.includes('tilt') || 
                        id.startsWith('δ') || id.startsWith('delta') || id.includes('harman')) {
                        console.log(`⏭️ Skipping target/delta curve: ${d3Data.id}`);
                        return;
                    }
                    
                    // Verify it's frequency response data [freq, amplitude] pairs
                    if (d3Data.l[0] && Array.isArray(d3Data.l[0]) && d3Data.l[0].length >= 2) {
                        frequencies = d3Data.l.map(point => point[0]);
                        amplitudes = d3Data.l.map(point => point[1]);
                        name = d3Data.id;
                    }
                }
                
                // Structure 2: {x: [freqs], y: [amps], name: "name"}
                else if (d3Data.x && d3Data.y && Array.isArray(d3Data.x) && Array.isArray(d3Data.y) && d3Data.x.length > 50) {
                    console.log(`📈 Found structure 2: ${d3Data.name || 'unnamed'} (${d3Data.x.length} points)`);
                    frequencies = d3Data.x;
                    amplitudes = d3Data.y;
                    name = d3Data.name || `Measurement ${index}`;
                }
                
                // Structure 3: Direct array of [freq, amp] pairs
                else if (Array.isArray(d3Data) && d3Data.length > 50 && Array.isArray(d3Data[0]) && d3Data[0].length >= 2) {
                    console.log(`📈 Found structure 3: array of pairs (${d3Data.length} points)`);
                    frequencies = d3Data.map(point => point[0]);
                    amplitudes = d3Data.map(point => point[1]);
                    name = `Measurement ${index}`;
                }
                
                // If we found valid data, create measurement
                if (frequencies && amplitudes && frequencies.length === amplitudes.length) {
                    const headphoneName = this.cleanSquiglinkName(name);
                    console.log(`✅ Extracting data for: "${headphoneName}" (${frequencies.length} points)`);
                    console.log(`📊 Sample data: ${frequencies[0]}Hz → ${amplitudes[0]}dB`);
                    
                    this.createOrUpdateMeasurement(headphoneName, frequencies, amplitudes, 'squiglink-d3');
                    foundData++;
                }
            } else {
                console.log(`🔍 Path ${index}: No data attached`);
            }
        });
        
        console.log(`📊 Summary: ${pathsWithData} paths with data, ${foundData} valid measurements extracted`);
        
        if (foundData > 0) {
            console.log(`🎯 Successfully extracted data from ${foundData} headphones via D3!`);
            this.updateResults();
            
            // Stop automatic scanning when we find data
            if (this.scanInterval) {
                clearInterval(this.scanInterval);
                console.log('✅ Data found, stopping automatic scanning');
            }
        } else if (pathsWithData === 0) {
            console.log('💡 No D3 data attached to SVG paths yet - try adding headphones to the graph');
        } else {
            console.log('⚠️ Found paths with data but none were valid measurements');
        }
    }

    cleanSquiglinkName(fullName) {
        // Clean up Squiglink measurement names
        let cleaned = fullName;
        
        // Remove tilt/EQ information in parentheses
        cleaned = cleaned.replace(/\s*\(Tilt:.*?\)/g, '');
        cleaned = cleaned.replace(/\s*\(AVG\)/g, '');
        cleaned = cleaned.replace(/\s*\(.*?\)/g, '');
        
        // Clean up extra whitespace
        cleaned = cleaned.trim();
        
        return cleaned;
    }

    createOrUpdateMeasurement(name, frequencies, amplitudes, source) {
        if (!frequencies || !amplitudes || frequencies.length !== amplitudes.length) {
            console.log(`❌ Invalid data for ${name}: freq=${frequencies?.length}, amp=${amplitudes?.length}`);
            return;
        }

        const cleanName = this.cleanTraceName(name);
        const measurementId = `${source}-${this.sanitizeId(cleanName)}`;
        
        const measurement = {
            url: measurementId,
            name: cleanName,
            frequencies: [...frequencies],
            amplitudes: [...amplitudes],
            metadata: { 
                source: source,
                hasData: true,
                dataPoints: frequencies.length,
                originalName: name
            }
        };
        
        this.measurements.set(measurementId, measurement);
        console.log(`✅ Created measurement: "${cleanName}" with ${frequencies.length} data points`);
    }

    scanForMeasurementItems() {
        // Look for visible headphone names in the UI
        const textNodes = this.getVisibleTextNodes();
        
        textNodes.forEach((textNode, index) => {
            const text = textNode.textContent?.trim();
            if (text && this.looksLikeHeadphoneName(text)) {
                const measurementId = `text-${this.sanitizeId(text)}`;
                
                if (!this.measurements.has(measurementId)) {
                    const measurement = {
                        url: measurementId,
                        name: text,
                        frequencies: [],
                        amplitudes: [],
                        metadata: { 
                            source: 'text-scan',
                            hasData: false
                        }
                    };
                    
                    this.measurements.set(measurementId, measurement);
                }
            }
        });
    }

    getVisibleTextNodes() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement && this.isVisibleElement(node.parentElement)) {
                textNodes.push(node);
            }
        }
        return textNodes;
    }

    isVisibleElement(element) {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               element.offsetWidth > 0 && 
               element.offsetHeight > 0;
    }

    looksLikeHeadphoneName(text) {
        if (!text || text.length < 3 || text.length > 100) return false;
        
        // Remove common prefixes/suffixes
        const cleanText = text.replace(/^x\s+/, '').replace(/\s+\(.*\)$/, '').trim();
        
        // Skip obvious non-headphone text
        const excludePatterns = [
            /^target/i, /^delta/i, /^graph/i, /hz$/i, /db$/i,
            /^frequency/i, /archive/i, /squig/i, /\.com/i
        ];

        if (excludePatterns.some(pattern => pattern.test(cleanText))) {
            return false;
        }

        // Look for headphone-like patterns
        const headphonePatterns = [
            /\w+\s*\d{2,}/,  // Model with numbers
            /\w+[-_]\w+\d/,  // Brand-model-number
            /(hd|ath|wh|dt|he|lcd)\s*\d+/i,  // Specific brand patterns
            /(truthear|moondrop|blessing|variations)/i  // IEM brands
        ];

        return headphonePatterns.some(pattern => pattern.test(cleanText));
    }

    scanGlobalVariables() {
        // Check for common data variables
        const globalVars = [
            'phones', 'measurements', 'data', 'graphData',
            'plotData', 'headphones', 'iems'
        ];
        
        globalVars.forEach(varName => {
            if (window[varName] && typeof window[varName] === 'object') {
                console.log(`Found global variable: ${varName}`);
                this.processGlobalData(window[varName], varName);
            }
        });
    }

    processGlobalData(data, varName) {
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                if (this.isValidMeasurement(item)) {
                    const measurement = this.normalizeMeasurement(item, `global-${varName}-${index}`);
                    this.measurements.set(measurement.url, measurement);
                }
            });
        } else if (typeof data === 'object') {
            Object.keys(data).forEach(key => {
                const item = data[key];
                if (this.isValidMeasurement(item)) {
                    const measurement = this.normalizeMeasurement(item, `global-${varName}-${key}`);
                    this.measurements.set(measurement.url, measurement);
                }
            });
        }
    }

    isValidMeasurement(item) {
        return item && (
            (item.x && item.y) ||
            (item.frequency && item.amplitude) ||
            (item.frequencies && item.amplitudes) ||
            (Array.isArray(item) && item.length > 10)
        );
    }

    normalizeMeasurement(item, id) {
        let frequencies = [];
        let amplitudes = [];
        let name = 'Unknown';

        if (item.x && item.y) {
            frequencies = item.x;
            amplitudes = item.y;
            name = item.name || id;
        } else if (item.frequency && item.amplitude) {
            frequencies = item.frequency;
            amplitudes = item.amplitude;
            name = item.name || id;
        }

        return {
            url: id,
            name: name,
            frequencies: frequencies,
            amplitudes: amplitudes,
            metadata: { source: 'processed', hasData: frequencies.length > 0 }
        };
    }

    cleanTraceName(name) {
        if (!name) return 'Unknown';
        
        return name
            .replace(/^x\s+/, '')
            .replace(/\s*\(.*\)$/, '')
            .replace(/\s*\[.*\]$/, '')
            .trim();
    }

    sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    observePageChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Check for new measurement data after DOM changes
                    setTimeout(() => this.scanForSquiglinkD3Data(), 500);
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    updateResults() {
        // Send message to background script to update badge
        const count = this.measurements.size;
        const withData = Array.from(this.measurements.values()).filter(m => m.frequencies.length > 0).length;
        
        chrome.runtime.sendMessage({
            action: 'updateBadge',
            count: withData
        });

        // Send message to popup if it's open
        chrome.runtime.sendMessage({
            action: 'updateMeasurementCount',
            count: count,
            withData: withData
        });
    }

    openAnalysisModal() {
        console.log('Opening analysis modal...');
        console.log('Current measurements:', this.measurements);
        
        // Create analysis modal
        const modal = document.createElement('div');
        modal.id = 'squig-analysis-modal';
        modal.innerHTML = this.getModalHTML();

        document.body.appendChild(modal);

        // Add event listeners
        this.setupModalEventListeners(modal);
    }

    getModalHTML() {
        const withData = Array.from(this.measurements.values()).filter(m => m.frequencies.length > 0).length;
        
        return `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Target Deviation Analysis</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="controls">
                        <label for="target-select">Target Curve:</label>
                        <select id="target-select">
                            <option value="harman">Harman 2018</option>
                            <option value="df">DF Neutral</option>
                            <option value="flat">Flat Response</option>
                        </select>
                        
                        <label for="freq-range">Frequency Range:</label>
                        <select id="freq-range">
                            <option value="20-20000">Full Range (20Hz-20kHz)</option>
                            <option value="200-2000">Midrange (200Hz-2kHz)</option>
                            <option value="20-200">Bass (20Hz-200Hz)</option>
                            <option value="2000-20000">Treble (2kHz-20kHz)</option>
                        </select>
                        
                        <button id="analyze-all-btn" ${withData === 0 ? 'disabled' : ''}>
                            Analyze ${withData} Measurements
                        </button>
                        <button id="rescan-btn">🔄 Re-scan Page</button>
                        <button id="debug-extract-btn" style="background: #17a2b8; color: white;">🔧 Force Extract</button>
                    </div>
                    
                    <div class="results">
                        <div class="measurements-found">
                            Found ${this.measurements.size} measurements (${withData} with data)
                        </div>
                        <div id="analysis-results">
                            ${withData === 0 ? 
                                '<div class="no-data">No measurement data found. Try adding some headphones to the graph first, then click "Force Extract" or "Re-scan Page".</div>' : 
                                ''
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupModalEventListeners(modal) {
        // Close button
        modal.querySelector('.close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Analyze button
        modal.querySelector('#analyze-all-btn').addEventListener('click', () => {
            this.performAnalysis();
        });

        // Rescan button
        modal.querySelector('#rescan-btn').addEventListener('click', () => {
            this.rescanPage();
        });

        // Debug extract button
        modal.querySelector('#debug-extract-btn').addEventListener('click', () => {
            this.forceExtractData();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    forceExtractData() {
        console.log('🔧 Force extracting data...');
        const resultsDiv = document.getElementById('analysis-results');
        
        resultsDiv.innerHTML = '<div class="loading">Force extracting measurement data...</div>';
        
        // Stop any running intervals first
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            console.log('🛑 Stopped automatic scanning');
        }
        
        // Clear existing measurements
        this.measurements.clear();
        
        // Run comprehensive data extraction
        this.debugDataSearch();
        this.scanForSquiglinkD3Data();
        this.scanGlobalVariables();
        this.scanForPlotlyData();
        
        // Add manual debug command to console
        console.log('🔧 Manual debug command available: window.squigAnalyzer.manualExtract()');
        
        // Wait a moment then update display
        setTimeout(() => {
            const withData = Array.from(this.measurements.values()).filter(m => m.frequencies.length > 0).length;
            
            // Update the measurements count
            const measurementsFound = document.querySelector('.measurements-found');
            if (measurementsFound) {
                measurementsFound.textContent = `Found ${this.measurements.size} measurements (${withData} with data)`;
            }
            
            // Update analyze button
            const analyzeBtn = document.getElementById('analyze-all-btn');
            if (analyzeBtn) {
                analyzeBtn.textContent = `Analyze ${withData} Measurements`;
                analyzeBtn.disabled = withData === 0;
            }
            
            if (withData > 0) {
                resultsDiv.innerHTML = '<div class="success">✅ Force extraction complete! You can now analyze the measurements.</div>';
            } else {
                resultsDiv.innerHTML = `
                    <div class="no-data">
                        Still no measurement data found. 
                        <br><br>
                        <strong>Try these steps:</strong>
                        <ol style="text-align: left; padding-left: 20px;">
                            <li>Make sure headphones are added to the graph</li>
                            <li>Wait for the graph to fully load</li>
                            <li>Check the browser console for debug info</li>
                            <li>Try a different IEM measurement page</li>
                            <li>Run <code>window.squigAnalyzer.manualExtract()</code> in console</li>
                        </ol>
                    </div>
                `;
            }
            
            this.updateResults();
        }, 1000);
    }

    // Manual extraction method for console debugging
    manualExtract() {
        console.log('🔧 Manual extraction triggered from console');
        
        // Get the SVG graph
        const svg = document.querySelector('#fr-graph');
        if (!svg) {
            console.log('❌ No #fr-graph found');
            return;
        }
        
        const paths = svg.querySelectorAll('path[d]');
        console.log(`📊 Found ${paths.length} paths in #fr-graph`);
        
        // Examine each path in detail
        paths.forEach((path, index) => {
            console.log(`\n--- Path ${index} ---`);
            console.log('Element:', path);
            console.log('__data__:', path.__data__);
            console.log('data:', path.data);
            console.log('_data:', path._data);
            console.log('dataset:', path.dataset);
            
            // Check parent element data
            if (path.parentElement) {
                console.log('Parent __data__:', path.parentElement.__data__);
            }
        });
        
        // Also check the SVG itself
        console.log('\n--- SVG Element ---');
        console.log('SVG __data__:', svg.__data__);
        console.log('SVG data:', svg.data);
        console.log('SVG _data:', svg._data);
        
        // Check for global variables
        console.log('\n--- Global Variables ---');
        const globalVars = ['phones', 'data', 'measurements', 'plotData', 'traces'];
        globalVars.forEach(varName => {
            if (window[varName]) {
                console.log(`${varName}:`, window[varName]);
            }
        });
        
        return 'Manual extraction complete - check console output above';
    }

    async performAnalysis() {
        const targetType = document.getElementById('target-select').value;
        const freqRange = document.getElementById('freq-range').value;
        const resultsDiv = document.getElementById('analysis-results');

        resultsDiv.innerHTML = '<div class="loading">Analyzing measurements...</div>';

        try {
            const targetCurve = this.getTargetCurve(targetType);
            const [minFreq, maxFreq] = freqRange.split('-').map(Number);
            
            const results = [];
            
            for (const [url, measurement] of this.measurements) {
                if (measurement.frequencies.length === 0) continue;
                
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

    getTargetCurve(targetType) {
        const targets = {
            harman: this.generateHarman2018Target(),
            df: this.generateDFNeutralTarget(),
            flat: this.generateFlatTarget()
        };

        return targets[targetType] || targets.harman;
    }

    generateHarman2018Target() {
        // Harman 2018 target curve for IEMs
        const frequencies = [];
        const amplitudes = [];

        for (let freq = 20; freq <= 20000; freq *= 1.02) {
            frequencies.push(freq);
            
            let amp = 0;
            if (freq < 100) {
                amp = 6 - Math.log10(freq / 20) * 3; // Bass shelf
            } else if (freq < 1000) {
                amp = 0;
            } else if (freq < 2000) {
                amp = Math.log10(freq / 1000) * 2; // Presence rise
            } else if (freq < 4000) {
                amp = 2;
            } else if (freq < 8000) {
                amp = 2 - Math.log10(freq / 4000) * 4; // Treble rolloff
            } else {
                amp = -2;
            }
            
            amplitudes.push(amp);
        }

        return { frequencies, amplitudes };
    }

    generateDFNeutralTarget() {
        // Diffuse Field Neutral target
        const frequencies = [];
        const amplitudes = [];

        for (let freq = 20; freq <= 20000; freq *= 1.02) {
            frequencies.push(freq);
            
            let amp = 0;
            if (freq > 1000) {
                amp = Math.log10(freq / 1000) * 3; // Rising treble
            }
            
            amplitudes.push(amp);
        }

        return { frequencies, amplitudes };
    }

    generateFlatTarget() {
        const frequencies = [];
        const amplitudes = [];

        for (let freq = 20; freq <= 20000; freq *= 1.02) {
            frequencies.push(freq);
            amplitudes.push(0);
        }

        return { frequencies, amplitudes };
    }

    calculateDeviation(measurement, targetCurve, minFreq, maxFreq) {
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
        for (let i = 0; i < targetFreqs.length - 1; i++) {
            if (frequency >= targetFreqs[i] && frequency <= targetFreqs[i + 1]) {
                const ratio = (frequency - targetFreqs[i]) / (targetFreqs[i + 1] - targetFreqs[i]);
                return targetAmps[i] + ratio * (targetAmps[i + 1] - targetAmps[i]);
            }
        }

        if (frequency < targetFreqs[0]) return targetAmps[0];
        if (frequency > targetFreqs[targetFreqs.length - 1]) return targetAmps[targetAmps.length - 1];

        return 0;
    }

    displayResults(results, container) {
        if (results.length === 0) {
            container.innerHTML = '<div class="no-data">No measurements with data found for analysis.</div>';
            return;
        }

        let html = '<div class="results-header">Results (sorted by deviation from target):</div>';
        html += '<div class="results-table">';
        html += '<div class="table-header"><span>Rank</span><span>Model</span><span>Deviation (dB RMS)</span></div>';

        results.forEach((result, index) => {
            const rank = index + 1;
            const rankClass = rank <= 3 ? 'top-rank' : '';
            html += `
                <div class="table-row ${rankClass}">
                    <span>${rank}</span>
                    <span>${result.name}</span>
                    <span>${result.deviation.toFixed(2)}</span>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    rescanPage() {
        console.log('Re-scanning page for measurements...');
        
        // Clear old text-based measurements but keep D3 data
        const toRemove = [];
        this.measurements.forEach((measurement, key) => {
            if (measurement.metadata.source === 'text-scan') {
                toRemove.push(key);
            }
        });
        toRemove.forEach(key => this.measurements.delete(key));
        
        // Re-scan for all data
        this.scanExistingData();
        
        // Update the modal if it's open
        const measurementsFound = document.querySelector('.measurements-found');
        if (measurementsFound) {
            const withData = Array.from(this.measurements.values()).filter(m => m.frequencies.length > 0).length;
            measurementsFound.textContent = `Found ${this.measurements.size} measurements (${withData} with data)`;
            
            // Update analyze button
            const analyzeBtn = document.getElementById('analyze-all-btn');
            if (analyzeBtn) {
                analyzeBtn.textContent = `Analyze ${withData} Measurements`;
                analyzeBtn.disabled = withData === 0;
            }
            
            // Clear results if no data
            const resultsDiv = document.getElementById('analysis-results');
            if (withData === 0 && resultsDiv) {
                resultsDiv.innerHTML = '<div class="no-data">No measurement data found. Try adding some headphones to the graph first.</div>';
            }
        }
        
        console.log(`Re-scan complete. Found ${this.measurements.size} measurements`);
    }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getMeasurementCount') {
        const analyzer = window.squigAnalyzer;
        if (analyzer) {
            const withData = Array.from(analyzer.measurements.values()).filter(m => m.frequencies.length > 0).length;
            sendResponse({ 
                count: analyzer.measurements.size,
                withData: withData
            });
        } else {
            sendResponse({ count: 0, withData: 0 });
        }
    } else if (request.action === 'openAnalysisModal') {
        const analyzer = window.squigAnalyzer;
        if (analyzer) {
            analyzer.openAnalysisModal();
        }
    }
});

// Initialize the analyzer when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.squigAnalyzer = new SquigAnalyzer();
    });
} else {
    window.squigAnalyzer = new SquigAnalyzer();
}