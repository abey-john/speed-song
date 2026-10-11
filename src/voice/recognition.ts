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
  private timerId: number | null = null;
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
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res || !res[0]) continue;
          if (res.isFinal) {
            finalText += res[0].transcript + ' ';
          } else {
            interimText += res[0].transcript + ' ';
          }
        }

        const combined = (finalText || interimText).trim();
        if (combined) {
          this.currentTranscript = combined;
          this.callbacks.onInterimTranscript?.(combined);
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          this.callbacks.onError?.(event.error);
        }
      };

      this.recognition.onend = () => {
        this.isCurrentlyListening = false;
        this.clearTimer();
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
      this.clearTimer();

      if (!this.recognition) {
        this.callbacks.onError?.('Speech recognition is not supported in this browser.');
        resolve('');
        return;
      }

      const finishListening = () => {
        this.clearTimer();
        if (this.isCurrentlyListening) {
          try {
            this.recognition?.stop();
          } catch {}
        }
        this.callbacks.onFinalTranscript?.(this.currentTranscript);
        resolve(this.currentTranscript);
      };

      this.timerId = window.setTimeout(finishListening, timeoutMs);

      try {
        this.recognition.start();
      } catch {
        // If already started, restart
        try {
          this.recognition.stop();
          this.recognition.start();
        } catch {
          finishListening();
        }
      }
    });
  }

  public stopListening(): string {
    this.clearTimer();
    if (this.isCurrentlyListening && this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    const result = this.currentTranscript;
    this.callbacks.onFinalTranscript?.(result);
    return result;
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
