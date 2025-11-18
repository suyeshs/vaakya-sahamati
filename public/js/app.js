/**
 * Sophisticated Vaakya Voice Chat Application
 * Uses XState for clean state management and sophisticated conversation flow
 */

class ConversationalVaakyaApp {
    constructor() {
        // Use the optimized voice assistant with VAD-integrated state machine
        this.voiceAssistant = new OptimizedVoiceAssistant();
        this.isInitialized = false;
    }

    /**
     * Initialize the sophisticated voice assistant app
     */
    async init() {
        try {
            console.log('[App] Initializing Sophisticated Vaakya Voice Chat...');
            
            // Initialize the voice assistant (which handles everything)
            await this.voiceAssistant.init();
            
            this.isInitialized = true;
            console.log('[App] Sophisticated voice assistant initialized successfully');
            
        } catch (error) {
            console.error('[App] Initialization failed:', error);
            this.showError('Failed to initialize sophisticated voice assistant');
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('[App] Error:', message);
        // The voice assistant will handle showing errors in the UI
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('[App] Starting Sophisticated Vaakya Voice Chat...');
        const app = new ConversationalVaakyaApp();
        await app.init();
        console.log('[App] Sophisticated Vaakya Voice Chat ready!');
    } catch (error) {
        console.error('[App] Failed to start application:', error);
    }
});