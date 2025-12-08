// ==================== CONFIGURATION ====================
const CONFIG = {
    // API Configuration
    GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby-THx84_OlQcA3LKNraevBtinJR8M0-MViM5C7c-xWGT7Ex9c9_GOJJs36hKjGDjFpEQ/exec',
    
    // API Security (Update these with your actual keys)
    API_KEY: 'HS_QUOTE_CALC_2024_SECURE_KEY_XYZ123',
    
    // HubSpot Integration
    HUBSPOT_MODE: true, // Set to false for standalone mode
    
    // Feature Flags
    ENABLE_LOGGING: true,
    ENABLE_CACHING: true,
    ENABLE_ANALYTICS: true,
    
    // Rate Limiting
    MAX_REQUESTS_PER_MINUTE: 30,
    
    // Default Values
    DEFAULT_RESOLUTION: 'P6',
    DEFAULT_SIDES: 'Single',
    DEFAULT_CUSTOMER_TYPE: 'Retail',
    
    // Cache Settings
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes in milliseconds
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
    },
    userPreferences: {
        autoCalculate: true,
        showDetails: true,
        theme: 'light'
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
    panelCost: document.getElementById('panelCost'),
    resolutionCost: document.getElementById('resolutionCost'),
    sensorCost: document.getElementById('sensorCost'),
    computerCost: document.getElementById('computerCost'),
    totalPanels: document.getElementById('totalPanels'),
    totalArea: document.getElementById('totalArea'),
    totalBeforeMarkup: document.getElementById('totalBeforeMarkup'),
    markupPercent: document.getElementById('markupPercent'),
    markupMultiplier: document.getElementById('markupMultiplier'),
    panelsPerSide: document.getElementById('panelsPerSide'),
    quoteId: document.getElementById('quoteId'),
    
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
    
    // Set icon based on type
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toastTitle.innerHTML = `<i class="${icons[type] || icons.info}"></i> ${title}`;
    toastMessage.textContent = message;
    
    // Set color
    toastEl.className = `toast ${type}`;
    
    // Show toast
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
    
    // Log to console
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
        checking: { class: 'status-offline', text: 'API: Checking...', show: true },
        unknown: { class: 'status-offline', text: 'API: Unknown', show: false }
    };
    
    const config = statusConfig[status] || statusConfig.unknown;
    
    elements.statusDot.className = `status-indicator ${config.class}`;
    elements.statusText.textContent = config.text;
    elements.apiStatus.style.display = config.show ? 'block' : 'none';
}

