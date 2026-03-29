/**
 * PolychordEngine (Standalone Port)
 */
const PolychordEngine = {
    ctx: null, masterGain: null, scales: {
        major: [523.25, 587.33, 659.25, 783.99, 880.00],
    }, currentScale: null, glitchInterval: null,

    init: function () {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.ctx.destination);
        this.currentScale = this.scales.major;
    },

    resume: async function() {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();
    },

    playNote: function (freq, options = {}) {
        if (!this.ctx) return;
        const randFreq = freq * (0.97 + Math.random() * 0.06); 
        const volume = (options.volume || 0.1) * (options.globalVol || 1.0);
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        osc.type = options.type || (Math.random() > 0.5 ? 'sine' : 'triangle');
        osc.frequency.setValueAtTime(randFreq, now);
        osc.frequency.exponentialRampToValueAtTime(randFreq * 1.2, now + 0.1);
        const attack = 0.02, decay = 0.05, release = options.release || 0.3;
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(volume, now + attack);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);
        osc.connect(noteGain);
        noteGain.connect(this.masterGain);
        osc.start(now); osc.stop(now + 0.5);
    },

    play: async function (type, vol = 1.0) {
        await this.resume();
        const s = this.currentScale;
        if (type === 'chime') [0, 2, 4, 7].forEach((n, i) => setTimeout(() => this.playNote(s[n % 5] * 2, { volume: 0.05, globalVol: vol }), i * 50));
        else if (type === 'strum') [0, 1, 2, 3, 4].forEach((n, i) => setTimeout(() => this.playNote(s[n] * 1.5, { volume: 0.04, globalVol: vol }), i * 30));
        else if (type === 'click') this.playNote(s[0] * 2, { volume: 0.1, globalVol: vol });
        else if (type === 'lift') this.playNote(s[3] * 3, { volume: 0.05, globalVol: vol });
        else if (type === 'place') this.playNote(s[0], { volume: 0.06, globalVol: vol });
    },

    startGlitchLoop: function() {
        if (this.glitchInterval) return;
        this.glitchInterval = setInterval(() => {
            const freq = 800 + Math.random() * 2000;
            this.playNote(freq, { volume: 0.03, type: 'square', release: 0.1 });
        }, 100);
    },

    stopGlitchLoop: function() {
        if (this.glitchInterval) { clearInterval(this.glitchInterval); this.glitchInterval = null; }
    }
};

/**
 * Background Music Controller
 */
const MusicController = {
    audio: null, isPlaying: false,

    init: function() {
        this.audio = new Audio('layers/cicada.mp3');
        this.audio.loop = true;
        this.audio.volume = 0.15;
        const btn = document.getElementById('toggle-music');
        if (btn) btn.addEventListener('click', () => this.toggle());
    },

    play: function() {
        this.audio.play().then(() => { this.isPlaying = true; this.updateButton(); }).catch(e => {});
    },

    pause: function() {
        this.audio.pause(); this.isPlaying = false; this.updateButton();
    },

    toggle: function() {
        if (this.isPlaying) this.pause();
        else this.play();
    },

    updateButton: function() {
        const btn = document.getElementById('toggle-music');
        if (btn) btn.innerText = this.isPlaying ? "⏸" : "▶";
    }
};

