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
        this.initTheme();
        this.setupNavigation();
        this.setupMobileStepper();
        this.setupFileHandlers();
        this.setupLanguageTabs();
        this.setupActionButtons();
        this.loadExistingFiles();
        this.setupSidebar();
        this.setupGlobalLoader();
        this.setupToasts();
        this.enhanceThemeToggleA11y();
        this.setupButtonRipples();
    }

    setupButtonRipples() {
        document.addEventListener('pointerdown', (e) => {
            const btn = e.target.closest('.btn-primary, .btn-secondary, .btn-accent');
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            btn.style.setProperty('--x', x + '%');
            btn.style.setProperty('--y', y + '%');
        }, { passive: true });
    }

    initTheme() {
        try {
            const root = document.documentElement;
            const stored = localStorage.getItem('theme');
            const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const theme = stored || (systemPrefersDark ? 'dark' : 'light');
            root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
            const toggle = document.getElementById('theme-toggle');
            if (toggle) {
                toggle.addEventListener('click', () => {
                    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
                    const next = current === 'dark' ? 'light' : 'dark';
                    root.setAttribute('data-theme', next);
                    localStorage.setItem('theme', next);
                    // Update ARIA state for switch
                    toggle.setAttribute('aria-checked', String(next === 'dark'));
                    // Swap icon
                    const icon = toggle.querySelector('i');
                    if (icon) icon.className = next === 'dark' ? 'ti ti-moon' : 'ti ti-sun';
                });
                // Initialize ARIA and icon
                toggle.setAttribute('aria-checked', String(theme === 'dark'));
                const icon = toggle.querySelector('i');
                if (icon) icon.className = theme === 'dark' ? 'ti ti-moon' : 'ti ti-sun';
            }
        } catch (e) {
            // Fail silently for theme init
        }
    }

    enhanceThemeToggleA11y() {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;
        toggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle.click();
            }
        });
    }
    
    setupNavigation() {
        const navItems = document.querySelectorAll('.step-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const step = parseInt(item.dataset.step);
                this.navigateToStep(step);
            });
            // Keyboard navigation
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const step = parseInt(item.dataset.step);
                    this.navigateToStep(step);
                }
            });
        });
    }

    setupMobileStepper() {
        const stepper = document.getElementById('mobile-stepper');
        if (!stepper) return;
        const dots = stepper.querySelectorAll('.step-dot');
        dots.forEach(dot => {
            dot.addEventListener('click', () => {
                const step = parseInt(dot.dataset.step);
                this.navigateToStep(step);
            });
        });
    }

    setupSidebar() {
        const stepsToggle = document.getElementById('steps-toggle');
        const sidebarClose = document.getElementById('sidebar-close');
        const backdrop = document.getElementById('backdrop');
        const body = document.body;
        const toggle = (open) => {
            const isOpen = open ?? !body.classList.contains('sidebar-open');
            body.classList.toggle('sidebar-open', isOpen);
            if (stepsToggle) stepsToggle.setAttribute('aria-expanded', String(isOpen));
            if (backdrop) backdrop.hidden = !isOpen;
        };
        stepsToggle?.addEventListener('click', () => toggle());
        sidebarClose?.addEventListener('click', () => toggle(false));
        backdrop?.addEventListener('click', () => toggle(false));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
        document.querySelectorAll('.step-nav-item').forEach(item => {
            item.addEventListener('click', () => toggle(false));
        });
    }

    setupGlobalLoader() {
        this.loader = {
            el: document.getElementById('global-loader'),
            msg: document.getElementById('loader-message'),
            sub: document.getElementById('loader-subtext'),
            show: (message, subtext) => {
                if (!this.loader.el) return;
                if (message) this.loader.msg.textContent = message;
                if (subtext) this.loader.sub.textContent = subtext;
                this.loader.el.hidden = false;
            },
            hide: () => {
                if (!this.loader.el) return;
                this.loader.el.hidden = true;
            }
        };
    }

    setupToasts() {
        this.toastContainer = document.getElementById('toast-container');
        this.toast = (message, type = 'info') => {
            if (!this.toastContainer) return;
            const el = document.createElement('div');
            el.className = `toast ${type}`;
            const icon = type === 'success' ? 'ti ti-check' : type === 'error' ? 'ti ti-alert-triangle' : 'ti ti-info-circle';
            el.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
            this.toastContainer.appendChild(el);
            setTimeout(() => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(8px)';
                setTimeout(() => el.remove(), 200);
            }, 3500);
        };
    }
    
    navigateToStep(step) {
        // Update navigation
        document.querySelectorAll('.step-nav-item').forEach(item => {
            item.classList.remove('active');
            if (parseInt(item.dataset.step) === step) {
                item.classList.add('active');
                item.setAttribute('aria-current', 'step');
            } else {
                item.removeAttribute('aria-current');
            }
        });
        
        // Update content
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`step-${step}`).classList.add('active');
        
        this.currentStep = step;
        this.updateMobileStepperActive(step);
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
        document.querySelectorAll('.language-tab').forEach((tab, index, tabs) => {
            // Add keyboard navigation
            tab.setAttribute('role', 'tab');
            tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
            
            tab.addEventListener('click', (e) => {
                const language = tab.dataset.lang;
                const tabContainer = tab.closest('.language-tabs') || tab.parentElement;
                
                // Handle different tab contexts
                if (tabContainer.closest('#step-4')) {
                    this.switchExternalVoiceLanguage(language, tabContainer);
                } else {
                    this.switchLanguage(language, tabContainer);
                }
            });
            
            // Keyboard navigation
            tab.addEventListener('keydown', (e) => {
                let newIndex = index;
                
                switch (e.key) {
                    case 'ArrowLeft':
                    case 'ArrowUp':
                        e.preventDefault();
                        newIndex = index > 0 ? index - 1 : tabs.length - 1;
                        break;
                    case 'ArrowRight':
                    case 'ArrowDown':
                        e.preventDefault();
                        newIndex = index < tabs.length - 1 ? index + 1 : 0;
                        break;
                    case 'Home':
                        e.preventDefault();
                        newIndex = 0;
                        break;
                    case 'End':
                        e.preventDefault();
                        newIndex = tabs.length - 1;
                        break;
                    case 'Enter':
                    case ' ':
                        e.preventDefault();
                        tab.click();
                        return;
                    default:
                        return;
                }
                
                tabs[newIndex].focus();
                tabs[newIndex].click();
            });
        });
    }
    
    switchLanguage(language, tabContainer) {
        // Update active tab
        tabContainer.querySelectorAll('.language-tab').forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
            tab.setAttribute('tabindex', '-1');
            if (tab.dataset.lang === language) {
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                tab.setAttribute('tabindex', '0');
            }
        });
        
        this.activeLanguage = language;
        this.updateLanguageContent(language);
        
        // Announce language change to screen readers
        this.announceToScreenReader(`Switched to ${language} language tab`);
    }
    
    switchExternalVoiceLanguage(language, tabContainer) {
        // Update active tab for external voice uploads
        tabContainer.querySelectorAll('.language-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.lang === language) {
                tab.classList.add('active');
            }
        });
        
        // Show/hide corresponding upload sections
        const uploadSections = tabContainer.nextElementSibling?.querySelectorAll('.upload-section');
        if (uploadSections) {
            uploadSections.forEach(section => {
                section.style.display = 'none';
            });
            
            const targetSection = document.getElementById(`${language}-upload-section`);
            if (targetSection) {
                targetSection.style.display = 'block';
            }
        }
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
        
        // Step 4 buttons - AI voice synthesis
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
        
        // Setup external voice upload listeners
        this.setupExternalVoiceUploads();
    }
    
    setupExternalVoiceUploads() {
        // Gujarati audio upload
        const gujaratiInput = document.getElementById('gujarati-audio-input');
        const gujaratiUpload = document.getElementById('gujarati-audio-upload');
        if (gujaratiInput && gujaratiUpload) {
            gujaratiInput.addEventListener('change', (e) => {
                this.handleExternalVoiceUpload(e, 'gujarati');
            });
        }
        
        // Telugu audio upload
        const teluguInput = document.getElementById('telugu-audio-input');
        const teluguUpload = document.getElementById('telugu-audio-upload');
        if (teluguInput && teluguUpload) {
            teluguInput.addEventListener('change', (e) => {
                this.handleExternalVoiceUpload(e, 'telugu');
            });
        }
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
        this.loader?.show('Uploading file…', 'We are processing your media.');
        
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
            this.loader?.hide();
        }
    }
    
    async handleExternalVoiceUpload(event, language) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.updateProgress(4, 'processing');
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('step', '4');
            formData.append('language', language);
            formData.append('external', 'true');
            
            const response = await fetch('/api/upload-external-voice', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.workflowData.audioFiles[language] = result.audioFile;
                this.showExternalVoicePreview(language, file.name);
                this.markStepCompleted(4);
                
                // Show success message
                this.showSuccess(`${language.charAt(0).toUpperCase() + language.slice(1)} voice file uploaded successfully!`);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('External voice upload failed: ' + error.message);
        } finally {
            this.updateProgress(4, 'completed');
        }
    }
    
    showExternalVoicePreview(language, filename) {
        const preview = document.getElementById(`${language}-preview`);
        const uploadZone = document.getElementById(`${language}-audio-upload`);
        
        if (preview) {
            document.getElementById(`${language}-filename`).textContent = filename;
            preview.style.display = 'block';
            uploadZone.style.display = 'none';
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
        this.loader?.show('Transcribing audio…', 'Using OpenAI Whisper for accurate speech-to-text.');
        
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
            this.loader?.hide();
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
        this.loader?.show('Translating culturally…', 'Adapting for Hindi, Tamil, Telugu, Gujarati with Claude.');
        
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
            this.loader?.hide();
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
        this.loader?.show('Generating AI voices…', 'Creating natural voices via ElevenLabs (Hindi & Tamil).');
        
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
            this.loader?.hide();
        }
    }
    
    async startLipSync() {
        if (Object.keys(this.workflowData.audioFiles).length === 0) {
            this.showError('No audio files available. Please complete Step 4 first.');
            return;
        }
        
        this.updateProgress(5, 'processing');
        this.showLipSyncProgress('Submitting lip sync jobs...');
        this.loader?.show('Creating lip-synced videos…', 'This takes ~3–5 minutes per language.');
        
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
                // Store job IDs and start polling
                this.jobStatus = result.results || {};
                this.showLipSyncProgress('Jobs submitted successfully! Processing videos (3-5 minutes)...');
                this.startJobPolling();
            } else {
                this.showError(result.error);
                this.updateProgress(5, 'failed');
            }
        } catch (error) {
            this.showError('Lip sync failed: ' + error.message);
            this.updateProgress(5, 'failed');
        } finally {
            this.loader?.hide();
        }
    }

    showLipSyncProgress(message) {
        const videoResults = document.getElementById('video-results');
        if (videoResults) {
            videoResults.innerHTML = `
                <div class="processing-status">
                    <div class="spinner ti ti-loader-2 ti-spin" aria-hidden="true"></div>
                    <h3>${message}</h3>
                    <p>Please be patient, this process takes 3-5 minutes per language.</p>
                    <p>Status updates every 30 seconds...</p>
                </div>
            `;
        }
        
        // Show output area
        const outputArea = document.getElementById('output-area-5');
        if (outputArea) {
            outputArea.style.display = 'block';
        }
    }

    startJobPolling() {
        // Clear any existing polling
        this.stopJobPolling();
        
        // Start polling every 30 seconds
        this.pollingInterval = setInterval(() => {
            this.checkJobStatus();
        }, 30000);
        
        // Check immediately
        this.checkJobStatus();
    }

    async checkJobStatus() {
        let allCompleted = true;
        let anyProcessing = false;
        const updatedResults = {};

        for (const [language, jobInfo] of Object.entries(this.jobStatus)) {
            if (jobInfo.job_id && (jobInfo.status === 'submitted' || jobInfo.status === 'processing')) {
                try {
                    const response = await fetch(`/api/check-lip-sync-status/${jobInfo.job_id}`);
                    const result = await response.json();
                    
                    if (response.ok && result.success) {
                        const status = result.result?.status || result.status || 'processing';
                        const outputUrl = result.result?.outputUrl || result.result?.output_url || result.result?.download_url;
                        updatedResults[language] = {
                            ...jobInfo,
                            status: status.toLowerCase(), // Convert COMPLETED to completed
                            output_url: outputUrl,
                            progress: result.result?.progress || 'processing'
                        };
                        
                        if (status.toLowerCase() !== 'completed') {
                            allCompleted = false;
                            if (status.toLowerCase() === 'processing') {
                                anyProcessing = true;
                            }
                        }
                    } else {
                        // Keep current status if API call fails
                        updatedResults[language] = jobInfo;
                        allCompleted = false;
                        anyProcessing = true;
                    }
                } catch (error) {
                    console.log(`Error checking ${language} job:`, error);
                    updatedResults[language] = jobInfo;
                    allCompleted = false;
                    anyProcessing = true;
                }
            } else {
                updatedResults[language] = jobInfo;
                if (jobInfo.status !== 'completed') {
                    allCompleted = false;
                }
            }
        }

        // Update job status
        this.jobStatus = updatedResults;
        
        // Update UI with live status
        this.updateVideoResultsWithPolling(updatedResults);
        
        // Stop polling if all jobs are complete
        if (allCompleted) {
            this.stopJobPolling();
            this.updateProgress(5, 'completed');
            this.markStepCompleted(5);
        } else if (anyProcessing) {
            this.updateProgress(5, 'processing');
        }
    }

    stopJobPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
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
                        <div class="file-icon"><i class="ti ti-video" aria-hidden="true"></i></div>
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
                        <div class="file-icon"><i class="ti ti-music" aria-hidden="true"></i></div>
                        <div class="file-details">
                            <h4>Extracted Audio</h4>
                            <p><strong>File:</strong> ${audioName}</p>
                            <p><strong>Size:</strong> ${data.audioSize || 'Unknown'}</p>
                            <p><strong>Status:</strong> <i class="ti ti-check" aria-hidden="true"></i> Ready for transcription</p>
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
                        <span class="stat-number"><i class="ti ti-check" aria-hidden="true"></i></span>
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
                <h4><i class="ti ti-books" aria-hidden="true"></i> Available Translations</h4>
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
                                <div class="lang-flag"><i class="ti ti-language" aria-hidden="true"></i></div>
                                <div class="lang-info">
                                    <h5>${langNames[lang]}</h5>
                                    <p>${words} words • <i class="ti ti-check" aria-hidden="true"></i> Ready</p>
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
                    <h3><i class="ti ti-music" aria-hidden="true"></i> ${language.toUpperCase()}</h3>
                    <p>Audio file generated</p>
                    <button class="btn-accent" onclick="app.downloadFile('${language}-audio', '${audioFile}')">
                        <i class="ti ti-download" aria-hidden="true"></i> Download
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
                const status = result.status === 'completed' ? 'Ready' : 'Failed';
                const downloadUrl = result.output_url || '#';
                
                card.innerHTML = `
                    <h3><i class="ti ti-clapperboard"></i> ${language.toUpperCase()}</h3>
                    <p>${status === 'Ready' ? '<i class=\"ti ti-check\"></i> Ready' : '<i class=\"ti ti-x\"></i> Failed'}</p>
                    ${result.status === 'completed' ? `
                        <a href="${downloadUrl}" target="_blank" class="btn-accent">
                            <i class="ti ti-download"></i> Download Video
                        </a>
                    ` : '<p>Processing failed</p>'}
                `;
                videoResults.appendChild(card);
            });
        }
    }

    updateVideoResultsWithPolling(results) {
        const videoResults = document.getElementById('video-results');
        if (videoResults) {
            videoResults.innerHTML = '';
            
            Object.entries(results).forEach(([language, result]) => {
                const card = document.createElement('div');
                card.className = 'result-card';
                
                let statusIcon = '<i class="ti ti-loader-2 ti-spin"></i>';
                let statusText = 'Processing...';
                let statusClass = 'processing';
                let actionContent = '<div class="processing-spinner"></div>';
                
                if (result.status === 'completed') {
                    statusIcon = '<i class="ti ti-check"></i>';
                    statusText = 'Ready';
                    statusClass = 'completed';
                    const downloadUrl = result.output_url || '#';
                    actionContent = `
                        <a href="${downloadUrl}" target="_blank" class="btn-accent">
                            <i class="ti ti-download"></i> Download Video
                        </a>
                    `;
                } else if (result.status === 'failed') {
                    statusIcon = '<i class="ti ti-x"></i>';
                    statusText = 'Failed';
                    statusClass = 'failed';
                    actionContent = '<p>Processing failed</p>';
                } else if (result.status === 'submitted') {
                    statusIcon = '<i class="ti ti-clock"></i>';
                    statusText = 'Queued';
                    statusClass = 'queued';
                    actionContent = '<p>Job submitted, waiting to start...</p>';
                } else {
                    statusIcon = '<i class="ti ti-loader-2 ti-spin"></i>';
                    statusText = 'Processing';
                    statusClass = 'processing';
                    actionContent = '<p>Creating lip-synced video...</p>';
                }
                
                card.innerHTML = `
                    <h3>${statusIcon} ${language.toUpperCase()}</h3>
                    <p class="status-text ${statusClass}">${statusText}</p>
                    <div class="job-info">
                        <small>Job ID: ${result.job_id || 'N/A'}</small>
                    </div>
                    ${actionContent}
                `;
                videoResults.appendChild(card);
            });
            
            // Add overall status message
            const processingCount = Object.values(results).filter(r => 
                r.status === 'processing' || r.status === 'submitted'
            ).length;
            
            if (processingCount > 0) {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'overall-status';
                statusDiv.innerHTML = `
                    <p><i class="ti ti-clock" aria-hidden="true"></i> ${processingCount} job(s) still processing. Next update in 30 seconds...</p>
                `;
                videoResults.appendChild(statusDiv);
            }
        }
    }
    
    updateProgress(step, status) {
        const progressBar = document.getElementById(`progress-${step}`);
        const statusBadge = document.getElementById(`status-${step}`);
        const stepEl = document.getElementById(`step-${step}`);
        
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

        // Disable/enable buttons within the current step for better feedback
        if (stepEl) {
            const buttons = stepEl.querySelectorAll('button');
            buttons.forEach(btn => {
                if (status === 'processing') {
                    btn.setAttribute('disabled', 'true');
                    btn.setAttribute('aria-busy', 'true');
                } else {
                    btn.removeAttribute('disabled');
                    btn.removeAttribute('aria-busy');
                }
            });
        }
    }
    
    markStepCompleted(step) {
        const navItem = document.querySelector(`.step-nav-item[data-step="${step}"]`);
        if (navItem) {
            navItem.classList.add('completed');
        }
        this.updateProgress(step, 'completed');
        this.updateMobileStepperCompleted(step);
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
        this.toast(message, 'error');
    }
    
    showSuccess(message) {
        this.toast(message, 'success');
    }
    
    announceToScreenReader(message) {
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'visually-hidden';
        announcer.textContent = message;
        document.body.appendChild(announcer);
        setTimeout(() => document.body.removeChild(announcer), 1000);
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
        // Reset mobile stepper
        const stepper = document.getElementById('mobile-stepper');
        if (stepper) {
            stepper.querySelectorAll('.step-dot').forEach(dot => {
                dot.classList.remove('completed', 'active');
                if (parseInt(dot.dataset.step) === 1) dot.classList.add('active');
            });
        }
        
        this.announceToScreenReader('Workflow has been reset to Step 1');
    }

    updateMobileStepperActive(step) {
        const stepper = document.getElementById('mobile-stepper');
        if (!stepper) return;
        stepper.querySelectorAll('.step-dot').forEach(dot => {
            dot.classList.toggle('active', parseInt(dot.dataset.step) === step);
        });
    }

    updateMobileStepperCompleted(step) {
        const stepper = document.getElementById('mobile-stepper');
        if (!stepper) return;
        const dot = stepper.querySelector(`.step-dot[data-step="${step}"]`);
        if (dot) dot.classList.add('completed');
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ModularWorkflowApp();
});