function checkApiHealth() {
    updateApiStatus('checking');
    
    // Simple GET request to check API
    fetch(`${CONFIG.GOOGLE_SCRIPT_URL}?test=true`, {
        method: 'GET',
        headers: {
            'X-API-Key': CONFIG.API_KEY
        }
    })
    .then(response => {
        if (response.ok) {
            updateApiStatus('online');
            showToast('API Ready', 'Connected to quote calculator', 'success');
        } else {
            updateApiStatus('offline');
            showToast('API Warning', 'Calculator service may be slow', 'warning');
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
    // Check rate limiting
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    if (state.requestCount > CONFIG.MAX_REQUESTS_PER_MINUTE && 
        state.lastRequestTime > oneMinuteAgo) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
    }
    
    // Update request tracking
    state.lastRequestTime = now;
    state.requestCount++;
    
    // Check cache first
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
            console.log('Using cached result for:', cacheKey);
            return cached.data;
        }
    }
    
    // Prepare request with authentication
    const apiRequest = {
        ...requestData,
        apiKey: CONFIG.API_KEY,
        source: 'hubspot_calculator',
        version: '1.0',
        timestamp: new Date().toISOString()
    };
    
    // Make API call with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
        const response = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Important for Google Script
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CONFIG.API_KEY
            },
            body: JSON.stringify(apiRequest),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Parse response
        const text = await response.text();
        let data;
        
        try {
            data = JSON.parse(text);
        } catch (e) {
            // Try alternative parsing for Google Script responses
            const match = text.match(/JSON\.parse\('(.+)'\)/);
            if (match) {
                data = JSON.parse(match[1].replace(/\\'/g, "'"));
            } else {
                throw new Error('Invalid response format from API');
            }
        }
        
        // Check for API errors
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (!data.success) {
            throw new Error(data.message || 'Calculation failed');
        }
        
        // Cache the result
        if (CONFIG.ENABLE_CACHING) {
            state.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            // Clean old cache entries
            const maxCacheSize = 100;
            if (state.cache.size > maxCacheSize) {
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
        
        throw error;
    }
}

// ==================== MAIN CALCULATION FUNCTION ====================
async function calculateQuote() {
    // Validate inputs
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
    
    // Show loading, hide results
    elements.loading.style.display = 'block';
    elements.results.style.display = 'none';
    elements.calculateBtn.disabled = true;
    
    try {
        // Prepare request data
        const requestData = {
            height: height,
            width: width,
            resolution: elements.resolution.value,
            sides: elements.sides.value,
            customerType: elements.customerType.value,
            contactEmail: 'user@example.com', // Will be replaced by HubSpot context
            projectName: elements.projectName.value || `Sign ${height}x${width}`,
            hubspotDealId: elements.hubspotDealId.value || null,
            hubspotContactId: elements.hubspotContactId.value || null,
            requestId: 'calc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        };
        
        // Call API
        const result = await callQuoteApi(requestData);
        
        // Store current quote
        state.currentQuote = {
            ...result,
            input: requestData,
            calculatedAt: new Date().toISOString()
        };
        
        // Display results
        displayResults(result);
        
        // Hide loading, show results
        elements.loading.style.display = 'none';
        elements.results.style.display = 'block';
        elements.calculateBtn.disabled = false;
        
        // Show success message
        showToast('Quote Calculated', 
                 `${result.totalPanels} panels optimized for ${height}'×${width}' sign`, 
                 'success');
        
        // Analytics
        if (CONFIG.ENABLE_ANALYTICS) {
            logCalculationAnalytics(requestData, result);
        }
        
    } catch (error) {
        // Handle errors
        elements.loading.style.display = 'none';
        elements.calculateBtn.disabled = false;
        
        console.error('Calculation error:', error);
        
        // Show error to user
        let errorMessage = error.message;
        
        if (errorMessage.includes('Cannot build')) {
            errorMessage = `Cannot build ${height}'×${width}' sign with exact coverage. Try different dimensions.`;
        } else if (errorMessage.includes('timeout')) {
            errorMessage = 'Calculation timed out. The server may be busy. Please try again.';
        } else if (errorMessage.includes('Rate limit')) {
            errorMessage = 'Too many requests. Please wait a moment before trying again.';
        }
        
        showToast('Calculation Failed', errorMessage, 'error');
        
        // Fallback: Show estimated calculation
        showEstimatedCalculation(height, width);
    }
}

function displayResults(data) {
    // Format panel details with badges
    if (data.panelDetails && data.panelDetails.trim()) {
        const panels = data.panelDetails.split(', ');
        elements.panelDetails.innerHTML = panels.map(panel => 
            `<span class="panel-badge">${panel}</span>`
        ).join('');
    } else {
        elements.panelDetails.innerHTML = 
            '<span class="text-muted"><i>Panel details not available</i></span>';
    }
    
    // Update all display values
    elements.finalPrice.textContent = formatCurrency(data.finalPrice || 0);
    elements.panelCost.textContent = (data.panelCost || 0).toFixed(2);
    elements.resolutionCost.textContent = (data.resolutionCost || 0).toFixed(2);
    elements.sensorCost.textContent = (data.sensorCost || 0).toFixed(2);
    elements.computerCost.textContent = (data.computerCost || 0).toFixed(2);
    elements.totalPanels.textContent = formatNumber(data.totalPanels || 0);
    elements.totalArea.textContent = formatNumber(data.totalArea || 0);
    elements.panelsPerSide.textContent = formatNumber(
        Math.ceil((data.totalPanels || 0) / (data.panelMultiplier || 1))
    );
    elements.quoteId.textContent = data.quoteId || 'N/A';
    
    // Calculate and display markup info
    const beforeMarkup = (data.panelCost || 0) + (data.resolutionCost || 0) + 
                        (data.sensorCost || 0) + (data.computerCost || 0);
    elements.totalBeforeMarkup.textContent = formatNumber(beforeMarkup);
    
    if (data.markupApplied) {
        const markupPercent = ((data.markupApplied - 1) * 100).toFixed(0);
        elements.markupPercent.textContent = markupPercent + '%';
        elements.markupMultiplier.textContent = data.markupApplied.toFixed(2) + 'x';
    }
    
    // Update window title with quote info
    const height = elements.height.value;
    const width = elements.width.value;
    document.title = `$${data.finalPrice?.toFixed(0) || '0'} - ${height}'×${width}' Quote`;
}

function showEstimatedCalculation(height, width) {
    // Fallback estimation when API fails
    const area = height * width;
    const sides = elements.sides.value;
    const customerType = elements.customerType.value;
    
    const panelMultiplier = sides.includes('Double') ? 2 : 1;
    const markup = customerType === 'Dealer' ? 1.65 : 2.1;
    
    // Simple estimation
    const estimatedPanels = Math.ceil(area / 16);
    const panelCost = (area * 2.5 * panelMultiplier) * 1.2;
    const resolutionCost = (area * 1.0 * panelMultiplier) * 1.2;
    const finalPrice = (panelCost + resolutionCost + 12 + 10) * markup;
    
    const estimatedData = {
        success: true,
        finalPrice: finalPrice,
        panelDetails: `Approximately ${estimatedPanels} panels needed`,
        panelCost: panelCost,
        resolutionCost: resolutionCost,
        sensorCost: 12.00,
        computerCost: 10.00,
        totalPanels: estimatedPanels,
        totalArea: area * panelMultiplier,
        panelMultiplier: panelMultiplier,
        markupApplied: markup,
        importTaxRate: 0.20,
        isEstimate: true
    };
    
    displayResults(estimatedData);
    elements.results.style.display = 'block';
    
    showToast('Estimated Calculation', 
             'Using estimated values. API may be unavailable.', 
             'warning');
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
        // Update button state
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        // Prepare HubSpot data
        const quoteData = {
            quote: state.currentQuote,
            context: {
                dealId: elements.hubspotDealId.value,
                contactId: elements.hubspotContactId.value,
                dealName: elements.hubspotDealName.value,
                savedAt: new Date().toISOString()
            }
        };
        
        // Check if we're in HubSpot context
        if (elements.hubspotDealId.value) {
            // We're in HubSpot - send message to parent
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'HUBSPOT_SAVE_QUOTE',
                    data: quoteData
                }, '*');
                
                showToast('Success', 'Quote sent to HubSpot deal', 'success');
            } else {
                // Standalone mode - save locally
                saveQuoteLocally(quoteData);
            }
        } else {
            // No HubSpot context - save locally
            saveQuoteLocally(quoteData);
        }
        
        // Also send to API for logging
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
        // Restore button
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

function saveQuoteLocally(quoteData) {
    // Save to localStorage for demo/standalone mode
    const savedQuotes = JSON.parse(localStorage.getItem('savedQuotes') || '[]');
    savedQuotes.push({
        ...quoteData,
        id: 'local_' + Date.now(),
        savedAt: new Date().toISOString()
    });
    
    localStorage.setItem('savedQuotes', JSON.stringify(savedQuotes));
    
    showToast('Saved Locally', 
             'Quote saved to browser storage. Enable HubSpot for CRM integration.', 
             'info');
}

function exportQuote() {
    if (!state.currentQuote) {
        showToast('No Quote', 'Please calculate a quote first', 'warning');
        return;
    }
    
    // Create PDF content
    const quoteContent = `
        QUOTE SUMMARY
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
        
        Cost Breakdown:
        - Panels: $${state.currentQuote.panelCost?.toFixed(2)}
        - Resolution: $${state.currentQuote.resolutionCost?.toFixed(2)}
        - Sensors: $${state.currentQuote.sensorCost?.toFixed(2)}
        - Computer: $${state.currentQuote.computerCost?.toFixed(2)}
        
        Generated: ${new Date().toLocaleString()}
        Quote ID: ${state.currentQuote.quoteId || 'N/A'}
    `;
    
    // Create and download file
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
    const shareText = `Check out this sign quote: ${elements.height.value}'×${elements.width.value}' for ${elements.finalPrice.textContent}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Sign Quote',
            text: shareText,
            url: quoteUrl
        });
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(shareText + '\n' + quoteUrl)
            .then(() => showToast('Copied', 'Quote link copied to clipboard', 'success'))
            .catch(() => showToast('Error', 'Could not share quote', 'error'));
    }
}

function logCalculationAnalytics(requestData, result) {
    const analyticsData = {
        event: 'quote_calculated',
        timestamp: new Date().toISOString(),
        dimensions: `${requestData.height}x${requestData.width}`,
        resolution: requestData.resolution,
        sides: requestData.sides,
        customerType: requestData.customerType,
        finalPrice: result.finalPrice,
        totalPanels: result.totalPanels,
        success: result.success,
        isEstimate: result.isEstimate || false,
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`
    };
    
    // Send to your analytics endpoint
    console.log('Analytics:', analyticsData);
}