const HARCODED_LAYOUT = [
  { id: "ashtray", x: 110, y: 31, rotate: 0, depth: 0.10, zIndex: 0, scale: 2.50 },
  { id: "cd-case", x: 752, y: 358, rotate: 0, depth: 0.10, zIndex: 107, scale: 3.46 },
  { id: "coin", x: 1258, y: 47, rotate: 0, depth: 0.20, zIndex: 2, scale: 0.57 },
  { id: "floppy", x: 1521, y: 100, rotate: 0, depth: 0.25, zIndex: 2, scale: 2.02 },
  { id: "pen", x: 1628, y: 197, rotate: 0, depth: 0.15, zIndex: 2, scale: 1.24 },
  { id: "bobber", x: 1544, y: 676, rotate: 0, depth: 0.30, zIndex: 105, scale: 1.00 },
  { id: "keychain", x: 231, y: 713, rotate: 0, depth: 0.20, zIndex: 102, scale: 1.80 },
  { id: "foldedp", x: 494, y: 39, rotate: 0, depth: 0.10, zIndex: 108, scale: 1.00 },
  { id: "oldkey", x: 1092, y: 751, rotate: 0, depth: 0.25, zIndex: 104, scale: 1.36 },
  { id: "unicorn", x: 37, y: 162, rotate: 0, depth: 0.35, zIndex: 106, scale: 0.70 },
  { id: "usb", x: 1629, y: 403, rotate: 0, depth: 0.20, zIndex: 109, scale: 1.00 }
];

