/* ─────────────────────────────────────────
   CONFIGURAÇÕES (padrão)
───────────────────────────────────────── */
let cfg = loadConfig();

function loadConfig() {
    const saved = localStorage.getItem('pomodoroConfig');
    if (saved) return JSON.parse(saved);
    return { focus: 25, short: 5, long: 20 };
}

function applyConfig() {
    const focus = parseInt(document.getElementById('cfg-focus').value) || 25;
    const short = parseInt(document.getElementById('cfg-short').value) || 5;
    const long  = parseInt(document.getElementById('cfg-long').value)  || 20;

    cfg = { focus, short, long };
    localStorage.setItem('pomodoroConfig', JSON.stringify(cfg));

    // Só reinicia o display se o timer não estiver rodando
    if (!isRunning) {
        timeLeft = isBreak ? (currentBreakDuration === cfg.long * 60 ? cfg.long * 60 : cfg.short * 60) : cfg.focus * 60;
        if (!isBreak) timeLeft = cfg.focus * 60;
        updateDisplay();
        showConfigToast();
    } else {
        showConfigToast();
    }
}

function showConfigToast() {
    const el = document.getElementById('config-feedback');
    if (!el) return;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
}

/* ─────────────────────────────────────────
   ESTADO GLOBAL
───────────────────────────────────────── */
let timer                = null;
let timeLeft             = cfg.focus * 60;
let isRunning            = false;
let isBreak              = false;
let currentBreakDuration = cfg.short * 60;
let pomodoroCount        = parseInt(localStorage.getItem('totalPomodoros')) || 0;
let wakeLock             = null;

