# Sign Quote Calculator

An embedded application for HubSpot CRM that calculates digital sign quotes using Google Sheets as the backend.

## Features
- Real-time sign quote calculations
- Optimal panel configuration algorithm
- HubSpot CRM integration
- Professional UI with Bootstrap 5
- Mobile-responsive design

## Setup Instructions

### 1. Google Sheets Backend
1. Copy the [Google Apps Script](https://docs.google.com/spreadsheets/d/...) 
2. Deploy as Web App:
   - Execute as: "Me"
   - Access: "Anyone"
   - Copy the web app URL

### 2. GitHub Pages Deployment
1. Go to Settings > Pages
2. Source: "Deploy from a branch"
3. Branch: "main", folder: "/ (root)"
4. Save - your site will be at: `https://username.github.io/sign-quote-calculator`

### 3. HubSpot Integration
1. In HubSpot, go to Settings > Website > Pages
2. Create new page or edit existing
3. Add HTML module with:
   ```html
   <iframe 
     src="https://username.github.io/sign-quote-calculator" 
     width="100%" 
     height="800px"
     frameborder="0"
   ></iframe>