const DeskPreview = {
    mouseX: 0, mouseY: 0, isDragging: false, draggedProp: null, 
    dragOffset: { x: 0, y: 0 }, cdClicks: 0, isCdOpen: false, props: [],
    bobberClicks: 0, foldedpClicks: 0, ashtrayClicks: 0, remiliaSpawned: false,
    unicornClicks: 0, floppyHoldTime: 0, isGlitching: false,
    fishPool: [], bubblePool: [], topZIndex: 1000000,
    bgDepth: 0.40, baseW: 1920, scaleFactor: 1.0, 
    psxCanvas: null, psxCtx: null, noiseCanvas: null, noiseCtx: null,
    noiseW: 320, noiseH: 240,

    init: function () {
        this.setupProps(); this.setupListeners(); this.initPSX(); this.startLoop();
        MusicController.init();
    },

    initPSX: function() {
        this.psxCanvas = document.getElementById('psx-canvas');
        if (!this.psxCanvas) return;
        this.psxCtx = this.psxCanvas.getContext('2d');
        this.noiseCanvas = document.createElement('canvas');
        this.noiseCanvas.width = this.noiseW; this.noiseCanvas.height = this.noiseH;
        this.noiseCtx = this.noiseCanvas.getContext('2d');
        const resize = () => { if (this.psxCanvas) { this.psxCanvas.width = window.innerWidth; this.psxCanvas.height = window.innerHeight; } };
        resize(); window.addEventListener('resize', resize);
    },

    setupProps: function() {
        document.querySelectorAll('.prop').forEach(el => {
            const config = HARCODED_LAYOUT.find(c => c.id === el.id) || {};
            this.addProp(el, config);
        });
    },

    addProp: function(el, config) {
        if (this.props.find(p => p.el === el)) return;
        const p = {
            id: el.id || ('spawn-' + Date.now()), el: el,
            x: config.x || 0, y: config.y || 0, targetX: config.x || 0, targetY: config.y || 0,
            vx: 0, vy: 0, depth: config.depth !== undefined ? config.depth : 0.1, isDragging: false, 
            scale: config.scale !== undefined ? parseFloat(config.scale) : 1.0,
            rotation: config.rotate || 0, zIndex: config.zIndex !== undefined ? config.zIndex : 2,
            springK: config.springK || 0.12, damping: config.damping || 0.82
        };
        this.props.push(p);

        el.addEventListener('mousedown', (e) => {
            if (p.id !== 'ashtray') {
                this.topZIndex += 1; p.zIndex = this.topZIndex; el.style.zIndex = p.zIndex;
            }
            if (el.classList.contains('static')) return;
            this.isDragging = true; this.draggedProp = el; el.classList.add('lifting'); p.isDragging = true;
            this.dragOffset.x = (e.clientX / this.scaleFactor) - p.x;
            this.dragOffset.y = (e.clientY / this.scaleFactor) - p.y;
            p.vx += (Math.random()-0.5)*15; p.vy += (Math.random()-0.5)*15;

            if (el.classList.contains('uwucorn-prop')) {
                this.createFlash(p.x + 85, p.y + 85);
            }

            PolychordEngine.play('lift');
            MusicController.play();
        });

        el.addEventListener('click', () => {
            if (p.id === 'bobber') {
                this.bobberClicks++; p.vx += 50; PolychordEngine.play('click');
                if (this.bobberClicks >= 4) { this.spawnFish(); this.bobberClicks = 0; PolychordEngine.play('chime', 0.8); }
            }
            if (p.id === 'ashtray') {
                if (this.remiliaSpawned) return; this.ashtrayClicks++; 
                if (this.ashtrayClicks >= 3) { this.spawnRemilia(); this.ashtrayClicks = 0; }
            }
            if (p.id === 'unicorn') {
                this.unicornClicks++; PolychordEngine.play('click', 0.8 + this.unicornClicks*0.1);
                if (this.unicornClicks === 7) { 
                    const sX = p.x + 150, sY = p.y + 20;
                    this.createFlash(sX + 85, sY + 85); this.spawnUwucorn(sX, sY); 
                    PolychordEngine.play('chime', 2.0);
                }
            }
            if (p.id === 'foldedp') {
                this.foldedpClicks++; PolychordEngine.play('strum', 0.6);
                if (this.foldedpClicks >= 4) { const img = el.querySelector('img'); if (img) img.src = 'layers/comingsoon.png'; PolychordEngine.play('chime', 1.6); }
            }
        });

        if (p.id === 'foldedp') {
            el.addEventListener('dblclick', () => {
                this.foldedpClicks = 0;
                const img = el.querySelector('img'); if (img) img.src = 'layers/foldedpape.png';
                PolychordEngine.play('strum', 0.8);
            });
        }
        return p;
    },

    createFlash: function(x, y) {
        // Elaborate Golden Starburst particle system
        for (let i = 0; i < 12; i++) {
            const star = document.createElement('div'); star.className = 'sparkle-particle';
            const dx = (Math.random() - 0.5) * 400; const dy = (Math.random() - 0.5) * 400;
            const rot = Math.random() * 360; const scale = 0.5 + Math.random() * 2;
            star.style.setProperty('--dx', dx + 'px'); star.style.setProperty('--dy', dy + 'px');
            star.style.setProperty('--r', rot + 'deg'); star.style.setProperty('--s', scale);
            star.style.left = (x * this.scaleFactor) + 'px'; star.style.top = (y * this.scaleFactor) + 'px';
            star.style.animation = `radiate 1.2s cubic-bezier(0.1, 1, 0.1, 1) forwards`;
            document.body.appendChild(star);
            setTimeout(() => { if (star.parentNode) star.parentNode.removeChild(star); }, 1300);
        }
    },

    spawnUwucorn: function(atX, atY) {
        const el = document.createElement('div'); el.className = 'prop uwucorn-prop';
        el.innerHTML = `<video src="layers/uwucorn.webm" autoplay loop muted playsinline></video>`;
        document.getElementById('scene').appendChild(el);
        const p = this.addProp(el, { x: atX, y: atY, scale: 0.85, depth: 0.45, zIndex: ++this.topZIndex });
        p.vx = 20; p.vy = -20; PolychordEngine.resume();
    },

    spawnFish: function() {
        const fEl = document.createElement('img'); fEl.src = 'layers/BASSFISH.png'; fEl.className = 'bass-fish'; document.body.appendChild(fEl);
        const side = Math.random() > 0.5 ? 'left' : 'right', startX = (side === 'left') ? -600 : window.innerWidth + 600;
        const fish = {
            el: fEl, x: startX, y: Math.random() * (window.innerHeight - 300) + 150,
            vx: (side === 'left') ? (25 + Math.random() * 15) : -(25 + Math.random() * 15),
            t: 0, yFreq: 0.1 + Math.random() * 0.1, yAmp: 80 + Math.random() * 140
        };
        fEl.style.transform = (fish.vx > 0) ? 'scaleX(-1)' : 'scaleX(1)';
        this.fishPool.push(fish);
    },

    spawnRemilia: function() {
        if (this.remiliaSpawned) return; this.remiliaSpawned = true;
        const el = document.createElement('div'); el.id = 'remilia'; el.className = 'prop remilia-prop';
        el.innerHTML = `<img src="layers/Remilia.png" draggable="false">`; 
        document.getElementById('scene').appendChild(el);
        const p = this.addProp(el, { x: 1920/2 - 50, y: -200, scale: 0.875, depth: 0.35, zIndex: 10000000 });
        p.targetY = 1080/2 - 50; p.vx = 0; p.vy = 0; p.waitingForHop = true; 
        PolychordEngine.play('chime', 1.5);
    },

    spawnBubble: function(x, y) {
        const b = document.createElement('div'); b.className = 'fish-bubble';
        b.style.left = x + 'px'; b.style.top = y + 'px'; document.body.appendChild(b);
        this.bubblePool.push({ el: b, x, y, vx: (Math.random()-0.5)*5, vy: -Math.random()*2-3, opacity: 1 });
    },

    setupListeners: function () {
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX; this.mouseY = e.clientY;
            document.documentElement.style.setProperty('--mouse-x', `${(this.mouseX/window.innerWidth)*100}%`);
            document.documentElement.style.setProperty('--mouse-y', `${(this.mouseY/window.innerHeight)*100}%`);
            if (this.isDragging && this.draggedProp) {
                const p = this.props.find(p => p.el === this.draggedProp);
                if (p) { p.targetX = (this.mouseX / this.scaleFactor) - this.dragOffset.x; p.targetY = (this.mouseY / this.scaleFactor) - this.dragOffset.y; }
            }
        });
        window.addEventListener('mouseup', () => {
            if (this.isDragging && this.draggedProp) {
                this.draggedProp.classList.remove('lifting');
                const p = this.props.find(p => p.el === this.draggedProp);
                if (p) { p.isDragging = false; p.x = p.targetX; p.y = p.targetY; p.el.classList.remove('glitching'); }
                this.isDragging = false; this.draggedProp = null; this.floppyHoldTime = 0; this.isGlitching = false;
                this.psxCanvas.classList.remove('glitch-active'); PolychordEngine.stopGlitchLoop(); PolychordEngine.play('place');
            }
        });
        window.addEventListener('dragstart', (e) => e.preventDefault());
        const cdCase = document.getElementById('cd-case');
        if (cdCase) {
            cdCase.addEventListener('click', () => {
                this.cdClicks++;
                cdCase.classList.remove('shake'); void cdCase.offsetWidth; cdCase.classList.add('shake');
                PolychordEngine.play('click');
                if (this.cdClicks >= 3) {
                    this.cdClicks = 0; this.isCdOpen = !this.isCdOpen;
                    if (this.isCdOpen) { document.getElementById('cd-closed').classList.add('hidden'); document.getElementById('cd-open').classList.remove('hidden'); PolychordEngine.play('chime', 1.5); }
                    else { document.getElementById('cd-open').classList.add('hidden'); document.getElementById('cd-closed').classList.remove('hidden'); PolychordEngine.play('strum', 1.2); }
                }
            });
        }
    },

    updatePSX: function() {
        if (!this.psxCtx) return; const imgData = this.noiseCtx.createImageData(this.noiseW, this.noiseH);
        for (let i = 0; i < imgData.data.length; i += 4) { imgData.data[i+3] = Math.random() * 110; }
        this.noiseCtx.putImageData(imgData, 0, 0); this.psxCtx.clearRect(0, 0, this.psxCanvas.width, this.psxCanvas.height);
        this.psxCtx.imageSmoothingEnabled = false; this.psxCtx.drawImage(this.noiseCanvas, 0, 0, this.psxCanvas.width, this.psxCanvas.height);
    },

    update: function () {
        const w = window.innerWidth, h = window.innerHeight, dx = (this.mouseX-w/2)/(w/2), dy = (this.mouseY-h/2)/(h/2);
        this.scaleFactor = w / this.baseW;
        const bg = document.querySelector('.background img'); if (bg) bg.style.transform = `translate(${-dx * this.bgDepth}%, ${-dy * this.bgDepth}%)`;
        
        this.bubblePool = this.bubblePool.filter(b => {
            b.x += b.vx; b.y += b.vy; b.el.style.left = b.x+'px'; b.el.style.top = b.y+'px'; b.opacity -= 0.015; b.el.style.opacity = b.opacity;
            if (b.opacity<=0) { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); return false; } return true;
        });

        this.fishPool = this.fishPool.filter(f => {
            f.x += f.vx; f.t += 0.04 + Math.random()*0.02; 
            const yPos = f.y + Math.sin(f.t * 5) * f.yAmp;
            const tilt = Math.cos(f.t * 5) * 15; 
            f.el.style.left = f.x + 'px'; 
            f.el.style.top = yPos + 'px';
            f.el.style.transform = `${f.vx > 0 ? 'scaleX(-1)' : 'scaleX(1)'} rotate(${f.vx > 0 ? -tilt : tilt}deg)`;
            
            if (Math.random() > 0.6) this.spawnBubble(f.x + (f.vx > 0 ? 0 : 350), yPos + 100);
            if ((f.vx > 0 && f.x > w + 800) || (f.vx < 0 && f.x < -800)) { 
                if (f.el.parentNode) f.el.parentNode.removeChild(f.el); return false; 
            } return true;
        });

        this.props.forEach(p => {
            if (p.id === 'remilia') { p.zIndex = 10000000; }
            if (p.waitingForHop && p.y >= p.targetY - 10) { p.waitingForHop = false; p.vy = -12; }
            if (p.id === 'floppy' && p.isDragging) {
                this.floppyHoldTime++; if (this.floppyHoldTime > 50) {
                    this.isGlitching = true; p.el.classList.add('glitching'); this.psxCanvas.classList.add('glitch-active');
                    PolychordEngine.startGlitchLoop(); p.vx += (Math.random()-0.5)*20; p.vy += (Math.random()-0.5)*20;
                }
            }
            const springK = p.isDragging ? 0.4 : (p.waitingForHop ? 0.15 : p.springK), damping = p.isDragging ? 0.6 : (p.waitingForHop ? 0.92 : p.damping);
            p.vx = (p.vx + (p.targetX-p.x)*springK)*damping; p.vy = (p.vy + (p.targetY-p.y)*springK)*damping;
            p.x += p.vx; p.y += p.vy;
            let activeZ = p.zIndex; if (p.isDragging) activeZ = 5000000; 
            p.el.style.left = `${p.x * this.scaleFactor}px`; p.el.style.top = `${p.y * this.scaleFactor}px`; p.el.style.zIndex = activeZ;
            let s = p.scale * this.scaleFactor; 
            if (p.id === 'cd-case') s *= this.isCdOpen ? 1.15 : 0.7;
            if (p.id === 'foldedp' && this.foldedpClicks >= 4) s *= 1.55;
            const px = -dx*p.depth*25*this.scaleFactor, py = -dy*p.depth*25*this.scaleFactor;
            const skewX = p.vx*0.2, stretchX = 1+(Math.abs(p.vx)/150), stretchY = 1+(Math.abs(p.vy)/150);
            p.el.style.transform = `translate(${px}px, ${py}px) scale(${s*stretchX}, ${s*stretchY}) rotate(${p.rotation}deg) skewX(${skewX}deg)`;
        });
    },

    startLoop: function () { const loop = () => { this.updatePSX(); this.update(); requestAnimationFrame(loop); }; loop(); }
};

window.addEventListener('DOMContentLoaded', () => DeskPreview.init());