const LEVEL_TITLES = [
    "Iniciante", "Aprendiz", "Focado", "Determinado",
    "Digital Architect", "Estrategista", "Especialista",
    "Mestre do Foco", "Elite", "Lendário"
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
   HISTÓRICO DO DIA
───────────────────────────────────────── */
function getTodayKey() {
    const d = new Date();
    return `pomodoro-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getTodayCount() {
    return parseInt(localStorage.getItem(getTodayKey())) || 0;
}

function incrementTodayCount() {
    const key = getTodayKey();
    const current = getTodayCount();
    localStorage.setItem(key, current + 1);
}

function updateTodayDisplay() {
    const el = document.getElementById('today-counter');
    if (el) el.innerHTML = `HOJE: <strong>${getTodayCount()}</strong>`;
}

/* ─────────────────────────────────────────
   NOTIFICAÇÕES DO SISTEMA
───────────────────────────────────────── */
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: 'https://em-content.zobj.net/source/apple/354/tomato_1f345.png',
            silent: false
        });
    }
}

/* ─────────────────────────────────────────
   TÍTULO DA ABA
───────────────────────────────────────── */
function updateTabTitle() {
    if (!isRunning) {
        document.title = 'Concentração e Foco';
        return;
    }
    const min = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const sec = (timeLeft % 60).toString().padStart(2, '0');
    const mode = isBreak ? 'Descanso' : 'Foco';
    document.title = `⏱ ${min}:${sec} — ${mode}`;
}

/* ─────────────────────────────────────────
   INICIALIZAÇÃO
───────────────────────────────────────── */
window.onload = () => {
    // Aplica config salva nos inputs
    document.getElementById('cfg-focus').value = cfg.focus;
    document.getElementById('cfg-short').value = cfg.short;
    document.getElementById('cfg-long').value  = cfg.long;

    timeLeft = cfg.focus * 60;

    updateStats();
    updateTodayDisplay();
    updateDisplay();
    requestNotificationPermission();

    // Retoma timer se a página foi recarregada com timer ativo
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

    // Page Visibility API
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isRunning) {
            const saved = localStorage.getItem('pomodoroEndTime');
            if (saved) {
                const remaining = Math.round((saved - Date.now()) / 1000);
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
            updateTabTitle();
            updateStartPauseBtn();
            if (timerEl) timerEl.classList.remove('running');
            handleTimerEnd();
        } else {
            timeLeft = remaining;
            updateDisplay();
            updateTabTitle();
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
    updateTabTitle();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');
}

function toggleStartPause() {
    isRunning ? pauseTimer() : startTimer();
}

function updateStartPauseBtn() {
    const btn = document.getElementById('startPauseBtn');
    if (btn) btn.textContent = isRunning ? '⏸ PAUSAR' : '▶ INICIAR';
}

function resetTimer() {
    clearInterval(timer);
    timer = null;
    isRunning = false;
    localStorage.removeItem('pomodoroEndTime');
    releaseWakeLock();
    updateStartPauseBtn();
    updateTabTitle();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');

    const alarm = document.getElementById('alarm');
    if (alarm) { alarm.pause(); alarm.currentTime = 0; }

    timeLeft = isBreak ? currentBreakDuration : cfg.focus * 60;
    updateDisplay();
}

function handleTimerEnd() {
    const alarm = document.getElementById('alarm');
    if (alarm) {
        alarm.volume = 1.0;
        alarm.play().catch(e => console.log("Erro som:", e));
    }

    if (!isBreak) {
        pomodoroCount++;
        incrementTodayCount();
        updateStats();
        updateTodayDisplay();

        if (pomodoroCount % 4 === 0) {
            setLongBreak();
            showToast('long-break');
            sendNotification('🏆 Ciclo completo!', '4 sessões encerradas. Pausa longa merecida.');
        } else {
            setShortBreak();
            showToast('focus-done');
            sendNotification('🎯 Sessão concluída!', 'Hora de respirar. Você merece.');
        }
    } else {
        setFocus();
        showToast('break-done');
        sendNotification('⚡ Descanso encerrado!', 'Foco máximo. Vamos lá.');
    }
}

/* ─────────────────────────────────────────
   MODOS
───────────────────────────────────────── */
function setFocus() {
    updatePhrase('focus');
    isBreak = false;
    timeLeft = cfg.focus * 60;
    updateDisplay();
    updateTimerLabel();
}

function setShortBreak() {
    updatePhrase('break');
    isBreak = true;
    currentBreakDuration = cfg.short * 60;
    timeLeft = currentBreakDuration;
    updateDisplay();
    updateTimerLabel();
}

function setLongBreak() {
    updatePhrase('break');
    isBreak = true;
    currentBreakDuration = cfg.long * 60;
    timeLeft = currentBreakDuration;
    updateDisplay();
    updateTimerLabel();
}

function updateTimerLabel() {
    const label   = document.getElementById('timer-label');
    const timerEl = document.getElementById('timer');
    const color   = isBreak ? '#10b981' : '#3b82f6';
    if (label)   { label.innerText = isBreak ? 'MODO: DESCANSO' : 'MODO: FOCO'; label.style.color = color; }
    if (timerEl) timerEl.style.color = color;
}

/* ─────────────────────────────────────────
   DISPLAY
───────────────────────────────────────── */
function updateDisplay() {
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;
    const min = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const sec = (timeLeft % 60).toString().padStart(2, '0');
    timerEl.innerText = `${min}:${sec}`;
}

function updatePhrase(type) {
    const container = document.getElementById('message-container');
    if (!container) return;
    const list = phrases[type];
    const idx  = Math.floor(Math.random() * list.length);
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
    const title     = LEVEL_TITLES[Math.min(levelNum - 1, LEVEL_TITLES.length - 1)];

    if (xpBar)   xpBar.style.width = xpPercent + '%';
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
        'focus-done': { icon: '🎯', title: 'SESSÃO CONCLUÍDA!',   sub: 'Hora de respirar. Você merece.',         btn: '▶ INICIAR DESCANSO',  cls: 'toast toast--break toast--show' },
        'long-break': { icon: '🏆', title: 'CICLO COMPLETO!',      sub: '4 sessões encerradas. Pausa longa.',      btn: '☕ INICIAR PAUSA LONGA', cls: 'toast toast--long toast--show'  },
        'break-done': { icon: '⚡', title: 'DESCANSO ENCERRADO!',  sub: 'Foco máximo. Vamos lá.',                 btn: '🔥 VOLTAR AO FOCO',   cls: 'toast toast--focus toast--show' }
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

    if (toast) toast.classList.remove('toast--show');
    if (alarm) { alarm.pause(); alarm.currentTime = 0; }

    startTimer();
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
    localStorage.removeItem(getTodayKey());
    updateStats();
    updateTodayDisplay();
    closeResetModal();
}

/* ─────────────────────────────────────────
   WAKE LOCK
───────────────────────────────────────── */
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
        console.log('Wake Lock error:', err.message);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) { wakeLock.release(); wakeLock = null; }
}