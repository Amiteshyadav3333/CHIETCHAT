# Saskat AI - Integration Guide

## Step 1: Add Route to main.jsx

Open `frontend/src/main.jsx` and add the import and route:

```javascript
import SaskatAI from './pages/SaskatAI/SaskatAI';

// Inside Routes component, add:
<Route path="/saskat-ai" element={
    <ProtectedRoute>
        <SaskatAI />
    </ProtectedRoute>
} />
```

## Step 2: Add Navigation Link

Add to your main navigation component (e.g., `Home.jsx` or `Sidebar.jsx`):

```javascript
import { Link } from './utils/clientRouter';

// In your navigation JSX:
<Link to="/saskat-ai" className="nav-link">
    <span className="nav-icon">🤖</span>
    <span className="nav-label">Saskat AI</span>
</Link>
```

## Step 3: Configure Environment Variables

Add to `backend/.env`:

```
# AI API Keys
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
HUGGINGFACE_API_KEY=your_huggingface_api_key

# Optional: Image generation
DALL_E_API_KEY=your_dalle_key
MIDJOURNEY_API_KEY=your_midjourney_key
```

## Step 4: Backend Blueprint Registration

The blueprint is already registered in `app.py`. Verify it's there:

```python
from routes.saskat_bp import saskat_bp
app.register_blueprint(saskat_bp)
```

## Step 5: Database Setup (Optional)

If you want to store ads in the database, create an Ad model:

```python
# In models.py
class Ad(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500))
    price = db.Column(db.Float)
    video_url = db.Column(db.String(500))
    image_url = db.Column(db.String(500))
    product_link = db.Column(db.String(500))
    product_id = db.Column(db.String(100))
    keywords = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utc_now)
```

## Step 6: Update Ad Fetching (Optional)

Update `saskat_bp.py` to fetch from database:

```python
def fetch_relevant_ad(keywords, user_id):
    """Fetch relevant ad based on keywords from database"""
    from models import Ad
    
    # Find ads matching keywords
    ads = Ad.query.all()
    
    for ad in ads:
        if any(keyword in ad.keywords for keyword in keywords):
            return {
                'id': ad.id,
                'title': ad.title,
                'description': ad.description,
                'price': ad.price,
                'videoUrl': ad.video_url,
                'imageUrl': ad.image_url,
                'productLink': ad.product_link,
                'productId': ad.product_id,
                'keywords': ad.keywords
            }
    
    # Return random ad if no match
    return ads[0].to_dict() if ads else {}
```

## Step 7: Add CSS to Main Stylesheet (Optional)

If you want to customize colors globally, add to your main CSS:

```css
:root {
    --saskat-primary: #0099ff;
    --saskat-secondary: #00d4ff;
    --saskat-dark: #0f0f1e;
    --saskat-surface: rgba(255, 255, 255, 0.05);
}
```

## Step 8: Test the Integration

1. Start backend:
```bash
cd backend
python app.py
```

2. Start frontend:
```bash
cd frontend
npm run dev
```

3. Navigate to `http://localhost:3000/saskat-ai`

4. Test features:
   - Chat with different models
   - Enable voice mode
   - Generate images
   - Check for ads (every 5 minutes)

## Step 9: Customize (Optional)

### Change Ad Display Frequency
In `SaskatAI.jsx`:
```javascript
// Change from 5 minutes to desired time (in milliseconds)
const showAdInterval = setInterval(() => {
    fetchAndShowAd();
}, 3 * 60 * 1000); // 3 minutes
```

### Change Ad Display Duration
In `AdPanel.jsx`:
```javascript
// Change from 10 seconds to desired time
const [timeLeft, setTimeLeft] = useState(10); // Change this value
```

### Add More AI Models
In `ModelSelector.jsx`:
```javascript
const models = [
    { id: 'gpt-4', name: 'GPT-4', icon: '🧠', description: 'Most capable' },
    { id: 'your-model', name: 'Your Model', icon: '🚀', description: 'Description' }
];
```

### Customize Colors
In `SaskatAI.css`:
```css
/* Change primary color */
--primary: #your-color;
/* Change secondary color */
--secondary: #your-color;
```

## Step 10: Deploy

### Frontend Deployment
```bash
cd frontend
npm run build
# Deploy dist/ folder to your hosting
```

### Backend Deployment
```bash
cd backend
# Set environment variables on your hosting
# Deploy using your preferred method (Docker, Heroku, etc.)
```

## Troubleshooting

### Issue: "Module not found" error
**Solution**: Ensure all files are in the correct directories:
- Frontend: `frontend/src/pages/SaskatAI/`
- Backend: `backend/routes/saskat_bp.py`

### Issue: API keys not working
**Solution**: 
1. Verify keys are correct
2. Check `.env` file is loaded
3. Restart backend server

### Issue: Ads not showing
**Solution**:
1. Check if ads are in database
2. Verify keyword extraction is working
3. Check browser console for errors

### Issue: Voice mode not working
**Solution**:
1. Check microphone permissions
2. Use Chrome/Edge browser
3. Ensure HTTPS in production

### Issue: Image generation failing
**Solution**:
1. Verify API keys are valid
2. Check API quotas
3. Ensure internet connection

## Performance Tips

1. **Optimize Images**: Compress ad images before uploading
2. **Cache Responses**: Enable browser caching
3. **Lazy Load**: Images load on demand
4. **Debounce**: Search is debounced to reduce API calls
5. **Monitor**: Track API usage and costs

## Security Checklist

- [ ] API keys are in `.env` (not committed)
- [ ] CSRF protection is enabled
- [ ] Rate limiting is configured
- [ ] User authentication is required
- [ ] Input validation is in place
- [ ] HTTPS is enabled in production

## Monitoring & Analytics

### Key Metrics to Track
- Chat response time
- Ad impression rate
- User engagement
- API usage and costs
- Error rates

### Logging
- Frontend: Browser console
- Backend: `backend.log`

## Support & Documentation

- Main README: `SASKAT_AI_README.md`
- Setup Guide: `SASKAT_AI_SETUP.md`
- Complete Summary: `SASKAT_AI_COMPLETE.md`

## Next Steps

1. ✅ Complete integration steps above
2. ✅ Configure API keys
3. ✅ Test all features
4. ✅ Customize as needed
5. ✅ Deploy to production
6. ✅ Monitor performance
7. ✅ Gather user feedback
8. ✅ Iterate and improve

---

**Integration Complete!** 🎉

Your Saskat AI is now integrated into your app. Access it at `/saskat-ai` after logging in.
