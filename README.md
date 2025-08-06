# Multilingual Video Workflow

A professional web application for converting videos into multiple Indian languages with AI-powered transcription, translation, voice synthesis, and lip synchronization.

## Features

- 🎬 **Video Processing**: Upload MP4/AVI/MOV files
- 🎙️ **AI Transcription**: OpenAI Whisper for accurate speech-to-text
- 🌍 **Cultural Translation**: Claude AI for Hindi, Tamil, Telugu, Gujarati
- 🗣️ **Voice Synthesis**: ElevenLabs TTS with custom voice cloning
- 💋 **Lip Sync**: Wav2Lip API for natural video synchronization
- ☁️ **Cloud Storage**: Cloudflare R2 for scalable file handling

## Tech Stack

- **Backend**: Python Flask
- **AI APIs**: OpenAI, Claude, ElevenLabs, Wav2Lip
- **Storage**: Cloudflare R2 (S3-compatible)
- **Frontend**: Vanilla JavaScript with professional UI
- **Deployment**: Railway/Render ready

## Deployment on Railway

1. Connect this GitHub repository to Railway
2. Add environment variables in Railway dashboard:

```bash
# Required API Keys
OPENAI_API_KEY=your-openai-key
CLAUDE_API_KEY=your-claude-key  
ELEVENLABS_API_KEY=your-elevenlabs-key
WAV2LIP_API_KEY=your-wav2lip-key

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://your-account-id.r2.cloudflarestorage.com/bucket-name
```

3. Railway will auto-deploy using `railway.toml` configuration

## Usage

1. Upload video file in Step 1
2. Generate transcript using OpenAI Whisper
3. Get cultural translations in 4 Indian languages  
4. Synthesize voice audio with ElevenLabs
5. Create lip-synced videos with Wav2Lip
6. Download final multilingual videos

## Architecture

- **Step-by-step workflow** with resume capability
- **Cloud-first storage** with R2 integration
- **API-driven processing** for scalability
- **Professional UI** with file visualization
- **Error handling** and progress tracking

Built with professional development standards and ready for production deployment.