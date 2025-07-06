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
        // Check for Squig.link specific elements with expanded selectors
        const indicators = [
            'div[id*="graph"]',
            'div[class*="graph"]',
            'div[id*="plotly"]',
            'div[class*="plotly"]',
            'div[class*="squig"]',
            'div[id*="squig"]',
            'script[src*="plotly"]',
            'div[class*="measurement"]',
            'div[id*="measurement"]',
            'div[class*="headphone"]',
            'div[id*="headphone"]',
            'div[class*="frequency"]',
            'div[id*="frequency"]'
        ];
        
        // Check URL first
        const urlIndicators = ['squig', 'headphone', 'iem', 'frequency', 'response', 'graph', 'audio', 'measurement'];
        const urlMatches = urlIndicators.some(indicator => 
            window.location.hostname.includes(indicator) || window.location.pathname.includes(indicator)
        );
        
        // Check DOM elements
        const domMatches = indicators.some(selector => document.querySelector(selector) !== null);
        
        // Check for Plotly.js
        const hasPlotly = typeof window.Plotly !== 'undefined';
        
        // Check for common script sources
        const scripts = document.querySelectorAll('script[src]');
        const scriptMatches = Array.from(scripts).some(script => {
            const src = script.getAttribute('src') || '';
            return src.includes('plotly') || 
                   src.includes('graph') || 
                   src.includes('chart') || 
                   src.includes('d3') ||
                   src.includes('squig');
        });
        
        this.isSquigSite = urlMatches || domMatches || hasPlotly || scriptMatches;
        
        console.log('Squig site detection results:', {
            urlMatches,
            domMatches,
            hasPlotly,
            scriptMatches,
            overall: this.isSquigSite
        });
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
            /frequency/i,
            /headphone/i,
            /iem/i,
            /graph/i,
            /fr/i,
            /response/i,
            /audio/i,
            /sound/i
        ];
        
        // Check if URL contains any of the patterns
        const containsPattern = patterns.some(pattern => pattern.test(url));
        
        // Additional check for common data endpoints
        const isDataEndpoint = url.includes('/api/') || 
                              url.includes('/data/') || 
                              url.includes('/measurements/') ||
                              url.includes('/fr/') ||
                              url.includes('/graph/');
        
        console.log(`Checking URL for measurement data: ${url}, result: ${containsPattern || isDataEndpoint}`);
        return containsPattern || isDataEndpoint;
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

        console.log("Parsing JSON data from:", url);
        
        try {
            // Try different JSON structures
            if (data.data && Array.isArray(data.data)) {
                // Plotly format
                console.log("Found Plotly format data");
                const trace = data.data[0];
                if (trace && trace.x && trace.y) {
                    result.frequencies = Array.isArray(trace.x) ? trace.x : [];
                    result.amplitudes = Array.isArray(trace.y) ? trace.y : [];
                    result.name = trace.name || result.name;
                    console.log(`Extracted Plotly data: ${result.frequencies.length} points`);
                }
            } else if (data.frequency && data.amplitude) {
                // Direct format
                console.log("Found direct frequency/amplitude format");
                result.frequencies = Array.isArray(data.frequency) ? data.frequency : [];
                result.amplitudes = Array.isArray(data.amplitude) ? data.amplitude : [];
                console.log(`Extracted direct data: ${result.frequencies.length} points`);
            } else if (data.freq && data.amp) {
                // Alternative direct format
                console.log("Found alternative freq/amp format");
                result.frequencies = Array.isArray(data.freq) ? data.freq : [];
                result.amplitudes = Array.isArray(data.amp) ? data.amp : [];
                console.log(`Extracted alternative data: ${result.frequencies.length} points`);
            } else if (data.x && data.y) {
                // Simple x/y format
                console.log("Found x/y format");
                result.frequencies = Array.isArray(data.x) ? data.x : [];
                result.amplitudes = Array.isArray(data.y) ? data.y : [];
                console.log(`Extracted x/y data: ${result.frequencies.length} points`);
            } else if (Array.isArray(data)) {
                // Array of points or array of traces
                console.log("Found array format, length:", data.length);
                
                // Check if it's an array of traces (each with x/y)
                if (data.length > 0 && data[0].x && data[0].y) {
                    console.log("Found array of traces format");
                    const trace = data[0]; // Use first trace
                    result.frequencies = Array.isArray(trace.x) ? trace.x : [];
                    result.amplitudes = Array.isArray(trace.y) ? trace.y : [];
                    result.name = trace.name || result.name;
                    console.log(`Extracted trace data: ${result.frequencies.length} points`);
                } else {
                    // Array of points
                    console.log("Processing as array of points");
                    data.forEach(point => {
                        // Check for different point formats
                        if (point.freq !== undefined && point.amp !== undefined) {
                            result.frequencies.push(point.freq);
                            result.amplitudes.push(point.amp);
                        } else if (point.frequency !== undefined && point.amplitude !== undefined) {
                            result.frequencies.push(point.frequency);
                            result.amplitudes.push(point.amplitude);
                        } else if (point.x !== undefined && point.y !== undefined) {
                            result.frequencies.push(point.x);
                            result.amplitudes.push(point.y);
                        } else if (Array.isArray(point) && point.length >= 2) {
                            // Handle [freq, amp] format
                            const freq = parseFloat(point[0]);
                            const amp = parseFloat(point[1]);
                            if (!isNaN(freq) && !isNaN(amp)) {
                                result.frequencies.push(freq);
                                result.amplitudes.push(amp);
                            }
                        }
                    });
                    console.log(`Extracted point data: ${result.frequencies.length} points`);
                }
            } else {
                // Try to find nested data
                console.log("Searching for nested data structures");
                for (const key in data) {
                    const value = data[key];
                    if (value && typeof value === 'object') {
                        // Check if this object has frequency data
                        if ((value.x && value.y) || 
                            (value.frequency && value.amplitude) || 
                            (value.freq && value.amp)) {
                            
                            console.log(`Found nested data in key: ${key}`);
                            if (value.x && value.y) {
                                result.frequencies = Array.isArray(value.x) ? value.x : [];
                                result.amplitudes = Array.isArray(value.y) ? value.y : [];
                            } else if (value.frequency && value.amplitude) {
                                result.frequencies = Array.isArray(value.frequency) ? value.frequency : [];
                                result.amplitudes = Array.isArray(value.amplitude) ? value.amplitude : [];
                            } else if (value.freq && value.amp) {
                                result.frequencies = Array.isArray(value.freq) ? value.freq : [];
                                result.amplitudes = Array.isArray(value.amp) ? value.amp : [];
                            }
                            
                            // Use key as name if it seems like a model name
                            if (key.length > 3 && !key.includes('data') && !key.includes('config')) {
                                result.name = key;
                            }
                            
                            console.log(`Extracted nested data: ${result.frequencies.length} points`);
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error parsing JSON data:", error);
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

        console.log("Parsing CSV data from:", url);
        
        try {
            const lines = data.split('\n');
            let headerSkipped = false;
            let frequencyIndex = 0;
            let amplitudeIndex = 1;
            
            // Try to detect column structure from header
            if (lines.length > 0) {
                const potentialHeader = lines[0].toLowerCase();
                if (potentialHeader.includes('frequency') || potentialHeader.includes('hz') || 
                    potentialHeader.includes('freq') || potentialHeader.includes('x')) {
                    
                    headerSkipped = true;
                    const headers = potentialHeader.split(',').map(h => h.trim());
                    
                    // Find frequency column
                    for (let i = 0; i < headers.length; i++) {
                        const header = headers[i];
                        if (header.includes('freq') || header.includes('hz') || header === 'x') {
                            frequencyIndex = i;
                            break;
                        }
                    }
                    
                    // Find amplitude column
                    for (let i = 0; i < headers.length; i++) {
                        const header = headers[i];
                        if (header.includes('amp') || header.includes('db') || 
                            header.includes('spl') || header === 'y') {
                            amplitudeIndex = i;
                            break;
                        }
                    }
                    
                    console.log(`CSV structure detected: frequency at index ${frequencyIndex}, amplitude at index ${amplitudeIndex}`);
                }
            }

            // Process data rows
            for (let i = headerSkipped ? 1 : 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Handle different delimiters (comma, tab, semicolon)
                let values;
                if (line.includes(',')) {
                    values = line.split(',');
                } else if (line.includes('\t')) {
                    values = line.split('\t');
                } else if (line.includes(';')) {
                    values = line.split(';');
                } else {
                    values = line.split(/\s+/); // Split by whitespace
                }
                
                values = values.map(v => v.trim());
                
                if (values.length > Math.max(frequencyIndex, amplitudeIndex)) {
                    const freq = parseFloat(values[frequencyIndex]);
                    const amp = parseFloat(values[amplitudeIndex]);
                    
                    if (!isNaN(freq) && !isNaN(amp)) {
                        result.frequencies.push(freq);
                        result.amplitudes.push(amp);
                    }
                }
            }
            
            console.log(`Extracted CSV data: ${result.frequencies.length} points`);
        } catch (error) {
            console.error("Error parsing CSV data:", error);
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
        console.log("Scanning for existing measurement data...");
        
        // Method 1: Check script tags
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            if (script.textContent.includes('frequency') || 
                script.textContent.includes('Plotly') || 
                script.textContent.includes('data') ||
                script.textContent.includes('graph') ||
                script.textContent.includes('chart') ||
                script.textContent.includes('series')) {
                this.extractInlineData(script.textContent);
            }
        });
        
        // Method 2: Look for Plotly graph divs and SVG graphs
        const plotlyDivs = document.querySelectorAll('div[id*="plotly"], div[class*="plotly"], div[id*="graph"], div[class*="graph"], div[id*="chart"], div[class*="chart"]');
        plotlyDivs.forEach(div => {
            console.log("Found potential graph div:", div.id || div.className);
            
            // Try to extract data from the Plotly object if it exists
            if (window.Plotly && window.Plotly.d3) {
                try {
                    const plotlyInstance = window.Plotly.d3.select(`#${div.id}`);
                    if (plotlyInstance && plotlyInstance.data) {
                        console.log("Found Plotly data in div:", div.id);
                        this.extractPlotlyData(plotlyInstance.data);
                    }
                } catch (err) {
                    console.log("Error accessing Plotly data:", err);
                }
            }
            
            // Check for SVG paths that might represent graph lines
            const svgPaths = div.querySelectorAll('svg path');
            if (svgPaths.length > 0) {
                console.log(`Found ${svgPaths.length} SVG paths in div, attempting to extract data`);
                this.extractSVGPathData(svgPaths, div);
            }
        });
        
        // Method 3: Check for global data objects
        const potentialDataObjects = [
            'graphData', 'plotData', 'measurements', 'headphones', 
            'chartData', 'audioData', 'frequencyData', 'responseData',
            'series', 'traces', 'curves', 'models', 'products'
        ];
        
        for (const objName of potentialDataObjects) {
            if (window[objName]) {
                console.log(`Found global data object: ${objName}`);
                this.extractGlobalData(window[objName]);
            }
        }
        
        // Method 4: Look for data in window object
        for (const key in window) {
            if (key.includes('data') || 
                key.includes('graph') || 
                key.includes('measurement') || 
                key.includes('headphone') ||
                key.includes('chart') ||
                key.includes('audio') ||
                key.includes('frequency') ||
                key.includes('response') ||
                key.includes('series') ||
                key.includes('model')) {
                if (Array.isArray(window[key]) || typeof window[key] === 'object') {
                    console.log("Found potential data in window object:", key);
                    this.extractGlobalData(window[key]);
                }
            }
        }
        
        // Method 5: Check for Canvas elements (might be used for charts)
        const canvasElements = document.querySelectorAll('canvas');
        if (canvasElements.length > 0) {
            console.log(`Found ${canvasElements.length} canvas elements, checking for chart data`);
            this.checkForCanvasCharts(canvasElements);
        }
        
        // Method 6: Look for listener.squig.link specific data structure
        if (window.location.hostname.includes('listener.squig')) {
            console.log("Detected listener.squig.link, looking for specific data structure");
            this.extractListenerSquigData();
        }
        
        // Method 7: Look for SVG elements directly (not just in graph divs)
        const svgElements = document.querySelectorAll('svg');
        svgElements.forEach(svg => {
            const paths = svg.querySelectorAll('path');
            if (paths.length > 0) {
                console.log(`Found SVG with ${paths.length} paths, attempting to extract data`);
                this.extractSVGPathData(paths, svg);
            }
        });
    }
    
    extractListenerSquigData() {
        try {
            console.log("Attempting to extract data from listener.squig.link");
            
            // Check for visible headphones/models in the UI
            const modelElements = document.querySelectorAll('.model, .headphone, [class*="model"], [class*="headphone"]');
            console.log(`Found ${modelElements.length} potential model elements`);
            
            if (modelElements.length > 0) {
                modelElements.forEach((element, index) => {
                    // Try to get the name from the element
                    const name = element.textContent.trim() || `Model ${index + 1}`;
                    
                    // Create a synthetic measurement for each visible model
                    // We'll use the visible SVG path data if possible
                    const associatedGraph = this.findAssociatedGraph(element);
                    if (associatedGraph) {
                        console.log(`Found associated graph for model: ${name}`);
                        const paths = associatedGraph.querySelectorAll('path');
                        if (paths.length > 0) {
                            this.extractSVGPathData(paths, associatedGraph, name);
                        }
                    } else {
                        // If we can't find a graph, create a placeholder measurement
                        // This ensures the model shows up in the list even if we can't extract its data
                        const measurement = {
                            url: `model-${index}`,
                            name: name,
                            frequencies: this.generateDefaultFrequencies(),
                            amplitudes: this.generateDefaultAmplitudes(),
                            metadata: { source: 'listener-model' }
                        };
                        this.measurements.set(`model-${index}`, measurement);
                        console.log(`Created placeholder measurement for: ${name}`);
                    }
                });
                
                this.updateMeasurementCount();
            }
            
            // Try to find any global state or store
            for (const key in window) {
                if (typeof window[key] === 'object' && window[key] !== null) {
                    // Look for objects that might contain state or store
                    if (key.includes('store') || key.includes('state') || key.includes('app') || key.includes('data')) {
                        console.log(`Checking potential state object: ${key}`);
                        this.extractNestedData(window[key], key);
                    }
                }
            }
        } catch (error) {
            console.error("Error extracting listener.squig data:", error);
        }
    }
    
    findAssociatedGraph(modelElement) {
        // Try to find a graph element associated with this model
        // This is a heuristic approach - we look for graph elements near the model element
        
        // First check if the model element is inside a container that also has a graph
        let parent = modelElement.parentElement;
        for (let i = 0; i < 3 && parent; i++) { // Check up to 3 levels up
            const graphs = parent.querySelectorAll('svg, canvas, [id*="graph"], [class*="graph"], [id*="chart"], [class*="chart"]');
            if (graphs.length > 0) {
                return graphs[0];
            }
            parent = parent.parentElement;
        }
        
        // If not found, look for graphs that appear after this element in the DOM
        const allGraphs = document.querySelectorAll('svg, canvas, [id*="graph"], [class*="graph"], [id*="chart"], [class*="chart"]');
        return allGraphs.length > 0 ? allGraphs[0] : null;
    }
    
    extractNestedData(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        
        // Check if this object itself has frequency response data
        if (this.looksLikeFrequencyData(obj)) {
            console.log(`Found potential frequency data at path: ${path}`);
            this.extractGlobalData(obj);
            return;
        }
        
        // Check for arrays of models or measurements
        if (Array.isArray(obj) && obj.length > 0) {
            if (obj.some(item => this.looksLikeFrequencyData(item))) {
                console.log(`Found array of frequency data at path: ${path}`);
                this.extractGlobalData(obj);
                return;
            }
        }
        
        // Recursively check properties
        for (const key in obj) {
            if (obj[key] && typeof obj[key] === 'object') {
                // Skip DOM nodes and circular references
                if (obj[key] instanceof Node || key === 'parent' || key === 'parentNode') continue;
                
                // Skip functions and built-in objects
                if (typeof obj[key] === 'function' || key.startsWith('__')) continue;
                
                try {
                    this.extractNestedData(obj[key], `${path}.${key}`);
                } catch (e) {
                    // Skip any errors from circular references
                }
            }
        }
    }
    
    looksLikeFrequencyData(obj) {
        if (!obj) return false;
        
        // Check for common frequency response data patterns
        if (obj.frequencies && obj.amplitudes) return true;
        if (obj.freq && obj.amp) return true;
        if (obj.x && obj.y) return true;
        if (obj.data && Array.isArray(obj.data)) return true;
        
        // Check if it's a headphone/model object with frequency data
        if (obj.name || obj.model || obj.title) {
            if (obj.frequency || obj.response || obj.measurements || obj.data) return true;
        }
        
        return false;
    }
    
    generateDefaultFrequencies() {
        // Generate a standard set of frequencies from 20Hz to 20kHz
        const frequencies = [];
        for (let freq = 20; freq <= 20000; freq = Math.round(freq * 1.1)) {
            frequencies.push(freq);
        }
        return frequencies;
    }
    
    generateDefaultAmplitudes() {
        // Generate flat response amplitudes (all zeros)
        const frequencies = this.generateDefaultFrequencies();
        return Array(frequencies.length).fill(0);
    }
    
    extractSVGPathData(paths, container, modelName = null) {
        try {
            // Extract data from SVG paths - these often represent frequency response curves
            paths.forEach((path, index) => {
                // Try to determine if this path is a frequency response curve
                // (vs. a decorative element, axis, etc.)
                const isLikelyGraph = this.isLikelyGraphPath(path);
                
                if (isLikelyGraph) {
                    // Get the path data
                    const pathData = path.getAttribute('d');
                    if (!pathData) return;
                    
                    // Try to extract the name from various sources
                    let name = modelName;
                    if (!name) {
                        // Try to get name from path attributes
                        name = path.getAttribute('data-name') || 
                               path.getAttribute('aria-label') || 
                               path.getAttribute('id') || 
                               path.getAttribute('class');
                        
                        // If still no name, try to get it from container
                        if (!name && container) {
                            name = container.getAttribute('data-name') || 
                                   container.getAttribute('aria-label') || 
                                   container.getAttribute('id') || 
                                   container.getAttribute('class');
                        }
                        
                        // If still no name, use a generic one
                        if (!name) {
                            name = `Graph Path ${index + 1}`;
                        }
                    }
                    
                    // Convert SVG path to frequency/amplitude points
                    const points = this.pathToPoints(pathData);
                    if (points.length > 10) { // Only use if we have enough points
                        const measurement = {
                            url: `svg-path-${index}`,
                            name: name,
                            frequencies: points.map(p => p.x),
                            amplitudes: points.map(p => p.y),
                            metadata: { source: 'svg-path' }
                        };
                        
                        this.measurements.set(`svg-path-${index}`, measurement);
                        console.log(`Extracted SVG path data for: ${name}, ${points.length} points`);
                    }
                }
            });
            
            this.updateMeasurementCount();
        } catch (error) {
            console.error("Error extracting SVG path data:", error);
        }
    }
    
    isLikelyGraphPath(path) {
        // Heuristics to determine if a path is likely a graph line
        // (vs. decorative elements, axes, etc.)
        
        // Check the path's style
        const stroke = path.getAttribute('stroke') || 
                      window.getComputedStyle(path).stroke || 
                      '';
        const fill = path.getAttribute('fill') || 
                    window.getComputedStyle(path).fill || 
                    '';
        const strokeWidth = parseFloat(path.getAttribute('stroke-width') || 
                           window.getComputedStyle(path).strokeWidth || 
                           '0');
        
        // Graph lines typically have a stroke but no fill
        if (stroke && stroke !== 'none' && (fill === 'none' || fill === '')) {
            return true;
        }
        
        // Graph lines typically have a reasonable stroke width
        if (strokeWidth > 0 && strokeWidth < 5) {
            return true;
        }
        
        // Check the path data itself
        const d = path.getAttribute('d') || '';
        
        // Graph lines typically have many commands and are complex
        if (d.length > 100 && (d.match(/[ML]/g) || []).length > 10) {
            return true;
        }
        
        // Graph lines often don't have closed paths
        if (!d.includes('Z') && !d.includes('z')) {
            return true;
        }
        
        return false;
    }
    
    pathToPoints(pathData) {
        // Convert SVG path data to points
        const points = [];
        
        // Simple parser for M and L commands
        const commands = pathData.match(/[ML][\d\.\-\s,]+/g) || [];
        
        commands.forEach(cmd => {
            const type = cmd[0]; // M or L
            const coords = cmd.substring(1).trim().split(/[\s,]+/);
            
            for (let i = 0; i < coords.length; i += 2) {
                if (i + 1 < coords.length) {
                    const x = parseFloat(coords[i]);
                    const y = parseFloat(coords[i + 1]);
                    
                    if (!isNaN(x) && !isNaN(y)) {
                        points.push({ x, y });
                    }
                }
            }
        });
        
        // Convert SVG coordinates to frequency/amplitude
        // This is a heuristic approach - we assume the x-axis is frequency (log scale)
        // and the y-axis is amplitude (linear scale)
        if (points.length > 0) {
            // Find the min/max values
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            
            points.forEach(p => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
            
            // Convert to frequency (20Hz-20kHz) and amplitude (-20dB to +20dB)
            const convertedPoints = points.map(p => {
                // Normalize to 0-1 range
                const normalizedX = (p.x - minX) / (maxX - minX);
                // Invert Y because SVG coordinates have 0 at the top
                const normalizedY = 1 - (p.y - minY) / (maxY - minY);
                
                // Convert to frequency (log scale) and amplitude
                const freq = Math.pow(10, normalizedX * 3 + 1.3); // 20Hz to 20kHz
                const amp = normalizedY * 40 - 20; // -20dB to +20dB
                
                return { x: freq, y: amp };
            });
            
            // Sort by frequency
            convertedPoints.sort((a, b) => a.x - b.x);
            
            return convertedPoints;
        }
        
        return points;
    }
    
    checkForCanvasCharts(canvasElements) {
        // Check for common chart libraries that use canvas
        if (window.Chart) {
            console.log("Found Chart.js library");
            this.extractChartJsData();
        }
        
        if (window.Highcharts) {
            console.log("Found Highcharts library");
            this.extractHighchartsData();
        }
        
        // Check for canvas elements with specific sizes (likely charts)
        canvasElements.forEach((canvas, index) => {
            const width = canvas.width || canvas.clientWidth;
            const height = canvas.height || canvas.clientHeight;
            
            // Charts typically have a reasonable aspect ratio
            if (width > 200 && height > 100) {
                console.log(`Found potential chart canvas: ${width}x${height}`);
                
                // Try to find the chart instance associated with this canvas
                this.findCanvasChartInstance(canvas, index);
            }
        });
    }
    
    findCanvasChartInstance(canvas, index) {
        // Try to find a chart instance associated with this canvas
        for (const key in window) {
            if (typeof window[key] === 'object' && window[key] !== null) {
                // Check if this object has a canvas property that matches our canvas
                if (window[key].canvas === canvas) {
                    console.log(`Found chart instance for canvas: ${key}`);
                    this.extractCanvasChartData(window[key], `canvas-chart-${index}`);
                    return;
                }
                
                // Check if this is a chart configuration object
                if (window[key].type && window[key].data && window[key].options) {
                    console.log(`Found potential chart config: ${key}`);
                    this.extractCanvasChartData(window[key], `canvas-config-${index}`);
                }
            }
        }
    }
    
    extractCanvasChartData(chartInstance, id) {
        try {
            let datasets = [];
            
            // Extract data from chart instance
            if (chartInstance.data && chartInstance.data.datasets) {
                datasets = chartInstance.data.datasets;
            } else if (chartInstance.datasets) {
                datasets = chartInstance.datasets;
            } else if (chartInstance.series) {
                datasets = chartInstance.series;
            }
            
            datasets.forEach((dataset, i) => {
                if (dataset.data && Array.isArray(dataset.data)) {
                    const name = dataset.label || dataset.name || `Chart Dataset ${i + 1}`;
                    
                    // Check if data is in {x,y} format or just y values
                    let frequencies = [];
                    let amplitudes = [];
                    
                    if (dataset.data.length > 0 && typeof dataset.data[0] === 'object') {
                        // {x,y} format
                        frequencies = dataset.data.map(point => point.x);
                        amplitudes = dataset.data.map(point => point.y);
                    } else {
                        // Just y values, generate x values
                        amplitudes = dataset.data;
                        frequencies = this.generateDefaultFrequencies().slice(0, amplitudes.length);
                    }
                    
                    if (frequencies.length > 0 && amplitudes.length > 0) {
                        const measurement = {
                            url: `${id}-${i}`,
                            name: name,
                            frequencies: frequencies,
                            amplitudes: amplitudes,
                            metadata: { source: 'canvas-chart' }
                        };
                        
                        this.measurements.set(`${id}-${i}`, measurement);
                        console.log(`Extracted canvas chart data for: ${name}`);
                    }
                }
            });
            
            this.updateMeasurementCount();
        } catch (error) {
            console.error("Error extracting canvas chart data:", error);
        }
    }
    
    extractChartJsData() {
        try {
            // Find Chart.js instances
            if (window.Chart.instances) {
                Object.values(window.Chart.instances).forEach((chart, index) => {
                    if (chart.data && chart.data.datasets) {
                        chart.data.datasets.forEach((dataset, i) => {
                            const name = dataset.label || `Chart ${index + 1} Dataset ${i + 1}`;
                            
                            // Extract data points
                            let frequencies = [];
                            let amplitudes = [];
                            
                            if (dataset.data && Array.isArray(dataset.data)) {
                                if (dataset.data.length > 0 && typeof dataset.data[0] === 'object') {
                                    // {x,y} format
                                    frequencies = dataset.data.map(point => point.x);
                                    amplitudes = dataset.data.map(point => point.y);
                                } else {
                                    // Just y values
                                    amplitudes = dataset.data;
                                    frequencies = this.generateDefaultFrequencies().slice(0, amplitudes.length);
                                }
                                
                                if (frequencies.length > 0 && amplitudes.length > 0) {
                                    const measurement = {
                                        url: `chartjs-${index}-${i}`,
                                        name: name,
                                        frequencies: frequencies,
                                        amplitudes: amplitudes,
                                        metadata: { source: 'chartjs' }
                                    };
                                    
                                    this.measurements.set(`chartjs-${index}-${i}`, measurement);
                                    console.log(`Extracted Chart.js data for: ${name}`);
                                }
                            }
                        });
                    }
                });
                
                this.updateMeasurementCount();
            }
        } catch (error) {
            console.error("Error extracting Chart.js data:", error);
        }
    }
    
    extractHighchartsData() {
        try {
            // Find Highcharts instances
            if (window.Highcharts.charts) {
                window.Highcharts.charts.forEach((chart, index) => {
                    if (chart && chart.series) {
                        chart.series.forEach((series, i) => {
                            const name = series.name || `Highcharts ${index + 1} Series ${i + 1}`;
                            
                            // Extract data points
                            if (series.points && series.points.length > 0) {
                                const frequencies = series.points.map(point => point.x);
                                const amplitudes = series.points.map(point => point.y);
                                
                                if (frequencies.length > 0) {
                                    const measurement = {
                                        url: `highcharts-${index}-${i}`,
                                        name: name,
                                        frequencies: frequencies,
                                        amplitudes: amplitudes,
                                        metadata: { source: 'highcharts' }
                                    };
                                    
                                    this.measurements.set(`highcharts-${index}-${i}`, measurement);
                                    console.log(`Extracted Highcharts data for: ${name}`);
                                }
                            }
                        });
                    }
                });
                
                this.updateMeasurementCount();
            }
        } catch (error) {
            console.error("Error extracting Highcharts data:", error);
        }
    }

    extractGlobalData(dataSource) {
        try {
            if (Array.isArray(dataSource)) {
                dataSource.forEach((item, index) => {
                    if ((item.x && item.y) || (item.frequencies && item.amplitudes) || (item.freq && item.amp)) {
                        const measurement = {
                            url: `global-${index}`,
                            name: item.name || item.model || item.title || `Measurement ${index + 1}`,
                            frequencies: item.x || item.frequencies || item.freq || [],
                            amplitudes: item.y || item.amplitudes || item.amp || [],
                            metadata: { source: 'global' }
                        };
                        this.measurements.set(`global-${index}`, measurement);
                        console.log("Extracted global data:", measurement.name);
                    }
                });
            } else if (typeof dataSource === 'object') {
                // Handle case where it's a single object with data
                if ((dataSource.x && dataSource.y) || (dataSource.frequencies && dataSource.amplitudes)) {
                    const measurement = {
                        url: 'global-single',
                        name: dataSource.name || dataSource.model || dataSource.title || 'Measurement',
                        frequencies: dataSource.x || dataSource.frequencies || [],
                        amplitudes: dataSource.y || dataSource.amplitudes || [],
                        metadata: { source: 'global' }
                    };
                    this.measurements.set('global-single', measurement);
                    console.log("Extracted single global data object:", measurement.name);
                }
                
                // Check if it's an object with headphones/measurements as properties
                for (const key in dataSource) {
                    const item = dataSource[key];
                    if (item && typeof item === 'object') {
                        if ((item.x && item.y) || (item.frequencies && item.amplitudes) || (item.freq && item.amp)) {
                            const measurement = {
                                url: `global-${key}`,
                                name: item.name || item.model || item.title || key,
                                frequencies: item.x || item.frequencies || item.freq || [],
                                amplitudes: item.y || item.amplitudes || item.amp || [],
                                metadata: { source: 'global' }
                            };
                            this.measurements.set(`global-${key}`, measurement);
                            console.log("Extracted nested global data:", measurement.name);
                        }
                    }
                }
            }
            this.updateMeasurementCount();
        } catch (error) {
            console.error('Error extracting global data:', error);
        }
    }

    extractPlotlyData(plotlyData) {
        try {
            if (Array.isArray(plotlyData)) {
                plotlyData.forEach((trace, index) => {
                    if (trace.x && trace.y) {
                        const measurement = {
                            url: `plotly-${index}`,
                            name: trace.name || `Measurement ${index + 1}`,
                            frequencies: trace.x,
                            amplitudes: trace.y,
                            metadata: { source: 'plotly' }
                        };
                        this.measurements.set(`plotly-${index}`, measurement);
                        console.log("Extracted Plotly trace data:", measurement.name);
                    }
                });
                this.updateMeasurementCount();
            }
        } catch (error) {
            console.error('Error extracting Plotly data:', error);
        }
    }

    extractInlineData(scriptContent) {
        // Extract data from inline JavaScript
        try {
            // Look for Plotly data with more flexible regex
            const plotlyMatches = [
                // Standard Plotly.newPlot format
                scriptContent.match(/Plotly\.newPlot\s*\(\s*[^,]+\s*,\s*(\[[\s\S]*?\])/),
                // Alternative format with data variable
                scriptContent.match(/data\s*=\s*(\[[\s\S]*?\])/),
                // Another common format
                scriptContent.match(/var\s+data\s*=\s*(\[[\s\S]*?\])/),
                // JSON data format
                scriptContent.match(/JSON\.parse\s*\(\s*'(\[[\s\S]*?\])'\s*\)/)
            ];
            
            for (const match of plotlyMatches) {
                if (match && match[1]) {
                    try {
                        // Try to safely parse the data using Function instead of eval
                        const dataStr = match[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":');
                        const data = new Function(`return ${dataStr}`)();
                        
                        if (Array.isArray(data)) {
                            console.log("Found data array in script, length:", data.length);
                            data.forEach((trace, index) => {
                                if (trace && trace.x && trace.y) {
                                    const measurement = {
                                        url: `inline-${index}`,
                                        name: trace.name || `Measurement ${index + 1}`,
                                        frequencies: Array.isArray(trace.x) ? trace.x : [],
                                        amplitudes: Array.isArray(trace.y) ? trace.y : [],
                                        metadata: { source: 'inline' }
                                    };
                                    this.measurements.set(`inline-${index}`, measurement);
                                    console.log("Extracted inline data:", measurement.name);
                                }
                            });
                            this.updateMeasurementCount();
                            break; // Stop after finding valid data
                        }
                    } catch (parseError) {
                        console.log("Error parsing potential data:", parseError);
                    }
                }
            }
            
            // Look for frequency response data in other formats
            const freqDataMatch = scriptContent.match(/frequencies\s*[:=]\s*(\[[^\]]+\])/);
            const ampDataMatch = scriptContent.match(/amplitudes\s*[:=]\s*(\[[^\]]+\])/);
            
            if (freqDataMatch && ampDataMatch) {
                try {
                    const frequencies = JSON.parse(freqDataMatch[1]);
                    const amplitudes = JSON.parse(ampDataMatch[1]);
                    
                    if (Array.isArray(frequencies) && Array.isArray(amplitudes)) {
                        const measurement = {
                            url: 'inline-freq-amp',
                            name: 'Extracted Measurement',
                            frequencies: frequencies,
                            amplitudes: amplitudes,
                            metadata: { source: 'inline-direct' }
                        };
                        this.measurements.set('inline-freq-amp', measurement);
                        console.log("Extracted direct frequency/amplitude data");
                        this.updateMeasurementCount();
                    }
                } catch (parseError) {
                    console.log("Error parsing frequency/amplitude data:", parseError);
                }
            }
        } catch (error) {
            console.error('Error extracting inline data:', error);
        }
    }

    observePageChanges() {
        // Watch for dynamic content changes
        console.log("Setting up mutation observer for page changes");
        
        // Debounce function to avoid excessive scanning
        let debounceTimer;
        const debouncedScan = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log("Detected page changes, rescanning for data");
                this.scanExistingData();
            }, 500); // Wait 500ms after changes stop before scanning
        };
        
        // Set up mutation observer
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            
            for (const mutation of mutations) {
                // Check if this mutation is relevant
                if (mutation.type === 'childList') {
                    // Look for added nodes that might contain graph data
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            
                            // Check if this element or its children might contain graph data
                            if (element.id && (
                                element.id.includes('graph') || 
                                element.id.includes('plot') || 
                                element.id.includes('chart')
                            )) {
                                shouldScan = true;
                                break;
                            }
                            
                            // Check for script tags
                            if (element.tagName === 'SCRIPT') {
                                shouldScan = true;
                                break;
                            }
                            
                            // Check for potential graph containers
                            if (element.querySelector && (
                                element.querySelector('div[id*="graph"]') ||
                                element.querySelector('div[class*="graph"]') ||
                                element.querySelector('div[id*="plot"]') ||
                                element.querySelector('div[class*="plot"]') ||
                                element.querySelector('canvas') ||
                                element.querySelector('svg')
                            )) {
                                shouldScan = true;
                                break;
                            }
                        }
                    }
                } else if (mutation.type === 'attributes') {
                    // Check if data attributes changed
                    const target = mutation.target;
                    if (target.nodeType === Node.ELEMENT_NODE) {
                        const element = target;
                        const attrName = mutation.attributeName;
                        
                        if (attrName && (
                            attrName.includes('data') || 
                            attrName === 'src' || 
                            attrName === 'id' || 
                            attrName === 'class'
                        )) {
                            shouldScan = true;
                            break;
                        }
                    }
                }
                
                if (shouldScan) break;
            }
            
            if (shouldScan) {
                debouncedScan();
            }
        });

        // Observe both childList and attribute changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-*', 'src', 'id', 'class']
        });
        
        // Also periodically check for new data that might have been loaded via AJAX
        setInterval(() => {
            if (this.measurements.size === 0) {
                console.log("No measurements found yet, rescanning");
                this.scanExistingData();
            }
        }, 3000); // Check every 3 seconds if no measurements found
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