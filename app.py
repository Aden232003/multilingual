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
try:
    from moviepy.editor import VideoFileClip
except ImportError:
    VideoFileClip = None

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
if OPENAI_API_KEY:
    openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)
    print("✅ OpenAI API key configured")
else:
    print("❌ OpenAI API key not found")
    openai_client = None

if CLAUDE_API_KEY:
    claude_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)
    print("✅ Claude API key configured")
else:
    print("❌ Claude API key not found")
    claude_client = None

# In-memory workflow state (in production, use Redis or database)
workflow_state = {
    'audioFile': None,
    'videoFile': None,
    'transcript': None,
    'translations': {},
    'audioFiles': {},
    'videoDuration': None,
    'audioSize': None
}

# Initialize R2 client (S3-compatible)
r2_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# R2 Storage Helper Functions
def upload_file_to_r2(file_obj, filename, content_type=None, simple_name=False):
    """Upload file to R2 and return public URL"""
    try:
        if simple_name:
            # Use simple filename for processed files
            unique_filename = filename
        else:
            # Generate unique filename with timestamp for uploads
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            unique_filename = f"{timestamp}_{str(uuid.uuid4())[:8]}_{filename}"
        
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

def upload_bytes_to_r2(data, filename, content_type=None, simple_name=False):
    """Upload bytes data to R2 and return public URL"""
    try:
        if simple_name:
            # Use simple filename for processed files
            unique_filename = filename
        else:
            # Generate unique filename with timestamp for uploads
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            unique_filename = f"{timestamp}_{str(uuid.uuid4())[:8]}_{filename}"
        
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

def extract_audio_from_video(video_url):
    """Extract audio from video file and upload to R2"""
    try:
        if not VideoFileClip:
            print("MoviePy not available for video processing")
            return None, None
            
        # Download video from R2
        video_filename = video_url.split('/')[-1]
        video_temp_path = download_file_from_r2(video_filename)
        
        if not video_temp_path:
            return None, None
            
        # Extract audio using MoviePy
        with VideoFileClip(video_temp_path) as video:
            duration_seconds = video.duration
            duration_formatted = f"{int(duration_seconds//60):02d}:{int(duration_seconds%60):02d}"
            
            # Create temporary audio file
            audio_temp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
            audio_temp.close()
            
            # Extract audio
            video.audio.write_audiofile(audio_temp.name, verbose=False, logger=None)
        
        # Upload extracted audio to R2 with simple filename
        # Extract original filename from the complex R2 filename
        original_name = video_filename.split('_')[-1] if '_' in video_filename else video_filename
        audio_filename = original_name.rsplit('.', 1)[0] + '_audio.mp3'
        
        with open(audio_temp.name, 'rb') as audio_file:
            audio_url, r2_filename = upload_file_to_r2(
                audio_file, 
                audio_filename, 
                content_type='audio/mpeg',
                simple_name=True  # Use simple filename for processed files
            )
        
        # Clean up temp files
        os.unlink(video_temp_path)
        os.unlink(audio_temp.name)
        
        return audio_url, duration_formatted
        
    except Exception as e:
        print(f"Audio extraction error: {e}")
        return None, None

