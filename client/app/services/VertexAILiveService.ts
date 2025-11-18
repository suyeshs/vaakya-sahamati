/**
 * Vertex AI Live WebSocket Service
 * Native audio-to-audio streaming with low latency
 */

export class VertexAILiveService {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  private audioCallback: ((audioData: ArrayBuffer) => void) | null = null;
  private messageCallback: ((message: any) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private wsUrl: string;

  constructor(wsUrl?: string) {
    // Auto-detect WebSocket URL based on current host
    if (!wsUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      this.wsUrl = `${protocol}//${host}/api/vertex-ai-live`;
    } else {
      this.wsUrl = wsUrl;
    }
  }

  /**
   * Connect to Vertex AI Live WebSocket
   */
  async connect(language: string = 'auto', userId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[VertexAILive] Connecting to:', this.wsUrl);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[VertexAILive] WebSocket connected');
          this.isConnected = true;

          // Send start_session message with userId for context persistence
          this.sendMessage({
            type: 'start_session',
            config: {
              language,
              userId, // For conversation history persistence
              systemInstruction: null // Use default with fraud protection
            }
          });
        };

        this.ws.onmessage = (event) => {
          // Check if binary audio data
          if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
            const audioSize = event.data instanceof ArrayBuffer ? event.data.byteLength : event.data.size;
            console.log('[VertexAILive] Received audio:', audioSize, 'bytes');

            if (event.data instanceof Blob) {
              // Convert Blob to ArrayBuffer
              event.data.arrayBuffer().then((buffer) => {
                if (this.audioCallback) {
                  this.audioCallback(buffer);
                }
              });
            } else {
              if (this.audioCallback) {
                this.audioCallback(event.data);
              }
            }
            return;
          }

          // Parse JSON messages
          try {
            const message = JSON.parse(event.data);
            console.log('[VertexAILive] Received message:', message.type);

            if (message.type === 'session_started') {
              this.sessionId = message.sessionId;
              console.log('[VertexAILive] Session started:', this.sessionId);
            }

            if (message.type === 'session_ready') {
              console.log('[VertexAILive] Session ready');
              resolve();
            }

            if (message.type === 'error') {
              console.error('[VertexAILive] Error from server:', message.error);
              if (this.errorCallback) {
                this.errorCallback(message.error);
              }
            }

            // Forward all messages to callback
            if (this.messageCallback) {
              this.messageCallback(message);
            }
          } catch (e) {
            console.warn('[VertexAILive] Non-JSON message:', event.data);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[VertexAILive] WebSocket error:', error);
          if (this.errorCallback) {
            this.errorCallback('WebSocket connection error');
          }
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = (event) => {
          console.log('[VertexAILive] WebSocket closed:', event.code, event.reason);
          this.isConnected = false;
          this.sessionId = null;
        };

        // Timeout if session doesn't start
        setTimeout(() => {
          if (!this.sessionId) {
            reject(new Error('Session start timeout'));
          }
        }, 10000);

      } catch (error) {
        console.error('[VertexAILive] Connection error:', error);
        reject(error);
      }
    });
  }

  /**
   * Send audio data (PCM 16-bit, 16kHz)
   */
  sendAudio(audioData: ArrayBuffer | Uint8Array): void {
    if (!this.isConnected || !this.ws) {
      console.warn('[VertexAILive] Cannot send audio - not connected');
      return;
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
      console.log('[VertexAILive] Sent audio:', audioData.byteLength, 'bytes');
    } else {
      console.warn('[VertexAILive] WebSocket not open, readyState:', this.ws.readyState);
    }
  }

  /**
   * Send JSON message
   */
  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('[VertexAILive] Sent message:', message.type);
    }
  }

  /**
   * Signal turn completion (user finished speaking)
   */
  sendTurnComplete(): void {
    this.sendMessage({ type: 'turn_complete' });
  }

  /**
   * Set callback for audio responses
   */
  onAudio(callback: (audioData: ArrayBuffer) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Set callback for JSON messages
   */
  onMessage(callback: (message: any) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }

  /**
   * End session and disconnect
   */
  disconnect(): void {
    if (this.ws) {
      this.sendMessage({ type: 'end_session' });

      setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
      }, 500);
    }

    this.isConnected = false;
    this.sessionId = null;
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}
