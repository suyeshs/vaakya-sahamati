/**
 * WebSocket Client for Gemini Live API
 * Handles real-time bidirectional audio streaming
 */

class GeminiLiveWebSocketClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isSessionActive = false;
        this.sessionId = null;
        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            audioChunksReceived: 0,
            sessionStartTime: 0
        };
        this.eventListeners = new Map();
    }

    /**
     * Connect to WebSocket
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                // Get WebSocket URL from current location
                // Use ws:// for localhost and http, wss:// for https
                const isSecure = window.location.protocol === 'https:';
                const protocol = isSecure ? 'wss' : 'ws';
                const wsUrl = `${protocol}://${window.location.host}/api/gemini-live-stream`;
                console.log('[WebSocket] Connecting to:', wsUrl);
                
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {
                    console.log('[WebSocket] Connected successfully');
                    this.isConnected = true;
                    this.emit('connected');
                    resolve();
                };
                
                this.ws.onclose = (event) => {
                    console.log('[WebSocket] Connection closed:', event.code, event.reason);
                    this.isConnected = false;
                    this.isSessionActive = false;
                    this.sessionId = null;
                    this.emit('disconnected', { code: event.code, reason: event.reason });
                };
                
                this.ws.onerror = (error) => {
                    console.error('[WebSocket] Connection error:', error);
                    this.emit('error', error);
                    reject(error);
                };
                
                this.ws.onmessage = (event) => {
                    this.handleMessage(event);
                };
                
            } catch (error) {
                console.error('[WebSocket] Connection failed:', error);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        if (this.ws) {
            console.log('[WebSocket] Disconnecting...');
            this.ws.close(1000, 'Intentional disconnect');
            this.ws = null;
        }
        this.isConnected = false;
        this.isSessionActive = false;
        this.sessionId = null;
    }

    /**
     * Start a new session
     */
    startSession(config = {}) {
        if (!this.isConnected) {
            throw new Error('WebSocket not connected');
        }

        const sessionMessage = {
            type: 'start_session',
            config: {
                sessionId: config.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                language: config.language || 'auto',
                systemInstruction: config.systemInstruction || 'You are a helpful AI assistant with multilingual capabilities. AUTOMATICALLY DETECT the language the user speaks and ALWAYS respond in THE EXACT SAME LANGUAGE.'
            }
        };

        console.log('[WebSocket] Starting session:', sessionMessage);
        this.send(sessionMessage);
        this.metrics.messagesSent++;
    }

    /**
     * End current session
     */
    endSession() {
        if (!this.isConnected || !this.isSessionActive) {
            return;
        }

        const endMessage = {
            type: 'end_session',
            data: {
                sessionId: this.sessionId
            }
        };

        console.log('[WebSocket] Ending session');
        this.send(endMessage);
        this.metrics.messagesSent++;
        this.isSessionActive = false;
    }

    /**
     * Send audio data
     */
    sendAudioData(audioBuffer) {
        console.log('[WebSocket] sendAudioData called:', {
            isConnected: this.isConnected,
            isSessionActive: this.isSessionActive,
            audioBufferSize: audioBuffer.size || audioBuffer.byteLength,
            audioBufferType: audioBuffer.type,
            timestamp: new Date().toISOString()
        });
        
        if (!this.isConnected || !this.isSessionActive) {
            console.warn('[WebSocket] Cannot send audio - not connected or session not active:', {
                isConnected: this.isConnected,
                isSessionActive: this.isSessionActive
            });
            return;
        }

        try {
            console.log('[WebSocket] Sending binary audio data to WebSocket...');
            // Send binary audio data directly
            this.ws.send(audioBuffer);
            this.metrics.messagesSent++;
            console.log('[WebSocket] Audio data sent successfully:', audioBuffer.byteLength, 'bytes');
        } catch (error) {
            console.error('[WebSocket] Failed to send audio data:', error);
            this.emit('error', error);
        }
    }

    /**
     * Send text message
     */
    sendTextMessage(text) {
        if (!this.isConnected || !this.isSessionActive) {
            console.warn('[WebSocket] Cannot send text - not connected or session not active');
            return;
        }

        const textMessage = {
            type: 'text_input',
            data: {
                text,
                sessionId: this.sessionId
            }
        };

        console.log('[WebSocket] Sending text message:', text);
        this.send(textMessage);
        this.metrics.messagesSent++;
    }

    /**
     * Send message
     */
    send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Handle incoming messages
     */
    handleMessage(event) {
        console.log('[WebSocket] Received message:', {
            type: typeof event.data,
            isArrayBuffer: event.data instanceof ArrayBuffer,
            isBlob: event.data instanceof Blob,
            length: event.data.length || event.data.byteLength || event.data.size,
            preview: typeof event.data === 'string' ? event.data.substring(0, 50) : '[Binary Data]'
        });
        
        try {
            // Handle binary audio data
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                console.log('[WebSocket] Received binary audio data:', event.data.byteLength || event.data.size, 'bytes');
                this.metrics.audioChunksReceived++;
                this.emit('audioResponse', {
                    audio: event.data,
                    sessionId: this.sessionId
                });
                return;
            }

            // Check if this looks like binary data received as string
            if (typeof event.data === 'string' && event.data.length > 0) {
                // Check if it's likely binary data (contains non-printable characters)
                const hasNonPrintable = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(event.data);
                if (hasNonPrintable) {
                    console.log('[WebSocket] Received binary data as string, treating as audio');
                    this.metrics.audioChunksReceived++;
                    this.emit('audioResponse', {
                        audio: event.data,
                        sessionId: this.sessionId
                    });
                    return;
                }
            }

            // Handle JSON messages
            console.log('[WebSocket] Raw message data:', {
                type: typeof event.data,
                length: event.data.length,
                preview: event.data.substring(0, 100),
                fullData: event.data
            });
            
            let message;
            try {
                message = JSON.parse(event.data);
                console.log('[WebSocket] Parsed message:', message);
            } catch (parseError) {
                console.error('[WebSocket] JSON Parse Error:', {
                    error: parseError.message,
                    data: event.data,
                    dataType: typeof event.data,
                    dataLength: event.data.length
                });
                this.emit('error', { message: `JSON Parse error: ${parseError.message}`, rawData: event.data });
                return;
            }
            
            console.log('[WebSocket] Received message:', message.type);
            this.metrics.messagesReceived++;

            switch (message.type) {
                case 'service_status':
                    this.emit('serviceStatus', message.data);
                    break;
                    
                case 'session_started':
                    this.isSessionActive = true;
                    this.sessionId = message.data.sessionId;
                    this.metrics.sessionStartTime = Date.now();
                    this.emit('sessionStarted', message.data);
                    break;

                case 'audio_response':
                    this.metrics.audioChunksReceived++;
                    this.emit('audioResponse', message.data);
                    break;

                case 'text_response':
                    this.emit('textResponse', message.data);
                    break;

                case 'session_ended':
                    this.isSessionActive = false;
                    this.emit('sessionEnded', message.data);
                    break;

                case 'error':
                    console.error('[WebSocket] Server error:', message.data);
                    this.emit('error', message.data);
                    break;

                default:
                    console.log('[WebSocket] Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('[WebSocket] Message handling error:', error);
            this.emit('error', error);
        }
    }

    /**
     * Event listener management
     */
    on(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }

    off(event, listener) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error('[WebSocket] Event listener error:', error);
                }
            });
        }
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            isSessionActive: this.isSessionActive,
            sessionId: this.sessionId
        };
    }

    /**
     * Get metrics
     */
    getMetrics() {
        const sessionDuration = this.metrics.sessionStartTime > 0 
            ? Math.round((Date.now() - this.metrics.sessionStartTime) / 1000)
            : 0;
        
        return {
            ...this.metrics,
            sessionDuration
        };
    }
}

// Export for use in other scripts
window.GeminiLiveWebSocketClient = GeminiLiveWebSocketClient;