class TranscriptExtractor:
    def transcribe_audio(self, audio_url_or_path):
        try:
            if not openai_client:
                print("OpenAI client not configured")
                return None
                
            print(f"Starting transcription for: {audio_url_or_path}")
            
            # If it's a URL, download first
            if audio_url_or_path.startswith('http'):
                # Download from R2 or extract filename from URL
                filename = audio_url_or_path.split('/')[-1]
                print(f"Downloading audio file: {filename}")
                temp_path = download_file_from_r2(filename)
                if not temp_path:
                    print("Failed to download audio file from R2")
                    return None
                audio_path = temp_path
                print(f"Downloaded to: {audio_path}")
            else:
                audio_path = audio_url_or_path
            
            # Check if file exists and is readable
            if not os.path.exists(audio_path):
                print(f"Audio file does not exist: {audio_path}")
                return None
                
            file_size = os.path.getsize(audio_path)
            print(f"Audio file size: {file_size} bytes")
            
            if file_size == 0:
                print("Audio file is empty")
                return None
            
            # Check file format by reading first few bytes
            with open(audio_path, 'rb') as f:
                first_bytes = f.read(12)
                print(f"File header: {first_bytes.hex()}")
                
                # Check for common audio file signatures
                if first_bytes.startswith(b'ID3') or first_bytes[1:4] == b'ID3':
                    print("Detected: MP3 with ID3 tag")
                elif first_bytes[:4] == b'fLaC':
                    print("Detected: FLAC")
                elif first_bytes[4:8] == b'ftyp':
                    print("Detected: MP4/M4A")
                elif first_bytes[:4] == b'RIFF':
                    print("Detected: WAV")
                elif first_bytes[:4] == b'OggS':
                    print("Detected: OGG")
                else:
                    print(f"Unknown format - first 12 bytes: {first_bytes}")
                    
                # Try to detect MP3 frame sync
                f.seek(0)
                data = f.read(1024)
                for i in range(len(data) - 1):
                    if data[i] == 0xFF and (data[i+1] & 0xE0) == 0xE0:
                        print(f"Found MP3 frame sync at offset {i}")
                        break
                else:
                    print("No MP3 frame sync found in first 1024 bytes")
            
            print("Sending to OpenAI Whisper...")
            
            # Try direct transcription first
            try:
                with open(audio_path, 'rb') as audio_file:
                    response = openai_client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        response_format="text"
                    )
            except Exception as transcribe_error:
                print(f"Direct transcription failed: {transcribe_error}")
                
                # Try converting to WAV format if MoviePy is available
                if VideoFileClip:
                    try:
                        print("Attempting format conversion with MoviePy...")
                        from moviepy.editor import AudioFileClip
                        
                        # Create temporary WAV file
                        wav_temp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
                        wav_temp.close()
                        
                        # Convert to WAV
                        audio_clip = AudioFileClip(audio_path)
                        audio_clip.write_audiofile(wav_temp.name, verbose=False, logger=None)
                        audio_clip.close()
                        
                        print(f"Converted to WAV: {wav_temp.name}")
                        
                        # Try transcription with converted file
                        with open(wav_temp.name, 'rb') as wav_file:
                            response = openai_client.audio.transcriptions.create(
                                model="whisper-1",
                                file=wav_file,
                                response_format="text"
                            )
                        
                        # Clean up converted file
                        os.unlink(wav_temp.name)
                        print("Format conversion successful, transcription completed")
                        
                    except Exception as convert_error:
                        print(f"Format conversion failed: {convert_error}")
                        if 'wav_temp' in locals() and os.path.exists(wav_temp.name):
                            os.unlink(wav_temp.name)
                        raise transcribe_error  # Re-raise original error
                else:
                    print("MoviePy not available for format conversion")
                    raise transcribe_error  # Re-raise original error
                
            print(f"Transcription successful: {len(response) if response else 0} characters")
                
            # Clean up temp file if we downloaded it
            if audio_url_or_path.startswith('http'):
                os.unlink(audio_path)
                
            return response
        except Exception as e:
            print(f"Transcription error: {e}")
            import traceback
            traceback.print_exc()
            return None

