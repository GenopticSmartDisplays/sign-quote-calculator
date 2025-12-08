const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyo0wwgbYdWvE9o5JZln90P882BNEIH1WaQD7L5pXtn0Tj1Qo_ea8zrWXpSgzf62kpxFw/exec';

// DOM Elements
const elements = {
    height: document.getElementById('height'),
    width: document.getElementById('width'),
    resolution: document.getElementById('resolution'),
    sides: document.getElementById('sides'),
    customerType: document.getElementById('customerType'),
    projectName: document.getElementById('projectName'),
    results: document.getElementById('results'),
    loading: document.getElementById('loading'),
    panelDetails: document.getElementById('panelDetails'),
    finalPrice: document.getElementById('finalPrice'),
    panelCost: document.getElementById('panelCost'),
    resolutionCost: document.getElementById('resolutionCost'),
    sensorCost: document.getElementById('sensorCost'),
    computerCost: document.getElementById('computerCost'),
    totalPanels: document.getElementById('totalPanels'),
    totalArea: document.getElementById('totalArea')
};

// Toast utility
function showToast(title, message, type = 'info') {
    const toastEl = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    // Set color based on type
    toastEl.className = `toast ${type}`;
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// Calculate quote
async function calculateQuote() {
    // Validate inputs
    if (!elements.height.value || !elements.width.value) {
        showToast('Error', 'Please enter height and width', 'error');
        return;
    }
    
    const height = parseFloat(elements.height.value);
    const width = parseFloat(elements.width.value);
    
    if (height > 100 || width > 100) {
        showToast('Warning', 'Maximum size is 100x100 feet', 'warning');
    }
    
    // Show loading, hide results
    elements.loading.style.display = 'block';
    elements.results.style.display = 'none';
    
    try {
        // Prepare data for Google Script
        const requestData = {
            height: height,
            width: width,
            resolution: elements.resolution.value,
            sides: elements.sides.value,
            customerType: elements.customerType.value,
            contactEmail: 'agent@company.com', // This would come from HubSpot context
            projectName: elements.projectName.value || `Sign ${height}x${width}`,
            timestamp: new Date().toISOString()
        };
        
        // Call Google Script
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Display results
        displayResults(data, height, width);
        
        // Hide loading, show results
        elements.loading.style.display = 'none';
        elements.results.style.display = 'block';
        
        showToast('Success', 'Quote calculated successfully!', 'success');
        
    } catch (error) {
        elements.loading.style.display = 'none';
        showToast('Calculation Error', error.message, 'error');
        console.error('Quote calculation error:', error);
    }
}

// Display results
function displayResults(data, height, width) {
    // Format panel details with badges
    if (data.panelDetails) {
        const panels = data.panelDetails.split(', ');
        elements.panelDetails.innerHTML = panels.map(panel => 
            `<span class="panel-badge">${panel}</span>`
        ).join('');
    } else {
        elements.panelDetails.innerHTML = '<span class="text-muted">No panel details available</span>';
    }
    
    // Update all values
    elements.finalPrice.textContent = `$${formatCurrency(data.finalPrice || 0)}`;
    elements.panelCost.textContent = formatCurrency(data.panelCost || 0);
    elements.resolutionCost.textContent = formatCurrency(data.resolutionCost || 0);
    elements.sensorCost.textContent = formatCurrency(data.sensorCost || 0);
    elements.computerCost.textContent = formatCurrency(data.computerCost || 0);
    elements.totalPanels.textContent = data.totalPanels || 0;
    elements.totalArea.textContent = (height * width).toFixed(1);
}

// Format currency
function formatCurrency(amount) {
    return parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Save to HubSpot
function saveToHubSpot() {
    // Check if running in HubSpot context
    if (typeof window.hubspot !== 'undefined') {
        // Get current data
        const quoteData = {
            height: elements.height.value,
            width: elements.width.value,
            resolution: elements.resolution.value,
            sides: elements.sides.value,
            customerType: elements.customerType.value,
            projectName: elements.projectName.value,
            finalPrice: elements.finalPrice.textContent.replace('$', ''),
            totalPanels: elements.totalPanels.textContent,
            timestamp: new Date().toISOString()
        };
        
        // Use HubSpot JavaScript SDK
        window.hubspot.track('quote_created', quoteData);
        
        // If in an iframe, send message to parent
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'HUBSPOT_QUOTE_DATA',
                data: quoteData
            }, '*');
        }
        
        showToast('Saved', 'Quote saved to HubSpot CRM', 'success');
        
    } else {
        // Not in HubSpot - show demo message
        showToast('Demo Mode', 'In HubSpot, this would save to CRM. Currently in demo.', 'info');
        
        // For testing, you could store in localStorage
        localStorage.setItem('last_quote', JSON.stringify({
            height: elements.height.value,
            width: elements.width.value,
            price: elements.finalPrice.textContent,
            date: new Date().toLocaleString()
        }));
    }
}

// Reset form
function resetForm() {
    elements.height.value = '';
    elements.width.value = '';
    elements.resolution.value = 'P6';
    elements.sides.value = 'Single';
    elements.customerType.value = 'Retail';
    elements.projectName.value = '';
    elements.results.style.display = 'none';
    
    // Set focus to height
    elements.height.focus();
    
    showToast('Reset', 'Form cleared. Ready for new quote.', 'info');
}

// Auto-calculate when both dimensions are entered
elements.height.addEventListener('blur', autoCalculateCheck);
elements.width.addEventListener('blur', autoCalculateCheck);

function autoCalculateCheck() {
    if (elements.height.value && elements.width.value && 
        elements.height.value >= 1 && elements.width.value >= 1) {
        // Optional: Auto-calculate for small signs
        const area = elements.height.value * elements.width.value;
        if (area <= 50) {
            calculateQuote();
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Set today's date as default project name
    const today = new Date().toLocaleDateString();
    elements.projectName.placeholder = `Quote ${today}`;
    
    // Check for saved quote
    const savedQuote = localStorage.getItem('last_quote');
    if (savedQuote) {
        try {
            const quote = JSON.parse(savedQuote);
            showToast('Last Quote', `${quote.height}x${quote.width} - ${quote.price} on ${quote.date}`, 'info');
        } catch (e) {
            // Ignore parse errors
        }
    }
});
