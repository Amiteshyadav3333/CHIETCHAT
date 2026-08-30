import React, { useState } from 'react';
import axios from 'axios';
import './AdForm.css';

const AdForm = ({ onSubmit, initialData, adminToken }) => {
    const [formData, setFormData] = useState(initialData || {
        title: '',
        description: '',
        price: '',
        keywords: '',
        productLink: '',
        productId: '',
        videoUrl: '',
        imageUrl: ''
    });
    const [videoFile, setVideoFile] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleFileChange = (e, type) => {
        const file = e.target.files[0];
        if (type === 'video') {
            setVideoFile(file);
        } else {
            setImageFile(file);
        }
    };

    const uploadFile = async (file, type) => {
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        formDataUpload.append('type', type);

        try {
            const response = await axios.post('/api/admin/upload', formDataUpload, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${adminToken}`
                }
            });
            return response.data.url;
        } catch (error) {
            throw new Error(`Failed to upload ${type}`);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setUploading(true);

        try {
            let videoUrl = formData.videoUrl;
            let imageUrl = formData.imageUrl;

            if (videoFile) {
                videoUrl = await uploadFile(videoFile, 'video');
            }

            if (imageFile) {
                imageUrl = await uploadFile(imageFile, 'image');
            }

            const submitData = {
                ...formData,
                videoUrl,
                imageUrl,
                keywords: formData.keywords.split(',').map(k => k.trim()).filter(k => k),
                price: parseFloat(formData.price) || 0
            };

            onSubmit(submitData);
            setFormData({
                title: '',
                description: '',
                price: '',
                keywords: '',
                productLink: '',
                productId: '',
                videoUrl: '',
                imageUrl: ''
            });
            setVideoFile(null);
            setImageFile(null);
        } catch (err) {
            setError(err.message || 'Failed to submit form');
        } finally {
            setUploading(false);
        }
    };

    return (
        <form className="ad-form" onSubmit={handleSubmit}>
            <div className="form-section">
                <h3>Basic Information</h3>
                
                <div className="form-group">
                    <label>Ad Title *</label>
                    <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="Enter ad title"
                        required
                        disabled={uploading}
                    />
                </div>

                <div className="form-group">
                    <label>Description *</label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        placeholder="Enter ad description"
                        rows="4"
                        required
                        disabled={uploading}
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Price (₹)</label>
                        <input
                            type="number"
                            name="price"
                            value={formData.price}
                            onChange={handleInputChange}
                            placeholder="0"
                            min="0"
                            step="0.01"
                            disabled={uploading}
                        />
                    </div>

                    <div className="form-group">
                        <label>Product ID *</label>
                        <input
                            type="text"
                            name="productId"
                            value={formData.productId}
                            onChange={handleInputChange}
                            placeholder="product-001"
                            required
                            disabled={uploading}
                        />
                    </div>
                </div>
            </div>

            <div className="form-section">
                <h3>Media</h3>

                <div className="form-group">
                    <label>Video File</label>
                    <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => handleFileChange(e, 'video')}
                        disabled={uploading}
                    />
                    {videoFile && <p className="file-name">✓ {videoFile.name}</p>}
                    {formData.videoUrl && !videoFile && <p className="file-url">Current: {formData.videoUrl}</p>}
                </div>

                <div className="form-group">
                    <label>Image File</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'image')}
                        disabled={uploading}
                    />
                    {imageFile && <p className="file-name">✓ {imageFile.name}</p>}
                    {formData.imageUrl && !imageFile && <p className="file-url">Current: {formData.imageUrl}</p>}
                </div>
            </div>

            <div className="form-section">
                <h3>Links & Keywords</h3>

                <div className="form-group">
                    <label>Product Link *</label>
                    <input
                        type="url"
                        name="productLink"
                        value={formData.productLink}
                        onChange={handleInputChange}
                        placeholder="https://example.com/product"
                        required
                        disabled={uploading}
                    />
                </div>

                <div className="form-group">
                    <label>Keywords (comma-separated) *</label>
                    <input
                        type="text"
                        name="keywords"
                        value={formData.keywords}
                        onChange={handleInputChange}
                        placeholder="laptop, computer, technology"
                        required
                        disabled={uploading}
                    />
                    <small>These keywords help match ads to user queries</small>
                </div>
            </div>

            {error && (
                <div className="error-message">
                    <span>❌</span>
                    <p>{error}</p>
                </div>
            )}

            <div className="form-actions">
                <button 
                    type="submit" 
                    disabled={uploading}
                    className="submit-btn"
                >
                    {uploading ? 'Uploading...' : initialData ? 'Update Ad' : 'Create Ad'}
                </button>
            </div>
        </form>
    );
};

export default AdForm;