// ==================== FORM MANAGEMENT ====================
function resetForm() {
    // Clear inputs
    elements.height.value = '';
    elements.width.value = '';
    elements.resolution.value = CONFIG.DEFAULT_RESOLUTION;
    elements.sides.value = CONFIG.DEFAULT_SIDES;
    elements.customerType.value = CONFIG.DEFAULT_CUSTOMER_TYPE;
    elements.projectName.value = '';
    
    // Clear results
    elements.results.style.display = 'none';
    elements.dimensionPreview.style.display = 'none';
    
    // Reset state
    state.currentQuote = null;
    
    // Focus on height
    elements.height.focus();
    
    showToast('Form Reset', 'Ready for new quote', 'info');
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Auto-update dimension preview
    elements.height.addEventListener('input', updateDimensionPreview);
    elements.width.addEventListener('input', updateDimensionPreview);
    
    // Auto-calculate for small signs
    elements.height.addEventListener('blur', autoCalculateIfReady);
    elements.width.addEventListener('blur', autoCalculateIfReady);
    
    // Enter key support
    elements.height.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') elements.width.focus();
    });
    
    elements.width.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && elements.height.value && elements.width.value) {
            calculateQuote();
        }
    });
    
    // Preset buttons (optional)
    addPresetButtons();
}

