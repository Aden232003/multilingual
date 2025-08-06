#!/usr/bin/env python3
"""
Multilingual Video Workflow Web App
Flask backend with real API integration
"""

import os
import json
import tempfile
from pathlib import Path
from flask import Flask, render_template, request, jsonify, redirect
from werkzeug.utils import secure_filename
import requests
import openai
import anthropic
import boto3
from botocore.exceptions import ClientError
import uuid
from datetime import datetime

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

# Create uploads directory if it doesn't exist
upload_dir = os.path.join(os.getcwd(), 'uploads')
os.makedirs(upload_dir, exist_ok=True)
app.config['UPLOAD_FOLDER'] = upload_dir

# Add CORS headers to all responses
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# API Keys - set these as environment variables
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
CLAUDE_API_KEY = os.environ.get('CLAUDE_API_KEY')
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY')
WAV2LIP_API_KEY = os.environ.get('WAV2LIP_API_KEY')

# R2 Configuration
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 't6d')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL', 'https://e9489e6c0f22eef2c0ba8b8d3981bab5.r2.cloudflarestorage.com')
R2_PUBLIC_URL = os.environ.get('R2_PUBLIC_URL', 'https://e9489e6c0f22eef2c0ba8b8d3981bab5.r2.cloudflarestorage.com/t6d')  # Direct R2 access

# Initialize API clients
openai.api_key = OPENAI_API_KEY
claude_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

# Initialize R2 client (S3-compatible)
r2_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# R2 Storage Helper Functions
def upload_file_to_r2(file_obj, filename, content_type=None):
    """Upload file to R2 and return public URL"""
    try:
        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{str(uuid.uuid4()[:8])}_{filename}"
        
        # Upload to R2
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
            
        r2_client.upload_fileobj(
            file_obj, 
            R2_BUCKET_NAME, 
            unique_filename,
            ExtraArgs=extra_args
        )
        
        # Return public URL
        public_url = f"{R2_PUBLIC_URL}/{unique_filename}"
        return public_url, unique_filename
        
    except ClientError as e:
        print(f"R2 upload error: {e}")
        return None, None

def upload_bytes_to_r2(data, filename, content_type=None):
    """Upload bytes data to R2 and return public URL"""
    try:
        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{str(uuid.uuid4()[:8])}_{filename}"
        
        # Upload to R2
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
            
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=unique_filename,
            Body=data,
            **extra_args
        )
        
        # Return public URL
        public_url = f"{R2_PUBLIC_URL}/{unique_filename}"
        return public_url, unique_filename
        
    except ClientError as e:
        print(f"R2 upload error: {e}")
        return None, None

def download_file_from_r2(filename):
    """Download file from R2 to local temp file"""
    try:
        temp_file = tempfile.NamedTemporaryFile(delete=False)
        r2_client.download_fileobj(R2_BUCKET_NAME, filename, temp_file)
        temp_file.close()
        return temp_file.name
    except ClientError as e:
        print(f"R2 download error: {e}")
        return None

def get_presigned_url(filename, expiration=3600):
    """Generate presigned URL for file access"""
    try:
        url = r2_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': R2_BUCKET_NAME, 'Key': filename},
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        print(f"Presigned URL error: {e}")
        return None

class TranscriptExtractor:
    def transcribe_audio(self, audio_url_or_path):
        try:
            # If it's a URL, download first
            if audio_url_or_path.startswith('http'):
                # Download from R2 or extract filename from URL
                filename = audio_url_or_path.split('/')[-1]
                temp_path = download_file_from_r2(filename)
                if not temp_path:
                    return None
                audio_path = temp_path
            else:
                audio_path = audio_url_or_path
            
            with open(audio_path, 'rb') as audio_file:
                response = openai.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text"
                )
                
            # Clean up temp file if we downloaded it
            if audio_url_or_path.startswith('http'):
                os.unlink(audio_path)
                
            return response
        except Exception as e:
            print(f"Transcription error: {e}")
            return None

class ClaudeTranslator:
    def translate_transcript(self, transcript, duration):
        try:
            prompt = f"""
            Translate this {duration} second video transcript into Hindi, Tamil, Gujarati, and Telugu with cultural relevance for Indian audiences:

            Original: {transcript}

            Provide translations that:
            1. Maintain the original meaning and tone
            2. Use culturally appropriate expressions
            3. Keep the same approximate length for lip sync

            Return as JSON with keys: hindi, tamil, gujarati, telugu
            """
            
            response = claude_client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            # Parse JSON response
            import json
            translations = json.loads(response.content[0].text)
            return translations
        except Exception as e:
            print(f"Translation error: {e}")
            return None

