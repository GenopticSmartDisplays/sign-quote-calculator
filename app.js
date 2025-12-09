// ==================== CONFIGURATION ====================
const CONFIG = {
    // API Configuration
    GOOGLE_SCRIPT_URL: 'https://sign-calculator-proxy.genoptic2025.workers.dev', // Your Cloudflare Worker URL
    
    // API Security
    API_KEY: 'HS_QUOTE_CALC_2024_SECURE_KEY_XYZ123',
    
    // HubSpot Integration
    HUBSPOT_MODE: true,
    
    // Feature Flags
    ENABLE_LOGGING: true,
    ENABLE_CACHING: true,
    
    // Rate Limiting
    MAX_REQUESTS_PER_MINUTE: 30,
    
    // Default Values
    DEFAULT_RESOLUTION: 'P6',
    DEFAULT_SIDES: 'Single',
    DEFAULT_CUSTOMER_TYPE: 'Retail',
    
    // Cache Settings
    CACHE_DURATION: 5 * 60 * 1000,
};

// ==================== GLOBAL STATE ====================
let state = {
    apiStatus: 'unknown',
    lastRequestTime: 0,
    requestCount: 0,
    cache: new Map(),
    currentQuote: null,
    hubspotContext: {
        dealId: null,
        contactId: null,
        dealName: null
    }
};

// ==================== DOM ELEMENTS ====================
const elements = {
    // Inputs
    height: document.getElementById('height'),
    width: document.getElementById('width'),
    resolution: document.getElementById('resolution'),
    sides: document.getElementById('sides'),
    customerType: document.getElementById('customerType'),
    projectName: document.getElementById('projectName'),
    
    // HubSpot Hidden Fields
    hubspotDealId: document.getElementById('hubspotDealId'),
    hubspotContactId: document.getElementById('hubspotContactId'),
    hubspotDealName: document.getElementById('hubspotDealName'),
    
    // Display Elements
    results: document.getElementById('results'),
    loading: document.getElementById('loading'),
    panelDetails: document.getElementById('panelDetails'),
    finalPrice: document.getElementById('finalPrice'),
    totalPanels: document.getElementById('totalPanels'),
    totalArea: document.getElementById('totalArea'),
    panelsPerSide: document.getElementById('panelsPerSide'),
    quoteId: document.getElementById('quoteId'),
    
    // Specifications
    totalResolution: document.getElementById('totalResolution'),
    pixelDensity: document.getElementById('pixelDensity'),
    viewingDistance: document.getElementById('viewingDistance'),
    
    // Preview
    dimensionPreview: document.getElementById('dimensionPreview'),
    dimensionText: document.getElementById('dimensionText'),
    
    // Status
    apiStatus: document.getElementById('apiStatus'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    
    // Buttons
    calculateBtn: document.getElementById('calculateBtn'),
    saveBtn: document.getElementById('saveBtn')
};

// ==================== UTILITY FUNCTIONS ====================
function showToast(title, message, type = 'info') {
    const toastEl = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toastTitle.innerHTML = `<i class="${icons[type] || icons.info}"></i> ${title}`;
    toastMessage.textContent = message;
    toastEl.className = `toast ${type}`;
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
    
    if (CONFIG.ENABLE_LOGGING) {
        console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    }
}

function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(num) {
    return parseFloat(num).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function updateApiStatus(status) {
    state.apiStatus = status;
    
    const statusConfig = {
        online: { class: 'status-online', text: 'API: Online', show: true },
        offline: { class: 'status-offline', text: 'API: Offline', show: true },
        checking: { class: 'status-checking', text: 'API: Checking...', show: true },
        unknown: { class: 'status-offline', text: 'API: Unknown', show: false }
    };
    
    const config = statusConfig[status] || statusConfig.unknown;
    elements.statusDot.className = `status-indicator ${config.class}`;
    elements.statusText.textContent = config.text;
    elements.apiStatus.style.display = config.show ? 'block' : 'none';
}

function checkApiHealth() {
    updateApiStatus('checking');
    
    fetch(`${CONFIG.GOOGLE_SCRIPT_URL}?test=true`)
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data && data.status === 'online') {
            updateApiStatus('online');
        } else {
            updateApiStatus('offline');
        }
    })
    .catch(error => {
        updateApiStatus('offline');
        console.warn('API health check failed:', error);
    });
}

function updateDimensionPreview() {
    const height = parseFloat(elements.height.value) || 0;
    const width = parseFloat(elements.width.value) || 0;
    
    if (height > 0 && width > 0) {
        const area = height * width;
        elements.dimensionText.textContent = 
            `${formatNumber(height)}' × ${formatNumber(width)}' = ${formatNumber(area)} sq ft`;
        elements.dimensionPreview.style.display = 'block';
    } else {
        elements.dimensionPreview.style.display = 'none';
    }
}

