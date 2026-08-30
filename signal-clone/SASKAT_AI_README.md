# Saskat AI - Complete Architecture Documentation

## Overview
Saskat AI is an advanced AI chat system with Perplexity-like UI, featuring real-time contextual ads, image generation, voice mode, and intelligent form filling.

## Features

### 1. **Chat Interface**
- Perplexity-style design with user and AI messages
- Multiple AI model selection (GPT-4, Claude 3, Gemini, Groq)
- Real-time streaming responses
- Source citations and references
- User profile photos in chat

### 2. **Voice Mode**
- Speech-to-text conversion
- Real-time transcription
- Hands-free interaction
- Natural language processing

### 3. **Image Generation**
- Multiple model support (DALL-E 3, Midjourney, Stable Diffusion)
- Custom prompt input
- Batch image generation
- Download functionality

### 4. **Contextual Ad System (RAG-Based)**
- Real-time keyword extraction from user queries
- Intelligent ad matching based on user context
- Draggable ad panels
- 10-second auto-dismiss with skip button
- Appears every 5 minutes
- Direct product purchase links
- Video and image ad support

### 5. **Form Filling with AI**
- Intelligent form field suggestions
- Context-aware auto-fill
- User data preservation
- Multi-step form support

### 6. **Product Review & Shopping**
- AI-powered product reviews
- Quality and feature analysis
- Direct purchase integration
- Shopping platform integration

### 7. **User Photo Generation**
- AI-powered photo creation
- Model selection
- Custom parameters
- Download and share options

## Architecture

### Frontend Structure
```
frontend/src/pages/SaskatAI/
├── SaskatAI.jsx                 # Main component
├── SaskatAI.css                 # Styling
├── components/
│   ├── ChatInterface.jsx        # Chat UI
│   ├── AdPanel.jsx              # Ad display with drag
│   ├── VoiceMode.jsx            # Voice interaction
│   ├── ImageGenerator.jsx       # Image generation
│   └── ModelSelector.jsx        # AI model selection
├── context/
│   └── SaskatAIContext.jsx      # State management
├── utils/
│   ├── adManager.js             # Ad logic
│   └── aiModels.js              # Model configurations
└── hooks/
    └── useVoiceRecognition.js   # Voice hook
```

### Backend Structure
```
backend/routes/
├── saskat_bp.py                 # Main blueprint
├── Endpoints:
│   ├── POST /api/ai/chat                    # Chat endpoint
│   ├── POST /api/ai/image/generate          # Image generation
│   ├── POST /api/ai/ads/get-contextual-ad   # Contextual ads
│   ├── POST /api/ai/form/fill               # Form filling
│   └── POST /api/ai/product/review          # Product reviews
```

## Ad System (RAG-Based)

### How It Works
1. **User Query Analysis**: Extract keywords from user message
2. **Keyword Matching**: Match keywords with ad database
3. **Ad Selection**: Return most relevant ad
4. **Display**: Show ad in draggable panel
5. **Tracking**: Track ad impressions and clicks

### Ad Display Rules
- Appears every 5 minutes
- 10-second display time with skip button
- Draggable anywhere on screen
- Can be dismissed anytime
- Video/image support
- Direct product link

### Ad Data Structure
```json
{
  "id": 1,
  "title": "Product Name",
  "description": "Product description",
  "price": 99999,
  "videoUrl": "https://...",
  "imageUrl": "https://...",
  "productLink": "https://shopping.example.com/product",
  "productId": "product-001",
  "keywords": ["keyword1", "keyword2"]
}
```

## AI Models Integration

### Supported Models
1. **GPT-4** - Most capable, best for complex queries
2. **Claude 3** - Balanced performance and speed
3. **Gemini** - Advanced reasoning
4. **Groq** - Fast inference

### Model Configuration
```javascript
const models = [
  { id: 'gpt-4', name: 'GPT-4', icon: '🧠', description: 'Most capable' },
  { id: 'gpt-3.5', name: 'GPT-3.5', icon: '⚡', description: 'Fast & efficient' },
  { id: 'claude-3', name: 'Claude 3', icon: '🎯', description: 'Balanced' },
  { id: 'gemini', name: 'Gemini', icon: '✨', description: 'Advanced' }
];
```

