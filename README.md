# Voice Flow 🎤✨

> A sophisticated voice-enabled AI assistant with enterprise-grade analytics, privacy controls, and multi-model support.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

## ✨ What Makes Voice Flow Special

Voice Flow is a **production-ready AI assistant** that seamlessly combines voice and text interaction with enterprise-level features you won't find elsewhere:

- 🎯 **Intelligent Conversation Management** - Smart memory pruning keeps conversations flowing naturally
- 📊 **Advanced Analytics Dashboard** - Deep insights into usage patterns and performance metrics  
- 🔐 **Privacy-First Architecture** - GDPR-compliant logging with user consent and data sanitization
- 🎨 **Professional UI/UX** - Responsive design with smooth animations and accessibility features
- ⚡ **Real-time Performance Monitoring** - Live metrics for STT, LLM, and TTS processing
- 🛡️ **Enterprise-Grade Error Handling** - Automatic retry, graceful degradation, and smart recovery

## 📸 Screenshots

### Main Interface
![Voice Flow Main Interface](screenshots/main-interface.png)
*Clean, modern chat interface with real-time conversation management and performance monitoring*

### Comprehensive Settings System

#### Model Configuration
![Model Settings](screenshots/settings-model.png)
*Dynamic model selection with automatic detection of installed Ollama models and parameter tuning*

#### Audio & Voice Settings  
![Audio Settings](screenshots/settings-audio.png)
*Professional audio controls with 14 voice options, speech rate adjustment, and volume controls*

#### Appearance & Themes
![Appearance Settings](screenshots/settings-appearance.png)
*Multiple theme options with smooth transitions and accessibility features*

#### Logging & Analytics
![Logging Settings](screenshots/settings-logging.png)
*Enterprise-grade logging with privacy controls, data export, and analytics configuration*

---

## 🚀 Quick Start

### Prerequisites

You'll need these services running:

1. **[Ollama](https://ollama.ai/)** - Local LLM service (required)
2. **[Kokoro TTS](https://github.com/remsky/Kokoro-FastAPI)** - Text-to-speech (optional)
3. **[Whisper STT](https://github.com/ahmetoner/whisper-asr-webservice)** - Speech-to-text (optional)

### Installation

```
bash

# Clone the repository
git clone https://github.com/johnriggs1959/voice-flow.git
cd voice-flow

# Serve the application
python -m http.server 8080
# or
npx serve .

# Open your browser
open https://localhost:8080
```
The app automatically detects and connects to your local AI services!

🎯 Key Features

🤖 AI Integration

* Multi-Model Support - Automatically detects all installed Ollama models
* Dynamic Model Switching - Change models without restarting
* Intelligent Responses - Voice-optimized AI responses with natural speech formatting
* Smart Context Management - Maintains conversation context with memory optimization

🎙️ Voice & Audio

* High-Quality Speech Recognition - Powered by OpenAI Whisper
* Natural Text-to-Speech - 14 voice options (American & British English)
* Hands-Free Operation - Voice → Transcription → AI Response → Speech
* Professional Audio Controls - Play, pause, download generated speech

📊 Analytics & Monitoring

* Real-Time Performance Metrics - Track STT, LLM, and TTS processing times
* Usage Pattern Analysis - Peak hours, preferred models, conversation insights
* Service Health Monitoring - Live status indicators for all connected services
* Export Capabilities - Download logs in JSON, CSV, or Markdown format

🔐 Privacy & Security

* User Consent Management - GDPR-compliant privacy controls
* Data Sanitization - Automatic filtering of sensitive information
* Local-First Architecture - Your data stays on your devices
* Configurable Retention - Automatic cleanup of old conversation logs

🎨 User Experience

* Responsive Design - Works beautifully on desktop, tablet, and mobile
* Theme System - Light, dark, and custom themes with smooth transitions
* Accessibility First - Screen reader support, keyboard navigation, WCAG compliant
* Touch-Friendly - Optimized for mobile voice interaction

📖 Setup Guide

1. Ollama Setup (Required)

```
bash

# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull some models
ollama pull llama3.2:3b      # Fast, balanced (recommended)
ollama pull llama3.1:8b      # Higher quality
ollama pull tinyllama:1.1b   # Ultra-fast

# Configure for network access
sudo systemctl edit ollama
```
Add this configuration:
```
ini

[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
```
```
bash

# Restart service
sudo systemctl restart ollama
```
2. Kokoro TTS Setup (Optional)

```
bash

# Clone and start TTS service
git clone https://github.com/remsky/Kokoro-FastAPI.git
cd Kokoro-FastAPI
docker-compose up -d
```
3. Whisper STT Setup (Optional)
```
bash

# Start Whisper service
docker run -d \
  --name whisper-api \
  -p 8000:8000 \
  -e ASR_MODEL=base \
  onerahmet/openai-whisper-asr-webservice:latest
```  
  🎵 Usage Examples
Voice Interaction
1. Click the microphone button
2. Ask your question naturally
3. Watch as it transcribes, processes, and responds with voice

Model Selection

* tinyllama:1.1b - Lightning fast for simple questions
* llama3.2:3b - Perfect balance of speed and quality
* llama3.1:8b - Detailed, thoughtful responses
* Custom models - Add any Ollama-compatible model

Analytics Dashboard
Access comprehensive insights about your AI assistant usage:

* Response time trends
* Model performance comparison
* Usage patterns by time of day
* Error rates and recovery statistics

🏗️ Architecture
Voice Flow is built with a modular, enterprise-grade architecture:
```  
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   UI Layer      │  │  Service Layer  │  │  Data Layer     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • Chat Interface│  │ • API Service   │  │ • Conversation  │
│ • Settings      │  │ • Audio Service │  │ • Analytics     │
│ • Themes        │  │ • Model Mgmt    │  │ • Logging       │
│ • Status        │  │ • Error Handling│  │ • Privacy       │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```  
Design Principles

* Memory Efficient - Smart conversation pruning prevents memory leaks
* Error Resilient - Comprehensive error handling with automatic recovery
* Privacy Conscious - User consent and data protection built-in
* Performance Focused - Real-time monitoring and optimization
* Accessibility First - Works for everyone, on every device

📊 Performance

* Response Time < 3s average (STT + LLM + TTS)
* Memory Usage < 50MB with automatic pruning
* Error Rate < 2% with automatic retry
* Accessibility WCAG 2.1 AA compliant
* Browser SupportAll modern browsers
  

🛣️ Roadmap
🎯 Phase 1: Enhanced UX (Next)

 * Voice command navigation ("Clear conversation", "Change voice")
 * Advanced model management interface
 * Conversation search and filtering
 * Custom wake words

📊 Phase 2: Intelligence 

 * Predictive analytics dashboard
 * AI-powered usage insights
 * Performance optimization suggestions
 * Smart conversation summarization

🏢 Phase 3: Enterprise 

 * Multi-user support with profiles
 * API integrations and webhooks
 * Plugin system for extensibility
 * Advanced security features

🤝 Contributing

We love contributions! Heres how to get started:

Fork the repository
1. Create a feature branch: git checkout -b feature/amazing-feature
2. Make your changes and test thoroughly
3. Commit with clear messages: git commit -m 'Add amazing feature'
4. Push to your branch: git push origin feature/amazing-feature
5. Open a Pull Request

Development Setup
```  
# Fork and clone your fork
git clone https://github.com/yourusername/voice-flow.git
cd voice-flow

# Create a feature branch
git checkout -b feature/my-new-feature

# Make changes and test
python -m http.server 8080

# Commit and push
git add .
git commit -m "Add my new feature"
git push origin feature/my-new-feature
```

🔧 Configuration
The app automatically detects services on:

* Ollama: http://localhost:11434
* TTS: http://localhost:8880
* STT: http://localhost:8000

For custom configurations, edit the service URLs in js/config.js.

🐛 Troubleshooting
Service Connection Issues

Ollama not detected:
```  
# Check if Ollama is running
curl http://localhost:11434/api/version

# Restart if needed
sudo systemctl restart ollama
```  
TTS service issues:
```  
# Check TTS service
curl http://localhost:8880/v1/test

# Restart TTS
cd Kokoro-FastAPI && docker-compose restart
```  
STT service problems:
```  
# Check STT service  
curl http://localhost:8000

# Restart STT
docker restart whisper-api
```  
Voice Input Issues

* Ensure you're using HTTPS or localhost
* Check browser microphone permissions
* Verify microphone is working in other apps
* Try refreshing the page

📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

🙏 Acknowledgments

* Ollama for excellent local LLM runtime
* Kokoro TTS for high-quality speech synthesis
* OpenAI Whisper for speech recognition
* The open-source AI community for inspiration and tools

📞 Support

📚 Documentation (coming soon)
🐛 Issue Tracker
💬 Discussions


⭐ Star this repository if it helped you! ⭐
Made with ❤️ by John Riggs