function autoCalculateIfReady() {
    if (!state.userPreferences.autoCalculate) return;
    
    const height = parseFloat(elements.height.value) || 0;
    const width = parseFloat(elements.width.value) || 0;
    
    if (height > 0 && width > 0 && height <= 50 && width <= 50) {
        // Auto-calculate for small signs
        setTimeout(() => {
            if (document.activeElement !== elements.height && 
                document.activeElement !== elements.width) {
                calculateQuote();
            }
        }, 500);
    }
}

function addPresetButtons() {
    // Add common preset buttons
    const presets = [
        { label: '22×33', height: 22, width: 33 },
        { label: '9×9', height: 9, width: 9 },
        { label: '10×20', height: 10, width: 20 },
        { label: '4×8', height: 4, width: 8 }
    ];
    
    const presetContainer = document.createElement('div');
    presetContainer.className = 'preset-buttons mt-3 text-center';
    presetContainer.innerHTML = '<small class="text-muted">Quick presets: </small>';
    
    presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline-primary ms-2';
        btn.textContent = preset.label;
        btn.onclick = () => {
            elements.height.value = preset.height;
            elements.width.value = preset.width;
            updateDimensionPreview();
            calculateQuote();
        };
        presetContainer.appendChild(btn);
    });
    
    // Insert after the calculate button
    const calculateDiv = elements.calculateBtn.parentElement;
    calculateDiv.parentNode.insertBefore(presetContainer, calculateDiv.nextSibling);
}

// ==================== INITIALIZATION ====================
function initializeApp() {
    console.log('Initializing Sign Quote Calculator v1.0');
    
    // Setup event listeners
    setupEventListeners();
    
    // Check API health
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
    
    // Load saved preferences
    const savedPrefs = localStorage.getItem('quoteCalculatorPrefs');
    if (savedPrefs) {
        try {
            state.userPreferences = { ...state.userPreferences, ...JSON.parse(savedPrefs) };
        } catch (e) {
            console.warn('Could not load preferences:', e);
        }
    }
    
    // Periodic API health check
    setInterval(checkApiHealth, 5 * 60 * 1000); // Every 5 minutes
    
    // Show welcome message
    setTimeout(() => {
        if (!state.currentQuote && elements.height.value === '' && elements.width.value === '') {
            showToast('Welcome', 'Enter dimensions to calculate your sign quote', 'info');
        }
    }, 1000);
    
    // Log initialization
    if (CONFIG.ENABLE_LOGGING) {
        console.log('App initialized successfully');
    }
}

// ==================== START APPLICATION ====================
document.addEventListener('DOMContentLoaded', initializeApp);