## Image Generation

### Supported Models
- DALL-E 3 (OpenAI)
- Midjourney
- Stable Diffusion

### Features
- Custom prompts
- Batch generation
- Download support
- Model switching

## Voice Mode

### Features
- Real-time speech recognition
- Continuous listening
- Interim results display
- Final transcript processing
- Error handling

### Browser Support
- Chrome/Edge (native)
- Firefox (with polyfill)
- Safari (limited)

## Form Filling

### Capabilities
- Auto-detect form fields
- Intelligent suggestions
- Context-aware filling
- Multi-step forms
- Data validation

### Example
```javascript
// User provides form description
const formDescription = "Fill out a job application form";

// AI suggests values for each field
const filledData = {
  fullName: "John Doe",
  email: "john@example.com",
  phone: "+91-9876543210",
  experience: "5 years in software development"
};
```

## Product Review System

### Features
- AI-powered analysis
- Quality assessment
- Feature comparison
- Price evaluation
- Recommendation engine

### Review Data
```json
{
  "productId": "product-001",
  "productName": "Laptop",
  "rating": 4.5,
  "review": "Detailed review text",
  "pros": ["Pro 1", "Pro 2"],
  "cons": ["Con 1", "Con 2"],
  "recommendation": "Highly recommended"
}
```

## User Photo Generation

### Features
- AI-powered photo creation
- Multiple styles
- Custom parameters
- Download and share
- Model selection

## API Endpoints

### Chat
```
POST /api/ai/chat
Body: {
  message: string,
  model: string,
  userId: number
}
Response: {
  response: string,
  sources: array,
  model: string
}
```

### Image Generation
```
POST /api/ai/image/generate
Body: {
  prompt: string,
  model: string,
  userId: number
}
Response: {
  images: array
}
```

### Contextual Ads
```
POST /api/ai/ads/get-contextual-ad
Body: {
  userContext: string,
  userId: number
}
Response: {
  id: number,
  title: string,
  description: string,
  price: number,
  videoUrl: string,
  imageUrl: string,
  productLink: string,
  productId: string,
  keywords: array
}
```

### Form Filling
```
POST /api/ai/form/fill
Body: {
  formData: object,
  description: string
}
Response: {
  filledData: object
}
```

### Product Review
```
POST /api/ai/product/review
Body: {
  productId: string,
  productName: string
}
Response: {
  productId: string,
  productName: string,
  rating: number,
  review: string,
  pros: array,
  cons: array,
  recommendation: string
}
```

## Styling

### Color Scheme
- Primary: #0099ff (Cyan)
- Secondary: #00d4ff (Light Cyan)
- Background: #0f0f1e (Dark)
- Surface: rgba(255, 255, 255, 0.05)

### Responsive Design
- Desktop: Full layout with side panels
- Tablet: Stacked layout
- Mobile: Single column

## Performance Optimization

### Frontend
- Lazy loading of components
- Message virtualization
- Image lazy loading
- Debounced search

### Backend
- Request caching
- Response streaming
- Connection pooling
- Rate limiting

## Security

### Features
- User authentication required
- CSRF protection
- Rate limiting
- Input validation
- XSS prevention
- SQL injection prevention

## Future Enhancements

1. **Real-time Collaboration**
   - Multi-user chat
   - Shared workspaces
   - Live editing

2. **Advanced Analytics**
   - User behavior tracking
   - Ad performance metrics
   - Engagement analytics

3. **Monetization**
   - Premium features
   - Ad revenue sharing
   - Subscription tiers

4. **Integration**
   - Third-party APIs
   - Payment gateways
   - CRM systems

## Deployment

### Environment Variables
```
GEMINI_API_KEY=your_key
GROQ_API_KEY=your_key
OPENAI_API_KEY=your_key
HUGGINGFACE_API_KEY=your_key
```

### Installation
```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
pip install -r requirements.txt
python app.py
```

## Support & Documentation

For more information, refer to:
- Frontend: `/frontend/src/pages/SaskatAI/`
- Backend: `/backend/routes/saskat_bp.py`
- API: `/backend/routes/saskat_bp.py`

---

**Version**: 1.0.0
**Last Updated**: 2024
**Status**: Production Ready
