from flask import Blueprint, jsonify, request
from utils import get_current_user_id, get_json_data
import os
import json
import requests

saskat_bp = Blueprint('saskat_bp', __name__)

# Initialize AI clients
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')

@saskat_bp.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    message = data.get('message', '')
    model = data.get('model', 'gpt-4')

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    try:
        # Route to appropriate AI model
        if model == 'gpt-4':
            response = call_openai_api(message, model)
        elif model == 'gemini':
            response = call_gemini_api(message)
        elif model == 'groq':
            response = call_groq_api(message)
        else:
            response = call_gemini_api(message)

        return jsonify({
            'response': response['text'],
            'sources': response.get('sources', []),
            'model': model
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@saskat_bp.route('/api/ai/image/generate', methods=['POST'])
def generate_image():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    prompt = data.get('prompt', '')
    model = data.get('model', 'dall-e-3')

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    try:
        if model == 'dall-e-3':
            images = generate_dalle_image(prompt)
        elif model == 'stable-diffusion':
            images = generate_stable_diffusion_image(prompt)
        else:
            images = generate_dalle_image(prompt)

        return jsonify({'images': images}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@saskat_bp.route('/api/ai/ads/get-contextual-ad', methods=['POST'])
def get_contextual_ad():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    user_context = data.get('userContext', '')

    try:
        # Extract keywords from user context
        keywords = extract_keywords(user_context)
        
        # Fetch relevant ads based on keywords
        ad = fetch_relevant_ad(keywords, user_id)
        
        return jsonify(ad), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@saskat_bp.route('/api/ai/form/fill', methods=['POST'])
def fill_form():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    form_data = data.get('formData', {})
    form_description = data.get('description', '')

    try:
        # Use AI to fill form based on description
        filled_data = ai_fill_form(form_data, form_description)
        
        return jsonify({'filledData': filled_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@saskat_bp.route('/api/ai/product/review', methods=['POST'])
def get_product_review():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    product_id = data.get('productId', '')
    product_name = data.get('productName', '')

    try:
        # Get AI review of product
        review = ai_review_product(product_name, product_id)
        
        return jsonify(review), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Helper functions

def call_openai_api(message, model):
    """Call OpenAI API"""
    try:
        import openai
        openai.api_key = os.environ.get('OPENAI_API_KEY')
        
        response = openai.ChatCompletion.create(
            model=model,
            messages=[{"role": "user", "content": message}],
            temperature=0.7,
            max_tokens=2000
        )
        
        return {
            'text': response.choices[0].message.content,
            'sources': []
        }
    except Exception as e:
        return {'text': f'Error: {str(e)}', 'sources': []}

def call_gemini_api(message):
    """Call Google Gemini API"""
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(message)
        
        return {
            'text': response.text,
            'sources': []
        }
    except Exception as e:
        return {'text': f'Error: {str(e)}', 'sources': []}

def call_groq_api(message):
    """Call Groq API"""
    try:
        headers = {
            'Authorization': f'Bearer {GROQ_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'model': 'mixtral-8x7b-32768',
            'messages': [{'role': 'user', 'content': message}],
            'temperature': 0.7,
            'max_tokens': 2000
        }
        
        response = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers=headers,
            json=payload
        )
        
        data = response.json()
        return {
            'text': data['choices'][0]['message']['content'],
            'sources': []
        }
    except Exception as e:
        return {'text': f'Error: {str(e)}', 'sources': []}

def generate_dalle_image(prompt):
    """Generate image using DALL-E"""
    try:
        import openai
        openai.api_key = os.environ.get('OPENAI_API_KEY')
        
        response = openai.Image.create(
            prompt=prompt,
            n=1,
            size="1024x1024"
        )
        
        return [{'url': img['url']} for img in response['data']]
    except Exception as e:
        return []

def generate_stable_diffusion_image(prompt):
    """Generate image using Stable Diffusion"""
    try:
        # Use Hugging Face API or local model
        headers = {
            'Authorization': f'Bearer {os.environ.get("HUGGINGFACE_API_KEY")}'
        }
        
        response = requests.post(
            'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2',
            headers=headers,
            json={'inputs': prompt}
        )
        
        if response.status_code == 200:
            return [{'url': f'data:image/png;base64,{response.content.hex()}'}]
        return []
    except Exception as e:
        return []

def extract_keywords(text):
    """Extract keywords from text for ad targeting"""
    # Simple keyword extraction - can be enhanced with NLP
    words = text.lower().split()
    # Filter common words
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'}
    keywords = [w for w in words if w not in stop_words and len(w) > 3]
    return keywords[:5]  # Return top 5 keywords

def fetch_relevant_ad(keywords, user_id):
    """Fetch relevant ad based on keywords"""
    # Mock ad data - replace with database query
    ads = [
        {
            'id': 1,
            'title': 'Premium Laptop',
            'description': 'High-performance laptop for professionals',
            'price': 89999,
            'videoUrl': 'https://example.com/ad1.mp4',
            'imageUrl': 'https://example.com/ad1.jpg',
            'productLink': 'https://shopping.example.com/laptop',
            'productId': 'laptop-001',
            'keywords': ['laptop', 'computer', 'technology']
        },
        {
            'id': 2,
            'title': 'Smart Watch',
            'description': 'Track your fitness and stay connected',
            'price': 19999,
            'videoUrl': 'https://example.com/ad2.mp4',
            'imageUrl': 'https://example.com/ad2.jpg',
            'productLink': 'https://shopping.example.com/watch',
            'productId': 'watch-001',
            'keywords': ['watch', 'fitness', 'health']
        }
    ]
    
    # Find matching ad
    for ad in ads:
        if any(keyword in ad['keywords'] for keyword in keywords):
            return ad
    
    # Return random ad if no match
    return ads[0] if ads else {}

def ai_fill_form(form_data, description):
    """Use AI to fill form fields"""
    # This would use AI to intelligently fill form fields
    # based on the form description and user context
    filled_data = {}
    
    for field, value in form_data.items():
        if not value:
            # Use AI to suggest value
            filled_data[field] = f"AI-suggested value for {field}"
        else:
            filled_data[field] = value
    
    return filled_data

def ai_review_product(product_name, product_id):
    """Get AI review of product"""
    return {
        'productId': product_id,
        'productName': product_name,
        'rating': 4.5,
        'review': f'This is an AI-generated review for {product_name}. It offers great value and quality.',
        'pros': ['Good quality', 'Affordable', 'Great features'],
        'cons': ['Limited warranty', 'Slow shipping'],
        'recommendation': 'Highly recommended'
    }
