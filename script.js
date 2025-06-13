document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const bpmInput = document.getElementById('bpmInput');
    const barsInput = document.getElementById('barsInput');
    const resInput = document.getElementById('resInput');
    const strengthInput = document.getElementById('strength');
    const candidatesInput = document.getElementById('candidates');
    const showTopInput = document.getElementById('show-top');
    const resetBtn = document.getElementById('resetGrid');
    const logEl = document.getElementById('log');
    const playInBtn = document.getElementById('play-input');
    const mutateBtn = document.getElementById('mutate');
    const editor = document.getElementById('editor');
    const eCtx = editor.getContext('2d');
    const labelsCanvas = document.getElementById('labels');
    const lCtx = labelsCanvas.getContext('2d');
    const variantsContainer = document.getElementById('variants-container');
    const metronomeBtn = document.getElementById('metronome');
    const skipStartBtn = document.getElementById('skip-start');

    // Constants
    const beats = 4;
    const pitchMin = 48; // C3
    const pitchMax = 72; // C5
    const rows = pitchMax - pitchMin + 1;
    const blackKeyPitches = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#

    // VAE Model
    let model;

    // Synths and transport
    let metronomeSynth, noteSynth, tonePart;
    let isMetronomeOn = false;
    let playheadAnimationId;

    // Players
    const inputPlayer = new core.Player();

    // State
    let originalNotes = []; // {step, duration, pitch}
    let dragStart = null;
    let isDragging = false;
    let currentlyMovingNote = null;
    let currentlyResizingNote = null;
    let resizeHandle = null; // 'left' or 'right'
    let hoveredNote = null;

    // --- Theming ---
    const themes = {
        dark: {
            background: '#282828',
            gridLine: '#333',
            gridBarLine: '#555',
            note: '#0d6efd',
            noteStroke: '#a0c7ff',
            noteHover: '#3d8bfd',
            whiteKey: '#282828',
            blackKey: '#222',
        }
    };
    const colors = themes.dark; // Default to dark theme

    // --- Utility Functions ---
    function log(...args) {
        logEl.textContent = args.join(' ') + '\n' + logEl.textContent;
    }

    function getMousePos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        // scale factors from CSS pixels → canvas pixels
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    }

    function getNoteAt(x, y) {
        const bars = +barsInput.value;
        const res = +resInput.value;
        const cols = bars * beats * res;
        const cellW = editor.width / cols;
        const cellH = editor.height / rows;

        for (const note of originalNotes) {
            const noteX = note.step * cellW;
            const noteY = (pitchMax - note.pitch) * cellH;
            const noteW = note.duration * cellW;

            if (x >= noteX && x <= noteX + noteW && y >= noteY && y <= noteY + cellH) {
                return note;
            }
        }
        return null;
    }

    function getResizeHandle(x, note) {
        const bars = +barsInput.value;
        const res = +resInput.value;
        const cols = bars * beats * res;
        const cellW = editor.width / cols;
        const noteX = note.step * cellW;
        const noteW = note.duration * cellW;
        const handleWidth = Math.min(10, cellW / 2);

        if (x >= noteX && x < noteX + handleWidth) return 'left';
        if (x > noteX + noteW - handleWidth && x <= noteX + noteW) return 'right';
        return null;
    }

    // --- Drawing Functions ---
    function pitchToNoteName(pitch) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const note = noteNames[pitch % 12];
        return note;
    }

    function drawLabels() {
        const cellH = labelsCanvas.height / rows;
        lCtx.clearRect(0, 0, labelsCanvas.width, labelsCanvas.height);

        lCtx.font = '10px sans-serif';
        lCtx.textAlign = 'right';
        lCtx.textBaseline = 'middle';

        for (let i = 0; i < rows; i++) {
            const pitch = pitchMax - i;
            const y = i * cellH;
            const isBlackKey = blackKeyPitches.includes(pitch % 12);

            lCtx.fillStyle = isBlackKey ? colors.blackKey : colors.whiteKey;
            lCtx.fillRect(0, y, labelsCanvas.width, cellH);

            lCtx.fillStyle = '#ccc'; // text color
            lCtx.fillText(pitchToNoteName(pitch), labelsCanvas.width - 5, y + cellH / 2);
        }
    }

    function drawGridAndNotes() {
        const bars = +barsInput.value;
        const res = +resInput.value;
        const cols = bars * beats * res;
        const cellW = editor.width / cols;
        const cellH = editor.height / rows;

        eCtx.clearRect(0, 0, editor.width, editor.height);
        eCtx.fillStyle = colors.background;
        eCtx.fillRect(0, 0, editor.width, editor.height);

        // Horizontal lines (with alternating background for clarity)
        for (let i = 0; i < rows; i++) {
            const pitch = pitchMax - i;
            const y = i * cellH;
            const isBlackKey = blackKeyPitches.includes(pitch % 12);
            eCtx.fillStyle = isBlackKey ? colors.blackKey : colors.whiteKey;
            eCtx.fillRect(0, y, editor.width, cellH);
        }
        
        // Vertical lines
        eCtx.strokeStyle = colors.gridLine;
        for (let i = 0; i <= cols; i++) {
            eCtx.beginPath();
            eCtx.lineWidth = (i % res === 0) ? 0.75 : 0.5; // Thicker line for beat
            eCtx.strokeStyle = (i % (beats * res) === 0) ? colors.gridBarLine : colors.gridLine; // Thicker for bar
            eCtx.moveTo(i * cellW, 0);
            eCtx.lineTo(i * cellW, editor.height);
            eCtx.stroke();
        }

        // Draw notes
        for (const note of originalNotes) {
            const { step, duration, pitch } = note;
            const x = step * cellW;
            const y = (pitchMax - pitch) * cellH;
            
            eCtx.fillStyle = (note === hoveredNote) ? colors.noteHover : colors.note;
            eCtx.fillRect(x, y, duration * cellW, cellH);
            eCtx.strokeStyle = colors.noteStroke;
            eCtx.strokeRect(x, y, duration * cellW, cellH);
        }
    }

    function drawPlayhead() {
        if (Tone.Transport.state === 'stopped') return;

        const bars = +barsInput.value;
        const totalTime = Tone.Time(bars + 'm').toSeconds();
        const percent = (Tone.Transport.seconds % totalTime) / totalTime;
        
        const x = percent * editor.width;
        
        eCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        eCtx.lineWidth = 2;
        eCtx.beginPath();
        eCtx.moveTo(x, 0);
        eCtx.lineTo(x, editor.height);
        eCtx.stroke();
    }

    function animationLoop() {
        drawEditor();
        playheadAnimationId = requestAnimationFrame(animationLoop);
    }

    function drawEditor() {
        drawGridAndNotes();
        drawLabels();
        drawPlayhead();
    }

    // --- Note to Sequence Conversion ---
    function makeProto(notes) {
        const bars = +barsInput.value;
        const res = +resInput.value;
        const seqNotes = notes.map(n => ({
            pitch: n.pitch,
            startTime: n.step / res,
            endTime: (n.step + n.duration) / res
        }));
        const seqJson = {
            ticksPerQuarter: 220,
            totalTime: bars * beats,
            notes: seqNotes,
            tempos: [{ time: 0, qpm: +bpmInput.value }]
        };
        return core.sequences.unquantizeSequence(
            core.sequences.quantizeNoteSequence(seqJson, res)
        );
    }

    // --- Event Handlers ---
    function handleMouseDown(e) {
        const { x, y } = getMousePos(editor, e);
        const note = getNoteAt(x, y);

        if (e.altKey && note) {
            originalNotes = originalNotes.filter(n => n !== note);
            drawEditor();
            return;
        }

        if (note) {
            const handle = getResizeHandle(x, note);
            if (handle) {
                currentlyResizingNote = note;
                resizeHandle = handle;
            } else {
                currentlyMovingNote = note;
            }
        } else {
            const res = +resInput.value;
            const bars = +barsInput.value;
            const cols = bars * beats * res;
            const step = Math.floor((x / editor.width) * cols);
            const pitch = pitchMax - Math.floor((y / editor.height) * rows);
            dragStart = { step, pitch, x, y };
        }
        isDragging = true;
    }

    function handleMouseMove(e) {
        const { x, y } = getMousePos(editor, e);
        if (isDragging) {
            const res = +resInput.value;
            const bars = +barsInput.value;
            const cols = bars * beats * res;
            const cellW = editor.width / cols;

            if (currentlyMovingNote) {
                const newStep = Math.round(x / cellW);
                const newPitch = pitchMax - Math.floor((y / editor.height) * rows);

                // Clamp pitch
                const clampedPitch = Math.max(pitchMin, Math.min(pitchMax, newPitch));

                // Check for collisions before moving
                const collision = originalNotes.some(n =>
                    n !== currentlyMovingNote &&
                    newStep < n.step + n.duration &&
                    newStep + currentlyMovingNote.duration > n.step &&
                    clampedPitch === n.pitch
                );

                if (!collision) {
                    currentlyMovingNote.step = newStep;
                    currentlyMovingNote.pitch = clampedPitch;
                    drawEditor();
                }

            } else if (currentlyResizingNote) {
                const step = Math.round(x / cellW);

                if (resizeHandle === 'right') {
                    const newDuration = Math.max(1, step - currentlyResizingNote.step);
                    currentlyResizingNote.duration = newDuration;
                } else { // left handle
                    const oldEndStep = currentlyResizingNote.step + currentlyResizingNote.duration;
                    const newStep = Math.min(step, oldEndStep - 1);
                    const newDuration = oldEndStep - newStep;
                    if (newDuration > 0) {
                        currentlyResizingNote.step = newStep;
                        currentlyResizingNote.duration = newDuration;
                    }
                }
                drawEditor();

            } else if (dragStart) {
                // Draw a temporary rectangle for the new note
                drawEditor();
                eCtx.fillStyle = 'rgba(13, 110, 253, 0.5)';
                const startX = dragStart.step * cellW;
                const startY = (pitchMax - dragStart.pitch) * (editor.height / rows);
                const width = x - startX;
                const height = editor.height / rows;
                eCtx.fillRect(startX, startY, width, height);
            }
        } else {
            // Logic for hover effects
            const note = getNoteAt(x, y);
            const handle = note ? getResizeHandle(x, note) : null;
            
            if (handle) {
                editor.style.cursor = 'ew-resize';
                hoveredNote = note;
            } else if (note) {
                editor.style.cursor = 'move';
                hoveredNote = note;
            } else {
                editor.style.cursor = 'crosshair';
                hoveredNote = null;
            }
            drawEditor();
        }
    }

    function handleMouseUp(e) {
        if (!isDragging) return;

        const { x, y } = getMousePos(editor, e);
        const res = +resInput.value;
        const bars = +barsInput.value;
        const cols = bars * beats * res;

        if (dragStart) {
            const step2 = Math.round((x / editor.width) * cols);
            const startStep = Math.min(dragStart.step, step2);
            const endStep = Math.max(dragStart.step, step2);
            const duration = Math.max(1, endStep - startStep);
            
            if (duration > 0) {
                const newNote = {
                    step: startStep,
                    duration: duration,
                    pitch: dragStart.pitch
                };

                // Prevent creating overlapping notes
                const collision = originalNotes.some(n =>
                    newNote.step < n.step + n.duration &&
                    newNote.step + newNote.duration > n.step &&
                    newNote.pitch === n.pitch
                );

                if (!collision) {
                    originalNotes.push(newNote);
                }
            }
        }

        isDragging = false;
        dragStart = null;
        currentlyMovingNote = null;
        currentlyResizingNote = null;
        drawEditor();
    }
    
    function handleMouseOut(e) {
        if (isDragging) {
            handleMouseUp(e);
        }
    }
    
    async function togglePlayback() {
        if (!originalNotes.length) {
            return alert('Draw some notes first');
        }
        await Tone.start();

        if (Tone.Transport.state === 'started') {
            Tone.Transport.pause();
            cancelAnimationFrame(playheadAnimationId);
            playInBtn.textContent = '▶️ Play';
            drawEditor(); // Redraw to show final playhead position
        } else {
            updateTransport();
            Tone.Transport.start();
            animationLoop();
            playInBtn.textContent = '⏸️ Pause';
        }
    }

    function skipToStart() {
        Tone.Transport.stop();
        cancelAnimationFrame(playheadAnimationId);
        playheadAnimationId = null;
        playInBtn.textContent = '▶️ Play';
        drawEditor(); // Redraw to remove playhead
    }

    function toggleMetronome() {
        isMetronomeOn = !isMetronomeOn;
        metronomeBtn.style.backgroundColor = isMetronomeOn ? colors.note : '';
        metronomeBtn.style.color = isMetronomeOn ? 'white' : '';
        if (Tone.Transport.state === 'started') {
            updateTransport();
        }
    }
    
    function updateTransport() {
        Tone.Transport.cancel(); // Clear previous events
        
        // Note playback
        tonePart = new Tone.Part((time, note) => {
            noteSynth.triggerAttackRelease(
                Tone.Frequency(note.pitch, 'midi'),
                Tone.Time(note.duration / +resInput.value * (60 / +bpmInput.value)),
                time
            );
        }, originalNotes.map(n => ({
            time: Tone.Time(n.step / +resInput.value * (60 / +bpmInput.value)),
            ...n
        }))).start(0);

        // Metronome
        if (isMetronomeOn) {
            Tone.Transport.scheduleRepeat(time => {
                metronomeSynth.triggerAttackRelease('C5', '8n', time);
            }, '4n');
        }
        
        const bars = +barsInput.value;
        Tone.Transport.loop = true;
        Tone.Transport.loopStart = 0;
        Tone.Transport.loopEnd = Tone.Time(bars + 'm');
        Tone.Transport.bpm.value = +bpmInput.value;
    }

    async function playInput() {
        if (inputPlayer.isPlaying()) {
            inputPlayer.stop();
            playInBtn.textContent = '▶️ Play Input';
            return;
        }
        if (!originalNotes.length) {
            return alert('Draw some notes first');
        }
        await Tone.start();
        inputPlayer.setTempo(+bpmInput.value);
        inputPlayer.start(makeProto(originalNotes));
        playInBtn.textContent = '⏸️ Pause Input';
    }

    function resetGrid() {
        originalNotes = [];
        skipToStart(); // Stop playback and reset
        drawEditor();
    }

    async function suggestVariation() {
        if (!model) return alert('Model not ready');
        if (!originalNotes.length) return alert('Draw some notes first');

        log('Generating candidates...');
        mutateBtn.disabled = true;

        const N = +candidatesInput.value;
        const K = +showTopInput.value;
        const sigma = +strengthInput.value;
        const res = +resInput.value;

        const proto = makeProto(originalNotes);
        if (!proto.notes.length) {
            mutateBtn.disabled = false;
            return alert('No notes to mutate.');
        }

        const q = core.sequences.quantizeNoteSequence(proto, res);
        const z = (await model.encode([q])).squeeze();

        const zBatch = tf.stack(Array(N).fill(z));
        const noiseBatch = tf.randomNormal(zBatch.shape, 0, sigma);
        const zRuns = zBatch.add(noiseBatch);
        const variants = await model.decode(zRuns);

        const latentDists = tf.sqrt(tf.sum(tf.square(noiseBatch), -1)).arraySync();

        const winners = variants
            .map((seq, i) => ({ seq, score: latentDists[i] }))
            .sort((a, b) => a.score - b.score)
            .slice(0, K);

        // Clean up tensors
        z.dispose();
        zBatch.dispose();
        noiseBatch.dispose();
        zRuns.dispose();

        // Present winners
        variantsContainer.innerHTML = '';
        winners.forEach((winner, i) => {
            const card = document.createElement('div');
            card.className = 'variant-card';

            const title = document.createElement('strong');
            title.textContent = `Variant ${i + 1} (score: ${winner.score.toFixed(2)})`;
            card.appendChild(title);

            const canvas = document.createElement('canvas');
            canvas.width = editor.width / 2;
            canvas.height = editor.height / 2;
            card.appendChild(canvas);
            
            // This is a simplified drawing function for variants
            const vCtx = canvas.getContext('2d');
            const notes = winner.seq.notes;
            const bars = +barsInput.value;
            const vRes = +resInput.value;
            const vCols = bars * beats * vRes;
            const vCellW = canvas.width / vCols;
            const vCellH = canvas.height / rows;

            vCtx.fillStyle = colors.note;
            for (const note of notes) {
                const step = note.quantizedStartStep;
                const duration = note.quantizedEndStep - step;
                const x = step * vCellW;
                const y = (pitchMax - note.pitch) * vCellH;
                vCtx.fillRect(x, y, duration * vCellW, vCellH);
            }

            const playBtn = document.createElement('button');
            playBtn.textContent = '▶️ Play';
            playBtn.onclick = async () => {
                const player = new Tone.Player().toDestination();
                await Tone.loaded();
                
                const variantSynth = new Tone.PolySynth(Tone.Synth).toDestination();
                const part = new Tone.Part((time, note) => {
                    variantSynth.triggerAttackRelease(
                        Tone.Frequency(note.pitch, 'midi'),
                        note.quantizedEndStep - note.quantizedStartStep,
                        time
                    );
                }, winner.seq.notes).start(0);

                part.loop = false;

                const duration = Tone.Time(core.sequences.quantizeNoteSequence(winner.seq, 4).totalQuantizedSteps, "4n").toSeconds();

                if (Tone.Transport.state === 'started') {
                    Tone.Transport.pause();
                }
                
                Tone.Transport.scheduleOnce(() => {
                    part.stop();
                    part.dispose();
                    variantSynth.dispose();
                }, `+${duration}`);
                
                Tone.Transport.start();
            };
            card.appendChild(playBtn);

            variantsContainer.appendChild(card);
        });
        
        mutateBtn.disabled = false;
        log('Done.');
    }

    // --- Initialization ---
    function init() {
        // Event Listeners
        bpmInput.addEventListener('change', () => {
            if (Tone.Transport.state === 'started') updateTransport();
            drawEditor();
        });
        barsInput.addEventListener('change', () => {
            if (Tone.Transport.state === 'started') updateTransport();
            drawEditor();
        });
        resInput.addEventListener('change', () => {
            if (Tone.Transport.state === 'started') updateTransport();
            drawEditor();
        });
        resetBtn.addEventListener('click', resetGrid);
        playInBtn.addEventListener('click', togglePlayback);
        metronomeBtn.addEventListener('click', toggleMetronome);
        skipStartBtn.addEventListener('click', skipToStart);
        mutateBtn.addEventListener('click', suggestVariation);

        editor.addEventListener('mousedown', handleMouseDown);
        editor.addEventListener('mousemove', handleMouseMove);
        editor.addEventListener('mouseup', handleMouseUp);
        editor.addEventListener('mouseout', handleMouseOut);

        // Add class to body for dark mode
        document.body.classList.add('dark');

        // Setup Synths
        noteSynth = new Tone.PolySynth(Tone.Synth).toDestination();
        metronomeSynth = new Tone.MembraneSynth().toDestination();

        // Load model
        log('Loading model...');
        model = new music_vae.MusicVAE('https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_16bar_small_q2');
        model.initialize().then(() => {
            log('Model loaded.');
            mutateBtn.disabled = false;
        });

        // Initial Draw
        drawEditor();
    }

    init();
}); 