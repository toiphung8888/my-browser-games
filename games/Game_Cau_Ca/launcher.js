// Tạo Audio Context
const AudioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmOscillators = [];
let isMuted = true;

function toggleMusic() {
    if (AudioCtx.state === 'suspended') AudioCtx.resume();
    
    if (isMuted) {
        startOceanSound();
        document.getElementById('sound-control').innerText = "🔊 Đang phát nhạc nền...";
        document.getElementById('sound-control').style.color = "#00ff00";
        isMuted = false;
    } else {
        stopOceanSound();
        document.getElementById('sound-control').innerText = "🔇 Bật Nhạc Nền";
        document.getElementById('sound-control').style.color = "white";
        isMuted = true;
    }
}

// Tạo tiếng ồn trắng (White Noise) giả lập tiếng sóng biển
function startOceanSound() {
    const bufferSize = 2 * AudioCtx.sampleRate;
    const noiseBuffer = AudioCtx.createBuffer(1, bufferSize, AudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = AudioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Bộ lọc để làm tiếng ồn trầm hơn giống tiếng biển
    const gainNode = AudioCtx.createGain();
    gainNode.gain.value = 0.05; // Âm lượng nhỏ
    
    // Lọc bỏ tần số cao
    const filter = AudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    // Tạo hiệu ứng sóng lên xuống (LFO)
    const lfo = AudioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15; // Tốc độ sóng (chậm)
    
    const lfoGain = AudioCtx.createGain();
    lfoGain.gain.value = 200; // Độ sâu biến thiên tần số

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(AudioCtx.destination);

    whiteNoise.start();
    lfo.start();

    bgmOscillators.push(whiteNoise, lfo);
}

function stopOceanSound() {
    bgmOscillators.forEach(osc => osc.stop());
    bgmOscillators = [];
}

// Hiệu ứng âm thanh khi di chuột (Tiếng "Bíp" nhẹ công nghệ)
function playHover() {
    if (AudioCtx.state === 'suspended') AudioCtx.resume();
    
    const osc = AudioCtx.createOscillator();
    const gain = AudioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, AudioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, AudioCtx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.05, AudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, AudioCtx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(AudioCtx.destination);
    
    osc.start();
    osc.stop(AudioCtx.currentTime + 0.1);
}

// Hiệu ứng khi bấm chọn game
// Hàm startGame phiên bản "Thông minh"
function startGame(version) {
    // 1. Tạo âm thanh xác nhận
    const osc = AudioCtx.createOscillator();
    const gain = AudioCtx.createGain();
    
    osc.frequency.setValueAtTime(600, AudioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, AudioCtx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.1, AudioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, AudioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(AudioCtx.destination);
    osc.start();

    // 2. Tự động chuyển hướng dựa trên tên thư mục
    setTimeout(() => {
        // Code này sẽ tự ghép chuỗi: "v3" + "/index.html" -> "v3/index.html"
        window.location.href = version + '/index.html'; 
    }, 300);
}

