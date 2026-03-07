// ==========================================
// SVALKA - Music Manager
// ==========================================

const MusicManager = (function () {
    const TRACKS = {
        main: 'audio/main.mp3',
        event: 'audio/event.mp3',
        auction: 'audio/auction.mp3',
    };

    const DEFAULT_VOLUME = 0.4;
    const DEFAULT_FADE = 1.0; // seconds

    let _muted = false;
    let _paused = false;
    let _current = null;       // track name currently playing/fading-in
    let _audios = {};          // { name: HTMLAudioElement }
    let _fadeTimers = {};      // { name: intervalId }
    let _unlocked = false;
    let _pendingPlay = null;   // track to play after unlock

    function _createAudio(name) {
        if (_audios[name]) return _audios[name];

        const audio = new Audio(TRACKS[name]);
        audio.loop = true;
        audio.volume = 0;
        audio.preload = 'auto';
        _audios[name] = audio;
        return audio;
    }

    function _fadeVolume(audio, from, to, duration, onDone) {
        const name = Object.keys(_audios).find(k => _audios[k] === audio);
        if (name && _fadeTimers[name]) {
            clearInterval(_fadeTimers[name]);
            delete _fadeTimers[name];
        }

        const steps = Math.max(1, Math.floor(duration * 30)); // ~30fps
        const stepTime = (duration * 1000) / steps;
        const delta = (to - from) / steps;
        let step = 0;

        audio.volume = Math.max(0, Math.min(1, from));

        const timerId = setInterval(() => {
            step++;
            const vol = from + delta * step;
            audio.volume = Math.max(0, Math.min(1, vol));

            if (step >= steps) {
                clearInterval(timerId);
                if (name) delete _fadeTimers[name];
                audio.volume = Math.max(0, Math.min(1, to));
                if (onDone) onDone();
            }
        }, stepTime);

        if (name) _fadeTimers[name] = timerId;
    }

    function _tryPlay(audio) {
        const promise = audio.play();
        if (promise && promise.catch) {
            promise.catch(() => {
                // Autoplay blocked — will retry on unlock
            });
        }
    }

    function _setupUnlock() {
        const unlock = () => {
            _unlocked = true;
            document.removeEventListener('click', unlock);
            document.removeEventListener('touchstart', unlock);

            // Resume pending track
            if (_pendingPlay) {
                play(_pendingPlay);
                _pendingPlay = null;
            }
        };
        document.addEventListener('click', unlock);
        document.addEventListener('touchstart', unlock);
    }

    // ---- Public API ----

    function init() {
        // Pre-create all audio elements
        Object.keys(TRACKS).forEach(name => _createAudio(name));
        _setupUnlock();

        // Restore mute from localStorage
        const saved = localStorage.getItem('svalka_music_muted');
        if (saved === 'true') {
            _muted = true;
        }
    }

    function play(name, fadeDuration) {
        if (!TRACKS[name]) return;
        if (name === _current && !_paused) return;

        fadeDuration = fadeDuration !== undefined ? fadeDuration : DEFAULT_FADE;

        if (!_unlocked) {
            _pendingPlay = name;
            _current = name;
            return;
        }

        const targetAudio = _createAudio(name);
        const targetVolume = _muted ? 0 : DEFAULT_VOLUME;

        // Fade out all other tracks
        Object.keys(_audios).forEach(trackName => {
            if (trackName === name) return;
            const audio = _audios[trackName];
            if (audio.paused) return;

            _fadeVolume(audio, audio.volume, 0, fadeDuration, () => {
                audio.pause();
                audio.currentTime = 0;
            });
        });

        // Fade in target
        if (targetAudio.paused) {
            targetAudio.volume = 0;
            _tryPlay(targetAudio);
        }
        _fadeVolume(targetAudio, targetAudio.volume, targetVolume, fadeDuration);

        _current = name;
        _paused = false;
    }

    function stop(fadeDuration) {
        fadeDuration = fadeDuration !== undefined ? fadeDuration : DEFAULT_FADE;

        Object.keys(_audios).forEach(trackName => {
            const audio = _audios[trackName];
            if (audio.paused) return;

            _fadeVolume(audio, audio.volume, 0, fadeDuration, () => {
                audio.pause();
                audio.currentTime = 0;
            });
        });

        _current = null;
    }

    function pauseAll() {
        _paused = true;
        Object.keys(_audios).forEach(trackName => {
            const audio = _audios[trackName];
            if (!audio.paused) {
                audio.pause();
            }
        });
    }

    function resumeAll() {
        _paused = false;
        if (_current && _audios[_current]) {
            const audio = _audios[_current];
            audio.volume = _muted ? 0 : DEFAULT_VOLUME;
            _tryPlay(audio);
        }
    }

    function setMuted(muted) {
        _muted = muted;
        localStorage.setItem('svalka_music_muted', _muted ? 'true' : 'false');

        Object.keys(_audios).forEach(trackName => {
            const audio = _audios[trackName];
            if (trackName === _current && !_paused) {
                audio.volume = _muted ? 0 : DEFAULT_VOLUME;
            }
        });
    }

    function isMuted() {
        return _muted;
    }

    return {
        init,
        play,
        stop,
        pauseAll,
        resumeAll,
        setMuted,
        isMuted,
    };
})();