function getCacheKey(height, width, resolution, sides, customerType) {
    return `${height}-${width}-${resolution}-${sides}-${customerType}`;
}

// ==================== API FUNCTIONS ====================
async function callQuoteApi(requestData) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    if (state.requestCount > CONFIG.MAX_REQUESTS_PER_MINUTE && 
        state.lastRequestTime > oneMinuteAgo) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
    }
    
    state.lastRequestTime = now;
    state.requestCount++;
    
    const cacheKey = getCacheKey(
        requestData.height,
        requestData.width,
        requestData.resolution,
        requestData.sides,
        requestData.customerType
    );
    
    if (CONFIG.ENABLE_CACHING && state.cache.has(cacheKey)) {
        const cached = state.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
            return cached.data;
        }
    }
    
    const apiRequest = {
        ...requestData,
        apiKey: CONFIG.API_KEY,
        source: 'hubspot_calculator',
        version: '1.0'
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
        const response = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiRequest),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || data.error);
        }
        
        if (!data.success) {
            throw new Error(data.message || 'Calculation failed');
        }
        
        if (CONFIG.ENABLE_CACHING) {
            state.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            if (state.cache.size > 100) {
                const oldestKey = state.cache.keys().next().value;
                state.cache.delete(oldestKey);
            }
        }
        
        return data;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Please try again.');
        }
        
        console.error('API call failed:', error);
        throw error;
    }
}

