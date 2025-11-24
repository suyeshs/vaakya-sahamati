// src/components/AudioVisualizer.tsx
import React, { useMemo } from "react";

export const AudioVisualizer = ({
  audioLevels,
  sessionStatus
}: {
  audioLevels: number[];
  sessionStatus: 'idle' | 'listening' | 'thinking' | 'speaking';
}) => {
  // Number of concentric circles
  const numCircles = 8;

  // Group audio levels for each circle (average every 4 levels from 32 total)
  const circleData = useMemo(() => {
    const circles = [];
    const levelsPerCircle = Math.ceil(audioLevels.length / numCircles);

    for (let i = 0; i < numCircles; i++) {
      const startIdx = i * levelsPerCircle;
      const endIdx = Math.min(startIdx + levelsPerCircle, audioLevels.length);

      // Average audio levels for this circle
      let avgLevel = 0;
      if (audioLevels.length > 0) {
        const slice = audioLevels.slice(startIdx, endIdx);
        avgLevel = slice.reduce((sum, val) => sum + val, 0) / slice.length;
      } else if (sessionStatus === 'thinking') {
        // Subtle pulsing for thinking
        avgLevel = 0.15 + Math.sin(Date.now() / 400 + i * 0.5) * 0.1;
      } else if (sessionStatus === 'listening') {
        // Gentle wave for listening
        avgLevel = 0.2 + (i * 0.05);
      } else {
        avgLevel = 0.1;
      }

      circles.push({
        index: i,
        level: avgLevel,
        baseRadius: 12 + i * 9, // Base radius increases for outer circles (adjusted to fit viewBox)
      });
    }

    return circles;
  }, [audioLevels, sessionStatus]);

  // Color scheme based on status
  const getCircleColor = (index: number, level: number) => {
    if (sessionStatus === 'thinking') {
      // Orange to amber gradient
      const hue = 30 + (index / numCircles) * 30;
      const opacity = 0.4 + level * 0.6;
      return `hsla(${hue}, 80%, 60%, ${opacity})`;
    } else {
      // Cyan to blue gradient
      const hue = 180 + (index / numCircles) * 60;
      const opacity = 0.4 + level * 0.6;
      return `hsla(${hue}, 70%, 60%, ${opacity})`;
    }
  };

  return (
    <div className="px-6 py-6">
      {/* Concentric Circles Audio Visualizer */}
      <div className="relative flex items-center justify-center">
        <div className="relative w-80 h-80">
          {/* Glow effect - changes color based on state */}
          <div
            className={`absolute inset-0 rounded-full blur-xl transition-colors duration-500 ${
              sessionStatus === 'thinking'
                ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20'
                : 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20'
            }`}
          ></div>

          {/* SVG for efficient rendering */}
          <svg
            className="relative w-full h-full"
            viewBox="0 0 200 200"
            style={{ willChange: 'transform' }}
          >
            {circleData.map((circle) => {
              // Modulate radius and stroke width based on audio level
              const radiusModulation = circle.level * 12; // Reduced to prevent clipping
              const finalRadius = circle.baseRadius + radiusModulation;
              const strokeWidth = 2 + circle.level * 4;
              const color = getCircleColor(circle.index, circle.level);

              return (
                <circle
                  key={circle.index}
                  cx="100"
                  cy="100"
                  r={finalRadius}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  style={{
                    filter: `drop-shadow(0 0 ${4 + circle.level * 8}px ${color})`,
                    transition: 'all 75ms ease-out',
                  }}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
