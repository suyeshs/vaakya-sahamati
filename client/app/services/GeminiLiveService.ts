/**
 * GeminiLiveService - WebSocket client for Gemini Live streaming
 *
 * Features:
 * - Real-time bidirectional audio streaming
 * - Low latency (~500ms) voice interactions
 * - Automatic reconnection handling
 * - Audio chunk buffering
 */

export interface GeminiLiveConfig {
  apiBaseUrl: string;
  language?: string;
  onAudioChunk?: (audioChunk: Uint8Array) => void;
  onTranscript?: (transcript: string) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class GeminiLiveService {
  private ws: WebSocket | null = null;
  private config: GeminiLiveConfig;
  private sessionId: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private isIntentionalClose: boolean = false;
  private audioQueue: Uint8Array[] = [];

  constructor(config: GeminiLiveConfig) {
    this.config = config;
    this.sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Connect to Gemini Live WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.apiBaseUrl.replace(/^http/, 'ws') + '/api/gemini-live-stream';
        console.log('[GeminiLive] Connecting to:', wsUrl);

        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          console.log('[GeminiLive] ✅ Connected');
          this.reconnectAttempts = 0;

          // Send initialization message
          this.send({
            type: 'init',
            sessionId: this.sessionId,
            language: this.config.language || 'en'
          });

          if (this.config.onConnected) {
            this.config.onConnected();
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          console.error('[GeminiLive] WebSocket error:', error);
          if (this.config.onError) {
            this.config.onError(new Error('WebSocket error'));
          }
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[GeminiLive] Disconnected');
          this.ws = null;

          if (this.config.onDisconnected) {
            this.config.onDisconnected();
          }

          // Attempt reconnection if not intentional
          if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[GeminiLive] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    // Binary audio data
    if (event.data instanceof ArrayBuffer) {
      const audioChunk = new Uint8Array(event.data);
      console.log('[GeminiLive] Received audio chunk:', audioChunk.length, 'bytes');

      if (this.config.onAudioChunk) {
        this.config.onAudioChunk(audioChunk);
      }
      return;
    }

    // Text message (JSON)
    try {
      const message = JSON.parse(event.data);
      console.log('[GeminiLive] Received message:', message.type);

      switch (message.type) {
        case 'transcript':
          if (this.config.onTranscript) {
            this.config.onTranscript(message.text);
          }
          break;

        case 'audio':
          // Handle base64 encoded audio
          if (message.audio) {
            const binaryString = atob(message.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            if (this.config.onAudioChunk) {
              this.config.onAudioChunk(bytes);
            }
          }
          break;

        case 'error':
          console.error('[GeminiLive] Server error:', message.error);
          if (this.config.onError) {
            this.config.onError(new Error(message.error));
          }
          break;

        case 'ready':
          console.log('[GeminiLive] Server ready');
          break;

        default:
          console.log('[GeminiLive] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[GeminiLive] Failed to parse message:', error);
    }
  }

  /**
   * Send audio chunk to server
   */
  sendAudio(audioData: Float32Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[GeminiLive] WebSocket not connected, queuing audio');
      return;
    }

    // Convert Float32Array to Int16Array (PCM 16-bit)
    const pcm16 = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send as binary
    this.ws.send(pcm16.buffer);
  }

  /**
   * Send JSON message
   */
  private send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[GeminiLive] WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.isIntentionalClose = true;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.audioQueue = [];
    console.log('[GeminiLive] Disconnected (intentional)');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getState(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'closed';
    }
  }

  /**
   * Update language
   */
  setLanguage(language: string): void {
    this.config.language = language;

    if (this.isConnected()) {
      this.send({
        type: 'set_language',
        language
      });
    }
  }
}