// ==================== MAIN CALCULATION ====================
async function calculateQuote() {
    if (!elements.height.value || !elements.width.value) {
        showToast('Validation Error', 'Please enter both height and width', 'error');
        elements.height.focus();
        return;
    }
    
    const height = parseFloat(elements.height.value);
    const width = parseFloat(elements.width.value);
    
    if (height < 1 || height > 100 || width < 1 || width > 100) {
        showToast('Validation Error', 'Dimensions must be between 1 and 100 feet', 'error');
        return;
    }
    
    elements.loading.style.display = 'block';
    elements.results.style.display = 'none';
    elements.calculateBtn.disabled = true;
    
    try {
        const requestData = {
            height: height,
            width: width,
            resolution: elements.resolution.value,
            sides: elements.sides.value,
            customerType: elements.customerType.value,
            projectName: elements.projectName.value || `Sign ${height}x${width}`,
            hubspotDealId: elements.hubspotDealId.value || null,
            hubspotContactId: elements.hubspotContactId.value || null,
            requestId: 'calc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        };
        
        const result = await callQuoteApi(requestData);
        state.currentQuote = {
            ...result,
            input: requestData,
            calculatedAt: new Date().toISOString()
        };
        
        displayResults(result);
        
        elements.loading.style.display = 'none';
        elements.results.style.display = 'block';
        elements.calculateBtn.disabled = false;
        
        showToast('Quote Calculated', 
                 `${result.totalPanels} panels optimized for ${height}'×${width}' sign`, 
                 'success');
        
    } catch (error) {
        elements.loading.style.display = 'none';
        elements.calculateBtn.disabled = false;
        
        console.error('Calculation error:', error);
        let errorMessage = error.message;
        
        if (errorMessage.includes('Cannot build')) {
            errorMessage = `Cannot build ${height}'×${width}' sign with exact coverage. Try different dimensions.`;
        } else if (errorMessage.includes('timeout')) {
            errorMessage = 'Calculation timed out. Please try again.';
        } else if (errorMessage.includes('Rate limit')) {
            errorMessage = 'Too many requests. Please wait a moment.';
        } else if (errorMessage.includes('CORS') || errorMessage.includes('Network')) {
            errorMessage = 'Network error. Please check connection.';
        }
        
        showToast('Calculation Failed', errorMessage, 'error');
    }
}

function displayResults(data) {
    // Panel Configuration
    if (data.panelDetails && data.panelDetails.trim()) {
        const panels = data.panelDetails.split(', ');
        elements.panelDetails.innerHTML = panels.map(panel => 
            `<span class="panel-badge">${panel}</span>`
        ).join('');
    } else {
        elements.panelDetails.innerHTML = 
            '<span class="text-muted"><i>Panel details not available</i></span>';
    }
    
    // Specifications
    calculateSpecifications();
    
    // Basic Information
    elements.finalPrice.textContent = formatCurrency(data.finalPrice || 0);
    elements.totalPanels.textContent = formatNumber(data.totalPanels || 0);
    elements.totalArea.textContent = formatNumber(data.totalArea || 0);
    elements.panelsPerSide.textContent = formatNumber(
        Math.ceil((data.totalPanels || 0) / (data.panelMultiplier || 1))
    );
    elements.quoteId.textContent = data.quoteId || 'N/A';
    
    // Update window title
    const height = elements.height.value;
    const width = elements.width.value;
    document.title = `$${data.finalPrice?.toFixed(0) || '0'} - ${height}'×${width}' Quote`;
}

function calculateSpecifications() {
    const height = parseFloat(elements.height.value) || 0;
    const width = parseFloat(elements.width.value) || 0;
    const resolution = elements.resolution.value;
    
    // Calculate specifications based on resolution
    const pixelPitch = parseInt(resolution.replace('P', ''));
    const pixelsPerFoot = 12 / pixelPitch; // 12 inches per foot
    
    // Total pixels
    const totalPixelsH = Math.round(height * pixelsPerFoot);
    const totalPixelsW = Math.round(width * pixelsPerFoot);
    
    // Pixel density
    const pixelDensity = Math.round(pixelsPerFoot * pixelsPerFoot);
    
    // Viewing distance (in feet) - based on pixel pitch
    const viewingDistanceFt = pixelPitch * 10; // Rough estimate: 10x pixel pitch in feet
    
    // Update display
    elements.totalResolution.textContent = `${totalPixelsW} × ${totalPixelsH}`;
    elements.pixelDensity.textContent = `${pixelDensity.toLocaleString()} pixels/sq ft`;
    elements.viewingDistance.textContent = `${viewingDistanceFt} ft (${Math.round(viewingDistanceFt * 0.3048)} m)`;
}

// ==================== PRESET BUTTONS ====================
function addPresetButtons() {
    if (document.querySelector('.preset-buttons')) return;
    
    const presets = [
        { label: '3×6', height: 3, width: 6 },
        { label: '3×8', height: 3, width: 8 },
        { label: '4×8', height: 4, width: 8 },
        { label: '5×10', height: 5, width: 10 },
        { label: '6×12', height: 6, width: 12 },
        { label: '8×12', height: 8, width: 12 },
        { label: '10×20', height: 10, width: 20 },
        { label: '12×24', height: 12, width: 24 },
        { label: '14×48', height: 14, width: 48 }
    ];
    
    const presetContainer = document.createElement('div');
    presetContainer.className = 'preset-buttons mt-3 text-center';
    presetContainer.innerHTML = '<small class="text-muted">Common sizes: </small>';
    
    // Group presets into rows for better display
    const rows = [];
    for (let i = 0; i < presets.length; i += 3) {
        rows.push(presets.slice(i, i + 3));
    }
    
    rows.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row mt-1';
        
        row.forEach(preset => {
            const colDiv = document.createElement('div');
            colDiv.className = 'col-md-4 col-4';
            
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-primary w-100';
            btn.textContent = preset.label;
            btn.onclick = () => {
                elements.height.value = preset.height;
                elements.width.value = preset.width;
                updateDimensionPreview();
                calculateQuote();
            };
            
            colDiv.appendChild(btn);
            rowDiv.appendChild(colDiv);
        });
        
        presetContainer.appendChild(rowDiv);
    });
    
    // Insert after the calculate button
    const calculateDiv = elements.calculateBtn.parentElement;
    calculateDiv.parentNode.insertBefore(presetContainer, calculateDiv.nextSibling);
}

// ==================== FORM MANAGEMENT ====================
function resetForm() {
    elements.height.value = '';
    elements.width.value = '';
    elements.resolution.value = CONFIG.DEFAULT_RESOLUTION;
    elements.sides.value = CONFIG.DEFAULT_SIDES;
    elements.customerType.value = CONFIG.DEFAULT_CUSTOMER_TYPE;
    elements.projectName.value = '';
    
    elements.results.style.display = 'none';
    elements.dimensionPreview.style.display = 'none';
    
    state.currentQuote = null;
    elements.height.focus();
    
    showToast('Form Reset', 'Ready for new quote', 'info');
}

