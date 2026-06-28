/* ─────────────────────────────────────────
   ESTADO GLOBAL
───────────────────────────────────────── */
let timer           = null;
let timeLeft        = 25 * 60;
let isRunning       = false;
let isBreak         = false;
let currentBreakDuration = 5 * 60; // Guarda o tipo de pausa atual
let isAmbiencePlaying    = false;
let pomodoroCount   = parseInt(localStorage.getItem('totalPomodoros')) || 0;
let wakeLock        = null;

const LEVEL_TITLES = [
    "Iniciante",        // 1
    "Aprendiz",         // 2
    "Focado",           // 3
    "Determinado",      // 4
    "Digital Architect",// 5
    "Estrategista",     // 6
    "Especialista",     // 7
    "Mestre do Foco",   // 8
    "Elite",            // 9
    "Lendário"          // 10+
];

const phrases = {
    focus: [
        "O sucesso é o que acontece enquanto seus concorrentes dormem.",
        "Não anuncie o movimento. Anuncie o resultado.",
        "Trabalhe até que sua assinatura se torne um autógrafo.",
        "Vença em silêncio. Deixe o sucesso fazer o barulho.",
        "Onde a maioria vê um problema, o mestre vê uma oportunidade."
    ],
    break: [
        "Até o motor mais potente precisa de resfriamento.",
        "Recupere o fôlego. O topo exige resistência.",
        "Descanso faz parte do treino de quem quer vencer.",
        "Limpe a mente. O próximo bloco exige clareza total.",
        "Afie o machado para o próximo corte."
    ]
};

/* ─────────────────────────────────────────
   INICIALIZAÇÃO
───────────────────────────────────────── */
window.onload = () => {
    updateStats();
    updateDisplay();

    const savedEndTime = localStorage.getItem('pomodoroEndTime');
    if (savedEndTime) {
        const remaining = Math.round((savedEndTime - Date.now()) / 1000);
        if (remaining > 0) {
            timeLeft = remaining;
            startTimer();
        } else {
            localStorage.removeItem('pomodoroEndTime');
        }
    }

    // Page Visibility API: recalcula tempo ao voltar para a aba
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isRunning) {
            const savedEndTime = localStorage.getItem('pomodoroEndTime');
            if (savedEndTime) {
                const remaining = Math.round((savedEndTime - Date.now()) / 1000);
                if (remaining > 0) {
                    timeLeft = remaining;
                    updateDisplay();
                }
            }
        }
    });
};

/* ─────────────────────────────────────────
   TIMER
───────────────────────────────────────── */
function startTimer() {
    if (isRunning) return;
    requestWakeLock();
    isRunning = true;
    updateStartPauseBtn();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.add('running');

    const endTime = Date.now() + (timeLeft * 1000);
    localStorage.setItem('pomodoroEndTime', endTime);

    timer = setInterval(() => {
        const remaining = Math.round((endTime - Date.now()) / 1000);

        if (remaining <= 0) {
            clearInterval(timer);
            timer = null;
            isRunning = false;
            timeLeft = 0;
            localStorage.removeItem('pomodoroEndTime');
            releaseWakeLock();
            updateDisplay();
            updateStartPauseBtn();
            if (timerEl) timerEl.classList.remove('running');
            handleTimerEnd();
        } else {
            timeLeft = remaining;
            updateDisplay();
        }
    }, 1000);
}

function pauseTimer() {
    if (!isRunning) return;
    clearInterval(timer);
    timer = null;
    isRunning = false;
    localStorage.removeItem('pomodoroEndTime');
    releaseWakeLock();
    updateStartPauseBtn();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');
}

