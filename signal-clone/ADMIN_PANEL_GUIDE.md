# Admin Panel - Complete Setup Guide

## 🔐 Admin Credentials

### Default Admin Login
- **Email**: `admin@saskatai.com`
- **Password**: `admin@123`

⚠️ **IMPORTANT**: Change these credentials in production!

## 🚀 Setup Instructions

### 1. Environment Variables

Add to `backend/.env`:

```
# Admin Credentials (Change in production!)
ADMIN_EMAIL=admin@saskatai.com
ADMIN_PASSWORD_HASH=<hashed_password>
JWT_SECRET_KEY=your-secret-key-here
```

To generate a hashed password:
```python
from werkzeug.security import generate_password_hash
hashed = generate_password_hash('your_password')
print(hashed)
```

### 2. Database Setup

The Ad model is automatically created. Run migrations:

```bash
cd backend
python migrate.py
```

### 3. Frontend Routes

Add to `frontend/src/main.jsx`:

```javascript
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

// Add routes
<Route path="/admin/login" element={<AdminLogin />} />
<Route path="/admin/dashboard" element={<AdminDashboard />} />
```

### 4. Backend Routes

Routes are automatically registered in `app.py`:

```python
from routes.admin_bp import admin_bp
app.register_blueprint(admin_bp)
```

## 📋 Admin Features

### 1. **Advertisement Management**
- ✅ Create new ads
- ✅ Edit existing ads
- ✅ Delete ads
- ✅ Upload video and image files
- ✅ Set keywords for ad targeting
- ✅ Track impressions and clicks

### 2. **Statistics Dashboard**
- ✅ Total ads count
- ✅ Total impressions
- ✅ Total clicks
- ✅ Click-through rate (CTR)
- ✅ Top performing ads
- ✅ Recent activity log

### 3. **Settings**
- ✅ Ad display frequency (minutes)
- ✅ Ad display duration (seconds)
- ✅ Custom configurations

## 🔑 API Endpoints

### Authentication
```
POST /api/admin/login
Body: { email, password }
Response: { token, admin }
```

### Ads Management
```
GET /api/admin/ads
Authorization: Bearer {token}

POST /api/admin/ads
Authorization: Bearer {token}
X-CSRF-Token: {csrf_token}
Body: { title, description, price, videoUrl, imageUrl, productLink, productId, keywords }

PUT /api/admin/ads/{id}
Authorization: Bearer {token}
X-CSRF-Token: {csrf_token}
Body: { ...updated fields }

DELETE /api/admin/ads/{id}
Authorization: Bearer {token}
X-CSRF-Token: {csrf_token}
```

### Statistics
```
GET /api/admin/ads/stats
Authorization: Bearer {token}
Response: { totalAds, totalImpressions, totalClicks, topAds, recentActivity }
```

### File Upload
```
POST /api/admin/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data
Body: { file, type }
Response: { url }
```

### Ad Tracking
```
POST /api/admin/ads/{id}/track
Body: { action: 'impression' | 'click' }
```

## 🔒 Security Features

### ✅ Implemented
- JWT token-based authentication
- CSRF token validation on all mutations
- Password hashing with werkzeug
- Admin token verification on all routes
- Input validation on all fields
- File upload validation
- Error handling and logging

### 🔐 Best Practices
1. **Change default credentials** in production
2. **Use HTTPS** for all admin communications
3. **Rotate JWT secrets** regularly
4. **Monitor admin activity** logs
5. **Restrict admin access** by IP if possible
6. **Use strong passwords** for admin accounts
7. **Enable 2FA** for admin accounts (future enhancement)

## 📊 Ad Management Workflow

### Creating an Ad

1. Login to admin panel
2. Click "Add New Ad"
3. Fill in ad details:
   - Title
   - Description
   - Price (optional)
   - Product ID
   - Keywords (comma-separated)
   - Product Link
4. Upload video (optional)
5. Upload image (optional)
6. Click "Create Ad"

### Editing an Ad

1. Find ad in the list
2. Click "Edit" button
3. Modify fields
4. Upload new media if needed
5. Click "Update Ad"

### Deleting an Ad

1. Find ad in the list
2. Click "Delete" button
3. Confirm deletion

### Viewing Statistics

1. Click "Statistics" tab
2. View key metrics:
   - Total ads
   - Impressions
   - Clicks
   - CTR
   - Top performing ads
   - Recent activity

## 🎯 Keyword Strategy

Keywords are used for RAG-based ad matching. Best practices:

1. **Relevant Keywords**: Use keywords related to the product
2. **User Intent**: Think about what users might search for
3. **Long-tail Keywords**: Include specific phrases
4. **Avoid Duplicates**: Don't repeat keywords
5. **Limit Keywords**: 3-5 keywords per ad is optimal

### Example Keywords
- Product: "Premium Laptop"
- Keywords: `laptop, computer, technology, work, productivity`

## 📈 Performance Optimization

### For Admins
- Use filters to find ads quickly
- Batch upload multiple ads
- Monitor CTR to optimize keywords
- Remove low-performing ads

### For Users
- Relevant ads improve user experience
- Better keywords = better targeting
- Higher CTR = better ad placement

## 🐛 Troubleshooting

### Issue: Can't login
**Solution**: 
- Verify email and password
- Check if admin credentials are set in .env
- Ensure backend is running

### Issue: Can't upload files
**Solution**:
- Check file size limits
- Verify Cloudinary credentials
- Check file format (video/image)

### Issue: Ads not showing
**Solution**:
- Verify keywords match user queries
- Check if ads are active
- Verify ad display settings

### Issue: CSRF token error
**Solution**:
- Refresh the page
- Clear browser cache
- Ensure X-CSRF-Token header is sent

## 📝 Admin Logs

Admin actions are logged for security:
- Login attempts
- Ad creation/update/deletion
- File uploads
- Settings changes

Access logs in:
- Backend: `backend.log`
- Database: `admin_activity` table (future enhancement)

## 🔄 Maintenance

### Regular Tasks
- Review ad performance weekly
- Remove expired ads
- Update keywords based on trends
- Monitor system health
- Backup database regularly

### Monthly Tasks
- Analyze ad statistics
- Optimize keyword strategy
- Review user feedback
- Update ad content
- Security audit

## 🚀 Deployment

### Production Checklist
- [ ] Change admin credentials
- [ ] Set strong JWT secret
- [ ] Enable HTTPS
- [ ] Configure Cloudinary
- [ ] Set up database backups
- [ ] Enable logging
- [ ] Configure rate limiting
- [ ] Set up monitoring
- [ ] Test all features
- [ ] Document procedures

## 📞 Support

For issues or questions:
1. Check this guide
2. Review error messages
3. Check backend logs
4. Contact system administrator

---

**Version**: 1.0.0
**Last Updated**: 2024
**Status**: Production Ready
