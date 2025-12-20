/**
 * Playback Engine
 * Handles cue playback with fading, looping, and speed control
 */
import { Cue } from '../models/Cue';
import { CueList } from '../models/CueList';
import { DmxController } from '../dmx/DmxController';

export enum PlaybackState {
    STOPPED = 'stopped',
    PLAYING = 'playing',
    PAUSED = 'paused'
}

export class PlaybackEngine {
    private dmxController: DmxController;
    private currentCueList: CueList | null = null;
    private currentCueIndex: number = 0;
    private state: PlaybackState = PlaybackState.STOPPED;
    private fadeIntervalId: NodeJS.Timeout | null = null;
    private nextCueTimeoutId: NodeJS.Timeout | null = null;

    constructor(dmxController: DmxController) {
        this.dmxController = dmxController;
    }

    /**
     * Load a cue list for playback
     */
    loadCueList(cueList: CueList): void {
        this.stop();
        this.currentCueList = cueList;
        this.currentCueIndex = 0;
        console.log(`📋 Loaded CueList: ${cueList.name} (${cueList.cues.length} cues)`);
    }

    /**
     * Start playback
     */
    start(): void {
        if (!this.currentCueList || this.currentCueList.cues.length === 0) {
            throw new Error('No cue list loaded or cue list is empty');
        }

        if (this.state === PlaybackState.PLAYING) {
            console.log('⏸️ Playback already running');
            return;
        }

        this.state = PlaybackState.PLAYING;
        console.log('▶️ Playback started');
        this.executeCue(this.currentCueIndex);
    }

    /**
     * Stop playback
     */
    stop(): void {
        if (this.fadeIntervalId) {
            clearInterval(this.fadeIntervalId);
            this.fadeIntervalId = null;
        }

        if (this.nextCueTimeoutId) {
            clearTimeout(this.nextCueTimeoutId);
            this.nextCueTimeoutId = null;
        }

        this.state = PlaybackState.STOPPED;
        this.currentCueIndex = 0;
        console.log('⏹️ Playback stopped');
    }

    /**
     * Pause playback
     */
    pause(): void {
        if (this.state !== PlaybackState.PLAYING) return;

        if (this.fadeIntervalId) {
            clearInterval(this.fadeIntervalId);
            this.fadeIntervalId = null;
        }

        if (this.nextCueTimeoutId) {
            clearTimeout(this.nextCueTimeoutId);
            this.nextCueTimeoutId = null;
        }

        this.state = PlaybackState.PAUSED;
        console.log('⏸️ Playback paused');
    }

    /**
     * Resume playback
     */
    resume(): void {
        if (this.state !== PlaybackState.PAUSED) return;
        this.state = PlaybackState.PLAYING;
        console.log('▶️ Playback resumed');
        this.executeCue(this.currentCueIndex);
    }

    /**
     * Go to next cue
     */
    next(): void {
        if (!this.currentCueList) return;

        const nextIndex = this.currentCueIndex + 1;

        if (nextIndex >= this.currentCueList.cues.length) {
            // End of list
            if (this.currentCueList.loopEnabled) {
                console.log('🔄 Loop: Restarting from beginning');
                this.currentCueIndex = 0;
                if (this.state === PlaybackState.PLAYING) {
                    this.executeCue(this.currentCueIndex);
                }
            } else {
                console.log('✅ End of cue list reached');
                this.stop();
            }
        } else {
            this.currentCueIndex = nextIndex;
            if (this.state === PlaybackState.PLAYING) {
                this.executeCue(this.currentCueIndex);
            }
        }
    }

    /**
     * Go to previous cue
     */
    previous(): void {
        if (!this.currentCueList) return;

        const prevIndex = this.currentCueIndex - 1;

        if (prevIndex < 0) {
            console.log('⚠️ Already at first cue');
            return;
        }

        this.currentCueIndex = prevIndex;
        if (this.state === PlaybackState.PLAYING) {
            this.executeCue(this.currentCueIndex);
        }
    }

    /**
     * Go to specific cue
     */
    goToCue(cueNumber: number): void {
        if (!this.currentCueList) return;

        const index = this.currentCueList.cues.findIndex(c => c.number === cueNumber);
        if (index >= 0) {
            this.currentCueIndex = index;
            if (this.state === PlaybackState.PLAYING) {
                this.executeCue(this.currentCueIndex);
            }
        } else {
            throw new Error(`Cue ${cueNumber} not found`);
        }
    }

