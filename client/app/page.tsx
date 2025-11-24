'use client';

import { useState, useRef, useEffect } from 'react';
import { VertexAILiveService } from './services/VertexAILiveService';
import { AudioVisualizer } from './components/AudioVisualizer';

// Get or create persistent user ID for context persistence
function getUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';

  let userId = localStorage.getItem('vaakya_user_id');
  if (!userId) {
    // Generate unique ID: timestamp + random string
    userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem('vaakya_user_id', userId);
    console.log('[Context] New user ID created:', userId);
  } else {
    console.log('[Context] Existing user ID loaded:', userId);
  }
  return userId;
}

export default function Home() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [apiStatus, setApiStatus] = useState<'online' | 'offline'>('offline');
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(32).fill(0));
  const [conversationTime, setConversationTime] = useState(0); // Time in seconds
  const [transcriptText, setTranscriptText] = useState(''); // AI response text

  const vertexAILiveServiceRef = useRef<VertexAILiveService | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const lastSpeechStartRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const idleAnimationRef = useRef<number | null>(null);
  const lastSpeechEndRef = useRef<number>(0);
  const endPlaybackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const conversationStartTimeRef = useRef<number>(0);

  // Check API status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/health');
        if (response.ok) setApiStatus('online');
        else setApiStatus('offline');
      } catch {
        setApiStatus('offline');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Conversation timer
  useEffect(() => {
    if (isSessionActive) {
      // Start timer
      conversationStartTimeRef.current = Date.now();
      setConversationTime(0);

      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - conversationStartTimeRef.current) / 1000);
        setConversationTime(elapsed);
      }, 1000);

      return () => clearInterval(timer);
    } else {
      // Reset timer when session ends
      setConversationTime(0);
      conversationStartTimeRef.current = 0;
    }
  }, [isSessionActive]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Idle animation for bars when listening
  const startIdleAnimation = () => {
    if (idleAnimationRef.current) return;

    let time = 0;
    const animate = () => {
      time += 0.05;
      const newLevels = Array.from({ length: 32 }, (_, i) => {
        const wave1 = Math.sin(time + i * 0.5) * 0.15;
        const wave2 = Math.sin(time * 1.3 - i * 0.3) * 0.1;
        return Math.abs(wave1 + wave2);
      });
      setAudioLevels(newLevels);
      idleAnimationRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  const stopIdleAnimation = () => {
    if (idleAnimationRef.current) {
      cancelAnimationFrame(idleAnimationRef.current);
      idleAnimationRef.current = null;
    }
  };

  const startSession = async () => {
    try {
      console.log('[VertexAILive] Starting session...');
      setSessionStatus('listening');

      // Request microphone permission FIRST before connecting
      // This ensures user grants permission before any audio is played
      console.log('[VertexAILive] Requesting microphone permission...');
      await startContinuousMicrophoneCapture();
      console.log('[VertexAILive] Microphone access granted');

      // Initialize Vertex AI Live service
      vertexAILiveServiceRef.current = new VertexAILiveService();

      // Set up audio playback callback
      vertexAILiveServiceRef.current.onAudio(async (audioData: ArrayBuffer) => {
        const responseReceivedTime = performance.now();
        const timeSinceSpeech = lastSpeechStartRef.current > 0
          ? responseReceivedTime - lastSpeechStartRef.current
          : 0;

        console.log('[VertexAILive] 🔊 Audio response received');
        console.log(`[Timing] Total latency: ${timeSinceSpeech.toFixed(0)}ms`);

        await playPCMAudio(audioData);
      });

      // Set up message callback
      vertexAILiveServiceRef.current.onMessage((message: any) => {
        console.log('[VertexAILive] Message:', message.type);
        if (message.type === 'session_ready') {
          setSessionStatus('listening');
        }
        // Handle text chunks from AI response
        if (message.type === 'text_chunk') {
          console.log('[VertexAILive] Text received:', message.text);
          setTranscriptText(prev => prev + message.text);
        }
      });

      // Get persistent user ID for context preservation across sessions
      const userId = getUserId();

      // Connect to server (now that mic is ready) with userId for context
      await vertexAILiveServiceRef.current.connect(selectedLanguage, userId);
      console.log('[VertexAILive] Connected successfully with userId:', userId);

      setIsSessionActive(true);

      // Start idle animation for listening state
      startIdleAnimation();

      console.log('[VertexAILive] Session started');
    } catch (error: any) {
      console.error('[VertexAILive] Failed:', error);
      alert('Failed to start session: ' + error.message);
      setSessionStatus('idle');
    }
  };

  const startContinuousMicrophoneCapture = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const audioContext = new AudioContext({ sampleRate: 16000 });
    recordingContextRef.current = audioContext;

    // Load AudioWorklet processor
    await audioContext.audioWorklet.addModule('/audio-processor.js');

    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, 'audio-stream-processor');

    let chunkCount = 0;

    // Handle messages from AudioWorklet
    workletNode.port.onmessage = (event) => {
      const { type, data, rms, duration } = event.data;

      if (type === 'speech-start') {
        lastSpeechStartRef.current = performance.now();
        setSessionStatus('listening');
        stopIdleAnimation();
        setTranscriptText(''); // Clear previous response
        console.log(`[Timing] 🎤 Speech detected (RMS: ${rms.toFixed(4)})`);
      } else if (type === 'speech-end') {
        lastSpeechEndRef.current = performance.now();
        setSessionStatus('thinking');
        console.log(`[Timing] ✋ Speech ended after ${duration.toFixed(0)}ms`);
        // Show thinking state - audio visualizer will be still
        setAudioLevels(new Array(32).fill(0));
      } else if (type === 'audio-data') {
        if (!vertexAILiveServiceRef.current?.isActive()) return;

        // Send PCM data to Vertex AI Live
        vertexAILiveServiceRef.current.sendAudio(data);

        chunkCount++;
        if (chunkCount % 50 === 0) {
          console.log('[Audio] 📤 Sent', chunkCount, 'chunks');
        }
      }
    };

    // Connect audio pipeline
    source.connect(workletNode);
    workletNode.connect(audioContext.destination);

    setSessionStatus('listening');
    console.log('[VertexAILive] ✅ AudioWorklet streaming started');
  };

  const startAudioVisualization = () => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateVisualization = () => {
      analyser.getByteFrequencyData(dataArray);

      // Create 32 frequency bands for the radial visualizer
      const barCount = 32;
      const barWidth = Math.floor(bufferLength / barCount);
      const newLevels: number[] = [];

      for (let i = 0; i < barCount; i++) {
        const start = i * barWidth;
        const end = start + barWidth;
        let sum = 0;

        for (let j = start; j < end; j++) {
          sum += dataArray[j];
        }

        const average = sum / barWidth;
        // Amplify and normalize for better visuals (increased from 1.5 to 3.0)
        const normalized = Math.min((average / 255) * 3.0, 1);
        newLevels.push(normalized);
      }

      setAudioLevels(newLevels);
      animationFrameRef.current = requestAnimationFrame(updateVisualization);
    };

    updateVisualization();
  };

  const playPCMAudio = async (audioData: ArrayBuffer) => {
    try {
      // Initialize playback audio context if needed
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
        nextPlayTimeRef.current = playbackContextRef.current.currentTime;

        // Create analyser for visualization
        analyserRef.current = playbackContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(playbackContextRef.current.destination);
      }

      const audioContext = playbackContextRef.current;
      const pcm16 = new Int16Array(audioData);

      // Convert Int16 PCM to Float32
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }

      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      // Schedule audio chunk
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      // Connect to analyser for visualization
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      } else {
        source.connect(audioContext.destination);
      }

      const currentTime = audioContext.currentTime;

      // Check if we're falling behind (gap in chunks)
      if (nextPlayTimeRef.current > 0 && currentTime > nextPlayTimeRef.current + 0.1) {
        console.warn('[Audio] Gap detected:', (currentTime - nextPlayTimeRef.current).toFixed(3), 's - resetting timeline');
        nextPlayTimeRef.current = currentTime;
      }

      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
      source.start(startTime);

      const duration = audioBuffer.duration;
      nextPlayTimeRef.current = startTime + duration;

      console.log('[Audio] Chunk scheduled - currentTime:', currentTime.toFixed(3), 'startTime:', startTime.toFixed(3), 'duration:', duration.toFixed(3), 'nextPlayTime:', nextPlayTimeRef.current.toFixed(3));

      // Update UI on first chunk
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        setSessionStatus('speaking');

        // Start visualization
        startAudioVisualization();

        const playbackStartTime = performance.now();
        const totalLatency = lastSpeechStartRef.current > 0
          ? playbackStartTime - lastSpeechStartRef.current
          : 0;

        console.log(`[Timing] 🔊 Audio playback started`);
        console.log(`[Timing] ⚡ Total latency: ${totalLatency.toFixed(0)}ms`);
      }

      // Clear any existing end playback timeout
      if (endPlaybackTimeoutRef.current) {
        clearTimeout(endPlaybackTimeoutRef.current);
        endPlaybackTimeoutRef.current = null;
      }

      // Set a new timeout to detect end of playback
      // This gets reset every time a new chunk arrives, preventing premature state changes
      const timeUntilEnd = (startTime + duration - audioContext.currentTime) * 1000 + 200;
      endPlaybackTimeoutRef.current = setTimeout(() => {
        // Double-check that no more audio is scheduled
        if (audioContext.currentTime >= nextPlayTimeRef.current - 0.05) {
          isPlayingRef.current = false;
          setSessionStatus('listening');

          // Stop audio visualization
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }

          // Start idle animation when returning to listening
          startIdleAnimation();

          console.log('[VertexAILive] Audio playback ended');
        }
      }, Math.max(timeUntilEnd, 0));
    } catch (error) {
      console.error('[VertexAILive] Audio playback error:', error);
    }
  };

  const endSession = async () => {
    // Stop all animations
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    stopIdleAnimation();

    // Clear end playback timeout
    if (endPlaybackTimeoutRef.current) {
      clearTimeout(endPlaybackTimeoutRef.current);
      endPlaybackTimeoutRef.current = null;
    }

    if (vertexAILiveServiceRef.current) {
      try {
        vertexAILiveServiceRef.current.disconnect();
      } catch (error) {
        console.error('[VertexAILive] Error disconnecting:', error);
      }
      vertexAILiveServiceRef.current = null;
    }

    // Close recording context
    if (recordingContextRef.current) {
      try {
        await recordingContextRef.current.close();
      } catch (error) {
        console.error('[RecordingContext] Error closing:', error);
      }
      recordingContextRef.current = null;
    }

    // Close playback context
    if (playbackContextRef.current) {
      try {
        await playbackContextRef.current.close();
      } catch (error) {
        console.error('[PlaybackContext] Error closing:', error);
      }
      playbackContextRef.current = null;
    }

    analyserRef.current = null;
    nextPlayTimeRef.current = 0;
    isPlayingRef.current = false;
    setIsSessionActive(false);
    setSessionStatus('idle');
    setAudioLevels(new Array(32).fill(0));
    setTranscriptText(''); // Clear transcript
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-[#f8f9fa] via-[#e9ecef] via-30% to-[#0a0a0a] text-[#e5e5e5]">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-4xl">
          {!isSessionActive ? (
            /* Start Screen */
            <div className="text-center space-y-6 sm:space-y-8">
              <div className="space-y-4">
                <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-[#1a1a1a] via-[#2a2a2a] to-[#3a3a3a] bg-clip-text text-transparent">
                  Voice AI Assistant
                </h1>
              </div>

              {/* Language Auto-Detect Display */}
              <div className="max-w-md mx-auto space-y-6">
                {/* Auto-Detect Badge */}
                <div className="flex flex-col items-center gap-3">
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-white/90 border border-[#dee2e6] rounded-xl pointer-events-none shadow-sm">
                    <span className="text-base">🌐</span>
                    <span className="text-base text-[#212529] font-medium">Auto-Detect Language</span>
                  </div>
                  <p className="text-sm text-[#6c757d]">
                    Speak in the language of your choice
                  </p>
                </div>

                {/* Start Button */}
                <button
                  onClick={startSession}
                  disabled={apiStatus === 'offline'}
                  className="w-full bg-gradient-to-r from-[#f5f5f5] to-[#e5e5e5] text-[#0a0a0a] rounded-xl px-8 py-4 text-base font-semibold hover:from-[#ffffff] hover:to-[#f5f5f5] hover:shadow-[0_8px_32px_rgba(229,229,229,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {apiStatus === 'offline' ? 'Service Offline' : 'Start Conversation'}
                </button>
              </div>

              {/* Features */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-8 sm:mt-12">
                <div className="bg-white/80 border border-[#dee2e6] rounded-xl p-4 backdrop-blur-sm shadow-sm">
                  <div className="text-2xl mb-2">⚡</div>
                  <h3 className="text-sm font-semibold mb-1 text-[#212529]">Low Latency</h3>
                  <p className="text-xs text-[#6c757d]">Real-time responses under 1 second</p>
                  <p className="text-xs text-[#6c757d] mt-1">Built with Bun, and Vertex AI Live running on Cloud Run</p>
                </div>
                <div className="bg-white/80 border border-[#dee2e6] rounded-xl p-4 backdrop-blur-sm shadow-sm">
                  <div className="text-2xl mb-2">🌍</div>
                  <h3 className="text-sm font-semibold mb-1 text-[#212529]">Multilingual</h3>
                  <p className="text-xs text-[#6c757d] leading-relaxed">
                    <span className="font-medium text-[#495057]">Indian:</span> Hindi, English, Tamil, Telugu, Marathi, Bengali, Gujarati, Kannada, Malayalam, Punjabi
                    <br/>
                    <span className="font-medium text-[#495057] mt-1 inline-block">International:</span> Spanish, French, German, Chinese, Arabic, Japanese + more
                  </p>
                </div>
                <div className="bg-white/80 border border-[#dee2e6] rounded-xl p-4 backdrop-blur-sm shadow-sm">
                  <div className="text-2xl mb-2">🎯</div>
                  <h3 className="text-sm font-semibold mb-1 text-[#212529]">Natural</h3>
                  <p className="text-xs text-[#6c757d]">Context-aware conversations</p>
                  <p className="text-xs text-[#6c757d] mt-1">Persistent context across sessions with unique user ID</p>
                  <p className="text-xs text-[#6c757d] mt-1">Content ingestion</p>
                </div>
              </div>
            </div>
          ) : (
            /* Active Session */
            <div className="space-y-6 h-full flex flex-col">
              {/* Transcript Area - Takes most of the space */}
              <div className="flex-1 overflow-y-auto bg-white/90 border border-[#dee2e6] rounded-xl p-6 shadow-sm min-h-[300px] max-h-[500px]">
                {transcriptText ? (
                  <div className="prose prose-sm max-w-none">
                    <p className="text-[#212529] text-lg leading-relaxed whitespace-pre-wrap">
                      {transcriptText}
                    </p>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-[#6c757d]">
                    <p className="text-sm">
                      {sessionStatus === 'listening' && '🎤 Listening...'}
                      {sessionStatus === 'thinking' && '💭 Thinking...'}
                      {sessionStatus === 'speaking' && '🔊 Speaking...'}
                    </p>
                  </div>
                )}
              </div>

              {/* Audio Visualizer - Smaller */}
              <div className="h-24">
                <AudioVisualizer
                  audioLevels={audioLevels}
                  sessionStatus={sessionStatus}
                />
              </div>

              {/* Controls with Timer */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={endSession}
                  className="inline-flex items-center gap-3 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium transition-all hover:shadow-[0_4px_16px_rgba(239,68,68,0.2)]"
                >
                  <span>End Conversation</span>
                  <div className="px-3 py-1.5 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg">
                    <span className="text-xs font-mono text-[#e5e5e5] tracking-wider">
                      {formatTime(conversationTime)}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-[#2a2a2a] px-6 py-4 text-center bg-[#0f0f0f]/80 backdrop-blur-sm">
        <p className="text-xs text-[#525252]">
          Built by bots copyright @ Sahamati Labs - Bengaluru • Feminine voice enabled
        </p>
      </footer>
    </div>
  );
}