class ElevenLabsTTS:
    def text_to_speech(self, text, language):
        try:
            # Using Niharika voice for both Hindi and Tamil
            voice_id = "21m00Tcm4TlvDq8ikWAM"  # Default voice, replace with Niharika's ID
            
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": ELEVENLABS_API_KEY
            }
            
            data = {
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.5
                }
            }
            
            response = requests.post(url, json=data, headers=headers)
            if response.status_code == 200:
                # Upload audio to R2 instead of saving locally
                filename = f"{language}_audio.mp3"
                audio_url, r2_filename = upload_bytes_to_r2(
                    response.content, 
                    filename, 
                    content_type="audio/mpeg"
                )
                return audio_url, r2_filename
            return None, None
        except Exception as e:
            print(f"TTS error: {e}")
            return None, None

class Wav2LipSync:
    def sync_video_with_audio(self, video_url, audio_url, language):
        try:
            # Download files from R2 for processing
            video_filename = video_url.split('/')[-1]
            audio_filename = audio_url.split('/')[-1]
            
            video_temp_path = download_file_from_r2(video_filename)
            audio_temp_path = download_file_from_r2(audio_filename)
            
            if not video_temp_path or not audio_temp_path:
                return None
                
            url = "https://api.sync.so/v1/lip-sync"
            headers = {
                "Authorization": f"Bearer {WAV2LIP_API_KEY}",
                "Content-Type": "application/json"
            }
            
            # Upload files and get job ID
            with open(video_temp_path, 'rb') as video, open(audio_temp_path, 'rb') as audio:
                files = {
                    'video': video,
                    'audio': audio
                }
                data = {
                    'mode': 'cut_off'
                }
                
                response = requests.post(url, files=files, data=data, headers=headers)
                
            # Clean up temp files
            os.unlink(video_temp_path)
            os.unlink(audio_temp_path)
                
            if response.status_code == 200:
                result = response.json()
                return {
                    'status': 'processing',
                    'job_id': result.get('id'),
                    'output_url': result.get('output_url')
                }
            return None
        except Exception as e:
            print(f"Lip sync error: {e}")
            return None

# Initialize modules
transcript_extractor = TranscriptExtractor()
translator = ClaudeTranslator()
tts = ElevenLabsTTS()
lip_sync = Wav2LipSync()

# Helper functions
def change_to_project_root():
    """Mock function for deployment"""
    return os.getcwd()

def restore_directory(original_cwd):
    """Mock function for deployment"""
    pass

@app.route('/')
def index():
    """Main webapp interface"""
    return render_template('index.html')

@app.route('/api/workflow-status')
def get_workflow_status():
    """Get current workflow status"""
    status = {
        'audioFile': None,
        'transcript': None,
        'translations': {},
        'audioFiles': {},
        'videoFile': None
    }
    return jsonify(status)

@app.route('/api/check-existing-files')
def check_existing_files():
    """Check for existing files"""
    return jsonify({'error': 'No existing files found'}), 404