    /**
     * Execute a cue with fading
     */
    private executeCue(index: number): void {
        if (!this.currentCueList || index >= this.currentCueList.cues.length) {
            console.error('Invalid cue index');
            return;
        }

        const cue = this.currentCueList.cues[index];
        console.log(`🎬 Executing Cue ${cue.number}: ${cue.name}`);

        // Apply speed multiplier to fade times
        const fadeInTime = cue.fadeIn / this.currentCueList.speed;
        const fadeOutTime = cue.fadeOut / this.currentCueList.speed;
        const delay = cue.delay / this.currentCueList.speed;

        // Clear any existing fade
        if (this.fadeIntervalId) {
            clearInterval(this.fadeIntervalId);
            this.fadeIntervalId = null;
        }

        // Apply delay if specified
        const executeAfterDelay = () => {
            if (fadeInTime > 0) {
                this.fadeToCue(cue, fadeInTime);
            } else {
                // Instant snap
                this.snapToCue(cue);
            }
        };

        if (delay > 0) {
            setTimeout(executeAfterDelay, delay);
        } else {
            executeAfterDelay();
        }
    }

    /**
     * Snap instantly to cue (no fade)
     */
    private snapToCue(cue: Cue): void {
        for (let ch = 1; ch <= 512; ch++) {
            const value = cue.getChannel(ch);
            this.dmxController.setChannel(ch, value);
        }
        console.log(`✨ Snapped to Cue ${cue.number}`);

        // Auto-advance to next cue if playing
        if (this.state === PlaybackState.PLAYING) {
            // Wait a moment before advancing
            this.nextCueTimeoutId = setTimeout(() => {
                this.next();
            }, 100);
        }
    }

    /**
     * Fade smoothly to cue
     */
    private fadeToCue(targetCue: Cue, fadeTime: number): void {
        const startValues: number[] = [];
        const targetValues: number[] = [];

        // Capture current DMX state
        for (let ch = 1; ch <= 512; ch++) {
            startValues[ch - 1] = this.dmxController.getChannel(ch);
            targetValues[ch - 1] = targetCue.getChannel(ch);
        }

        const steps = Math.max(10, Math.floor(fadeTime / 50)); // 50ms per step
        const stepDuration = fadeTime / steps;
        let currentStep = 0;

        this.fadeIntervalId = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;

            // Linear interpolation
            for (let ch = 1; ch <= 512; ch++) {
                const start = startValues[ch - 1];
                const target = targetValues[ch - 1];
                const value = Math.round(start + (target - start) * progress);
                this.dmxController.setChannel(ch, value);
            }

            if (currentStep >= steps) {
                // Fade complete
                if (this.fadeIntervalId) {
                    clearInterval(this.fadeIntervalId);
                    this.fadeIntervalId = null;
                }

                console.log(`✨ Faded to Cue ${targetCue.number}`);

                // Auto-advance if playing
                if (this.state === PlaybackState.PLAYING) {
                    this.nextCueTimeoutId = setTimeout(() => {
                        this.next();
                    }, 100);
                }
            }
        }, stepDuration);
    }

    /**
     * Get current playback state
     */
    getState(): {
        state: PlaybackState;
        currentCueNumber: number | null;
        currentCueName: string | null;
        loopEnabled: boolean;
        speed: number;
    } {
        if (!this.currentCueList) {
            return {
                state: this.state,
                currentCueNumber: null,
                currentCueName: null,
                loopEnabled: false,
                speed: 1.0
            };
        }

        const currentCue = this.currentCueList.cues[this.currentCueIndex];

        return {
            state: this.state,
            currentCueNumber: currentCue ? currentCue.number : null,
            currentCueName: currentCue ? currentCue.name : null,
            loopEnabled: this.currentCueList.loopEnabled,
            speed: this.currentCueList.speed
        };
    }

    /**
     * Set playback speed
     */
    setSpeed(speed: number): void {
        if (speed < 0.1 || speed > 2.0) {
            throw new Error('Speed must be between 0.1 and 2.0');
        }

        if (this.currentCueList) {
            this.currentCueList.speed = speed;
            console.log(`⚡ Speed set to ${speed}x`);
        }
    }

    /**
     * Toggle loop
     */
    toggleLoop(): boolean {
        if (this.currentCueList) {
            this.currentCueList.loopEnabled = !this.currentCueList.loopEnabled;
            console.log(`🔄 Loop ${this.currentCueList.loopEnabled ? 'enabled' : 'disabled'}`);
            return this.currentCueList.loopEnabled;
        }
        return false;
    }
}
