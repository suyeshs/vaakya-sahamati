import { useState, useCallback, useRef, useEffect, useMemo } from "react";

export interface AudioVisualizationState {
  audioBars: number[];
  volumeLevel: number;
  isPlaying: boolean;
  isInterruptible: boolean;
  showLanguageSelector: boolean;

  // Methods
  setAudioBars: (bars: number[]) => void;
  setVolumeLevel: (level: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsInterruptible: (interruptible: boolean) => void;
  setShowLanguageSelector: (show: boolean) => void;
  startAudioBars: () => void;
  stopAudioBars: () => void;
  reset: () => void;
}

export function useAudioVisualization(): AudioVisualizationState {
  const [audioBars, setAudioBars] = useState<number[]>([]);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isInterruptible, setIsInterruptible] = useState<boolean>(false);
  const [showLanguageSelector, setShowLanguageSelector] =
    useState<boolean>(false);

  const audioBarsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start animated audio bars for TTS playback
  const startAudioBars = useCallback(() => {
    // Clear any existing interval first
    if (audioBarsIntervalRef.current) {
      clearInterval(audioBarsIntervalRef.current);
    }

    console.log("[AudioVisualization] Starting TTS audio bars...");

    // Simple animated bars for TTS playback
    const animateTTSBars = () => {
      const bars = Array.from({ length: 32 }, () => {
        // Create smooth wave-like patterns for TTS
        const baseHeight = Math.random() * 35 + 15;
        const wave = Math.sin(Date.now() * 0.008 + Math.random() * 5) * 25;
        return Math.max(8, Math.min(90, baseHeight + wave));
      });

      setAudioBars(bars);

      // Higher volume for TTS
      const volumePercent = Math.random() * 25 + 25;
      setVolumeLevel(volumePercent);
    };

    animateTTSBars();
    audioBarsIntervalRef.current = setInterval(() => {
      animateTTSBars();
    }, 60); // Smooth updates for TTS
  }, []);

  // Stop audio bars animation
  const stopAudioBars = useCallback(() => {
    if (audioBarsIntervalRef.current) {
      clearInterval(audioBarsIntervalRef.current);
      audioBarsIntervalRef.current = null;
    }

    // Reset to empty bars
    setAudioBars([]);
    setVolumeLevel(0);
    console.log("[AudioVisualization] Audio bars stopped");
  }, []);

  // Reset all visualization state
  const reset = useCallback(() => {
    setAudioBars([]);
    setVolumeLevel(0);
    setIsPlaying(false);
    setIsInterruptible(false);
    stopAudioBars();
  }, [stopAudioBars]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioBarsIntervalRef.current) {
        clearInterval(audioBarsIntervalRef.current);
      }
    };
  }, []);

  // Memoize the return value to prevent infinite re-renders
  return useMemo(() => ({
    audioBars,
    volumeLevel,
    isPlaying,
    isInterruptible,
    showLanguageSelector,
    setAudioBars,
    setVolumeLevel,
    setIsPlaying,
    setIsInterruptible,
    setShowLanguageSelector,
    startAudioBars,
    stopAudioBars,
    reset
  }), [
    audioBars,
    volumeLevel,
    isPlaying,
    isInterruptible,
    showLanguageSelector,
    setAudioBars,
    setVolumeLevel,
    setIsPlaying,
    setIsInterruptible,
    setShowLanguageSelector,
    startAudioBars,
    stopAudioBars,
    reset
  ]);
}
