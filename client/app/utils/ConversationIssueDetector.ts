/**
 * ConversationIssueDetector - Detects and tracks conversational issues
 *
 * Features:
 * - Detects repeated questions/misunderstandings
 * - Tracks conversation context issues
 * - Provides suggestions for improving interactions
 */

export interface ConversationIssue {
  type: 'REPEATED_QUESTION' | 'MISUNDERSTANDING' | 'CONTEXT_LOSS' | 'UNCLEAR_RESPONSE';
  severity: 'low' | 'medium' | 'high';
  transcript: string;
  timestamp: number;
  suggestion?: string;
}

export class ConversationIssueDetector {
  private transcriptHistory: Array<{ text: string; timestamp: number }> = [];
  private issueHistory: ConversationIssue[] = [];
  private readonly HISTORY_LIMIT = 20;
  private readonly SIMILARITY_THRESHOLD = 0.7;

  /**
   * Analyze transcript for conversation issues
   */
  detectIssues(transcript: string): ConversationIssue[] {
    const issues: ConversationIssue[] = [];
    const now = Date.now();

    // Store transcript
    this.transcriptHistory.push({ text: transcript, timestamp: now });
    if (this.transcriptHistory.length > this.HISTORY_LIMIT) {
      this.transcriptHistory.shift();
    }

    // Check for repeated questions
    const repeatedIssue = this.checkForRepeatedQuestions(transcript);
    if (repeatedIssue) {
      issues.push(repeatedIssue);
    }

    // Check for misunderstandings (polyfill responses)
    const misunderstandingIssue = this.checkForMisunderstanding(transcript);
    if (misunderstandingIssue) {
      issues.push(misunderstandingIssue);
    }

    // Store issues
    issues.forEach(issue => this.issueHistory.push(issue));

    return issues;
  }

  /**
   * Check if user is repeating the same question
   */
  private checkForRepeatedQuestions(transcript: string): ConversationIssue | null {
    if (this.transcriptHistory.length < 2) return null;

    // Check last 5 transcripts for similarity
    const recentTranscripts = this.transcriptHistory.slice(-5);
    for (const prev of recentTranscripts) {
      const similarity = this.calculateSimilarity(transcript, prev.text);

      if (similarity > this.SIMILARITY_THRESHOLD) {
        return {
          type: 'REPEATED_QUESTION',
          severity: 'medium',
          transcript,
          timestamp: Date.now(),
          suggestion: 'User may not have received a satisfactory answer. Consider rephrasing or providing more details.'
        };
      }
    }

    return null;
  }

  /**
   * Check for misunderstanding indicators
   */
  private checkForMisunderstanding(transcript: string): ConversationIssue | null {
    const misunderstandingPhrases = [
      'i didn\'t understand',
      'what do you mean',
      'can you repeat',
      'sorry what',
      'huh',
      'pardon',
      'come again'
    ];

    const lowerTranscript = transcript.toLowerCase();
    const hasMisunderstanding = misunderstandingPhrases.some(phrase =>
      lowerTranscript.includes(phrase)
    );

    if (hasMisunderstanding) {
      return {
        type: 'MISUNDERSTANDING',
        severity: 'high',
        transcript,
        timestamp: Date.now(),
        suggestion: 'User didn\'t understand previous response. Try explaining differently or providing examples.'
      };
    }

    return null;
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - (distance / maxLength);
  }

  /**
   * Get recent issues
   */
  getRecentIssues(limit: number = 10): ConversationIssue[] {
    return this.issueHistory.slice(-limit);
  }

  /**
   * Clear history
   */
  clear() {
    this.transcriptHistory = [];
    this.issueHistory = [];
  }

  /**
   * Get statistics
   */
  getStats() {
    const issueTypes = this.issueHistory.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalIssues: this.issueHistory.length,
      issueTypes,
      transcriptCount: this.transcriptHistory.length
    };
  }
}
