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

        // Intercept Google Analytics calls that track headphone additions
        this.interceptAnalytics();

        // Monitor for changes in the measurement list
        this.observeMeasurementList();

        // Check for existing data multiple ways
        this.scanExistingData();
        this.scanForPlotlyData();
        this.scanForMeasurementItems();
        
        // Set up periodic scanning for dynamically loaded content
        setInterval(() => {
            this.scanForMeasurementItems();
        }, 2000);
    }

    interceptAnalytics() {
        // Intercept gtag calls that track headphone events
        const originalGtag = window.gtag;
        if (originalGtag) {
            window.gtag = (...args) => {
                // Call original function first
                originalGtag.apply(window, args);
                
                // Check if this is a headphone-related event
                if (args.length >= 3 && args[0] === 'event') {
                    const eventName = args[1];
                    const eventData = args[2];
                    
                    if (eventData && (eventData.phone || eventData.variant)) {
                        console.log('Detected headphone analytics event:', eventData);
                        this.processAnalyticsHeadphone(eventData);
                    }
                }
            };
        }

        // Also intercept any direct analytics calls
        const originalSendEvent = window.sendEvent;
        if (originalSendEvent) {
            window.sendEvent = (...args) => {
                originalSendEvent.apply(window, args);
                console.log('Analytics event intercepted:', args);
            };
        }
    }

    processAnalyticsHeadphone(eventData) {
        const headphoneName = eventData.phone || eventData.variant || 'Unknown';
        const measurementId = `analytics-${this.sanitizeId(headphoneName)}`;
        
        if (!this.measurements.has(measurementId)) {
            const measurement = {
                url: measurementId,
                name: headphoneName,
                frequencies: [], // Will be populated from graph data
                amplitudes: [],
                metadata: { 
                    source: 'analytics',
                    eventData: eventData,
                    timestamp: Date.now()
                }
            };
            
            this.measurements.set(measurementId, measurement);
            console.log('Added headphone from analytics:', headphoneName);
            
            // Try to get the actual measurement data for this headphone
            this.loadMeasurementData(measurement);
        }
    }

    observeMeasurementList() {
        // Watch for changes in the measurement list area
        const observerCallback = (mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    // Re-scan measurement items when the list changes
                    this.scanForMeasurementItems();
                }
            });
        };

        const observer = new MutationObserver(observerCallback);
        
        // Observe the entire body for changes, but we'll filter in the callback
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    scanForMeasurementItems() {
        // Look for measurement items in the visible list (like in your screenshot)
        const measurementSelectors = [
            // Text elements that contain headphone names
            '[class*="measurement"] span',
            '[class*="item"] span',
            'div[style*="color"] span', // Colored measurement names
            '.measurement-name',
            '.headphone-name',
            // List items
            'li:contains("x ")', // Items with "x" prefix like in your screenshot
            'div:contains("Truthear")',
            'div:contains("Unique Melody")',
            'div:contains("Twistura")',
            // Any element that might contain headphone model names
            '*[class*="track"], *[class*="item"], *[class*="measurement"]'
        ];

        // Clear previous measurement items
        const toRemove = [];
        this.measurements.forEach((measurement, key) => {
            if (measurement.metadata.source === 'visible-list') {
                toRemove.push(key);
            }
        });
        toRemove.forEach(key => this.measurements.delete(key));

        // Scan all text content for headphone names
        this.scanTextContent();
        
        // Also look for specific UI elements
        measurementSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach((element, index) => {
                    const text = element.textContent?.trim();
                    if (text && this.looksLikeHeadphoneName(text)) {
                        const measurementId = `visible-${this.sanitizeId(text)}`;
                        
                        if (!this.measurements.has(measurementId)) {
                            const measurement = {
                                url: measurementId,
                                name: text,
                                frequencies: [],
                                amplitudes: [],
                                metadata: { 
                                    source: 'visible-list',
                                    element: element,
                                    selector: selector
                                }
                            };
                            
                            this.measurements.set(measurementId, measurement);
                            console.log('Found visible headphone:', text);
                        }
                    }
                });
            } catch (error) {
                // Ignore selector errors
            }
        });
    }

    scanTextContent() {
        // Get all text nodes and look for headphone patterns
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.parentElement && this.isVisibleElement(node.parentElement)) {
                textNodes.push(node);
            }
        }

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
                            element: textNode.parentElement
                        }
                    };
                    
                    this.measurements.set(measurementId, measurement);
                    console.log('Found headphone in text:', text);
                }
            }
        });
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
        
        // Skip obvious non-headphone text (expanded list)
        const excludePatterns = [
            /^target/i,
            /^delta/i,
            /^only$/i,
            /^graph/i,
            /^comp$/i,
            /^comparison/i,
            /hz$/i,
            /db$/i,
            /^frequency/i,
            /^amplitude/i,
            /^\d+$/,
            /^[a-z]$/i,
            /^super\s*\d*$/i,
            /archive/i,
            /squig/i,
            /\.com/i,
            /\.net/i,
            /review/i,
            // Brand/company names that shouldn't be treated as models
            /^audio discourse$/i,
            /^crinacle/i,
            /^in-ear fidelity$/i,
            /^hypethersonics$/i,
            /^headphone databases$/i,
            /^7th acoustics$/i,
            /^64 audio$/i,
            /^634ears$/i,
            /^aful acoustics$/i,
            /^binary acoustics$/i,
            /^campfire audio$/i,
            /^co-donguri$/i,
            /^custom art$/i,
            /^effect audio$/i,
            /^elysian acoustic labs$/i,
            /^empire ears$/i,
            /^final audio$/i,
            /^gs audio$/i,
            /^headphones$/i,
            /^earbuds$/i,
            /^iems$/i,
            /^up to \d+% off/i,
            /^copy url$/i,
            /^dark mode$/i,
            /^sub bass$/i,
            /^mid bass$/i,
            /^lower midrange$/i,
            /^upper midrange$/i,
            /^presence region$/i,
            /^mid treble$/i,
            /^air$/i,
            /^treble$/i,
            /^bass$/i,
            /^midrange$/i,
            /^mids$/i,
            /^\w+\s+(audio|acoustics|labs|ears|art)$/i
        ];

        if (excludePatterns.some(pattern => pattern.test(cleanText))) {
            return false;
        }

        // Look for headphone-like patterns (be more specific)
        const headphonePatterns = [
            /\w+\s*\d{2,}/,  // Model with 2+ digit numbers (HD650, ATH-M50x)
            /\w+[-_]\w+\d/,  // Brand-model-number (ATH-M50x, DT-770)
            /(hd|ath|wh|dt|he|lcd)\s*\d+/i,  // Specific brand patterns with numbers
            /\w+\s+(pro|studio|reference|monitor|open|closed)/i,  // Professional terms
            /^(sony|sennheiser|audio.*technica|beyerdynamic|focal|audeze|hifiman|shure|akg|grado)\s+\w/i,  // Brand + model
            /(truthear|unique.*melody|moondrop|blessing|variations|starfield|aria|chu|zero|mest|monarch)/i,  // IEM brands/models
            /\w+\s*x\s*\w+/i  // Collaboration models (Truthear x Crinacle)
        ];

        return headphonePatterns.some(pattern => pattern.test(cleanText));
    }

    async loadMeasurementData(measurement) {
        // Try to extract actual frequency response data for the measurement
        // This would involve looking at the current graph data or making requests
        
        // For now, we'll mark it as having placeholder data
        // In a real implementation, this would fetch the actual FR data
        measurement.frequencies = this.generatePlaceholderFrequencies();
        measurement.amplitudes = this.generatePlaceholderAmplitudes();
    }

    generatePlaceholderFrequencies() {
        const freqs = [];
        for (let f = 20; f <= 20000; f *= 1.1) {
            freqs.push(Math.round(f));
        }
        return freqs;
    }

    generatePlaceholderAmplitudes() {
        const amps = [];
        for (let i = 0; i < 200; i++) {
            amps.push(Math.random() * 10 - 5); // Random values between -5 and 5 dB
        }
        return amps;
    }

    isMeasurementData(url) {
        const patterns = [
            /\.csv$/i,
            /\.json$/i,
            /data.*\.js$/i,
            /measurements/i,
            /frequency/i,
            /headphone/i,
            /iem/i,
            /response/i,
            /squig/i
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
            if (script.textContent.includes('frequency') || 
                script.textContent.includes('Plotly') ||
                script.textContent.includes('measurement') ||
                script.textContent.includes('headphone')) {
                this.extractInlineData(script.textContent);
            }
        });

        // Look for data in window object
        this.scanWindowObject();
        
        // Look for common data containers
        this.scanDataContainers();
    }

    scanWindowObject() {
        // Check if measurement data is stored in global variables
        const commonVars = ['measurements', 'data', 'headphones', 'iems', 'plotData', 'graphData'];
        
        commonVars.forEach(varName => {
            if (window[varName]) {
                try {
                    const data = window[varName];
                    if (typeof data === 'object') {
                        this.processGlobalData(data, varName);
                    }
                } catch (error) {
                    console.error(`Error processing global variable ${varName}:`, error);
                }
            }
        });
    }

    scanDataContainers() {
        // Look for data stored in DOM elements
        const dataContainers = document.querySelectorAll(
            '[data-measurements], [data-headphones], [data-iems], [data-graph-data]'
        );
        
        dataContainers.forEach((container, index) => {
            for (const attr of container.attributes) {
                if (attr.name.startsWith('data-') && attr.value) {
                    try {
                        const data = JSON.parse(attr.value);
                        this.processContainerData(data, `container-${index}-${attr.name}`);
                    } catch (error) {
                        // Not JSON, might be a filename or reference
                        if (attr.value.includes('.') || attr.value.length > 5) {
                            const measurement = {
                                url: `reference-${index}`,
                                name: attr.value,
                                frequencies: [],
                                amplitudes: [],
                                metadata: { source: 'reference', attribute: attr.name }
                            };
                            this.measurements.set(measurement.url, measurement);
                        }
                    }
                }
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

    processContainerData(data, id) {
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                if (this.isValidMeasurement(item)) {
                    const measurement = this.normalizeMeasurement(item, `${id}-${index}`);
                    this.measurements.set(measurement.url, measurement);
                }
            });
        }
    }

    isValidMeasurement(item) {
        return item && (
            (item.x && item.y) || // Plotly format
            (item.frequency && item.amplitude) || // Direct format
            (item.frequencies && item.amplitudes) || // Array format
            (Array.isArray(item) && item.length > 10) // Raw array data
        );
    }

    normalizeMeasurement(item, id) {
        let frequencies = [];
        let amplitudes = [];
        let name = 'Unknown';

        if (item.x && item.y) {
            frequencies = item.x;
            amplitudes = item.y;
            name = item.name || item.title || id;
        } else if (item.frequency && item.amplitude) {
            frequencies = item.frequency;
            amplitudes = item.amplitude;
            name = item.name || id;
        } else if (item.frequencies && item.amplitudes) {
            frequencies = item.frequencies;
            amplitudes = item.amplitudes;
            name = item.name || id;
        } else if (Array.isArray(item)) {
            // Assume it's frequency-amplitude pairs
            frequencies = item.map((point, i) => i % 2 === 0 ? point : null).filter(x => x !== null);
            amplitudes = item.map((point, i) => i % 2 === 1 ? point : null).filter(x => x !== null);
            name = id;
        }

        return {
            url: id,
            name: name,
            frequencies: frequencies,
            amplitudes: amplitudes,
            metadata: { source: 'processed' }
        };
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
                }
            }

            // Look for other data patterns
            const dataPatterns = [
                /var\s+(\w*[Dd]ata\w*)\s*=\s*(\[.*?\])/gs,
                /let\s+(\w*[Mm]easurement\w*)\s*=\s*(\{.*?\})/gs,
                /const\s+(\w*[Hh]eadphone\w*)\s*=\s*(\[.*?\])/gs
            ];

            dataPatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(scriptContent)) !== null) {
                    try {
                        const data = eval(match[2]);
                        this.processGlobalData(data, match[1]);
                    } catch (error) {
                        console.error('Error parsing script data:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error extracting inline data:', error);
        }
    }

    scanForPlotlyData() {
        console.log('Scanning for Squiglink D3 data...');
        
        // Squiglink uses D3.js and stores data directly on SVG path elements
        this.scanSquiglinkD3Data();
        
        // Fallback to other methods
        this.scanCrinGraphData();
        this.scanSVGGraphData();
    }

    scanSquiglinkD3Data() {
        console.log('Scanning for Squiglink D3 frequency response data...');
        
        const svgGraph = document.querySelector('#fr-graph');
        if (!svgGraph) {
            console.log('No #fr-graph SVG found');
            return;
        }
        
        const paths = svgGraph.querySelectorAll('path');
        console.log(`Found ${paths.length} path elements in SVG`);
        
        let foundData = 0;
        
        paths.forEach((path, index) => {
            const data = path.__data__;
            
            // Check if this path has D3 frequency response data
            if (data && data.id && data.l && Array.isArray(data.l) && data.l.length > 100) {
                const headphoneName = this.cleanSquiglinkName(data.id);
                
                // Verify it's frequency response data [freq, amplitude] pairs
                if (data.l[0] && Array.isArray(data.l[0]) && data.l[0].length >= 2) {
                    console.log(`✅ Found D3 data for: "${headphoneName}" (${data.l.length} points)`);
                    
                    // Extract frequencies and amplitudes
                    const frequencies = data.l.map(point => point[0]);
                    const amplitudes = data.l.map(point => point[1]);
                    
                    // Create or update measurement with real data
                    this.createOrUpdateMeasurement(headphoneName, frequencies, amplitudes, 'squiglink-d3');
                    foundData++;
                    
                    console.log(`📊 Sample data for ${headphoneName}: ${frequencies[0]}Hz → ${amplitudes[0]}dB`);
                } else {
                    console.log(`⚠️ Path ${index} has data but wrong format:`, data);
                }
            } else if (data && typeof data === 'number') {
                // These are the small UI elements like the ±1 indicators
                console.log(`🎨 UI element path ${index}: ${data}`);
            }
        });
        
        if (foundData > 0) {
            console.log(`🎯 Successfully extracted data from ${foundData} headphones via D3!`);
        } else {
            console.log('❌ No D3 frequency response data found - try adding headphones to the graph first');
        }
    }

    cleanSquiglinkName(fullName) {
        // Clean up Squiglink measurement names
        // Remove suffixes like "(AVG)", "(Tilt: -0.4dB/Oct, B: 2dB, T: -2dB)", etc.
        let cleaned = fullName;
        
        // Remove tilt/EQ information in parentheses
        cleaned = cleaned.replace(/\s*\(Tilt:.*?\)/g, '');
        cleaned = cleaned.replace(/\s*\(AVG\)/g, '');
        cleaned = cleaned.replace(/\s*\(.*?\)/g, ''); // Remove any other parentheses content
        
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
        
        // Check if measurement already exists
        const existingMeasurement = this.findMeasurementByName(cleanName);
        
        if (existingMeasurement) {
            // Update existing measurement with real data
            existingMeasurement.frequencies = [...frequencies];
            existingMeasurement.amplitudes = [...amplitudes];
            existingMeasurement.metadata.hasData = true;
            existingMeasurement.metadata.source = source;
            existingMeasurement.metadata.dataPoints = frequencies.length;
            console.log(`✅ Updated existing measurement: "${cleanName}" with ${frequencies.length} data points`);
        } else {
            // Create new measurement
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
            console.log(`✅ Created new measurement: "${cleanName}" with ${frequencies.length} data points`);
        }
        
        // Update the popup immediately if it's open
        this.updateResults();
    }

    scanSVGGraphData() {
        console.log('Scanning for SVG-based graph data...');
        
        // Look for the SVG graph element
        const svgGraph = document.querySelector('svg#fr-graph, svg[id*="graph"], svg[class*="graph"]');
        if (svgGraph) {
            console.log('Found SVG graph element:', svgGraph);
            
            // Try to extract data from SVG paths or associated data
            this.extractSVGData(svgGraph);
        }
        
        // Look for data stored in relation to SVG elements
        const allSVGs = document.querySelectorAll('svg');
        allSVGs.forEach((svg, index) => {
            if (svg.dataset || svg._data || svg.__data__) {
                console.log(`Found data on SVG element ${index}:`, svg);
                this.processSVGElementData(svg, `svg-${index}`);
            }
        });
    }

    extractSVGData(svgElement) {
        console.log('Extracting data from SVG graph...');
        
        // Look for path elements that might represent frequency response curves
        const paths = svgElement.querySelectorAll('path[d]');
        console.log(`Found ${paths.length} path elements in SVG`);
        
        paths.forEach((path, index) => {
            const pathData = path.getAttribute('d');
            if (pathData && pathData.length > 50) { // Likely a curve, not just UI element
                console.log(`Analyzing path ${index}:`, path);
                
                // Try to extract name from path attributes or nearby elements
                const name = this.extractPathName(path, index);
                const coordinates = this.parsePathData(pathData);
                
                if (coordinates && coordinates.length > 10) {
                    console.log(`Extracted ${coordinates.length} points from path: ${name}`);
                    this.createMeasurementFromPath(name, coordinates, `svg-path-${index}`);
                }
            }
        });
        
        // Also check for data attributes on the SVG or parent elements
        this.checkSVGDataAttributes(svgElement);
    }

    extractPathName(pathElement, index) {
        // Try to find the name from various sources
        let name = `Curve ${index + 1}`;
        
        // Check path attributes
        if (pathElement.dataset.name) {
            name = pathElement.dataset.name;
        } else if (pathElement.getAttribute('data-name')) {
            name = pathElement.getAttribute('data-name');
        } else if (pathElement.id) {
            name = pathElement.id;
        } else if (pathElement.classList.length > 0) {
            name = Array.from(pathElement.classList).join(' ');
        }
        
        // Look for nearby text or title elements
        const nearbyText = pathElement.parentElement?.querySelector('title, text');
        if (nearbyText) {
            name = nearbyText.textContent.trim() || name;
        }
        
        // Check if parent has useful attributes
        const parent = pathElement.parentElement;
        if (parent && (parent.dataset.name || parent.id)) {
            name = parent.dataset.name || parent.id || name;
        }
        
        return this.cleanTraceName(name);
    }

    parsePathData(pathData) {
        // Parse SVG path data to extract coordinates
        // This is a simplified parser for common path commands
        const coordinates = [];
        
        try {
            // Remove path commands and extract number pairs
            const numbers = pathData.replace(/[A-Za-z]/g, ' ').split(/[\s,]+/).filter(n => n && !isNaN(n)).map(Number);
            
            // Group into coordinate pairs
            for (let i = 0; i < numbers.length - 1; i += 2) {
                const x = numbers[i];
                const y = numbers[i + 1];
                if (!isNaN(x) && !isNaN(y)) {
                    coordinates.push({ x, y });
                }
            }
        } catch (error) {
            console.error('Error parsing path data:', error);
        }
        
        return coordinates;
    }

    createMeasurementFromPath(name, coordinates, id) {
        // Convert SVG coordinates to frequency/amplitude data
        // This requires understanding the SVG coordinate system and scaling
        
        // For now, create a measurement with the raw coordinates
        // In a real implementation, we'd need to convert SVG coordinates back to frequency/dB values
        const frequencies = coordinates.map(coord => coord.x);
        const amplitudes = coordinates.map(coord => coord.y);
        
        const existingMeasurement = this.findMeasurementByName(name);
        if (existingMeasurement) {
            existingMeasurement.frequencies = frequencies;
            existingMeasurement.amplitudes = amplitudes;
            existingMeasurement.metadata.hasData = true;
            existingMeasurement.metadata.source = 'svg-path';
            console.log(`✅ Updated measurement from SVG path: "${name}"`);
        } else {
            const measurement = {
                url: id,
                name: name,
                frequencies: frequencies,
                amplitudes: amplitudes,
                metadata: { 
                    source: 'svg-path',
                    hasData: true,
                    rawCoordinates: coordinates
                }
            };
            
            this.measurements.set(id, measurement);
            console.log(`✅ Created measurement from SVG path: "${name}"`);
        }
    }

    checkSVGDataAttributes(svgElement) {
        // Check for data stored in various ways on the SVG
        const dataAttributes = ['data-measurements', 'data-graph-data', 'data-curves', 'data-traces'];
        
        dataAttributes.forEach(attr => {
            const data = svgElement.getAttribute(attr);
            if (data) {
                try {
                    const parsedData = JSON.parse(data);
                    console.log(`Found data in ${attr}:`, parsedData);
                    this.processGenericData(parsedData, `svg-${attr}`);
                } catch (error) {
                    // Not JSON, might be a reference
                    console.log(`Non-JSON data in ${attr}: ${data}`);
                }
            }
        });
    }

    processSVGElementData(svgElement, id) {
        const data = svgElement.dataset || svgElement._data || svgElement.__data__;
        if (data && typeof data === 'object') {
            console.log('Processing SVG element data:', data);
            this.processGenericData(data, id);
        }
    }

    scanGlobalVariables() {
        console.log('Scanning global variables for measurement data...');
        
        // Check the specific variables found in debug
        const foundVars = ['onformdata', 'onloadeddata', 'onloadedmetadata'];
        foundVars.forEach(varName => {
            if (window[varName]) {
                console.log(`Inspecting found variable: ${varName}`, window[varName]);
                if (typeof window[varName] === 'object' && window[varName] !== null) {
                    this.processGenericData(window[varName], `global-${varName}`);
                }
            }
        });
        
        // Extended search for data variables
        const potentialVars = [
            'graphData', 'measurementData', 'frData', 'responseData', 'curveData',
            'phones', 'headphones', 'measurements', 'data', 'dataset',
            'plotData', 'chartData', 'traces', 'curves', 'lines'
        ];
        
        potentialVars.forEach(varName => {
            if (window[varName] && typeof window[varName] === 'object') {
                console.log(`Found potential data variable: ${varName}`, window[varName]);
                this.processGenericData(window[varName], `global-${varName}`);
            }
        });

        // Check for data in modules or namespaces
        if (window.app && typeof window.app === 'object') {
            console.log('Found app namespace:', window.app);
            this.scanObjectForData(window.app, 'app');
        }

        if (window.graph && typeof window.graph === 'object') {
            console.log('Found graph namespace:', window.graph);
            this.scanObjectForData(window.graph, 'graph');
        }
    }

    scanObjectForData(obj, prefix) {
        Object.keys(obj).forEach(key => {
            const value = obj[key];
            if (value && typeof value === 'object') {
                if (this.containsMeasurementData(value)) {
                    console.log(`Found measurement data in ${prefix}.${key}`);
                    this.processGenericData(value, `${prefix}-${key}`);
                }
            }
        });
    }

    scanStandardPlotlyData() {
        // Keep the original Plotly detection as fallback
        const plotlySelectors = [
            'div[id*="plotly"]', 'div[id*="graph"]', '.js-plotly-plot',
            '[class*="plotly"]', 'div[id*="plot"]', '.plotly-graph-div'
        ];
        
        plotlySelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((div, index) => {
                if (div._fullData || div.data) {
                    console.log('Found standard Plotly data');
                    const plotData = div._fullData || div.data;
                    this.processPlotlyData(plotData, div.id || `plotly-${index}`);
                }
            });
        });
    }

    scanCrinGraphData() {
        console.log('Scanning for HarutoHiroki/PublicGraphTool data structures...');
        
        // Based on the txt file format you provided, let's look for loaded measurement data
        const crinGraphVars = [
            'phone_book', 'phoneBook', 'phones', 'measurements', 
            'graph_phone_book', 'active_phones', 'visible_phones',
            'phone_data', 'measurement_data', 'fr_data', 'loaded_measurements'
        ];
        
        crinGraphVars.forEach(varName => {
            if (window[varName]) {
                console.log(`Found ${varName}:`, window[varName]);
                this.processHarutoGraphData(window[varName], varName);
            }
        });

        // Check for specific patterns used by this implementation
        this.scanForTextFileData();
        this.scanForActiveGraphs();
        this.scanForModuleData();
    }

    scanForTextFileData() {
        console.log('Scanning for loaded text file measurement data...');
        
        // Look for variables that might contain the parsed txt file data
        const textDataVars = [
            'loadedData', 'parsedData', 'measurementCache', 'fileCache',
            'graphData', 'plotData', 'traces', 'curves', 'lines'
        ];
        
        textDataVars.forEach(varName => {
            if (window[varName]) {
                console.log(`Checking ${varName} for text file data:`, window[varName]);
                this.processTextFileData(window[varName], varName);
            }
        });

        // Look for cached fetch responses that might contain the txt files
        this.scanFetchCache();
    }

    processTextFileData(data, varName) {
        console.log(`Processing ${varName} for measurement text data...`);
        
        if (!data) return;

        if (typeof data === 'string') {
            // Raw text data like your example
            this.parseRawTextData(data, varName);
        } else if (Array.isArray(data)) {
            data.forEach((item, index) => {
                if (typeof item === 'string') {
                    this.parseRawTextData(item, `${varName}-${index}`);
                } else if (item && typeof item === 'object') {
                    this.processPhoneEntry(item, `${varName}-${index}`);
                }
            });
        } else if (typeof data === 'object') {
            Object.keys(data).forEach(key => {
                const item = data[key];
                if (typeof item === 'string' && this.looksLikeMeasurementData(item)) {
                    this.parseRawTextData(item, `${varName}-${key}`, key);
                } else if (item && typeof item === 'object') {
                    this.processPhoneEntry(item, `${varName}-${key}`, key);
                }
            });
        }
    }

    looksLikeMeasurementData(text) {
        if (!text || typeof text !== 'string') return false;
        
        // Check if it looks like frequency response data
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 10) return false;
        
        // Check if most lines contain two numbers (frequency and amplitude)
        let validLines = 0;
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const parts = lines[i].trim().split(/[\s\t,]+/);
            if (parts.length >= 2) {
                const freq = parseFloat(parts[0]);
                const amp = parseFloat(parts[1]);
                if (!isNaN(freq) && !isNaN(amp) && freq > 0) {
                    validLines++;
                }
            }
        }
        
        return validLines >= 8; // At least 80% of sampled lines should be valid
    }

    parseRawTextData(textData, id, name = null) {
        console.log(`Parsing raw text data for ${id}...`);
        
        const lines = textData.split('\n').filter(line => line.trim());
        const frequencies = [];
        const amplitudes = [];
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            // Split by whitespace, tab, or comma
            const parts = trimmed.split(/[\s\t,]+/);
            if (parts.length >= 2) {
                const freq = parseFloat(parts[0]);
                const amp = parseFloat(parts[1]);
                
                if (!isNaN(freq) && !isNaN(amp)) {
                    frequencies.push(freq);
                    amplitudes.push(amp);
                }
            }
        });

        if (frequencies.length > 10) {
            const measurementName = name || this.extractNameFromId(id) || `Measurement ${id}`;
            console.log(`✅ Parsed ${frequencies.length} data points from text for: ${measurementName}`);
            this.createOrUpdateMeasurement(measurementName, frequencies, amplitudes, 'text-file');
        } else {
            console.log(`❌ Not enough valid data points in text for ${id}: ${frequencies.length} points`);
        }
    }

    extractNameFromId(id) {
        // Try to extract a meaningful name from the ID
        if (id.includes('-')) {
            const parts = id.split('-');
            return parts[parts.length - 1];
        }
        return id;
    }

    scanForActiveGraphs() {
        console.log('Scanning for active graph elements...');
        
        // Look for SVG elements that might contain the current graph state
        const svgGraph = document.querySelector('svg#fr-graph, svg[id*="graph"], svg[class*="graph"]');
        if (svgGraph) {
            console.log('Found SVG graph, checking for data attributes and child elements...');
            this.extractFromSVG(svgGraph);
        }

        // Look for elements that might represent active measurements
        const activeElements = document.querySelectorAll('[class*="active"], [class*="visible"], [data-active="true"]');
        activeElements.forEach((element, index) => {
            if (element.dataset || element._data) {
                console.log(`Found active element ${index} with data:`, element);
                this.processElementData(element, `active-${index}`);
            }
        });
    }

    extractFromSVG(svgElement) {
        // Look for path elements that represent frequency response curves
        const paths = svgElement.querySelectorAll('path[d]');
        console.log(`Found ${paths.length} path elements in SVG`);
        
        paths.forEach((path, index) => {
            const pathData = path.getAttribute('d');
            if (pathData && pathData.length > 100) { // Substantial path data
                const name = this.extractPathName(path, index);
                
                // Try to get associated data from the path element or parent
                if (path.dataset.measurements || path.dataset.data) {
                    console.log(`Found data attribute on path for ${name}`);
                    try {
                        const data = JSON.parse(path.dataset.measurements || path.dataset.data);
                        this.processGenericData(data, `svg-path-${index}`, name);
                    } catch (error) {
                        console.log(`Could not parse path data for ${name}`);
                    }
                }
            }
        });
    }

    processElementData(element, id) {
        const data = element.dataset || element._data || element.__data__;
        if (data) {
            console.log(`Processing element data for ${id}:`, data);
            this.processGenericData(data, id);
        }
    }

    scanFetchCache() {
        console.log('Scanning for cached fetch responses...');
        
        // Check if there's a global cache of loaded files
        if (window.Response && window.Response.cache) {
            console.log('Found Response cache:', window.Response.cache);
        }

        // Look for common cache patterns
        const cacheVars = ['cache', 'fileCache', 'responseCache', 'loadedFiles', 'fetchCache'];
        cacheVars.forEach(varName => {
            if (window[varName] && typeof window[varName] === 'object') {
                console.log(`Found ${varName}:`, window[varName]);
                Object.keys(window[varName]).forEach(key => {
                    const value = window[varName][key];
                    if (typeof value === 'string' && this.looksLikeMeasurementData(value)) {
                        console.log(`Found measurement data in ${varName}.${key}`);
                        this.parseRawTextData(value, `${varName}-${key}`, key);
                    }
                });
            }
        });
    }

    processHarutoGraphData(data, varName) {
        console.log(`Processing ${varName} data structure...`);
        
        if (!data) {
            console.log(`${varName} is empty or undefined`);
            return;
        }

        if (Array.isArray(data)) {
            console.log(`${varName} is an array with ${data.length} items`);
            data.forEach((item, index) => {
                this.processPhoneEntry(item, `${varName}-${index}`);
            });
        } else if (typeof data === 'object') {
            const keys = Object.keys(data);
            console.log(`${varName} is an object with keys:`, keys);
            
            keys.forEach(key => {
                const item = data[key];
                console.log(`Processing ${varName}.${key}:`, item);
                
                // Check if this item contains text file data
                if (typeof item === 'string' && this.looksLikeMeasurementData(item)) {
                    this.parseRawTextData(item, `${varName}-${key}`, key);
                } else {
                    this.processPhoneEntry(item, `${varName}-${key}`, key);
                }
            });
        }
    }

    processHarutoGraphData(data, varName) {
        console.log(`Processing ${varName} data structure...`);
        
        if (!data) {
            console.log(`${varName} is empty or undefined`);
            return;
        }

        if (Array.isArray(data)) {
            console.log(`${varName} is an array with ${data.length} items`);
            data.forEach((item, index) => {
                this.processPhoneEntry(item, `${varName}-${index}`);
            });
        } else if (typeof data === 'object') {
            const keys = Object.keys(data);
            console.log(`${varName} is an object with keys:`, keys);
            
            keys.forEach(key => {
                const item = data[key];
                console.log(`Processing ${varName}.${key}:`, item);
                this.processPhoneEntry(item, `${varName}-${key}`, key);
            });
        }
    }

    processPhoneEntry(entry, id, originalKey = null) {
        if (!entry || typeof entry !== 'object') {
            console.log(`Entry ${id} is not a valid object:`, entry);
            return;
        }

        console.log(`Processing phone entry ${id}:`, entry);
        
        let name = originalKey || id;
        let frequencies = [];
        let amplitudes = [];
        
        // Try different data structure patterns used by CrinGraph variants
        if (entry.name) {
            name = entry.name;
        } else if (entry.phone_name) {
            name = entry.phone_name;
        } else if (entry.model) {
            name = entry.model;
        }

        // Look for frequency response data in various formats
        if (entry.fr && Array.isArray(entry.fr)) {
            // Format: fr: [[freq1, db1], [freq2, db2], ...]
            console.log(`Found FR array for ${name} with ${entry.fr.length} points`);
            entry.fr.forEach(point => {
                if (Array.isArray(point) && point.length >= 2) {
                    frequencies.push(point[0]);
                    amplitudes.push(point[1]);
                }
            });
        } else if (entry.measurements && Array.isArray(entry.measurements)) {
            // Format: measurements: [{freq: x, db: y}, ...]
            console.log(`Found measurements array for ${name} with ${entry.measurements.length} points`);
            entry.measurements.forEach(point => {
                if (point.freq !== undefined && point.db !== undefined) {
                    frequencies.push(point.freq);
                    amplitudes.push(point.db);
                } else if (point.frequency !== undefined && point.amplitude !== undefined) {
                    frequencies.push(point.frequency);
                    amplitudes.push(point.amplitude);
                }
            });
        } else if (entry.frequency && entry.amplitude) {
            // Format: {frequency: [freq array], amplitude: [db array]}
            console.log(`Found separate frequency/amplitude arrays for ${name}`);
            frequencies = Array.isArray(entry.frequency) ? entry.frequency : [entry.frequency];
            amplitudes = Array.isArray(entry.amplitude) ? entry.amplitude : [entry.amplitude];
        } else if (entry.data && Array.isArray(entry.data)) {
            // Format: data: [freq, db, freq, db, ...]
            console.log(`Found data array for ${name} with ${entry.data.length} elements`);
            for (let i = 0; i < entry.data.length - 1; i += 2) {
                frequencies.push(entry.data[i]);
                amplitudes.push(entry.data[i + 1]);
            }
        } else {
            // Try to find numeric arrays that might be frequency data
            Object.keys(entry).forEach(key => {
                const value = entry[key];
                if (Array.isArray(value) && value.length > 10 && value.every(v => typeof v === 'number')) {
                    if (key.toLowerCase().includes('freq') && frequencies.length === 0) {
                        frequencies = value;
                        console.log(`Found frequency data in ${key} for ${name}`);
                    } else if ((key.toLowerCase().includes('db') || key.toLowerCase().includes('amp')) && amplitudes.length === 0) {
                        amplitudes = value;
                        console.log(`Found amplitude data in ${key} for ${name}`);
                    }
                }
            });
        }

        // If we found data, create or update the measurement
        if (frequencies.length > 0 && amplitudes.length > 0 && frequencies.length === amplitudes.length) {
            console.log(`✅ Successfully extracted ${frequencies.length} data points for: ${name}`);
            this.createOrUpdateMeasurement(name, frequencies, amplitudes, 'haruto-graph');
        } else {
            console.log(`❌ Could not extract valid frequency data for: ${name}`, {
                freqLength: frequencies.length,
                ampLength: amplitudes.length,
                entryKeys: Object.keys(entry)
            });
        }
    }

    scanForModuleData() {
        console.log('Scanning for module-based data...');
        
        // Check for AMD/RequireJS modules
        if (window.require && window.require.defined) {
            console.log('RequireJS detected, checking for graph modules...');
            // This would need specific module names from the actual implementation
        }

        // Check for CommonJS-style exports
        if (window.module && window.module.exports) {
            console.log('Module exports detected:', window.module.exports);
            this.processGenericData(window.module.exports, 'module-exports');
        }

        // Check for global functions that might return data
        const dataFunctions = ['getPhoneData', 'getMeasurements', 'getActivePhones', 'getVisiblePhones'];
        dataFunctions.forEach(funcName => {
            if (typeof window[funcName] === 'function') {
                try {
                    const data = window[funcName]();
                    console.log(`Got data from ${funcName}():`, data);
                    this.processGenericData(data, `function-${funcName}`);
                } catch (error) {
                    console.log(`Error calling ${funcName}():`, error);
                }
            }
        });
    }

    scanForCSVData() {
        console.log('Scanning for CSV or raw measurement data...');
        
        // Look for script tags that might contain CSV data
        const scripts = document.querySelectorAll('script[type="text/csv"], script[src*="csv"], script[src*="measurements"]');
        scripts.forEach((script, index) => {
            console.log(`Found potential CSV script ${index}:`, script);
            if (script.textContent) {
                this.parseCSVContent(script.textContent, `csv-script-${index}`);
            }
        });

        // Check for fetch requests that might have loaded CSV data
        if (window.fetch.originalFetch) {
            console.log('Fetch has been overridden, checking for cached responses...');
        }

        // Look for XMLHttpRequest cache
        if (window.XMLHttpRequest.responseCache) {
            console.log('Found XMLHttpRequest cache:', window.XMLHttpRequest.responseCache);
        }
    }

    parseCSVContent(csvText, id) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 10) return; // Too short to be measurement data
        
        console.log(`Parsing CSV content with ${lines.length} lines`);
        
        const frequencies = [];
        const amplitudes = [];
        
        lines.forEach((line, index) => {
            if (index === 0 && line.includes('frequency')) return; // Skip header
            
            const values = line.split(',').map(v => parseFloat(v.trim()));
            if (values.length >= 2 && !isNaN(values[0]) && !isNaN(values[1])) {
                frequencies.push(values[0]);
                amplitudes.push(values[1]);
            }
        });
        
        if (frequencies.length > 10) {
            console.log(`✅ Parsed CSV data with ${frequencies.length} points`);
            this.createOrUpdateMeasurement(`CSV Data ${id}`, frequencies, amplitudes, 'csv-data');
        }
    }

    processPhonesObject(phonesObj) {
        console.log('Processing phones object in detail...');
        
        if (!phonesObj || typeof phonesObj !== 'object') {
            console.log('Phones object is empty or invalid');
            return;
        }

        const phoneKeys = Object.keys(phonesObj);
        console.log(`Found ${phoneKeys.length} entries in phones object:`, phoneKeys);

        phoneKeys.forEach(phoneKey => {
            const phoneData = phonesObj[phoneKey];
            console.log(`Processing phone: ${phoneKey}`, phoneData);
            
            if (phoneData && typeof phoneData === 'object') {
                // Check different possible data structures
                if (phoneData.measurements || phoneData.data || phoneData.fr || phoneData.frequency) {
                    console.log(`Found measurement data for: ${phoneKey}`);
                    this.extractPhoneFrequencyData(phoneKey, phoneData);
                } else if (Array.isArray(phoneData)) {
                    console.log(`Phone data is array for: ${phoneKey}, length: ${phoneData.length}`);
                    this.processPhoneArray(phoneKey, phoneData);
                } else {
                    // Check if the phoneData object itself contains frequency data
                    const dataKeys = Object.keys(phoneData);
                    console.log(`Phone ${phoneKey} has keys:`, dataKeys);
                    
                    if (dataKeys.some(key => key.includes('freq') || key.includes('amplitude') || key.includes('db'))) {
                        console.log(`Potential frequency data found in keys for: ${phoneKey}`);
                        this.extractPhoneFrequencyData(phoneKey, phoneData);
                    }
                }
            }
        });
    }

    extractPhoneFrequencyData(phoneName, phoneData) {
        let frequencies = [];
        let amplitudes = [];
        
        // Try different data structure patterns
        if (phoneData.measurements && Array.isArray(phoneData.measurements)) {
            // Measurements array format
            phoneData.measurements.forEach(point => {
                if (point.freq !== undefined && point.db !== undefined) {
                    frequencies.push(point.freq);
                    amplitudes.push(point.db);
                } else if (point.frequency !== undefined && point.amplitude !== undefined) {
                    frequencies.push(point.frequency);
                    amplitudes.push(point.amplitude);
                } else if (Array.isArray(point) && point.length >= 2) {
                    frequencies.push(point[0]);
                    amplitudes.push(point[1]);
                }
            });
        } else if (phoneData.fr && Array.isArray(phoneData.fr)) {
            // FR array format
            phoneData.fr.forEach(point => {
                if (Array.isArray(point) && point.length >= 2) {
                    frequencies.push(point[0]);
                    amplitudes.push(point[1]);
                }
            });
        } else if (phoneData.frequency && phoneData.amplitude) {
            // Separate arrays format
            frequencies = Array.isArray(phoneData.frequency) ? phoneData.frequency : [phoneData.frequency];
            amplitudes = Array.isArray(phoneData.amplitude) ? phoneData.amplitude : [phoneData.amplitude];
        } else if (phoneData.freq && phoneData.db) {
            // Alternative separate arrays
            frequencies = Array.isArray(phoneData.freq) ? phoneData.freq : [phoneData.freq];
            amplitudes = Array.isArray(phoneData.db) ? phoneData.db : [phoneData.db];
        } else {
            // Try to find data in nested objects
            Object.keys(phoneData).forEach(key => {
                const value = phoneData[key];
                if (Array.isArray(value) && value.length > 10) {
                    // Might be frequency data
                    if (key.toLowerCase().includes('freq')) {
                        frequencies = value;
                    } else if (key.toLowerCase().includes('db') || key.toLowerCase().includes('amp')) {
                        amplitudes = value;
                    }
                }
            });
        }

        if (frequencies.length > 0 && amplitudes.length > 0) {
            console.log(`✅ Extracted ${frequencies.length} data points for: ${phoneName}`);
            this.createOrUpdateMeasurement(phoneName, frequencies, amplitudes, 'phones-object');
        } else {
            console.log(`❌ Could not extract frequency data for: ${phoneName}`, phoneData);
        }
    }

    processPhoneArray(phoneName, phoneArray) {
        if (phoneArray.length > 10 && Array.isArray(phoneArray[0])) {
            // Array of [frequency, amplitude] pairs
            const frequencies = phoneArray.map(point => point[0]);
            const amplitudes = phoneArray.map(point => point[1]);
            
            if (frequencies.every(f => typeof f === 'number') && amplitudes.every(a => typeof a === 'number')) {
                console.log(`✅ Extracted data from array format for: ${phoneName}`);
                this.createOrUpdateMeasurement(phoneName, frequencies, amplitudes, 'phones-array');
            }
        }
    }

    createOrUpdateMeasurement(name, frequencies, amplitudes, source) {
        const cleanName = this.cleanTraceName(name);
        const existingMeasurement = this.findMeasurementByName(cleanName);
        
        if (existingMeasurement) {
            existingMeasurement.frequencies = [...frequencies];
            existingMeasurement.amplitudes = [...amplitudes];
            existingMeasurement.metadata.hasData = true;
            existingMeasurement.metadata.source = source;
            console.log(`✅ Updated existing measurement: "${cleanName}" with ${frequencies.length} points`);
        } else {
            const measurementId = `${source}-${this.sanitizeId(cleanName)}`;
            const measurement = {
                url: measurementId,
                name: cleanName,
                frequencies: [...frequencies],
                amplitudes: [...amplitudes],
                metadata: { 
                    source: source,
                    hasData: true,
                    originalName: name
                }
            };
            
            this.measurements.set(measurementId, measurement);
            console.log(`✅ Created new measurement: "${cleanName}" with ${frequencies.length} points`);
        }
    }

    deepInspectWindowObject() {
        console.log('Deep inspection of window object for measurement data...');
        
        // Look for any object that might contain measurement data
        Object.keys(window).forEach(key => {
            const value = window[key];
            
            if (value && typeof value === 'object' && !value.nodeType) { // Exclude DOM elements
                // Check if this object might contain measurement data
                if (this.mightContainMeasurements(value, key)) {
                    console.log(`Potential measurement container found: ${key}`, value);
                    this.processGenericData(value, `window-${key}`);
                }
            }
        });
    }

    mightContainMeasurements(obj, objName) {
        if (!obj || typeof obj !== 'object') return false;
        
        const objNameLower = objName.toLowerCase();
        
        // Check object name for measurement-related terms
        if (objNameLower.includes('phone') || objNameLower.includes('measure') || 
            objNameLower.includes('data') || objNameLower.includes('graph') ||
            objNameLower.includes('fr') || objNameLower.includes('response')) {
            return true;
        }
        
        // Check object structure
        const keys = Object.keys(obj);
        if (keys.length === 0) return false;
        
        // Look for measurement-like structure
        const hasArrays = keys.some(key => Array.isArray(obj[key]));
        const hasMeasurementKeys = keys.some(key => 
            key.toLowerCase().includes('freq') || 
            key.toLowerCase().includes('db') || 
            key.toLowerCase().includes('measure') ||
            key.toLowerCase().includes('amplitude')
        );
        
        return hasArrays || hasMeasurementKeys;
    }

    processCrinGraphVariable(data, varName) {
        console.log(`Processing CrinGraph variable: ${varName}`);
        
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                if (this.isCrinGraphMeasurement(item)) {
                    this.processCrinGraphMeasurement(item, `${varName}-${index}`);
                }
            });
        } else if (typeof data === 'object' && data !== null) {
            Object.keys(data).forEach(key => {
                const item = data[key];
                if (this.isCrinGraphMeasurement(item)) {
                    this.processCrinGraphMeasurement(item, `${varName}-${key}`);
                }
            });
        }
    }

    isCrinGraphMeasurement(item) {
        if (!item || typeof item !== 'object') return false;
        
        // CrinGraph measurements might have different structures
        return (
            (item.x && item.y) ||
            (item.freq && item.db) ||
            (item.frequency && item.amplitude) ||
            (item.frequencies && item.amplitudes) ||
            (item.name && (item.data || item.trace)) ||
            (Array.isArray(item) && item.length > 10) // Raw frequency data
        );
    }

    processCrinGraphMeasurement(item, id) {
        let frequencies = [];
        let amplitudes = [];
        let name = 'Unknown';

        if (item.x && item.y) {
            frequencies = item.x;
            amplitudes = item.y;
            name = item.name || item.title || id;
        } else if (item.freq && item.db) {
            frequencies = item.freq;
            amplitudes = item.db;
            name = item.name || id;
        } else if (item.frequency && item.amplitude) {
            frequencies = item.frequency;
            amplitudes = item.amplitude;
            name = item.name || id;
        } else if (item.frequencies && item.amplitudes) {
            frequencies = item.frequencies;
            amplitudes = item.amplitudes;
            name = item.name || id;
        } else if (item.name && item.data) {
            name = item.name;
            if (item.data.x && item.data.y) {
                frequencies = item.data.x;
                amplitudes = item.data.y;
            }
        }

        if (frequencies.length > 0 && amplitudes.length > 0) {
            const cleanName = this.cleanTraceName(name);
            
            // Try to match with existing measurements
            const existingMeasurement = this.findMeasurementByName(cleanName);
            if (existingMeasurement) {
                existingMeasurement.frequencies = [...frequencies];
                existingMeasurement.amplitudes = [...amplitudes];
                existingMeasurement.metadata.hasData = true;
                existingMeasurement.metadata.source = 'cringraph';
                console.log(`✅ Updated CrinGraph measurement: "${cleanName}"`);
            } else {
                // Create new measurement
                const measurementId = `cringraph-${this.sanitizeId(cleanName)}`;
                const measurement = {
                    url: measurementId,
                    name: cleanName,
                    frequencies: [...frequencies],
                    amplitudes: [...amplitudes],
                    metadata: { 
                        source: 'cringraph',
                        hasData: true,
                        originalId: id
                    }
                };
                
                this.measurements.set(measurementId, measurement);
                console.log(`✅ Created CrinGraph measurement: "${cleanName}"`);
            }
        }
    }

    scanModulePatterns() {
        // Check for AMD/CommonJS/ES6 modules that might contain data
        if (window.require) {
            console.log('Found AMD loader, checking for data modules...');
            // This would be complex to implement safely
        }

        // Check for data in script tags with specific types
        const scriptTags = document.querySelectorAll('script[type="application/json"], script[type="text/json"]');
        scriptTags.forEach((script, index) => {
            try {
                const data = JSON.parse(script.textContent);
                if (this.containsMeasurementData(data)) {
                    console.log(`Found measurement data in JSON script tag ${index}`);
                    this.processGenericData(data, `json-script-${index}`);
                }
            } catch (error) {
                // Not valid JSON
            }
        });
    }

    scanPlotlyTraces() {
        // Try to access Plotly traces more directly
        try {
            const plotElement = document.querySelector('[id*="graph"], [id*="plot"], .plotly-graph-div');
            if (plotElement) {
                console.log('Found potential plot element:', plotElement);
                
                // Try multiple ways to access the data
                if (plotElement.data) {
                    console.log('Found data property');
                    this.processPlotlyData(plotElement.data, 'direct-data');
                }
                
                if (plotElement._fullData) {
                    console.log('Found _fullData property');
                    this.processPlotlyData(plotElement._fullData, 'direct-fulldata');
                }

                // Try accessing through Plotly API if available
                if (window.Plotly && plotElement.id) {
                    try {
                        const plotlyData = window.Plotly.d3.select(`#${plotElement.id}`).datum();
                        if (plotlyData && plotlyData.data) {
                            console.log('Found data through Plotly API');
                            this.processPlotlyData(plotlyData.data, 'plotly-api');
                        }
                    } catch (error) {
                        console.log('Error accessing Plotly API:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error scanning Plotly traces:', error);
        }
    }

    containsMeasurementData(data) {
        if (!data) return false;
        
        // Check if object contains measurement-like data
        if (Array.isArray(data)) {
            return data.some(item => this.isCrinGraphMeasurement(item));
        }
        
        if (typeof data === 'object') {
            return Object.values(data).some(item => this.isCrinGraphMeasurement(item));
        }
        
        return false;
    }

    processGenericData(data, sourceId) {
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                if (this.isCrinGraphMeasurement(item)) {
                    this.processCrinGraphMeasurement(item, `${sourceId}-${index}`);
                }
            });
        } else if (typeof data === 'object') {
            Object.keys(data).forEach(key => {
                const item = data[key];
                if (this.isCrinGraphMeasurement(item)) {
                    this.processCrinGraphMeasurement(item, `${sourceId}-${key}`);
                }
            });
        }
    }

    scanGlobalVariables() {
        // Extended list of potential global variables
        const globalVars = [
            'plotData', 'graphData', 'chartData', 'measurementData', 'traces',
            'phones', 'headphones', 'iems', 'measurements', 'data',
            'plotlyData', 'frData', 'responseData', 'curveData',
            'activeData', 'selectedData', 'visibleData'
        ];
        
        globalVars.forEach(varName => {
            if (window[varName]) {
                console.log(`Found global variable: ${varName}`, window[varName]);
                try {
                    this.processGenericData(window[varName], `global-${varName}`);
                } catch (error) {
                    console.error(`Error processing global ${varName}:`, error);
                }
            }
        });
    }

    processPlotlyData(plotData, sourceId) {
        console.log('Processing Plotly data from:', sourceId, plotData);
        
        if (!Array.isArray(plotData)) {
            console.log('Plot data is not an array, skipping');
            return;
        }

        plotData.forEach((trace, traceIndex) => {
            if (trace.x && trace.y && Array.isArray(trace.x) && Array.isArray(trace.y)) {
                const traceName = this.cleanTraceName(trace.name || `Trace ${traceIndex + 1}`);
                console.log(`Found trace: "${traceName}" with ${trace.x.length} data points`);
                
                // Try to match with existing measurements
                const existingMeasurement = this.findMeasurementByName(traceName);
                if (existingMeasurement) {
                    existingMeasurement.frequencies = [...trace.x];
                    existingMeasurement.amplitudes = [...trace.y];
                    existingMeasurement.metadata.hasData = true;
                    existingMeasurement.metadata.plotlySource = sourceId;
                    console.log(`✅ Updated existing measurement: "${traceName}"`);
                } else {
                    // Create new measurement with the data
                    const measurementId = `plotly-${this.sanitizeId(traceName)}`;
                    const measurement = {
                        url: measurementId,
                        name: traceName,
                        frequencies: [...trace.x],
                        amplitudes: [...trace.y],
                        metadata: { 
                            source: 'plotly', 
                            element: sourceId,
                            hasData: true,
                            plotlySource: sourceId
                        }
                    };
                    
                    this.measurements.set(measurementId, measurement);
                    console.log(`✅ Created new measurement: "${traceName}"`);
                }
            } else {
                console.log('Trace missing x/y data or not arrays:', trace);
            }
        });
    }

    extractFromPlotlyLibrary() {
        try {
            // Try to get data from Plotly's internal state
            if (window.Plotly.d3) {
                const plotDivs = window.Plotly.d3.selectAll('.plotly-graph-div');
                plotDivs.each(function() {
                    const div = this;
                    if (div.data) {
                        console.log('Found data in Plotly d3 selection');
                        this.processPlotlyData(div.data, div.id || 'plotly-d3');
                    }
                });
            }
        } catch (error) {
            console.error('Error extracting from Plotly library:', error);
        }
    }

    tryAlternativeDataExtraction() {
        console.log('Trying alternative data extraction methods...');
        
        // Look for script tags that might contain measurement data
        const scripts = document.querySelectorAll('script');
        scripts.forEach((script, index) => {
            const content = script.textContent;
            if (content && (content.includes('x:') && content.includes('y:') && content.includes('name:'))) {
                console.log(`Found potential data in script tag ${index}`);
                this.extractDataFromScript(content, index);
            }
        });

        // Look for JSON data in the page
        const jsonRegex = /\{[^{}]*"x"\s*:\s*\[[^\]]+\][^{}]*"y"\s*:\s*\[[^\]]+\][^{}]*\}/g;
        const pageHTML = document.documentElement.outerHTML;
        let match;
        let jsonCount = 0;
        while ((match = jsonRegex.exec(pageHTML)) !== null && jsonCount < 10) {
            try {
                const data = JSON.parse(match[0]);
                if (data.x && data.y) {
                    console.log('Found JSON data with x/y arrays');
                    this.processPlotlyData([data], `json-${jsonCount}`);
                }
                jsonCount++;
            } catch (error) {
                // Invalid JSON, continue
            }
        }
    }

    extractDataFromScript(scriptContent, scriptIndex) {
        try {
            // Look for Plotly.newPlot calls
            const plotlyMatches = scriptContent.match(/Plotly\.newPlot\s*\([^,]+,\s*(\[.*?\])/s);
            if (plotlyMatches) {
                console.log('Found Plotly.newPlot in script');
                const data = eval(plotlyMatches[1]);
                this.processPlotlyData(data, `script-${scriptIndex}`);
                return;
            }

            // Look for variable assignments with array data
            const dataMatches = scriptContent.match(/(?:var|let|const)\s+\w+\s*=\s*(\[.*?\])/gs);
            if (dataMatches) {
                dataMatches.forEach((match, matchIndex) => {
                    try {
                        const arrayMatch = match.match(/=\s*(\[.*?\])/s);
                        if (arrayMatch) {
                            const data = eval(arrayMatch[1]);
                            if (Array.isArray(data) && data.length > 0 && data[0].x && data[0].y) {
                                console.log('Found array data in script variable');
                                this.processPlotlyData(data, `script-var-${scriptIndex}-${matchIndex}`);
                            }
                        }
                    } catch (error) {
                        // Skip invalid data
                    }
                });
            }
        } catch (error) {
            console.error('Error extracting data from script:', error);
        }
    }

    extractPlotlyGlobalData() {
        // Try to find Plotly graphs through the global Plotly object
        try {
            const plotlyElements = document.querySelectorAll('[id]');
            plotlyElements.forEach(element => {
                if (element.id && element._fullData) {
                    const data = element._fullData;
                    if (Array.isArray(data)) {
                        data.forEach(trace => {
                            if (trace.x && trace.y && trace.name) {
                                const traceName = this.cleanTraceName(trace.name);
                                const existingMeasurement = this.findMeasurementByName(traceName);
                                if (existingMeasurement) {
                                    existingMeasurement.frequencies = [...trace.x];
                                    existingMeasurement.amplitudes = [...trace.y];
                                    existingMeasurement.metadata.hasData = true;
                                    console.log('Updated from global Plotly:', traceName);
                                }
                            }
                        });
                    }
                }
            });
        } catch (error) {
            console.error('Error extracting global Plotly data:', error);
        }
    }

    cleanTraceName(name) {
        if (!name) return 'Unknown';
        
        // Remove common prefixes and clean up the name
        return name
            .replace(/^x\s+/, '') // Remove "x " prefix
            .replace(/\s*\(.*\)$/, '') // Remove parenthetical info
            .replace(/\s*\[.*\]$/, '') // Remove bracket info
            .trim();
    }

    findMeasurementByName(targetName) {
        // Find measurement by name (case-insensitive, flexible matching)
        const cleanTarget = targetName.toLowerCase().trim();
        
        for (const [key, measurement] of this.measurements) {
            const cleanMeasurementName = measurement.name.toLowerCase().trim();
            
            // Exact match
            if (cleanMeasurementName === cleanTarget) {
                return measurement;
            }
            
            // Partial match (either direction)
            if (cleanMeasurementName.includes(cleanTarget) || cleanTarget.includes(cleanMeasurementName)) {
                return measurement;
            }
            
            // Remove common variations and try again
            const normalizedTarget = this.normalizeName(cleanTarget);
            const normalizedMeasurement = this.normalizeName(cleanMeasurementName);
            
            if (normalizedTarget === normalizedMeasurement) {
                return measurement;
            }
        }
        
        return null;
    }

    normalizeName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
            .replace(/\s+/g, ''); // Remove spaces
    }

    scanForSelectableItems() {
        // Clear previous selectable items to avoid duplicates
        const toRemove = [];
        this.measurements.forEach((measurement, key) => {
            if (measurement.metadata.source === 'selectable') {
                toRemove.push(key);
            }
        });
        toRemove.forEach(key => this.measurements.delete(key));

        // Look for headphone/IEM measurement selectors (more specific)
        const headphoneSelectors = [
            'select[id*="headphone"] option[value]:not([value=""])',
            'select[id*="iem"] option[value]:not([value=""])',
            'select[id*="measurement"] option[value]:not([value=""])',
            'select[name*="headphone"] option[value]:not([value=""])',
            'select[name*="iem"] option[value]:not([value=""])',
            'datalist option[value]',
            '.headphone-list option[value]',
            '.measurement-list option[value]'
        ];

        headphoneSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element, index) => {
                const name = this.extractItemName(element);
                const value = element.value;
                
                // Filter out non-headphone items (likely site names, categories, etc.)
                if (this.isValidHeadphoneName(name, value)) {
                    const measurementId = `headphone-${this.sanitizeId(name)}-${index}`;
                    
                    if (!this.measurements.has(measurementId)) {
                        const measurement = {
                            url: measurementId,
                            name: name,
                            frequencies: [], // Will be populated when accessed
                            amplitudes: [],
                            metadata: { 
                                source: 'selectable',
                                element: element,
                                selector: selector,
                                value: value
                            }
                        };
                        
                        this.measurements.set(measurementId, measurement);
                        console.log('Found headphone measurement:', name);
                    }
                }
            });
        });

        // Also look for dynamically loaded measurement lists
        this.scanForDynamicMeasurements();
    }

    isValidHeadphoneName(name, value) {
        if (!name || name.length < 3) return false;
        
        // Filter out obvious non-headphone entries
        const excludePatterns = [
            /^select/i,
            /^choose/i,
            /archive/i,
            /reviews?/i,
            /^more/i,
            /squiglink/i,
            /\.link/i,
            /\.com/i,
            /\.net/i,
            /\.org/i,
            /^http/i,
            /^www/i,
            /earphones archive/i,
            /hangout\.audio/i,
            /listener/i,
            /acho reviews/i,
            /adri-n/i,
            /aftersound/i,
            /animagus/i
        ];

        if (excludePatterns.some(pattern => pattern.test(name))) {
            return false;
        }

        // Look for patterns that suggest it's a headphone model
        const includePatterns = [
            /\d/,  // Contains numbers (common in model names)
            /-/,   // Contains dashes (common in model names)
            /hd\d+/i,  // Sennheiser pattern
            /ath-/i,   // Audio-Technica pattern
            /wh-/i,    // Sony pattern
            /dt\d+/i,  // Beyerdynamic pattern
            /he-/i,    // HiFiMAN pattern
            /lcd-/i,   // Audeze pattern
            /focal/i,
            /sony/i,
            /sennheiser/i,
            /audio.*technica/i,
            /beyerdynamic/i
        ];

        // If it contains headphone brand patterns, it's likely valid
        if (includePatterns.some(pattern => pattern.test(name))) {
            return true;
        }

        // If value looks like a filename, it's probably a measurement
        if (value && (value.includes('.') || value.includes('/'))) {
            return true;
        }

        // Default to true if none of the exclude patterns matched
        return true;
    }

    sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    scanForDynamicMeasurements() {
        // Look for measurement data that might be loaded dynamically
        const dataElements = document.querySelectorAll('[data-measurements], [data-headphones], [data-files]');
        
        dataElements.forEach((element, index) => {
            try {
                const dataAttr = element.dataset.measurements || element.dataset.headphones || element.dataset.files;
                if (dataAttr) {
                    const data = JSON.parse(dataAttr);
                    if (Array.isArray(data)) {
                        data.forEach((item, itemIndex) => {
                            if (typeof item === 'string' && this.isValidHeadphoneName(item, item)) {
                                const measurementId = `dynamic-${index}-${itemIndex}`;
                                const measurement = {
                                    url: measurementId,
                                    name: item,
                                    frequencies: [],
                                    amplitudes: [],
                                    metadata: { 
                                        source: 'dynamic',
                                        element: element
                                    }
                                };
                                this.measurements.set(measurementId, measurement);
                            }
                        });
                    }
                }
            } catch (error) {
                // Not valid JSON, skip
            }
        });
    }

    extractItemName(element) {
        // Extract name from various element types
        if (element.tagName === 'OPTION') {
            return element.textContent.trim() || element.value;
        }
        
        if (element.dataset.name) {
            return element.dataset.name;
        }
        
        if (element.dataset.measurement) {
            return element.dataset.measurement;
        }
        
        return element.textContent.trim();
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
        // Debug: Log current measurements
        console.log('Current measurements:', this.measurements);
        console.log('Page URL:', window.location.href);
        console.log('Page title:', document.title);
        
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
                        <button id="debug-btn" style="background: #dc3545; margin-left: 10px;">Debug Info</button>
                        <button id="rescan-btn" style="background: #ffc107; color: black; margin-left: 10px;">Re-scan Page</button>
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

        modal.querySelector('#debug-btn').addEventListener('click', () => {
            this.showDebugInfo();
        });

        modal.querySelector('#rescan-btn').addEventListener('click', () => {
            this.rescanPage();
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

    showDebugInfo() {
        const resultsDiv = document.getElementById('analysis-results');
        let debugInfo = '<div class="debug-info" style="background: #ffffff; color: #000000; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; max-height: 400px; overflow-y: auto; border: 2px solid #333; user-select: text; -webkit-user-select: text; -moz-user-select: text;">';
        
        debugInfo += `<strong style="color: #000;">Debug Information:</strong><br><br>`;
        debugInfo += `URL: ${window.location.href}<br>`;
        debugInfo += `Title: ${document.title}<br>`;
        debugInfo += `Measurements found: ${this.measurements.size}<br><br>`;
        
        // Inspect the specific variables we found
        debugInfo += `<strong style="color: #000;">Inspecting Found Variables:</strong><br>`;
        
        const foundVars = ['onformdata', 'onloadeddata', 'onloadedmetadata', 'caches'];
        foundVars.forEach(varName => {
            if (window[varName] !== undefined) {
                const value = window[varName];
                debugInfo += `<span style="color: #006600; font-weight: bold;">${varName}:</span> `;
                
                if (value === null) {
                    debugInfo += '<span style="color: #999;">null</span><br>';
                } else if (typeof value === 'function') {
                    debugInfo += '<span style="color: #cc6600;">function</span><br>';
                } else if (Array.isArray(value)) {
                    debugInfo += `<span style="color: #0066cc;">Array[${value.length}]</span><br>`;
                    if (value.length > 0) {
                        debugInfo += `&nbsp;&nbsp;Sample: ${JSON.stringify(value[0]).substring(0, 100)}...<br>`;
                    }
                } else if (typeof value === 'object' && value !== null) {
                    const keys = Object.keys(value);
                    debugInfo += `<span style="color: #0066cc;">Object with ${keys.length} keys</span><br>`;
                    if (keys.length > 0) {
                        debugInfo += `&nbsp;&nbsp;Keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}<br>`;
                    }
                } else {
                    debugInfo += `<span style="color: #cc6600;">${typeof value}: ${String(value).substring(0, 50)}</span><br>`;
                }
            } else {
                debugInfo += `<span style="color: #cc0000;">${varName}: undefined</span><br>`;
            }
        });
        
        debugInfo += `<br>`;
        
        // Look for more data variables
        debugInfo += `<strong style="color: #000;">Additional Data Search:</strong><br>`;
        const additionalVars = ['phone_book', 'phones', 'measurements', 'graphData', 'plotData', 'loadedFiles', 'fileCache'];
        additionalVars.forEach(varName => {
            if (window[varName] !== undefined) {
                const value = window[varName];
                const type = Array.isArray(value) ? `Array[${value.length}]` : typeof value;
                debugInfo += `<span style="color: #006600;">${varName}</span>: <span style="color: #0066cc;">${type}</span><br>`;
            }
        });
        
        debugInfo += `<br><strong style="color: #000;">Measurements Status:</strong><br>`;
        const withData = [];
        const withoutData = [];
        
        this.measurements.forEach((measurement) => {
            if (measurement.frequencies.length > 0) {
                withData.push(measurement.name);
            } else {
                withoutData.push(measurement.name);
            }
        });
        
        debugInfo += `<span style="color: #006600; font-weight: bold;">WITH data (${withData.length}):</span><br>`;
        if (withData.length > 0) {
            withData.slice(0, 10).forEach(name => {
                debugInfo += `&nbsp;&nbsp;✅ "${name}"<br>`;
            });
            if (withData.length > 10) debugInfo += `&nbsp;&nbsp;<span style="color: #666;">... +${withData.length - 10} more</span><br>`;
        } else {
            debugInfo += `&nbsp;&nbsp;<span style="color: #cc0000;">None found</span><br>`;
        }
        
        debugInfo += `<br><span style="color: #cc6600; font-weight: bold;">WITHOUT data (${withoutData.length}):</span><br>`;
        withoutData.slice(0, 5).forEach(name => {
            debugInfo += `&nbsp;&nbsp;❌ "${name}"<br>`;
        });
        if (withoutData.length > 5) debugInfo += `&nbsp;&nbsp;<span style="color: #666;">... +${withoutData.length - 5} more</span><br>`;
        
        if (withData.length === 0) {
            debugInfo += `<br><div style="background: #ffe6e6; padding: 10px; border-radius: 5px; border: 1px solid #cc0000;">`;
            debugInfo += `<strong style="color: #cc0000;">🚨 No frequency data found!</strong><br><br>`;
            debugInfo += `<strong>Try these console commands (copy & paste):</strong><br>`;
            debugInfo += `<div style="background: #f0f0f0; padding: 5px; margin: 5px 0; border-radius: 3px; font-family: monospace;">console.log('caches:', window.caches);</div>`;
            debugInfo += `<div style="background: #f0f0f0; padding: 5px; margin: 5px 0; border-radius: 3px; font-family: monospace;">console.log('onloadeddata:', window.onloadeddata);</div>`;
            debugInfo += `<div style="background: #f0f0f0; padding: 5px; margin: 5px 0; border-radius: 3px; font-family: monospace;">Object.keys(window).filter(k => k.includes('phone') || k.includes('measurement'));</div>`;
            debugInfo += `</div>`;
        }
        
        debugInfo += '</div>';
        resultsDiv.innerHTML = debugInfo;
        
        // Now process the specific variables we found
        this.inspectFoundVariables();
    }

    inspectFoundVariables() {
        console.log('=== DETAILED VARIABLE INSPECTION ===');
        
        // The debug showed 'phones: object' - this is the key!
        if (window.phones) {
            console.log('\n--- PHONES OBJECT (THE KEY DATA SOURCE) ---');
            console.log('phones type:', typeof window.phones);
            console.log('phones keys:', Object.keys(window.phones));
            console.log('phones object:', window.phones);
            
            // Process the phones object in detail
            this.processPhones(window.phones);
        }
        
        // Inspect other found variables
        const foundVars = ['onformdata', 'onloadeddata', 'onloadedmetadata', 'caches'];
        
        foundVars.forEach(varName => {
            if (window[varName] !== undefined && window[varName] !== null) {
                console.log(`\n--- ${varName} ---`);
                console.log('Type:', typeof window[varName]);
                console.log('Value:', window[varName]);
                
                if (window[varName] && typeof window[varName] === 'object') {
                    console.log('Keys:', Object.keys(window[varName]));
                    this.processGenericData(window[varName], `inspect-${varName}`);
                }
            }
        });
        
        // Special handling for 'caches' which might be the browser Cache API
        if (window.caches && Object.keys(window.caches).length > 0) {
            console.log('\n--- CACHES API INSPECTION ---');
            this.inspectCacheAPI();
        }
        
        console.log('=== END INSPECTION ===');
    }

    processPhones(phonesObj) {
        console.log('\n🎯 PROCESSING PHONES OBJECT...');
        
        if (!phonesObj || typeof phonesObj !== 'object') {
            console.log('❌ Phones object is invalid');
            return;
        }

        const phoneKeys = Object.keys(phonesObj);
        console.log(`📋 Found ${phoneKeys.length} entries in phones object`);
        
        phoneKeys.forEach((phoneKey, index) => {
            if (index < 10) { // Log first 10 in detail
                console.log(`\n--- Processing phone: "${phoneKey}" ---`);
            }
            
            const phoneData = phonesObj[phoneKey];
            
            if (!phoneData || typeof phoneData !== 'object') {
                if (index < 10) console.log(`❌ Invalid phone data for ${phoneKey}`);
                return;
            }
            
            if (index < 10) {
                console.log(`Phone data keys:`, Object.keys(phoneData));
                console.log(`Phone data:`, phoneData);
            }
            
            // Extract frequency response data from various possible formats
            let frequencies = [];
            let amplitudes = [];
            let success = false;
            
            // Format 1: fr array with [freq, amplitude] pairs
            if (phoneData.fr && Array.isArray(phoneData.fr)) {
                phoneData.fr.forEach(point => {
                    if (Array.isArray(point) && point.length >= 2) {
                        frequencies.push(point[0]);
                        amplitudes.push(point[1]);
                    }
                });
                if (frequencies.length > 0) {
                    success = true;
                    if (index < 10) console.log(`✅ Extracted ${frequencies.length} points from .fr array`);
                }
            }
            
            // Format 2: separate frequency and amplitude arrays
            if (!success && phoneData.frequency && phoneData.amplitude) {
                frequencies = Array.isArray(phoneData.frequency) ? phoneData.frequency : [phoneData.frequency];
                amplitudes = Array.isArray(phoneData.amplitude) ? phoneData.amplitude : [phoneData.amplitude];
                if (frequencies.length > 0 && amplitudes.length > 0) {
                    success = true;
                    if (index < 10) console.log(`✅ Extracted ${frequencies.length} points from separate arrays`);
                }
            }
            
            // Format 3: measurements array
            if (!success && phoneData.measurements && Array.isArray(phoneData.measurements)) {
                phoneData.measurements.forEach(point => {
                    if (point.freq !== undefined && point.db !== undefined) {
                        frequencies.push(point.freq);
                        amplitudes.push(point.db);
                    } else if (point.frequency !== undefined && point.amplitude !== undefined) {
                        frequencies.push(point.frequency);
                        amplitudes.push(point.amplitude);
                    }
                });
                if (frequencies.length > 0) {
                    success = true;
                    if (index < 10) console.log(`✅ Extracted ${frequencies.length} points from measurements array`);
                }
            }
            
            // Format 4: direct frequency/db properties
            if (!success && phoneData.freq && phoneData.db) {
                frequencies = Array.isArray(phoneData.freq) ? phoneData.freq : [phoneData.freq];
                amplitudes = Array.isArray(phoneData.db) ? phoneData.db : [phoneData.db];
                if (frequencies.length > 0 && amplitudes.length > 0) {
                    success = true;
                    if (index < 10) console.log(`✅ Extracted ${frequencies.length} points from freq/db properties`);
                }
            }
            
            // Format 5: Look for any arrays that might be frequency data
            if (!success) {
                const dataKeys = Object.keys(phoneData);
                let freqKey = null;
                let ampKey = null;
                
                dataKeys.forEach(key => {
                    const value = phoneData[key];
                    if (Array.isArray(value) && value.length > 10 && value.every(v => typeof v === 'number')) {
                        if (key.toLowerCase().includes('freq') && !freqKey) {
                            freqKey = key;
                        } else if ((key.toLowerCase().includes('db') || key.toLowerCase().includes('amp') || key.toLowerCase().includes('response')) && !ampKey) {
                            ampKey = key;
                        }
                    }
                });
                
                if (freqKey && ampKey) {
                    frequencies = phoneData[freqKey];
                    amplitudes = phoneData[ampKey];
                    success = true;
                    if (index < 10) console.log(`✅ Extracted ${frequencies.length} points from ${freqKey}/${ampKey}`);
                }
            }
            
            // If we found valid data, create/update the measurement
            if (success && frequencies.length > 0 && amplitudes.length > 0 && frequencies.length === amplitudes.length) {
                this.createOrUpdateMeasurement(phoneKey, frequencies, amplitudes, 'phones-object');
                if (index < 10) console.log(`✅ Created/updated measurement for: "${phoneKey}"`);
            } else {
                if (index < 10) {
                    console.log(`❌ Could not extract data for: "${phoneKey}"`);
                    console.log(`   Frequencies: ${frequencies.length}, Amplitudes: ${amplitudes.length}`);
                    console.log(`   Available keys: ${Object.keys(phoneData).join(', ')}`);
                }
            }
        });
        
        console.log(`\n📊 Finished processing ${phoneKeys.length} phone entries`);
    }

    async inspectCacheAPI() {
        try {
            const cacheNames = await window.caches.keys();
            console.log('Cache names:', cacheNames);
            
            for (const cacheName of cacheNames) {
                const cache = await window.caches.open(cacheName);
                const requests = await cache.keys();
                console.log(`Cache "${cacheName}" has ${requests.length} entries`);
                
                // Look for measurement-related requests
                for (const request of requests.slice(0, 10)) { // Limit to first 10
                    if (request.url.includes('.txt') || request.url.includes('measurement') || request.url.includes('data')) {
                        console.log('Found potential measurement in cache:', request.url);
                        
                        try {
                            const response = await cache.match(request);
                            const text = await response.text();
                            
                            if (this.looksLikeMeasurementData(text)) {
                                console.log('✅ Found measurement data in cache!', request.url);
                                const name = this.extractNameFromUrl(request.url);
                                this.parseRawTextData(text, `cache-${cacheName}`, name);
                            }
                        } catch (error) {
                            console.log('Error reading cached response:', error);
                        }
                    }
                }
            }
        } catch (error) {
            console.log('Error inspecting cache API:', error);
        }
    }

    extractNameFromUrl(url) {
        // Extract filename from URL
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        return filename.replace(/\.(txt|csv|json)$/i, '').replace(/[_-]/g, ' ');
    }

    inspectWindowProperties() {
        let inspection = '';
        
        // Check common CrinGraph/Squiglink patterns
        const checkVars = [
            'phones', 'phoneData', 'measurements', 'measurementData',
            'graphData', 'plotData', 'traces', 'curves', 'frData',
            'data', 'dataset', 'chartData', 'plotlyData'
        ];
        
        checkVars.forEach(varName => {
            if (window[varName] !== undefined) {
                const value = window[varName];
                let description = 'undefined';
                
                if (value === null) {
                    description = 'null';
                } else if (Array.isArray(value)) {
                    description = `Array[${value.length}]`;
                    if (value.length > 0) {
                        const sample = value[0];
                        if (typeof sample === 'object' && sample !== null) {
                            const keys = Object.keys(sample).slice(0, 3).join(', ');
                            description += ` - sample keys: {${keys}}`;
                        }
                    }
                } else if (typeof value === 'object' && value !== null) {
                    const keys = Object.keys(value).slice(0, 5);
                    description = `Object - keys: {${keys.join(', ')}}`;
                } else {
                    description = typeof value;
                }
                
                inspection += `${varName}: ${description}<br>`;
            }
        });
        
        if (!inspection) {
            inspection = 'No common data variables found<br>';
        }
        
        return inspection;
    }

    getVisibleHeadphoneTexts() {
        const texts = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.parentElement && this.isVisibleElement(node.parentElement)) {
                const text = node.textContent?.trim();
                if (text && text.length > 2 && text.length < 100) {
                    texts.push(text);
                }
            }
        }
        
        return texts.filter(text => this.looksLikeHeadphoneName(text));
    }

    rescanPage() {
        console.log('Re-scanning page for measurements...');
        
        // Don't clear all measurements, but mark which ones have data
        this.measurements.forEach(measurement => {
            measurement.metadata.hadData = measurement.frequencies.length > 0;
        });
        
        // Re-run all detection methods
        this.scanExistingData();
        this.scanForPlotlyData();
        this.scanForMeasurementItems();
        
        // Try to match names with plotly data
        this.matchNamesWithPlotlyData();
        
        // Update the measurements count
        const measurementsFound = document.querySelector('.measurements-found');
        if (measurementsFound) {
            const withData = Array.from(this.measurements.values()).filter(m => m.frequencies.length > 0).length;
            measurementsFound.textContent = `Found ${this.measurements.size} measurements (${withData} with data)`;
        }
        
        console.log(`Re-scan complete. Found ${this.measurements.size} measurements`);
    }

    matchNamesWithPlotlyData() {
        // Try to find Plotly graphs and match their trace names with our detected measurements
        const plotlyDivs = document.querySelectorAll('div[id*="graph"], div[class*="plotly"], .js-plotly-plot');
        
        plotlyDivs.forEach(div => {
            if (div._fullData) {
                const traces = div._fullData;
                traces.forEach(trace => {
                    if (trace.x && trace.y && trace.name) {
                        const traceName = this.cleanTraceName(trace.name);
                        
                        // Find matching measurement by name
                        const matchingMeasurement = this.findMeasurementByName(traceName);
                        if (matchingMeasurement && matchingMeasurement.frequencies.length === 0) {
                            matchingMeasurement.frequencies = [...trace.x];
                            matchingMeasurement.amplitudes = [...trace.y];
                            matchingMeasurement.metadata.hasData = true;
                            matchingMeasurement.metadata.dataSource = 'plotly-matched';
                            console.log('Matched plotly data to measurement:', traceName);
                        }
                    }
                });
            }
        });

        // Also try accessing through Plotly's internal data structures
        if (window.Plotly) {
            try {
                // Look for any elements that might have Plotly data
                document.querySelectorAll('[id]').forEach(element => {
                    if (element.data || element._fullData) {
                        const data = element.data || element._fullData;
                        if (Array.isArray(data)) {
                            data.forEach(trace => {
                                if (trace.x && trace.y && trace.name) {
                                    const traceName = this.cleanTraceName(trace.name);
                                    const matchingMeasurement = this.findMeasurementByName(traceName);
                                    if (matchingMeasurement && matchingMeasurement.frequencies.length === 0) {
                                        matchingMeasurement.frequencies = [...trace.x];
                                        matchingMeasurement.amplitudes = [...trace.y];
                                        matchingMeasurement.metadata.hasData = true;
                                        console.log('Matched element data to measurement:', traceName);
                                    }
                                }
                            });
                        }
                    }
                });
            } catch (error) {
                console.error('Error matching Plotly data:', error);
            }
        }
    }
}

// Initialize the analyzer when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new SquigAnalyzer();
    });
} else {
    new SquigAnalyzer();
}