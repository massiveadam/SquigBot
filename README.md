# Squig Target Analyzer

A Chrome extension for analyzing frequency response deviations from target curves on Squig.link sites.

## Features

- Automatically detects and extracts headphone/IEM frequency response data from Squig.link repositories
- Analyzes deviations from common target curves (Harman, Diffuse Field, Flat Response)
- Ranks headphones by their deviation from the selected target
- Allows filtering by frequency range (full range, bass, midrange, treble)
- Works across all Squig.link repositories

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the folder containing this extension
5. The extension is now installed and will activate on Squig.link sites

## Usage

1. Visit any Squig.link repository (e.g., https://crinacle.com/graphs/, https://headphonedatabase.com/, etc.)
2. The extension will automatically scan for headphone measurement data
3. Click the "Analyze" button that appears in the top-right corner of the page
4. Select your target curve and frequency range
5. Click "Analyze All Measurements" to see the results
6. Headphones will be ranked by their deviation from the selected target (lower is better)

## Troubleshooting

If no measurements are found:
- Make sure you're on a Squig.link site that contains frequency response graphs
- Try refreshing the page and waiting for all content to load
- Scroll down to load more content if the site uses lazy loading
- Click on different headphones to load their data

## Development

This extension works by:
1. Detecting Squig.link sites based on URL and page content
2. Intercepting network requests for measurement data
3. Scanning the page for inline measurement data
4. Extracting frequency response data from various formats (JSON, CSV, Plotly)
5. Calculating RMS deviation between measurements and target curves

## License

MIT License