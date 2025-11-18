import { setup, assign } from 'xstate';

export type VoiceAssistantContext = {
  error: string | null;
};

export type VoiceAssistantEvent =
  | { type: 'START' }
  | { type: 'SPEECH_START' }
  | { type: 'SPEECH_END' }
  | { type: 'PROCESSING_COMPLETE' }
  | { type: 'TTS_START' }
  | { type: 'TTS_END' }
  | { type: 'ERROR'; error: string }
  | { type: 'INTERRUPT' }
  | { type: 'STOP' };

export const voiceAssistantMachine = setup({
  types: {
    context: {} as VoiceAssistantContext,
    events: {} as VoiceAssistantEvent,
  },
  actions: {
    clearError: assign({
      error: () => null,
    }),
    setError: assign({
      error: (_, event: any) => event.error || null,
    }),
  },
}).createMachine({
  id: 'voiceAssistant',
  initial: 'idle',
  context: {
    error: null,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'listening',
          actions: 'clearError',
        },
      },
    },
    listening: {
      on: {
        SPEECH_START: 'speaking',
        STOP: 'idle',
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    speaking: {
      on: {
        SPEECH_END: 'processing',
        INTERRUPT: 'listening',
        STOP: 'idle',
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    processing: {
      on: {
        PROCESSING_COMPLETE: 'responding',
        SPEECH_START: 'speaking',
        STOP: 'idle',
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    responding: {
      on: {
        TTS_START: 'playingResponse',
        STOP: 'idle',
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    playingResponse: {
      on: {
        TTS_END: 'listening',
        INTERRUPT: 'listening',
        SPEECH_START: {
          target: 'speaking',
          actions: 'clearError',
        },
        STOP: 'idle',
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    error: {
      on: {
        START: {
          target: 'listening',
          actions: 'clearError',
        },
        STOP: 'idle',
      },
    },
  },
});
