/**
 * GracefulAudioCancellation - Manages smooth audio interruptions
 *
 * Features:
 * - Fade out audio instead of abrupt stops
 * - Queue management for audio playback
 * - Prevents audio glitches during interruptions
 */

export interface AudioQueueItem {
  audio: HTMLAudioElement;
  id: string;
  startTime: number;
  priority: 'normal' | 'high';
}

export class GracefulAudioCancellation {
  private audioQueue: AudioQueueItem[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private fadeOutDuration: number = 200; // ms
  private volumeCheckInterval: NodeJS.Timeout | null = null;

  constructor(fadeOutDuration: number = 200) {
    this.fadeOutDuration = fadeOutDuration;
  }

  /**
   * Play audio with graceful cancellation support
   */
  async playAudio(audioElement: HTMLAudioElement, priority: 'normal' | 'high' = 'normal'): Promise<void> {
    const id = `audio-${Date.now()}-${Math.random()}`;

    // If high priority, cancel current audio
    if (priority === 'high' && this.currentAudio) {
      await this.cancelCurrent();
    }

    // Add to queue
    const queueItem: AudioQueueItem = {
      audio: audioElement,
      id,
      startTime: Date.now(),
      priority
    };

    this.audioQueue.push(queueItem);

    // If nothing playing, start immediately
    if (!this.currentAudio) {
      await this.playNext();
    }

    return new Promise((resolve, reject) => {
      audioElement.onended = () => {
        this.onAudioEnded(id);
        resolve();
      };

      audioElement.onerror = (error) => {
        this.onAudioEnded(id);
        reject(error);
      };
    });
  }

  /**
   * Cancel currently playing audio with fade out
   */
  async cancelCurrent(): Promise<void> {
    if (!this.currentAudio) return;

    return new Promise((resolve) => {
      const audio = this.currentAudio!;
      const initialVolume = audio.volume;
      const startTime = Date.now();

      const fadeInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / this.fadeOutDuration, 1);

        // Linear fade out
        audio.volume = initialVolume * (1 - progress);

        if (progress >= 1) {
          clearInterval(fadeInterval);
          audio.pause();
          audio.currentTime = 0;
          audio.volume = initialVolume; // Reset volume for next use
          this.currentAudio = null;
          resolve();
        }
      }, 10); // Update every 10ms for smooth fade
    });
  }

  /**
   * Cancel all audio in queue
   */
  async cancelAll(): Promise<void> {
    // Cancel current
    await this.cancelCurrent();

    // Clear queue
    this.audioQueue.forEach(item => {
      item.audio.pause();
      item.audio.currentTime = 0;
    });

    this.audioQueue = [];
  }

  /**
   * Play next audio in queue
   */
  private async playNext(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.currentAudio = null;
      return;
    }

    const nextItem = this.audioQueue.shift()!;
    this.currentAudio = nextItem.audio;

    try {
      await nextItem.audio.play();
    } catch (error) {
      console.error('[GracefulAudioCancellation] Play error:', error);
      this.onAudioEnded(nextItem.id);
    }
  }

  /**
   * Handle audio ended event
   */
  private onAudioEnded(id: string): void {
    // Remove from queue if still there
    this.audioQueue = this.audioQueue.filter(item => item.id !== id);

    // Play next if current audio ended
    if (this.currentAudio) {
      this.currentAudio = null;
      this.playNext();
    }
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(): boolean {
    return this.currentAudio !== null && !this.currentAudio.paused;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.audioQueue.length;
  }

  /**
   * Get current playback position (0-1)
   */
  getCurrentPosition(): number {
    if (!this.currentAudio) return 0;

    const duration = this.currentAudio.duration;
    if (!duration || isNaN(duration)) return 0;

    return this.currentAudio.currentTime / duration;
  }

  /**
   * Set fade out duration
   */
  setFadeOutDuration(duration: number): void {
    this.fadeOutDuration = Math.max(50, Math.min(duration, 1000)); // Between 50ms and 1s
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      queueLength: this.audioQueue.length,
      isPlaying: this.isPlaying(),
      currentPosition: this.getCurrentPosition(),
      fadeOutDuration: this.fadeOutDuration
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.volumeCheckInterval) {
      clearInterval(this.volumeCheckInterval);
    }

    this.cancelAll();
  }
}
