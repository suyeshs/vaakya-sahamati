# Samvad Voice AI - React Client

Production-ready React client for Samvad GCP voice assistant, built with Next.js 15, TypeScript, XState, and Silero VAD.

## 🎯 Features

### Core Voice Capabilities
- **Silero VAD Integration** - ML-based voice activity detection
- **STT-TTS Pipeline** - Speech-to-Text → LLM → Text-to-Speech flow
- **Gemini Live** - Real-time bidirectional audio streaming (~500ms latency)
- **Multi-language Support** - 9 Indic languages + English

### Advanced Conversation Management
- **ConversationIssueDetector** - Detects repeated questions, misunderstandings
- **InterruptionDetector** - Natural barge-in support during AI speech
- **GracefulAudioCancellation** - Smooth audio fade-outs instead of abrupt stops
- **XState State Machine** - Robust conversation flow control

### Architecture Highlights
- **TypeScript** - Full type safety
- **React Hooks** - Modern functional components
- **XState v5** - State machine for predictable state transitions
- **Tailwind CSS** - Utility-first styling
- **Next.js 15** - App router with React 19

## 📁 Project Structure

```
client-react/
├── app/
│   ├── machines/
│   │   └── voiceAssistantMachine.ts    # XState state machine
│   ├── services/
│   │   ├── HttpVoiceService.ts         # STT-TTS pipeline client
│   │   └── GeminiLiveService.ts        # Gemini Live WebSocket client
│   ├── utils/
│   │   ├── ConversationIssueDetector.ts
│   │   ├── InterruptionDetector.ts
│   │   └── GracefulAudioCancellation.ts
│   ├── page.tsx                         # Main voice client UI
│   ├── layout.tsx                       # Root layout
│   └── globals.css                      # Global styles
├── public/
│   ├── silero_vad.onnx                 # Silero VAD model
│   └── vad.worklet*.js                 # Audio worklet files
├── Dockerfile                           # Production deployment
└── package.json                         # Dependencies

```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Backend API running (samvad-api-bun)

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://samvad-api-bun-def3r7eewq-uc.a.run.app
```

## 🔧 Configuration

### VAD Settings

Optimized for natural speech detection (from Bolbachan implementation):

```typescript
{
  positiveSpeechThreshold: 0.8,   // High confidence for speech
  negativeSpeechThreshold: 0.3,   // Quick to detect silence
  preSpeechPadFrames: 10,          // Capture frames before speech
  minSpeechFrames: 5,              // Minimum frames to count as speech
  redemptionFrames: 8,             // Silence frames before ending
  frameSamples: 512                // Processing chunk size
}
```

### XState Machine States

```
idle → listening → speaking → processing → responding → playingResponse
                                                    ↓
                                              (loop back to listening)
```

## 📦 Dependencies

### Core
- `next@15.3.5` - React framework
- `react@19.0.0` - UI library
- `react-dom@19.0.0` - React DOM bindings

### State Management
- `xstate@5.20.1` - State machines
- `@xstate/react@6.0.0` - React integration

### Voice AI
- `@ricky0123/vad@0.2.4` - Silero VAD for speech detection

### Development
- `typescript@5.9.3` - Type safety
- `tailwindcss@4.1.16` - Styling
- `@tailwindcss/postcss` - PostCSS integration

## 🎨 UI Design

**Monochromatic Theme:**
- Background: `#000000` (black)
- Text: `#ffffff` (white)
- Borders: `#27272a` (zinc-800)
- Surfaces: `#18181b` (zinc-900)

**Status Indicators:**
- 🎤 Listening
- 🗣️ Speaking detected
- ⚙️ Processing
- 💭 Generating response
- 🔊 AI Speaking

## 🔌 API Integration

### STT-TTS Pipeline

```typescript
const service = new HttpVoiceService(apiBaseUrl);

// Send audio for processing
const response = await service.sendAudio(audioFloat32Array, 'en');

// Response structure:
{
  success: true,
  stt: { transcript: "...", confidence: 0.95 },
  llm: { text: "...", model: "gemini-2.5-flash-lite" },
  tts: { audio: "base64...", format: "mp3" }
}
```

### Gemini Live WebSocket

```typescript
const gemini = new GeminiLiveService({
  apiBaseUrl: 'ws://localhost:8080',
  language: 'en',
  onAudioChunk: (chunk) => playAudio(chunk),
  onTranscript: (text) => updateUI(text)
});

await gemini.connect();
gemini.sendAudio(audioFloat32Array);
```

## 🧪 Testing

### Local Testing

1. Start backend:
```bash
cd ../backend-bun
bun run server.js
```

2. Start client:
```bash
npm run dev
```

3. Open http://localhost:3000

### Browser Console Logs

- `[VAD]` - Voice activity detection
- `[STT]` - Speech-to-text processing
- `[GeminiLive]` - WebSocket events
- `[InterruptionDetector]` - Barge-in events
- `[ConversationIssueDetector]` - Conversation quality

## 🐳 Docker Deployment

### Build Image

```bash
docker build -t samvad-client-react .
```

### Run Container

```bash
docker run -p 8080:8080 \
  -e NEXT_PUBLIC_API_BASE_URL=https://your-backend-url \
  samvad-client-react
```

### Deploy to Cloud Run

```bash
gcloud run deploy samvad-client-react \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_API_BASE_URL=https://samvad-api-bun-def3r7eewq-uc.a.run.app
```

## 📊 Performance Optimizations

- **Audio Worklet** - Offloads audio processing to separate thread
- **WebAssembly** - Silero VAD runs in WASM for near-native performance
- **Chunked Processing** - Processes audio in 512-sample chunks
- **Connection Pooling** - Reuses WebSocket connections
- **Graceful Degradation** - Falls back to polyfills on STT failures

## 🔍 Troubleshooting

### VAD Not Detecting Speech
- Check microphone permissions
- Verify `silero_vad.onnx` is in `/public`
- Lower `positiveSpeechThreshold` to 0.6-0.7
- Check console for `[VAD]` logs

### WebSocket Connection Fails
- Verify backend is running
- Check CORS settings on backend
- Ensure firewall allows WebSocket connections
- Check browser console for errors

### Audio Not Playing
- Check browser audio permissions
- Verify TTS response contains valid base64 audio
- Check `GracefulAudioCancellation` queue status
- Look for `playTTSAudio` errors in console

## 🤝 Contributing

### Code Style
- Use TypeScript for all new files
- Follow React Hooks best practices
- Use XState for complex state logic
- Write descriptive commit messages

### Adding New Features
1. Create feature branch
2. Implement with TypeScript types
3. Add to relevant service/util
4. Update README
5. Test locally and on Cloud Run
6. Submit PR with description

## 📝 License

ISC

## 🙏 Acknowledgments

- **Bolbachan/Sahamati-Samvad** - Original VAD implementation reference
- **@ricky0123/vad** - Silero VAD JavaScript wrapper
- **XState** - State machine library
- **Next.js** - React framework
- **Bun** - Backend runtime

## 📞 Support

For issues or questions:
- Open issue on GitHub
- Check backend logs for API errors
- Review browser console for client errors
- Verify environment variables are set

---

Built with ❤️ for natural voice interactions