function toggleStartPause() {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function updateStartPauseBtn() {
    const btn = document.getElementById('startPauseBtn');
    if (!btn) return;
    btn.textContent = isRunning ? '⏸ PAUSAR' : '▶ INICIAR';
}

function resetTimer() {
    clearInterval(timer);
    timer = null;
    isRunning = false;
    localStorage.removeItem('pomodoroEndTime');
    releaseWakeLock();
    updateStartPauseBtn();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');

    const alarm = document.getElementById('alarm');
    if (alarm) { alarm.pause(); alarm.currentTime = 0; }

    // Usa a variável correta de duração da pausa atual
    timeLeft = isBreak ? currentBreakDuration : 25 * 60;
    updateDisplay();
}

function handleTimerEnd() {
    const alarm = document.getElementById('alarm');
    const audioAmbiente = document.getElementById('ambienceAudio');

    if (alarm) {
        if (audioAmbiente && isAmbiencePlaying) audioAmbiente.volume = 0.02;
        alarm.volume = 1.0;
        alarm.play().catch(e => console.log("Erro som:", e));
    }

    if (!isBreak) {
        pomodoroCount++;
        updateStats();
        if (pomodoroCount % 4 === 0) {
            setLongBreak();
            showToast('long-break');
        } else {
            setShortBreak();
            showToast('focus-done');
        }
    } else {
        setFocus();
        showToast('break-done');
    }
}

/* ─────────────────────────────────────────
   MODOS
───────────────────────────────────────── */
function setFocus() {
    updatePhrase('focus');
    isBreak = false;
    timeLeft = 25 * 60;
    updateDisplay();
    updateTimerLabel();
}

function setShortBreak() {
    updatePhrase('break');
    isBreak = true;
    currentBreakDuration = 5 * 60;
    timeLeft = currentBreakDuration;
    updateDisplay();
    updateTimerLabel();
}

function setLongBreak() {
    updatePhrase('break');
    isBreak = true;
    currentBreakDuration = 20 * 60;
    timeLeft = currentBreakDuration;
    updateDisplay();
    updateTimerLabel();
}

function updateTimerLabel() {
    const label = document.getElementById('timer-label');
    const timerEl = document.getElementById('timer');
    if (label) {
        label.innerText = isBreak ? "MODO: DESCANSO" : "MODO: FOCO";
        label.style.color = isBreak ? "#10b981" : "#3b82f6";
    }
    if (timerEl) {
        timerEl.style.color = isBreak ? "#10b981" : "#3b82f6";
    }
}

/* ─────────────────────────────────────────
   DISPLAY
───────────────────────────────────────── */
function updateDisplay() {
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;
    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;
    timerEl.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function updatePhrase(type) {
    const container = document.getElementById('message-container');
    if (!container) return;
    const list = phrases[type];
    const idx = Math.floor(Math.random() * list.length);
    container.style.opacity = 0;
    setTimeout(() => {
        container.innerText = `"${list[idx]}"`;
        container.style.opacity = 1;
    }, 500);
}

function updateStats() {
    const counterEl = document.getElementById('counter');
    const xpBar     = document.getElementById('xp-bar');
    const levelEl   = document.getElementById('level');

    localStorage.setItem('totalPomodoros', pomodoroCount);

    if (counterEl) counterEl.innerHTML = `SESSÕES CONCLUÍDAS: <strong>#${pomodoroCount}</strong>`;

    const xpPercent = (pomodoroCount % 10) * 10;
    const levelNum  = Math.floor(pomodoroCount / 10) + 1;
    const titleIdx  = Math.min(levelNum - 1, LEVEL_TITLES.length - 1);
    const title     = LEVEL_TITLES[titleIdx];

    if (xpBar)   xpBar.style.width = xpPercent + "%";
    if (levelEl) levelEl.innerText = `NÍVEL: ${levelNum} — ${title}`;
}

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function showToast(type) {
    const toast = document.getElementById('toast');
    const icon  = document.getElementById('toast-icon');
    const title = document.getElementById('toast-title');
    const sub   = document.getElementById('toast-sub');
    const btn   = document.getElementById('toast-btn');

    const configs = {
        'focus-done': {
            icon: '🎯',
            title: 'SESSÃO CONCLUÍDA!',
            sub: 'Hora de respirar. Você merece.',
            btn: '▶ INICIAR DESCANSO',
            cls: 'toast toast--break toast--show'
        },
        'long-break': {
            icon: '🏆',
            title: 'CICLO COMPLETO!',
            sub: '4 sessões encerradas. Pausa longa ativada.',
            btn: '☕ INICIAR PAUSA LONGA',
            cls: 'toast toast--long toast--show'
        },
        'break-done': {
            icon: '⚡',
            title: 'DESCANSO ENCERRADO!',
            sub: 'Foco máximo. Vamos lá.',
            btn: '🔥 VOLTAR AO FOCO',
            cls: 'toast toast--focus toast--show'
        }
    };

    const c = configs[type];
    if (icon)  icon.innerText  = c.icon;
    if (title) title.innerText = c.title;
    if (sub)   sub.innerText   = c.sub;
    if (btn)   btn.innerText   = c.btn;
    if (toast) toast.className = c.cls;
}

function dismissToast() {
    const toast = document.getElementById('toast');
    const alarm = document.getElementById('alarm');
    const audioAmbiente = document.getElementById('ambienceAudio');

    if (toast) toast.classList.remove('toast--show');

    if (alarm) { alarm.pause(); alarm.currentTime = 0; }

    if (audioAmbiente && isAmbiencePlaying) audioAmbiente.volume = 0.1;

    startTimer();
}

/* ─────────────────────────────────────────
   SOM AMBIENTE
───────────────────────────────────────── */
function toggleAmbience() {
    const audioAmbiente = document.getElementById('ambienceAudio');
    const botaoSom      = document.getElementById('bgMusicBtn');

    if (!isAmbiencePlaying) {
        audioAmbiente.load();
        audioAmbiente.play().then(() => {
            audioAmbiente.volume = 0.1;
            botaoSom.innerText = "🔊 SOM AMBIENTE: ON";
            isAmbiencePlaying = true;
        }).catch(error => console.error("Erro áudio:", error));
    } else {
        audioAmbiente.pause();
        botaoSom.innerText = "🔇 SOM AMBIENTE: OFF";
        isAmbiencePlaying = false;
    }
}

/* ─────────────────────────────────────────
   RESET DE SESSÕES
───────────────────────────────────────── */
function openResetModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('modal--show');
}

function closeResetModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('modal--show');
}

function confirmResetSessions() {
    pomodoroCount = 0;
    localStorage.removeItem('totalPomodoros');
    updateStats();
    closeResetModal();
}

/* ─────────────────────────────────────────
   WAKE LOCK
───────────────────────────────────────── */
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log("Wake Lock error:", err.message);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
    }
}