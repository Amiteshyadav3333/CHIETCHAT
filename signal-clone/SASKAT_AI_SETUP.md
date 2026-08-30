# Saskat AI - Quick Setup Guide

## Installation Steps

### 1. Frontend Integration

Add route to `frontend/src/main.jsx`:
```javascript
import SaskatAI from './pages/SaskatAI/SaskatAI';

// Add to Routes
<Route path="/saskat-ai" element={
  <ProtectedRoute>
    <SaskatAI />
  </ProtectedRoute>
} />
```

### 2. Backend Integration

The backend is already configured. Just ensure these environment variables are set in `.env`:

```
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
HUGGINGFACE_API_KEY=your_huggingface_key
```

### 3. Database Setup

No additional database setup needed. The system uses existing user authentication.

### 4. Start Services

**Backend:**
```bash
cd backend
python app.py
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## Features Overview

### 1. Chat with Multiple AI Models
- Select from GPT-4, Claude 3, Gemini, or Groq
- Real-time responses with sources
- User profile photos in chat

### 2. Voice Mode
- Click microphone icon to enable
- Speak naturally
- AI responds to your voice

### 3. Image Generation
- Click image icon to open generator
- Choose model (DALL-E 3, Midjourney, Stable Diffusion)
- Enter prompt and generate
- Download generated images

### 4. Contextual Ads (RAG-Based)
- Ads appear every 5 minutes
- Based on your conversation context
- Draggable anywhere on screen
- Skip button with 10-second countdown
- Direct product purchase links

### 5. Form Filling
- AI helps fill forms automatically
- Context-aware suggestions
- Preserves your data

### 6. Product Reviews
- Get AI-powered product reviews
- Quality and feature analysis
- Direct shopping integration

## Ad System Details

### How Ads Work
1. **Keyword Extraction**: System extracts keywords from your messages
2. **Ad Matching**: Finds relevant ads based on keywords
3. **Display**: Shows ad in draggable panel
4. **Interaction**: Click "View Product" to shop or "Skip" to dismiss

### Ad Customization
Ads are stored in the database and can be managed through:
- Admin panel (future feature)
- Direct database updates
- API endpoints

### Sample Ad Data
```json
{
  "title": "Premium Laptop",
  "description": "High-performance laptop for professionals",
  "price": 89999,
  "videoUrl": "https://example.com/ad.mp4",
  "productLink": "https://shopping.example.com/laptop",
  "keywords": ["laptop", "computer", "technology"]
}
```

## API Endpoints

### Chat
```
POST /api/ai/chat
```

### Image Generation
```
POST /api/ai/image/generate
```

### Contextual Ads
```
POST /api/ai/ads/get-contextual-ad
```

### Form Filling
```
POST /api/ai/form/fill
```

### Product Review
```
POST /api/ai/product/review
```

## Customization

### Change Colors
Edit `SaskatAI.css`:
```css
/* Primary color */
--primary: #0099ff;
/* Secondary color */
--secondary: #00d4ff;
```

### Add New AI Models
Edit `ModelSelector.jsx`:
```javascript
const models = [
  { id: 'new-model', name: 'New Model', icon: '🚀', description: 'Description' }
];
```

### Modify Ad Display Time
Edit `SaskatAI.jsx`:
```javascript
// Change from 5 minutes to desired time
const showAdInterval = setInterval(() => {
  fetchAndShowAd();
}, 5 * 60 * 1000); // Change this value
```

## Troubleshooting

### Ads Not Showing
1. Check if API key is configured
2. Verify ad database has entries
3. Check browser console for errors

### Voice Mode Not Working
1. Ensure microphone permission is granted
2. Check browser support (Chrome/Edge recommended)
3. Verify microphone is working

### Image Generation Failing
1. Check API keys are valid
2. Verify API quotas
3. Check internet connection

### Chat Not Responding
1. Verify API keys are set
2. Check rate limiting
3. Ensure user is authenticated

## Performance Tips

1. **Optimize Images**: Compress ad images before uploading
2. **Cache Responses**: Enable browser caching
3. **Lazy Load**: Images load on demand
4. **Debounce**: Search is debounced to reduce API calls

## Security Notes

1. **API Keys**: Never commit API keys to repository
2. **User Data**: All user data is encrypted
3. **CSRF Protection**: Enabled by default
4. **Rate Limiting**: Prevents abuse

## Monitoring

### Key Metrics
- Chat response time
- Ad impression rate
- User engagement
- API usage

### Logs
Check logs in:
- Frontend: Browser console
- Backend: `backend.log`

## Support

For issues or questions:
1. Check the documentation
2. Review error messages
3. Check browser console
4. Review backend logs

## Next Steps

1. Configure API keys
2. Add sample ads to database
3. Test all features
4. Deploy to production

---

**Ready to use!** Access Saskat AI at `/saskat-ai` after logging in.