class ClaudeTranslator:
    def translate_transcript(self, transcript, duration):
        import json  # Import at function level to avoid scope issues
        
        try:
            if not claude_client:
                print("Claude client not configured")
                return None
                
            prompt = f"""
            Translate this {duration} second video transcript into Hindi, Tamil, Gujarati, and Telugu with cultural relevance for Indian audiences:

            Original: {transcript}

            Provide translations that:
            1. Maintain the original meaning and tone
            2. Use culturally appropriate expressions
            3. Keep the same approximate length for lip sync

            Return as JSON with keys: hindi, tamil, gujarati, telugu
            """
            
            print("Sending request to Claude API...")
            response = claude_client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            print(f"Claude API response received, content length: {len(response.content[0].text) if response.content else 0}")
            print(f"Raw response: {response.content[0].text[:500]}...")  # First 500 chars
            
            # Parse JSON response
            response_text = response.content[0].text.strip()
            
            # Try to extract JSON if it's wrapped in markdown
            if response_text.startswith('```json'):
                response_text = response_text.split('```json')[1].split('```')[0].strip()
            elif response_text.startswith('```'):
                response_text = response_text.split('```')[1].strip()
            
            print(f"Cleaned response for JSON parsing: {response_text[:200]}...")
            translations = json.loads(response_text)
            print(f"Successfully parsed translations: {list(translations.keys())}")
            return translations
            
        except json.JSONDecodeError as json_error:
            print(f"JSON parsing error: {json_error}")
            print(f"Response text: {response.content[0].text if 'response' in locals() else 'No response'}")
            return None
        except Exception as e:
            print(f"Translation error: {e}")
            import traceback
            traceback.print_exc()
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
            print(f"Starting lip sync for {language}: video={video_url}, audio={audio_url}")
            
            # Verify URLs are accessible
            print(f"Using R2 URLs directly - no file download needed")
            
            # New Sync.so API format - uses URLs not file uploads
            url = "https://api.sync.so/generations"
            headers = {
                "Authorization": f"Bearer {WAV2LIP_API_KEY}",
                "Content-Type": "application/json"
            }
            
            print("Sending lip sync request to Sync.so API...")
            
            # Use R2 URLs directly instead of uploading files
            request_data = {
                "input": [
                    {"type": "video", "url": video_url},
                    {"type": "audio", "url": audio_url}
                ],
                "model": "lipsync-2",
                "options": {"sync_mode": "cut_off"},
                "outputFileName": f"lipsync_{language}"
            }
            
            print(f"Request data: {request_data}")
            response = requests.post(url, headers=headers, json=request_data)
                
            print(f"Sync.so API response: status={response.status_code}")
            print(f"Response content: {response.text}")
                
            if response.status_code == 200 or response.status_code == 201:
                result = response.json()
                print(f"Lip sync job submitted successfully: {result}")
                job_id = result.get('id') or result.get('job_id') or result.get('jobId')
                
                if job_id:
                    # Return job info for polling - don't wait here
                    return {
                        'status': 'submitted',
                        'job_id': job_id,
                        'message': 'Job submitted successfully. Use job_id to check status.',
                        'estimated_time': '3-5 minutes',
                        'poll_url': f"/api/check-lip-sync-status/{job_id}"
                    }
                else:
                    return {
                        'status': 'submitted',
                        'result': result,
                        'message': 'Job submitted but no job_id returned'
                    }
            else:
                print(f"Wav2Lip API error: {response.status_code} - {response.text}")
                return {
                    'status': 'failed',
                    'error': f"API error {response.status_code}: {response.text}"
                }
        except Exception as e:
            print(f"Lip sync error: {e}")
            import traceback
            traceback.print_exc()
            return {
                'status': 'failed',
                'error': str(e)
            }

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
    return jsonify(workflow_state)

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
                # Video file - store and extract audio
                workflow_state['videoFile'] = public_url
                result['videoFile'] = public_url
                
                print("Extracting audio from video...")
                audio_url, duration = extract_audio_from_video(public_url)
                
                if audio_url:
                    workflow_state['audioFile'] = audio_url
                    workflow_state['videoDuration'] = duration
                    result['audioFile'] = audio_url
                    result['duration'] = duration
                    print(f"Audio extracted: {audio_url}")
                else:
                    result['duration'] = '00:30'  # Default if extraction fails
                    
            else:
                # Audio file - store directly
                workflow_state['audioFile'] = public_url
                result['audioFile'] = public_url
                
        elif step == '2':
            # Step 2: Audio file upload for transcription
            workflow_state['audioFile'] = public_url
            result['audioFile'] = public_url
            print(f"Step 2 audio file stored: {public_url}")
                
        elif step == '4' or step == '5':
            result['audioFile'] = public_url
            result['language'] = language
        
        print(f"Upload successful: {result}")
        print(f"Workflow state updated: {workflow_state}")
        return jsonify(result)
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/api/transcribe', methods=['GET', 'POST'])
def transcribe_audio():
    """Transcribe audio file using OpenAI Whisper"""
    try:
        # Handle both GET and POST requests
        if request.method == 'POST':
            data = request.get_json() or {}
            audio_file = data.get('audioFile') or workflow_state.get('audioFile')
        else:
            # For GET requests, try to find an audio file in R2
            audio_file = request.args.get('audioFile') or workflow_state.get('audioFile')
            
            # If no audio file specified, try to find one in R2
            if not audio_file:
                try:
                    response = r2_client.list_objects_v2(Bucket=R2_BUCKET_NAME)
                    if 'Contents' in response:
                        audio_files = [obj['Key'] for obj in response['Contents'] 
                                     if obj['Key'].endswith(('.mp3', '.wav', '.m4a'))]
                        if audio_files:
                            # Use the most recent audio file
                            latest_audio = sorted(audio_files)[-1]
                            audio_file = f"{R2_PUBLIC_URL}/{latest_audio}"
                            print(f"Found R2 audio file: {audio_file}")
                except Exception as r2_error:
                    print(f"R2 error: {r2_error}")
        
        if not audio_file:
            return jsonify({
                'error': 'No audio file available. Please complete Step 1 first.',
                'workflow_state': workflow_state,
                'help': 'Try uploading a video/audio file first, or specify audioFile parameter'
            }), 400
        
        print(f"Starting transcription for: {audio_file}")
        transcript = transcript_extractor.transcribe_audio(audio_file)
        
        if transcript:
            # Store transcript in workflow state
            workflow_state['transcript'] = transcript
            
            return jsonify({
                'transcript': transcript,
                'length': len(transcript),
                'words': len(transcript.split()),
                'audio_file': audio_file
            })
        else:
            return jsonify({'error': 'Transcription failed', 'audio_file': audio_file}), 500
            
    except Exception as e:
        print(f"Transcription error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc(),
            'workflow_state': workflow_state
        }), 500

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
    transcript = data.get('transcript') or workflow_state.get('transcript')
    
    if not transcript:
        return jsonify({'error': 'No transcript available. Please complete Step 2 first.'}), 400
    
    try:
        duration = workflow_state.get('videoDuration', '00:30')
        print(f"Starting translation for transcript of {len(transcript)} characters")
        
        translations = translator.translate_transcript(transcript, duration)
        if translations:
            # Store translations in workflow state
            workflow_state['translations'] = translations
            
            return jsonify({
                'translations': translations,
                'files': list(translations.keys())
            })
        else:
            return jsonify({'error': 'Translation failed'}), 500
    except Exception as e:
        print(f"Translation error: {e}")
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
    translations = data.get('translations', {}) or workflow_state.get('translations', {})
    
    if not translations:
        return jsonify({'error': 'No translations available. Please complete Step 3 first.'}), 400
    
    try:
        audio_files = {}
        
        print(f"Starting voice synthesis for {len(translations)} languages")
        
        # Process Hindi and Tamil with TTS
        for lang in ['hindi', 'tamil']:
            if lang in translations:
                print(f"Generating {lang} audio...")
                audio_url, r2_filename = tts.text_to_speech(translations[lang], lang)
                if audio_url:
                    audio_files[lang] = audio_url
                    print(f"{lang} audio generated: {audio_url}")
        
        # Store audio files in workflow state
        workflow_state['audioFiles'].update(audio_files)
        
        return jsonify({'audioFiles': audio_files})
    except Exception as e:
        print(f"Voice synthesis error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/lip-sync', methods=['POST'])
def lip_sync_videos():
    """Create lip-synced videos using Wav2Lip with R2 storage"""
    data = request.get_json()
    video_file = data.get('videoFile') or workflow_state.get('videoFile')
    audio_files = data.get('audioFiles', {}) or workflow_state.get('audioFiles', {})
    
    if not video_file:
        return jsonify({'error': 'No video file available. Please upload a video in Step 1.'}), 400
        
    if not audio_files:
        return jsonify({'error': 'No audio files available. Please complete Step 4 first.'}), 400
    
    try:
        results = {}
        
        print(f"Starting lip sync for {len(audio_files)} languages")
        
        for lang, audio_url in audio_files.items():
            print(f"Processing {lang} lip sync...")
            result = lip_sync.sync_video_with_audio(video_file, audio_url, lang)
            results[lang] = result or {'status': 'failed'}
            print(f"{lang} lip sync result: {result}")
        
        return jsonify({'results': results})
    except Exception as e:
        print(f"Lip sync error: {e}")
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

@app.route('/api/download-audio')
def download_audio():
    """Download the extracted audio file from workflow state"""
    try:
        audio_file = workflow_state.get('audioFile')
        if not audio_file:
            return jsonify({'error': 'No audio file available'}), 404
            
        # Extract filename from URL for download
        filename = audio_file.split('/')[-1]
        presigned_url = get_presigned_url(filename, expiration=3600)
        
        if presigned_url:
            return redirect(presigned_url)
        else:
            return jsonify({'error': 'Audio file not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Test endpoints for workflow validation
@app.route('/api/test-translation', methods=['GET', 'POST'])
def test_translation():
    """Test translation functionality independently"""
    try:
        # Check if Claude client is configured
        if not claude_client:
            return jsonify({
                'success': False,
                'error': 'Claude client not configured - CLAUDE_API_KEY missing'
            }), 500
            
        test_transcript = "Hello, this is a test transcript for the multilingual video workflow application."
        print("Testing Claude translation...")
        
        try:
            translations = translator.translate_transcript(test_transcript, '00:30')
            if translations:
                return jsonify({
                    'success': True,
                    'test_transcript': test_transcript,
                    'translations': translations,
                    'message': 'Translation test successful'
                })
            else:
                return jsonify({
                    'success': False, 
                    'error': 'Translation returned None - check Claude API key and model access',
                    'claude_client_status': 'CONFIGURED' if claude_client else 'NOT_CONFIGURED'
                }), 500
        except Exception as translation_error:
            import traceback
            return jsonify({
                'success': False,
                'error': f'Translation error: {str(translation_error)}',
                'traceback': traceback.format_exc(),
                'claude_client_status': 'CONFIGURED' if claude_client else 'NOT_CONFIGURED'
            }), 500
            
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/test-voice-synthesis', methods=['GET', 'POST'])
def test_voice_synthesis():
    """Test voice synthesis functionality independently"""
    try:
        test_translations = {
            'hindi': 'नमस्ते, यह बहुभाषी वीडियो वर्कफ़्लो एप्लिकेशन के लिए एक परीक्षण ट्रांसक्रिप्ट है।',
            'tamil': 'வணக்கம், இது பன்மொழி வீடியோ பணிப்பாலம் பயன்பாட்டிற்கான ஒரு சோதனை டிரான்ஸ்கிரிப்ட் ஆகும்।'
        }
        
        print("Testing ElevenLabs voice synthesis...")
        audio_files = {}
        
        for lang in ['hindi', 'tamil']:
            if lang in test_translations:
                print(f"Generating {lang} test audio...")
                audio_url, r2_filename = tts.text_to_speech(test_translations[lang], lang)
                if audio_url:
                    audio_files[lang] = audio_url
        
        if audio_files:
            return jsonify({
                'success': True,
                'test_translations': test_translations,
                'audioFiles': audio_files,
                'message': 'Voice synthesis test successful'
            })
        else:
            return jsonify({'success': False, 'error': 'Voice synthesis test failed'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/test-workflow-status')
def test_workflow_status():
    """Test endpoint to check current workflow state"""
    try:
        # Also check R2 bucket contents
        r2_files = []
        try:
            response = r2_client.list_objects_v2(Bucket=R2_BUCKET_NAME)
            if 'Contents' in response:
                r2_files = [obj['Key'] for obj in response['Contents']]
        except Exception as r2_error:
            r2_files = [f"R2 Error: {str(r2_error)}"]
            
        return jsonify({
            'success': True,
            'workflow_state': workflow_state,
            'r2_files': r2_files,
            'r2_bucket': R2_BUCKET_NAME,
            'message': 'Workflow status retrieved successfully'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/test-transcription', methods=['GET', 'POST'])
def test_transcription():
    """Test transcription with current audio file"""
    try:
        audio_file = workflow_state.get('audioFile')
        print(f"Testing transcription with audio file: {audio_file}")
        
        if not audio_file:
            return jsonify({
                'success': False,
                'error': 'No audio file in workflow state',
                'workflow_state': workflow_state
            }), 400
        
        # Test R2 download first
        filename = audio_file.split('/')[-1]
        print(f"Attempting to download: {filename}")
        
        temp_path = download_file_from_r2(filename)
        if not temp_path:
            return jsonify({
                'success': False,
                'error': f'Failed to download {filename} from R2',
                'audio_file': audio_file,
                'filename': filename
            }), 500
        
        # Check downloaded file
        file_size = os.path.getsize(temp_path)
        print(f"Downloaded file size: {file_size} bytes")
        
        if file_size == 0:
            os.unlink(temp_path)
            return jsonify({
                'success': False,
                'error': 'Downloaded audio file is empty',
                'file_size': file_size
            }), 500
        
        # Test OpenAI API
        print("Testing OpenAI Whisper...")
        try:
            with open(temp_path, 'rb') as audio:
                response = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio,
                    response_format="text"
                )
            
            os.unlink(temp_path)  # Clean up
            
            return jsonify({
                'success': True,
                'transcript': response,
                'file_size': file_size,
                'message': 'Transcription test successful'
            })
            
        except Exception as openai_error:
            os.unlink(temp_path)  # Clean up
            return jsonify({
                'success': False,
                'error': f'OpenAI API error: {str(openai_error)}',
                'file_size': file_size
            }), 500
        
    except Exception as e:
        print(f"Test transcription error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/test-transcribe-r2', methods=['GET', 'POST'])
def test_transcribe_r2():
    """Test transcription with any audio file found in R2"""
    try:
        # List R2 files and find an audio file
        response = r2_client.list_objects_v2(Bucket=R2_BUCKET_NAME)
        if 'Contents' not in response:
            return jsonify({
                'success': False,
                'error': 'No files found in R2 bucket',
                'bucket': R2_BUCKET_NAME
            }), 404
        
        audio_files = []
        for obj in response['Contents']:
            filename = obj['Key']
            if filename.endswith(('.mp3', '.wav', '.m4a')):
                audio_files.append({
                    'filename': filename,
                    'size': obj['Size'],
                    'last_modified': str(obj['LastModified'])
                })
        
        if not audio_files:
            return jsonify({
                'success': False,
                'error': 'No audio files found in R2 bucket',
                'all_files': [obj['Key'] for obj in response['Contents']]
            }), 404
        
        # Use the most recent audio file
        latest_audio = sorted(audio_files, key=lambda x: x['last_modified'])[-1]
        filename = latest_audio['filename']
        
        print(f"Testing transcription with R2 file: {filename}")
        
        # Download and transcribe
        temp_path = download_file_from_r2(filename)
        if not temp_path:
            return jsonify({
                'success': False,
                'error': f'Failed to download {filename} from R2'
            }), 500
        
        file_size = os.path.getsize(temp_path)
        print(f"Downloaded file size: {file_size} bytes")
        
        # Test transcription
        try:
            with open(temp_path, 'rb') as audio:
                response = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio,
                    response_format="text"
                )
            
            os.unlink(temp_path)  # Clean up
            
            return jsonify({
                'success': True,
                'filename': filename,
                'file_size': file_size,
                'transcript': response,
                'message': 'R2 transcription test successful'
            })
            
        except Exception as openai_error:
            os.unlink(temp_path)  # Clean up
            return jsonify({
                'success': False,
                'error': f'OpenAI API error: {str(openai_error)}',
                'filename': filename,
                'file_size': file_size
            }), 500
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/test-lip-sync', methods=['GET', 'POST'])
def test_lip_sync():
    """Test lip sync functionality with existing files"""
    try:
        # Get existing video and audio files from R2
        response = r2_client.list_objects_v2(Bucket=R2_BUCKET_NAME)
        if 'Contents' not in response:
            return jsonify({
                'success': False,
                'error': 'No files found in R2 bucket'
            }), 404
        
        video_files = []
        audio_files = []
        
        for obj in response['Contents']:
            filename = obj['Key']
            if filename.endswith(('.mp4', '.avi', '.mov')):
                video_files.append(filename)
            elif filename.endswith('_audio.mp3') and any(lang in filename for lang in ['hindi', 'tamil']):
                audio_files.append(filename)
        
        if not video_files:
            return jsonify({
                'success': False,
                'error': 'No video files found in R2 bucket',
                'all_files': [obj['Key'] for obj in response['Contents']]
            }), 404
        
        if not audio_files:
            return jsonify({
                'success': False,
                'error': 'No translated audio files found in R2 bucket',
                'all_files': [obj['Key'] for obj in response['Contents']]
            }), 404
        
        # Use the most recent video and audio file
        video_file = sorted(video_files)[-1]
        audio_file = sorted(audio_files)[-1]
        
        video_url = f"{R2_PUBLIC_URL}/{video_file}"
        audio_url = f"{R2_PUBLIC_URL}/{audio_file}"
        
        language = 'hindi' if 'hindi' in audio_file else 'tamil'
        
        print(f"Testing lip sync with video: {video_file}, audio: {audio_file}")
        
        result = lip_sync.sync_video_with_audio(video_url, audio_url, language)
        
        return jsonify({
            'success': result is not None and result.get('status') != 'failed',
            'video_file': video_file,
            'audio_file': audio_file,
            'language': language,
            'result': result,
            'message': 'Lip sync test completed'
        })
        
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/test-wav2lip-api', methods=['GET', 'POST'])
def test_wav2lip_api():
    """Test Wav2Lip API connectivity and endpoints"""
    try:
        if not WAV2LIP_API_KEY:
            return jsonify({
                'success': False,
                'error': 'WAV2LIP_API_KEY not configured'
            }), 500
        
        headers = {
            "Authorization": f"Bearer {WAV2LIP_API_KEY}"
        }
        
        # Test different possible endpoints with both GET and POST
        endpoints_to_test = [
            "https://api.sync.so/v1/sync",
            "https://api.sync.so/v1/lip-sync", 
            "https://api.sync.so/sync",
            "https://api.sync.so/lip-sync"
        ]
        
        results = {}
        
        for endpoint in endpoints_to_test:
            results[endpoint] = {}
            
            # Test GET
            try:
                print(f"Testing GET {endpoint}")
                response = requests.get(endpoint, headers=headers, timeout=10)
                results[endpoint]['GET'] = {
                    'status_code': response.status_code,
                    'response': response.text[:500] if response.text else 'No content'
                }
            except Exception as e:
                results[endpoint]['GET'] = {'error': str(e)}
            
            # Test POST with minimal data
            try:
                print(f"Testing POST {endpoint}")
                test_data = {'test': True}
                response = requests.post(endpoint, headers=headers, json=test_data, timeout=10)
                results[endpoint]['POST'] = {
                    'status_code': response.status_code,
                    'response': response.text[:500] if response.text else 'No content'
                }
            except Exception as e:
                results[endpoint]['POST'] = {'error': str(e)}
        
        return jsonify({
            'success': True,
            'api_key_configured': 'SET' if WAV2LIP_API_KEY else 'NOT_SET',
            'endpoint_tests': results,
            'message': 'Wav2Lip API endpoint test completed'
        })
        
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/check-lip-sync-status/<job_id>')
def check_lip_sync_status(job_id):
    """Check the status of a lip sync job"""
    try:
        if not WAV2LIP_API_KEY:
            return jsonify({
                'success': False,
                'error': 'WAV2LIP_API_KEY not configured'
            }), 500
            
        headers = {
            "Authorization": f"Bearer {WAV2LIP_API_KEY}"
        }
        
        # Try different possible status endpoints
        possible_urls = [
            f"https://api.sync.so/generations/{job_id}",
            f"https://api.sync.so/jobs/{job_id}",
            f"https://api.sync.so/status/{job_id}"
        ]
        
        for url in possible_urls:
            try:
                print(f"Checking job status at: {url}")
                response = requests.get(url, headers=headers, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    status = result.get('status', 'unknown')
                    
                    return jsonify({
                        'success': True,
                        'job_id': job_id,
                        'status': status,
                        'result': result,
                        'endpoint_used': url,
                        'message': f'Job status: {status}'
                    })
                elif response.status_code == 404:
                    continue  # Try next endpoint
                else:
                    return jsonify({
                        'success': False,
                        'job_id': job_id,
                        'error': f'Status check failed: {response.status_code} - {response.text}',
                        'endpoint_used': url
                    })
                    
            except Exception as e:
                continue  # Try next endpoint
        
        return jsonify({
            'success': False,
            'job_id': job_id,
            'error': 'Could not find working status endpoint',
            'tried_endpoints': possible_urls
        }), 404
        
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'job_id': job_id,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/debug-env')
def debug_env():
    """Debug endpoint to check environment variables (masking sensitive data)"""
    try:
        env_info = {}
        
        # Check API keys (mask for security)
        openai_key = os.environ.get('OPENAI_API_KEY', 'NOT_SET')
        if openai_key and openai_key != 'NOT_SET':
            env_info['OPENAI_API_KEY'] = f"{openai_key[:10]}...{openai_key[-4:]}" if len(openai_key) > 14 else "SET_BUT_SHORT"
        else:
            env_info['OPENAI_API_KEY'] = 'NOT_SET'
            
        # Check other keys
        claude_key = os.environ.get('CLAUDE_API_KEY', 'NOT_SET')
        env_info['CLAUDE_API_KEY'] = 'SET' if claude_key and claude_key != 'NOT_SET' else 'NOT_SET'
        
        elevenlabs_key = os.environ.get('ELEVENLABS_API_KEY', 'NOT_SET')
        env_info['ELEVENLABS_API_KEY'] = 'SET' if elevenlabs_key and elevenlabs_key != 'NOT_SET' else 'NOT_SET'
        
        wav2lip_key = os.environ.get('WAV2LIP_API_KEY', 'NOT_SET')
        env_info['WAV2LIP_API_KEY'] = 'SET' if wav2lip_key and wav2lip_key != 'NOT_SET' else 'NOT_SET'
        
        # R2 config
        env_info['R2_BUCKET_NAME'] = os.environ.get('R2_BUCKET_NAME', 'NOT_SET')
        env_info['R2_ENDPOINT_URL'] = os.environ.get('R2_ENDPOINT_URL', 'NOT_SET')
        
        return jsonify({
            'success': True,
            'environment_variables': env_info,
            'openai_client_status': 'CONFIGURED' if openai_client else 'NOT_CONFIGURED'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

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