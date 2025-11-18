/**
 * InterruptionDetector - Detects when user interrupts AI speech
 *
 * Features:
 * - Detects user speech during AI playback
 * - Provides natural barge-in support
 * - Tracks interruption patterns
 */

export interface InterruptionEvent {
  timestamp: number;
  aiSpeakingDuration: number; // How long AI was speaking before interruption
  interruptionType: 'early' | 'mid' | 'late';
}

export class InterruptionDetector {
  private isAISpeaking: boolean = false;
  private aiSpeechStartTime: number = 0;
  private interruptions: InterruptionEvent[] = [];
  private onInterruptCallback: ((event: InterruptionEvent) => void) | null = null;

  /**
   * Mark when AI starts speaking
   */
  startAISpeech(): void {
    this.isAISpeaking = true;
    this.aiSpeechStartTime = Date.now();
    console.log('[InterruptionDetector] AI speech started');
  }

  /**
   * Mark when AI stops speaking
   */
  endAISpeech(): void {
    this.isAISpeaking = false;
    this.aiSpeechStartTime = 0;
    console.log('[InterruptionDetector] AI speech ended');
  }

  /**
   * Detect if user speech is an interruption
   */
  detectInterruption(): InterruptionEvent | null {
    if (!this.isAISpeaking) {
      return null;
    }

    const now = Date.now();
    const aiSpeakingDuration = now - this.aiSpeechStartTime;

    // Classify interruption type based on timing
    let interruptionType: 'early' | 'mid' | 'late';
    if (aiSpeakingDuration < 1000) {
      interruptionType = 'early'; // Within first second
    } else if (aiSpeakingDuration < 3000) {
      interruptionType = 'mid'; // 1-3 seconds
    } else {
      interruptionType = 'late'; // After 3 seconds
    }

    const event: InterruptionEvent = {
      timestamp: now,
      aiSpeakingDuration,
      interruptionType
    };

    this.interruptions.push(event);
    console.log('[InterruptionDetector] 🚫 Interruption detected:', interruptionType, `(${aiSpeakingDuration}ms)`);

    // Trigger callback
    if (this.onInterruptCallback) {
      this.onInterruptCallback(event);
    }

    return event;
  }

  /**
   * Set interruption callback
   */
  onInterrupt(callback: (event: InterruptionEvent) => void): void {
    this.onInterruptCallback = callback;
  }

  /**
   * Check if AI is currently speaking
   */
  isAICurrentlySpeaking(): boolean {
    return this.isAISpeaking;
  }

  /**
   * Get interruption history
   */
  getInterruptions(): InterruptionEvent[] {
    return [...this.interruptions];
  }

  /**
   * Get interruption statistics
   */
  getStats() {
    if (this.interruptions.length === 0) {
      return {
        totalInterruptions: 0,
        averageDuration: 0,
        earlyInterruptions: 0,
        midInterruptions: 0,
        lateInterruptions: 0
      };
    }

    const stats = {
      totalInterruptions: this.interruptions.length,
      averageDuration: 0,
      earlyInterruptions: 0,
      midInterruptions: 0,
      lateInterruptions: 0
    };

    let totalDuration = 0;
    this.interruptions.forEach(int => {
      totalDuration += int.aiSpeakingDuration;
      stats[`${int.interruptionType}Interruptions`]++;
    });

    stats.averageDuration = totalDuration / this.interruptions.length;

    return stats;
  }

  /**
   * Clear history
   */
  clear(): void {
    this.interruptions = [];
    this.isAISpeaking = false;
    this.aiSpeechStartTime = 0;
  }

  /**
   * Reset state (for new conversation)
   */
  reset(): void {
    this.clear();
    this.onInterruptCallback = null;
  }
}