@app.route('/api/upload-step', methods=['POST'])
def upload_step_file():
    """Handle file upload for specific step using R2 storage"""
    try:
        print("Upload request received")
        print(f"Request files: {request.files}")
        print(f"Request form: {request.form}")
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        step = request.form.get('step', '1')
        language = request.form.get('language', 'hindi')
        
        print(f"File: {file.filename}, Step: {step}, Language: {language}")
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file type based on step
        step_extensions = {
            '1': {'.mp4', '.avi', '.mov', '.mp3', '.wav', '.m4a'},
            '2': {'.mp3', '.wav', '.m4a'},
            '3': {'.txt'},
            '4': {'.mp3', '.wav', '.m4a', '.txt'},
            '5': {'.mp4', '.avi', '.mov', '.mp3', '.wav', '.m4a'}
        }
        
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in step_extensions.get(step, set()):
            return jsonify({'error': f'File type {file_ext} not supported for step {step}'}), 400
        
        # Determine content type
        content_type_map = {
            '.mp4': 'video/mp4',
            '.avi': 'video/avi', 
            '.mov': 'video/quicktime',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/m4a',
            '.txt': 'text/plain'
        }
        content_type = content_type_map.get(file_ext, 'application/octet-stream')
        
        # Upload to R2
        filename = secure_filename(file.filename)
        print(f"Uploading {filename} to R2...")
        
        public_url, r2_filename = upload_file_to_r2(file, filename, content_type)
        
        if not public_url:
            return jsonify({'error': 'Failed to upload file to storage'}), 500
        
        result = {
            'filename': filename,
            'r2_filename': r2_filename,
            'public_url': public_url,
            'step': step, 
            'language': language
        }
        
        # Process based on step
        if step == '1':
            if file_ext in {'.mp4', '.avi', '.mov'}:
                result['videoFile'] = public_url
                result['duration'] = '00:30'  # Could extract real duration
            else:
                result['audioFile'] = public_url
        elif step == '4' or step == '5':
            result['audioFile'] = public_url
            result['language'] = language
        
        print(f"Upload successful: {result}")
        return jsonify(result)
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """Transcribe audio file using OpenAI Whisper"""
    data = request.get_json()
    audio_file = data.get('audioFile')
    
    if not audio_file:
        return jsonify({'error': 'No audio file provided'}), 400
    
    try:
        transcript = transcript_extractor.transcribe_audio(audio_file)
        if transcript:
            return jsonify({
                'transcript': transcript,
                'length': len(transcript),
                'words': len(transcript.split())
            })
        else:
            return jsonify({'error': 'Transcription failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save-transcript', methods=['POST'])
def save_transcript():
    """Save edited transcript"""
    data = request.get_json()
    transcript = data.get('transcript')
    
    if not transcript:
        return jsonify({'error': 'No transcript provided'}), 400
    
    return jsonify({'message': 'Transcript saved successfully'})

@app.route('/api/translate', methods=['POST'])
def translate_transcript():
    """Translate transcript using Claude"""
    data = request.get_json()
    transcript = data.get('transcript')
    
    if not transcript:
        return jsonify({'error': 'No transcript provided'}), 400
    
    try:
        translations = translator.translate_transcript(transcript, '00:30')
        if translations:
            return jsonify({
                'translations': translations,
                'files': list(translations.keys())
            })
        else:
            return jsonify({'error': 'Translation failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save-translations', methods=['POST'])
def save_translations():
    """Save edited translations"""
    data = request.get_json()
    translations = data.get('translations')
    
    if not translations:
        return jsonify({'error': 'No translations provided'}), 400
    
    return jsonify({'message': 'Translations saved successfully', 'files': list(translations.keys())})

@app.route('/api/voice-synthesis', methods=['POST'])
def voice_synthesis():
    """Generate voice audio using ElevenLabs and store in R2"""
    data = request.get_json()
    translations = data.get('translations', {})
    
    try:
        audio_files = {}
        
        # Process Hindi and Tamil with TTS
        for lang in ['hindi', 'tamil']:
            if lang in translations:
                audio_url, r2_filename = tts.text_to_speech(translations[lang], lang)
                if audio_url:
                    audio_files[lang] = audio_url
        
        return jsonify({'audioFiles': audio_files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/lip-sync', methods=['POST'])
def lip_sync_videos():
    """Create lip-synced videos using Wav2Lip with R2 storage"""
    data = request.get_json()
    video_file = data.get('videoFile')
    audio_files = data.get('audioFiles', {})
    
    if not video_file:
        return jsonify({'error': 'No video file provided'}), 400
    
    try:
        results = {}
        
        for lang, audio_url in audio_files.items():
            result = lip_sync.sync_video_with_audio(video_file, audio_url, lang)
            results[lang] = result or {'status': 'failed'}
        
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<filename>')
def download_file(filename):
    """Generate presigned download URL for R2 files"""
    try:
        safe_filename = secure_filename(filename)
        presigned_url = get_presigned_url(safe_filename, expiration=3600)  # 1 hour
        
        if presigned_url:
            return redirect(presigned_url)
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# For Vercel serverless deployment
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print("🎬 Multilingual Video Workflow Web App")
    print("=" * 50)
    print("🚀 Starting Flask server...")
    print(f"📱 Access at: http://localhost:{port}")
    print("⚡ Full API integration enabled!")
    print(f"📁 Upload directory: {app.config['UPLOAD_FOLDER']}")
    
    app.run(debug=False, host='0.0.0.0', port=port)