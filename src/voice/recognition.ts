// Web Speech API interface definitions for client-side speech recognition
export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export interface VoiceRecognizerCallbacks {
  onInterimTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export class VoiceRecognizer {
  private recognition: ISpeechRecognition | null = null;
  private isCurrentlyListening = false;
  private currentTranscript = '';
  private hardTimerId: number | null = null;
  private silenceTimerId: number | null = null;
  private activeResolve: ((transcript: string) => void) | null = null;
  private callbacks: VoiceRecognizerCallbacks;

  constructor(callbacks: VoiceRecognizerCallbacks = {}) {
    this.callbacks = callbacks;
    this.initRecognition();
  }

  private initRecognition(): void {
    if (!isSpeechRecognitionSupported()) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isCurrentlyListening = true;
        this.callbacks.onStart?.();
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let fullTranscript = '';
        let hasFinal = false;

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res || !res[0]) continue;
          fullTranscript += res[0].transcript + ' ';
          if (res.isFinal) {
            hasFinal = true;
          }
        }

        const combined = fullTranscript.trim();
        if (combined) {
          this.currentTranscript = combined;
          this.callbacks.onInterimTranscript?.(combined);

          // If browser finalized a phrase, conclude in 350ms grace period.
          // Otherwise, start a 750ms silence debounce so stopping speaking completes the guess.
          this.resetSilenceTimer(hasFinal ? 350 : 750);
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          this.callbacks.onError?.(event.error);
        }
      };

      this.recognition.onend = () => {
        if (this.isCurrentlyListening) {
          this.finishListening();
        }
        this.clearAllTimers();
        this.callbacks.onEnd?.();
      };
    } catch {
      this.recognition = null;
    }
  }

  public isListening(): boolean {
    return this.isCurrentlyListening;
  }

  public startListening(timeoutMs = 3000): Promise<string> {
    return new Promise((resolve) => {
      this.currentTranscript = '';
      this.clearAllTimers();
      this.activeResolve = resolve;

      if (!this.recognition) {
        this.callbacks.onError?.('Speech recognition is not supported in this browser.');
        this.finishListening();
        return;
      }

      this.hardTimerId = window.setTimeout(() => {
        this.finishListening();
      }, timeoutMs);

      try {
        this.recognition.start();
      } catch {
        try {
          this.recognition.stop();
          this.recognition.start();
        } catch {
          this.finishListening();
        }
      }
    });
  }

  private resetSilenceTimer(delayMs: number): void {
    if (this.silenceTimerId !== null) {
      window.clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }

    if (this.isCurrentlyListening && this.currentTranscript.trim()) {
      this.silenceTimerId = window.setTimeout(() => {
        this.finishListening();
      }, delayMs);
    }
  }

  private finishListening(): void {
    this.clearAllTimers();

    if (this.isCurrentlyListening && this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.isCurrentlyListening = false;

    const transcript = this.currentTranscript;
    this.callbacks.onFinalTranscript?.(transcript);

    if (this.activeResolve) {
      const resolve = this.activeResolve;
      this.activeResolve = null;
      resolve(transcript);
    }
  }

  public stopListening(): string {
    const result = this.currentTranscript;
    this.finishListening();
    return result;
  }

  private clearAllTimers(): void {
    if (this.hardTimerId !== null) {
      window.clearTimeout(this.hardTimerId);
      this.hardTimerId = null;
    }
    if (this.silenceTimerId !== null) {
      window.clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }
  }
}