// ==================== HUBSPOT INTEGRATION ====================
async function saveToHubSpot() {
    if (!state.currentQuote) {
        showToast('No Quote', 'Please calculate a quote first', 'warning');
        return;
    }
    
    const saveBtn = elements.saveBtn;
    const originalText = saveBtn.innerHTML;
    
    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        const quoteData = {
            quote: state.currentQuote,
            context: {
                dealId: elements.hubspotDealId.value,
                contactId: elements.hubspotContactId.value,
                dealName: elements.hubspotDealName.value,
                savedAt: new Date().toISOString()
            }
        };
        
        if (elements.hubspotDealId.value) {
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'HUBSPOT_SAVE_QUOTE',
                    data: quoteData
                }, '*');
                showToast('Success', 'Quote sent to HubSpot deal', 'success');
            } else {
                saveQuoteLocally(quoteData);
            }
        } else {
            saveQuoteLocally(quoteData);
        }
        
        // Log to API
        await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...state.currentQuote.input,
                action: 'save_quote',
                quoteData: quoteData,
                apiKey: CONFIG.API_KEY
            })
        });
        
    } catch (error) {
        console.error('Save to HubSpot failed:', error);
        showToast('Save Failed', 'Could not save quote: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

function saveQuoteLocally(quoteData) {
    const savedQuotes = JSON.parse(localStorage.getItem('savedQuotes') || '[]');
    savedQuotes.push({
        ...quoteData,
        id: 'local_' + Date.now(),
        savedAt: new Date().toISOString()
    });
    
    localStorage.setItem('savedQuotes', JSON.stringify(savedQuotes));
    showToast('Saved Locally', 'Quote saved to browser storage', 'info');
}

function exportQuote() {
    if (!state.currentQuote) {
        showToast('No Quote', 'Please calculate a quote first', 'warning');
        return;
    }
    
    const quoteContent = `
        DIGITAL SIGN QUOTE
        ===============================
        Project: ${elements.projectName.value || 'Unnamed Project'}
        Dimensions: ${elements.height.value}' × ${elements.width.value}'
        Resolution: ${elements.resolution.value}
        Sides: ${elements.sides.value}
        Customer Type: ${elements.customerType.value}
        
        FINAL PRICE: ${elements.finalPrice.textContent}
        
        Panel Configuration:
        ${state.currentQuote.panelDetails}
        
        Total Panels: ${state.currentQuote.totalPanels}
        Total Area: ${state.currentQuote.totalArea} sq ft
        
        Specifications:
        - Total Resolution: ${elements.totalResolution.textContent}
        - Pixel Density: ${elements.pixelDensity.textContent}
        - Optimal Viewing Distance: ${elements.viewingDistance.textContent}
        
        Quote Terms:
        This quote is valid for 30 days. As a manufacturer of high-quality 
        Outdoor LED Displays, we only manufacture and assemble the digital 
        components. Quotes do not include shipping, installation, or frame 
        or mounting bracket fabrication.
        
        Generated: ${new Date().toLocaleString()}
        Quote ID: ${state.currentQuote.quoteId || 'N/A'}
    `;
    
    const blob = new Blob([quoteContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quote_${elements.height.value}x${elements.width.value}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Exported', 'Quote saved as text file', 'success');
}

function shareQuote() {
    if (!state.currentQuote) {
        showToast('No Quote', 'Please calculate a quote first', 'warning');
        return;
    }
    
    const quoteUrl = window.location.href.split('?')[0];
    const shareText = `Digital Sign Quote: ${elements.height.value}'×${elements.width.value}' ${elements.resolution.value} - ${elements.finalPrice.textContent}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Digital Sign Quote',
            text: shareText,
            url: quoteUrl
        });
    } else {
        navigator.clipboard.writeText(shareText + '\n' + quoteUrl)
            .then(() => showToast('Copied', 'Quote link copied to clipboard', 'success'))
            .catch(() => showToast('Error', 'Could not share quote', 'error'));
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    elements.height.addEventListener('input', updateDimensionPreview);
    elements.width.addEventListener('input', updateDimensionPreview);
    
    elements.height.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') elements.width.focus();
    });
    
    elements.width.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && elements.height.value && elements.width.value) {
            calculateQuote();
        }
    });
    
    elements.resolution.addEventListener('change', () => {
        if (state.currentQuote) {
            calculateSpecifications();
        }
    });
    
    // Add preset buttons
    addPresetButtons();
}

// ==================== INITIALIZATION ====================
function initializeApp() {
    console.log('Initializing Sign Quote Calculator');
    
    setupEventListeners();
    checkApiHealth();
    
    // Check for URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('height') && urlParams.has('width')) {
        elements.height.value = urlParams.get('height');
        elements.width.value = urlParams.get('width');
        updateDimensionPreview();
        
        if (urlParams.has('auto') && urlParams.get('auto') === 'true') {
            setTimeout(calculateQuote, 500);
        }
    }
    
    // Periodic API health check
    setInterval(checkApiHealth, 5 * 60 * 1000);
    
    if (CONFIG.ENABLE_LOGGING) {
        console.log('App initialized successfully');
    }
}

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
