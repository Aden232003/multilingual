// Talented Multilingual Video Workflow - Modular Interface

class ModularWorkflowApp {
    constructor() {
        this.currentStep = 1;
        this.workflowData = {
            audioFile: null,
            transcript: null,
            translations: {},
            audioFiles: {},
            videoFile: null
        };
        this.activeLanguage = 'hindi';
        this.jobStatus = {};
        
        this.init();
    }
    
    init() {
        this.setupNavigation();
        this.setupFileHandlers();
        this.setupLanguageTabs();
        this.setupActionButtons();
        this.loadExistingFiles();
    }
    
    setupNavigation() {
        const navItems = document.querySelectorAll('.step-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const step = parseInt(item.dataset.step);
                this.navigateToStep(step);
            });
        });
    }
    
    navigateToStep(step) {
        // Update navigation
        document.querySelectorAll('.step-nav-item').forEach(item => {
            item.classList.remove('active');
            if (parseInt(item.dataset.step) === step) {
                item.classList.add('active');
            }
        });
        
        // Update content
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`step-${step}`).classList.add('active');
        
        this.currentStep = step;
        this.updateStepData(step);
    }
    
    setupFileHandlers() {
        // Setup drag and drop for all upload zones
        document.querySelectorAll('.upload-zone').forEach(zone => {
            this.setupDragAndDrop(zone);
        });
        
        // Setup file inputs
        document.querySelectorAll('input[type="file"]').forEach(input => {
            input.addEventListener('change', (e) => this.handleFileSelect(e));
        });
    }
    
    setupDragAndDrop(zone) {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0], zone);
            }
        });
        
        zone.addEventListener('click', () => {
            const input = zone.querySelector('input[type="file"]') || 
                         zone.parentElement.querySelector('input[type="file"]');
            if (input) input.click();
        });
    }
    
    setupLanguageTabs() {
        document.querySelectorAll('.language-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const language = tab.dataset.lang;
                this.switchLanguage(language, tab.parentElement);
            });
        });
    }
    
    switchLanguage(language, tabContainer) {
        // Update active tab
        tabContainer.querySelectorAll('.language-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.lang === language) {
                tab.classList.add('active');
            }
        });
        
        this.activeLanguage = language;
        this.updateLanguageContent(language);
    }
    
    updateLanguageContent(language) {
        // Update translation editor content
        const translationEditor = document.getElementById('translation-editor');
        if (translationEditor && this.workflowData.translations[language]) {
            translationEditor.value = this.workflowData.translations[language];
        }
    }
    
    setupActionButtons() {
        // Step 1 buttons
        document.getElementById('use-existing-btn')?.addEventListener('click', () => {
            this.useExistingFiles();
        });
        
        document.getElementById('proceed-to-step-2')?.addEventListener('click', () => {
            this.navigateToStep(2);
        });
        
        // Step 2 buttons
        document.getElementById('start-transcription')?.addEventListener('click', () => {
            this.startTranscription();
        });
        
        document.getElementById('save-transcript')?.addEventListener('click', () => {
            this.saveTranscript();
        });
        
        document.getElementById('download-transcript')?.addEventListener('click', () => {
            this.downloadFile('transcript', this.workflowData.transcript);
        });
        
        document.getElementById('proceed-to-step-3')?.addEventListener('click', () => {
            this.navigateToStep(3);
        });
        
        // Step 3 buttons
        document.getElementById('start-translation')?.addEventListener('click', () => {
            this.startTranslation();
        });
        
        document.getElementById('save-translations')?.addEventListener('click', () => {
            this.saveTranslations();
        });
        
        document.getElementById('download-translations')?.addEventListener('click', () => {
            this.downloadTranslations();
        });
        
        document.getElementById('proceed-to-step-4')?.addEventListener('click', () => {
            this.navigateToStep(4);
        });
        
        // Step 4 buttons
        document.getElementById('start-voice-synthesis')?.addEventListener('click', () => {
            this.startVoiceSynthesis();
        });
        
        document.getElementById('download-all-audio')?.addEventListener('click', () => {
            this.downloadAllAudio();
        });
        
        document.getElementById('proceed-to-step-5')?.addEventListener('click', () => {
            this.navigateToStep(5);
        });
        
        // Step 5 buttons
        document.getElementById('start-lip-sync')?.addEventListener('click', () => {
            this.startLipSync();
        });
        
        document.getElementById('download-all-videos')?.addEventListener('click', () => {
            this.downloadAllVideos();
        });
        
        document.getElementById('start-new-workflow')?.addEventListener('click', () => {
            this.resetWorkflow();
        });
    }
    
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            const zone = event.target.closest('.file-area')?.querySelector('.upload-zone');
            await this.handleFileUpload(file, zone || event.target.parentElement);
        }
    }
    
    async handleFileUpload(file, zone) {
        const stepId = zone.closest('.step-content')?.id;
        const step = stepId ? parseInt(stepId.split('-')[1]) : this.currentStep;
        
        this.updateProgress(step, 'processing');
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('step', step);
            formData.append('language', this.activeLanguage);
            
            const response = await fetch('/api/upload-step', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.handleUploadSuccess(step, result);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Upload failed: ' + error.message);
        } finally {
            this.updateProgress(step, 'completed');
        }
    }
    
    handleUploadSuccess(step, result) {
        switch (step) {
            case 1:
                this.workflowData.audioFile = result.audioFile;
                this.workflowData.videoFile = result.videoFile;
                this.showStepOutput(1, result);
                break;
            case 2:
                this.workflowData.audioFile = result.audioFile;
                break;
            case 3:
                this.workflowData.transcript = result.transcript;
                break;
            case 4:
                if (result.language) {
                    this.workflowData.audioFiles[result.language] = result.audioFile;
                }
                break;
            case 5:
                if (result.language) {
                    this.workflowData.audioFiles[result.language] = result.audioFile;
                }
                break;
        }
        
        this.markStepCompleted(step);
    }
    
    async useExistingFiles() {
        this.updateProgress(1, 'processing');
        
        try {
            const response = await fetch('/api/check-existing-files');
            const result = await response.json();
            
            if (response.ok) {
                this.workflowData = { ...this.workflowData, ...result };
                this.showStepOutput(1, result);
                this.markStepCompleted(1);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Failed to load existing files: ' + error.message);
        } finally {
            this.updateProgress(1, 'completed');
        }
    }
    
    async startTranscription() {
        if (!this.workflowData.audioFile) {
            this.showError('No audio file available. Please complete Step 1 first.');
            return;
        }
        
        this.updateProgress(2, 'processing');
        
        try {
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioFile: this.workflowData.audioFile })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.workflowData.transcript = result.transcript;
                document.getElementById('transcript-editor').value = result.transcript;
                this.showStepOutput(2, result);
                this.markStepCompleted(2);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Transcription failed: ' + error.message);
        } finally {
            this.updateProgress(2, 'completed');
        }
    }
    
    async saveTranscript() {
        const transcript = document.getElementById('transcript-editor').value;
        this.workflowData.transcript = transcript;
        
        try {
            const response = await fetch('/api/save-transcript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript })
            });
            
            if (response.ok) {
                this.showSuccess('Transcript saved successfully');
            } else {
                const result = await response.json();
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Failed to save transcript: ' + error.message);
        }
    }
    
    async startTranslation() {
        if (!this.workflowData.transcript) {
            this.showError('No transcript available. Please complete Step 2 first.');
            return;
        }
        
        this.updateProgress(3, 'processing');
        
        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: this.workflowData.transcript })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.workflowData.translations = result.translations;
                this.updateLanguageContent(this.activeLanguage);
                this.showStepOutput(3, result);
                this.markStepCompleted(3);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Translation failed: ' + error.message);
        } finally {
            this.updateProgress(3, 'completed');
        }
    }
    
    async saveTranslations() {
        const currentTranslation = document.getElementById('translation-editor').value;
        this.workflowData.translations[this.activeLanguage] = currentTranslation;
        
        try {
            const response = await fetch('/api/save-translations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ translations: this.workflowData.translations })
            });
            
            if (response.ok) {
                this.showSuccess('Translations saved successfully');
            } else {
                const result = await response.json();
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Failed to save translations: ' + error.message);
        }
    }
    
    async startVoiceSynthesis() {
        if (Object.keys(this.workflowData.translations).length === 0) {
            this.showError('No translations available. Please complete Step 3 first.');
            return;
        }
        
        this.updateProgress(4, 'processing');
        
        try {
            const response = await fetch('/api/voice-synthesis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    translations: this.workflowData.translations,
                    externalAudio: this.workflowData.audioFiles 
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.workflowData.audioFiles = { ...this.workflowData.audioFiles, ...result.audioFiles };
                this.showStepOutput(4, result);
                this.markStepCompleted(4);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Voice synthesis failed: ' + error.message);
        } finally {
            this.updateProgress(4, 'completed');
        }
    }
    
    async startLipSync() {
        if (Object.keys(this.workflowData.audioFiles).length === 0) {
            this.showError('No audio files available. Please complete Step 4 first.');
            return;
        }
        
        this.updateProgress(5, 'processing');
        
        try {
            const response = await fetch('/api/lip-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoFile: this.workflowData.videoFile,
                    audioFiles: this.workflowData.audioFiles
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showStepOutput(5, result);
                this.markStepCompleted(5);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('Lip sync failed: ' + error.message);
        } finally {
            this.updateProgress(5, 'completed');
        }
    }
    
    showStepOutput(step, data) {
        const outputArea = document.getElementById(`output-area-${step}`);
        if (outputArea) {
            outputArea.style.display = 'block';
            
            // Update content based on step
            switch (step) {
                case 1:
                    this.displayStep1Output(data);
                    break;
                case 2:
                    this.displayStep2Output(data);
                    break;
                case 3:
                    this.displayStep3Output(data);
                    break;
                case 4:
                    this.updateAudioResults(data.audioFiles);
                    break;
                case 5:
                    this.updateVideoResults(data.results);
                    break;
            }
        }
    }
    
    displayStep1Output(data) {
        const audioInfo = document.getElementById('audio-info');
        if (audioInfo) {
            let content = '<div class="file-display">';
            
            if (data.videoFile) {
                const videoName = data.videoFile.split('/').pop();
                content += `
                    <div class="file-item">
                        <div class="file-icon">🎬</div>
                        <div class="file-details">
                            <h4>Original Video</h4>
                            <p><strong>File:</strong> ${videoName}</p>
                            <p><strong>Duration:</strong> ${data.duration || 'Unknown'}</p>
                        </div>
                    </div>
                `;
            }
            
            if (data.audioFile) {
                const audioName = data.audioFile.split('/').pop();
                content += `
                    <div class="file-item">
                        <div class="file-icon">🎵</div>
                        <div class="file-details">
                            <h4>Extracted Audio</h4>
                            <p><strong>File:</strong> ${audioName}</p>
                            <p><strong>Size:</strong> ${data.audioSize || 'Unknown'}</p>
                            <p><strong>Status:</strong> ✅ Ready for transcription</p>
                        </div>
                    </div>
                `;
            }
            
            content += '</div>';
            audioInfo.innerHTML = content;
        }
    }
    
    displayStep2Output(data) {
        if (data.transcript) {
            const editor = document.getElementById('transcript-editor');
            if (editor) {
                editor.value = data.transcript;
            }
            
            // Add transcript stats
            const words = data.transcript.split(' ').length;
            const chars = data.transcript.length;
            
            // Add stats display if it doesn't exist
            let statsDiv = document.getElementById('transcript-stats');
            if (!statsDiv) {
                statsDiv = document.createElement('div');
                statsDiv.id = 'transcript-stats';
                statsDiv.className = 'file-stats';
                editor.parentNode.insertBefore(statsDiv, editor);
            }
            
            statsDiv.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-number">${words}</span>
                        <span class="stat-label">Words</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${chars}</span>
                        <span class="stat-label">Characters</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">✅</span>
                        <span class="stat-label">Ready</span>
                    </div>
                </div>
            `;
        }
    }
    
    displayStep3Output(data) {
        if (data.translations) {
            const languages = Object.keys(data.translations);
            
            // Add translation overview
            let overviewDiv = document.getElementById('translation-overview');
            if (!overviewDiv) {
                const outputArea = document.getElementById('output-area-3');
                overviewDiv = document.createElement('div');
                overviewDiv.id = 'translation-overview';
                overviewDiv.className = 'translation-overview';
                outputArea.insertBefore(overviewDiv, outputArea.firstChild);
            }
            
            overviewDiv.innerHTML = `
                <h4>📚 Available Translations</h4>
                <div class="translation-grid">
                    ${languages.map(lang => {
                        const text = data.translations[lang];
                        const words = text.split(' ').length;
                        const langNames = {
                            'hindi': 'हिंदी Hindi',
                            'tamil': 'தமிழ் Tamil',
                            'gujarati': 'ગુજરાતી Gujarati',
                            'telugu': 'తెలుగు Telugu'
                        };
                        
                        return `
                            <div class="translation-item ${lang === this.activeLanguage ? 'active' : ''}" 
                                 onclick="app.switchLanguageFromOverview('${lang}')">
                                <div class="lang-flag">${lang === 'hindi' ? '🇮🇳' : lang === 'tamil' ? '🇮🇳' : lang === 'gujarati' ? '🇮🇳' : '🇮🇳'}</div>
                                <div class="lang-info">
                                    <h5>${langNames[lang]}</h5>
                                    <p>${words} words • ✅ Ready</p>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
    }
    
    switchLanguageFromOverview(language) {
        // Find the language tabs container in step 3
        const step3 = document.getElementById('step-3');
        const tabContainer = step3.querySelector('.language-tabs');
        this.switchLanguage(language, tabContainer);
        
        // Update overview active state
        document.querySelectorAll('.translation-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`.translation-item[onclick*="${language}"]`).classList.add('active');
    }
    
    updateAudioResults(audioFiles) {
        const audioResults = document.getElementById('audio-results');
        if (audioResults) {
            audioResults.innerHTML = '';
            Object.entries(audioFiles).forEach(([language, audioFile]) => {
                const card = document.createElement('div');
                card.className = 'result-card';
                card.innerHTML = `
                    <h3>🎵 ${language.toUpperCase()}</h3>
                    <p>Audio file generated</p>
                    <button class="btn-accent" onclick="app.downloadFile('${language}-audio', '${audioFile}')">
                        📥 Download
                    </button>
                `;
                audioResults.appendChild(card);
            });
        }
    }
    
    updateVideoResults(results) {
        const videoResults = document.getElementById('video-results');
        if (videoResults) {
            videoResults.innerHTML = '';
            Object.entries(results).forEach(([language, result]) => {
                const card = document.createElement('div');
                card.className = 'result-card';
                const status = result.status === 'completed' ? '✅ Ready' : '❌ Failed';
                const downloadUrl = result.output_url || '#';
                
                card.innerHTML = `
                    <h3>🎬 ${language.toUpperCase()}</h3>
                    <p>${status}</p>
                    ${result.status === 'completed' ? `
                        <a href="${downloadUrl}" target="_blank" class="btn-accent">
                            📥 Download Video
                        </a>
                    ` : '<p>Processing failed</p>'}
                `;
                videoResults.appendChild(card);
            });
        }
    }
    
    updateProgress(step, status) {
        const progressBar = document.getElementById(`progress-${step}`);
        const statusBadge = document.getElementById(`status-${step}`);
        
        if (progressBar) {
            progressBar.style.display = status === 'processing' ? 'block' : 'none';
            if (status === 'processing') {
                const fill = progressBar.querySelector('.progress-fill');
                fill.style.width = '100%';
            }
        }
        
        if (statusBadge) {
            statusBadge.className = `status-badge ${status}`;
            statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
    }
    
    markStepCompleted(step) {
        const navItem = document.querySelector(`.step-nav-item[data-step="${step}"]`);
        if (navItem) {
            navItem.classList.add('completed');
        }
        this.updateProgress(step, 'completed');
    }
    
    updateStepData(step) {
        // Load existing data for the current step
        switch (step) {
            case 2:
                if (this.workflowData.transcript) {
                    const editor = document.getElementById('transcript-editor');
                    if (editor) editor.value = this.workflowData.transcript;
                }
                break;
            case 3:
                if (this.workflowData.translations[this.activeLanguage]) {
                    this.updateLanguageContent(this.activeLanguage);
                }
                break;
        }
    }
    
    async loadExistingFiles() {
        try {
            const response = await fetch('/api/workflow-status');
            if (response.ok) {
                const data = await response.json();
                this.workflowData = { ...this.workflowData, ...data };
                
                // Update UI based on existing data
                this.displayExistingData(data);
            }
        } catch (error) {
            console.log('No existing workflow data found');
        }
    }
    
    displayExistingData(data) {
        // Step 1: Show video/audio files
        if (data.audioFile || data.videoFile) {
            this.showStepOutput(1, {
                audioFile: data.audioFile,
                videoFile: data.videoFile,
                duration: data.videoDuration || '00:30',
                audioSize: data.audioSize || 'Unknown'
            });
            this.markStepCompleted(1);
        }
        
        // Step 2: Show transcript
        if (data.transcript) {
            const editor = document.getElementById('transcript-editor');
            if (editor) {
                editor.value = data.transcript;
            }
            this.showStepOutput(2, { transcript: data.transcript });
            this.markStepCompleted(2);
        }
        
        // Step 3: Show translations
        if (data.translations && Object.keys(data.translations).length > 0) {
            this.displayTranslations(data.translations);
            this.showStepOutput(3, { translations: data.translations });
            this.markStepCompleted(3);
        }
        
        // Step 4: Show audio files
        if (data.audioFiles && Object.keys(data.audioFiles).length > 0) {
            this.showStepOutput(4, { audioFiles: data.audioFiles });
            this.markStepCompleted(4);
        }
    }
    
    displayTranslations(translations) {
        // Set first available translation in editor
        const firstLang = Object.keys(translations)[0];
        if (firstLang) {
            this.activeLanguage = firstLang;
            const editor = document.getElementById('translation-editor');
            if (editor) {
                editor.value = translations[firstLang];
            }
            
            // Update active tab
            document.querySelectorAll('.language-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.lang === firstLang) {
                    tab.classList.add('active');
                }
            });
        }
    }
    
    getStepFromData(dataKey) {
        const mapping = {
            'audioFile': 1,
            'transcript': 2,
            'translations': 3,
            'audioFiles': 4
        };
        return mapping[dataKey];
    }
    
    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    downloadTranslations() {
        Object.entries(this.workflowData.translations).forEach(([language, content]) => {
            this.downloadFile(`${language}-translation`, content);
        });
    }
    
    downloadAllAudio() {
        // This would typically trigger a server-side zip creation
        console.log('Download all audio files');
    }
    
    downloadAllVideos() {
        // This would typically trigger a server-side zip creation
        console.log('Download all video files');
    }
    
    showError(message) {
        // Simple error display - could be enhanced with a modal or toast
        alert('Error: ' + message);
    }
    
    showSuccess(message) {
        // Simple success display - could be enhanced with a toast
        console.log('Success: ' + message);
    }
    
    resetWorkflow() {
        this.workflowData = {
            audioFile: null,
            transcript: null,
            translations: {},
            audioFiles: {},
            videoFile: null
        };
        
        // Reset UI
        document.querySelectorAll('.step-nav-item').forEach(item => {
            item.classList.remove('completed');
        });
        
        document.querySelectorAll('.step-content .file-area[id^="output-area"]').forEach(area => {
            area.style.display = 'none';
        });
        
        document.querySelectorAll('.status-badge').forEach(badge => {
            badge.className = 'status-badge pending';
            badge.textContent = 'Ready';
        });
        
        // Clear editors
        const editors = document.querySelectorAll('.file-editor');
        editors.forEach(editor => editor.value = '');
        
        this.navigateToStep(1);
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ModularWorkflowApp();
});