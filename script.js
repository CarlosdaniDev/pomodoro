'use strict';

/* ─────────────────────────────────────────
   ARMAZENAMENTO SEGURO
   Em modo privado (principalmente no Safari), o localStorage pode
   lançar exceção ao tentar gravar. Esses wrappers evitam que isso
   derrube o app inteiro — na pior das hipóteses o progresso só não
   fica salvo entre sessões.
───────────────────────────────────────── */
function safeGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn('LocalStorage indisponível para leitura:', e.message);
        return null;
    }
}

function safeSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn('LocalStorage indisponível para escrita:', e.message);
    }
}

function safeRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('LocalStorage indisponível para remoção:', e.message);
    }
}

/* Mantém um número dentro do intervalo válido do campo (os atributos
   min/max do HTML só protegem o clique nas setinhas do input; nada
   impede alguém de digitar "0" ou "-5" direto no teclado). */
function clamp(value, min, max, fallback) {
    if (Number.isNaN(value)) return fallback;
    return Math.min(Math.max(value, min), max);
}

/* ─────────────────────────────────────────
   CONFIGURAÇÕES (padrão)
───────────────────────────────────────── */
let cfg = loadConfig();

function loadConfig() {
    const saved = safeGet('pomodoroConfig');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.warn('Config salva estava corrompida, voltando ao padrão.', e.message);
        }
    }
    return { focus: 25, short: 5, long: 20 };
}

function applyConfig() {
    const focusInput = document.getElementById('cfg-focus');
    const shortInput = document.getElementById('cfg-short');
    const longInput  = document.getElementById('cfg-long');

    const focus = clamp(parseInt(focusInput.value, 10), 1, 90, cfg.focus);
    const short = clamp(parseInt(shortInput.value, 10), 1, 30, cfg.short);
    const long  = clamp(parseInt(longInput.value, 10), 5, 60, cfg.long);

    // Se o usuário digitou algo fora do limite, os campos refletem o valor
    // corrigido — assim ele vê que o número foi ajustado, não apenas ignorado.
    focusInput.value = focus;
    shortInput.value = short;
    longInput.value  = long;

    cfg = { focus, short, long };
    safeSet('pomodoroConfig', JSON.stringify(cfg));

    // Só recalcula o tempo em tela se o timer estiver parado — mudar a duração
    // de uma sessão que já está correndo não faz sentido.
    if (!isRunning) {
        if (isBreak) {
            timeLeft = (breakType === 'long' ? cfg.long : cfg.short) * 60;
            currentBreakDuration = timeLeft;
        } else {
            timeLeft = cfg.focus * 60;
        }
        updateDisplay();
    }

    showConfigToast();
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
let breakType            = 'short'; // 'short' | 'long' — evita ter que "adivinhar" o tipo de pausa comparando durações
let currentBreakDuration = cfg.short * 60;
let pomodoroCount        = parseInt(safeGet('totalPomodoros'), 10) || 0;
let wakeLock             = null;
let lastFocusedElement   = null; // quem estava focado antes de abrir o modal, para devolver o foco depois

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
    return parseInt(safeGet(getTodayKey()), 10) || 0;
}

function incrementTodayCount() {
    const key = getTodayKey();
    const current = getTodayCount();
    safeSet(key, current + 1);
}

function updateTodayDisplay() {
    const el = document.getElementById('today-counter');
    if (el) el.innerHTML = `HOJE: <strong>${getTodayCount()}</strong>`;
}

/* Chaves de dias antigos (pomodoro-2026-3-14, etc.) nunca eram apagadas e
   ficariam se acumulando no localStorage indefinidamente. Uma vez por
   carregamento, removemos o que passou de 30 dias. */
function cleanupOldDailyKeys(daysToKeep = 30) {
    try {
        const prefix = 'pomodoro-';
        const now = new Date();

        Object.keys(localStorage)
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => {
                const [year, month, day] = key.slice(prefix.length).split('-').map(Number);
                if ([year, month, day].some(Number.isNaN)) return;

                const keyDate = new Date(year, month, day);
                const diasDeDiferenca = (now - keyDate) / 86400000;
                if (diasDeDiferenca > daysToKeep) safeRemove(key);
            });
    } catch (e) {
        console.warn('Não foi possível limpar chaves antigas:', e.message);
    }
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
        // Sem ícone customizado de propósito: depender de uma imagem hospedada
        // em outro domínio é um ponto de falha desnecessário para um aviso do
        // sistema — o navegador já usa um ícone padrão sem isso.
        new Notification(title, { body, silent: false });
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
function init() {
    // Aplica config salva nos inputs
    document.getElementById('cfg-focus').value = cfg.focus;
    document.getElementById('cfg-short').value = cfg.short;
    document.getElementById('cfg-long').value  = cfg.long;

    timeLeft = cfg.focus * 60;

    updateStats();
    updateTodayDisplay();
    updateDisplay();
    requestNotificationPermission();
    cleanupOldDailyKeys();
    initEventListeners();

    // Retoma o timer se a página foi recarregada com uma sessão em andamento
    const savedEndTime = safeGet('pomodoroEndTime');
    if (savedEndTime) {
        const remaining = Math.round((savedEndTime - Date.now()) / 1000);
        if (remaining > 0) {
            timeLeft = remaining;
            startTimer();
        } else {
            safeRemove('pomodoroEndTime');
        }
    }

    // Page Visibility API: o navegador pausa o setInterval (e libera o Wake
    // Lock) quando a aba fica em segundo plano. Ao voltar, recalculamos o
    // tempo real a partir do timestamp salvo e pedimos a tela acesa de novo.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isRunning) {
            const saved = safeGet('pomodoroEndTime');
            if (saved) {
                const remaining = Math.round((saved - Date.now()) / 1000);
                if (remaining > 0) {
                    timeLeft = remaining;
                    updateDisplay();
                }
            }
            requestWakeLock();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);

/* Centraliza todos os cliques que antes eram atributos onclick="" no HTML.
   Isso deixa o HTML mais limpo, evita repetir lógica inline e permite usar
   uma Content Security Policy mais restrita no futuro, já que não há mais
   JavaScript embutido nos atributos. */
function initEventListeners() {
    document.getElementById('startPauseBtn').addEventListener('click', toggleStartPause);
    document.getElementById('resetBtn').addEventListener('click', resetTimer);
    document.getElementById('openResetModalBtn').addEventListener('click', openResetModal);
    document.getElementById('applyConfigBtn').addEventListener('click', applyConfig);
    document.getElementById('toast-btn').addEventListener('click', dismissToast);
    document.getElementById('modalCancelBtn').addEventListener('click', closeResetModal);
    document.getElementById('modalConfirmBtn').addEventListener('click', confirmResetSessions);

    const overlay = document.getElementById('modal-overlay');
    overlay.addEventListener('click', (event) => {
        // Fecha só quando o clique acontece no fundo escurecido, não dentro da caixa
        if (event.target === overlay) closeResetModal();
    });

    document.addEventListener('keydown', (event) => {
        if (!overlay.classList.contains('modal--show')) return;
        if (event.key === 'Escape') closeResetModal();
        if (event.key === 'Tab') trapFocusInModal(event);
    });
}

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
    safeSet('pomodoroEndTime', endTime);

    timer = setInterval(() => {
        const remaining = Math.round((endTime - Date.now()) / 1000);

        if (remaining <= 0) {
            clearInterval(timer);
            timer = null;
            isRunning = false;
            timeLeft = 0;
            safeRemove('pomodoroEndTime');
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
    safeRemove('pomodoroEndTime');
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
    safeRemove('pomodoroEndTime');
    releaseWakeLock();
    updateStartPauseBtn();
    updateTabTitle();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');

    timeLeft = isBreak ? currentBreakDuration : cfg.focus * 60;
    updateDisplay();
}

function playAlarm() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Três bipes curtos
        [0, 0.35, 0.7].forEach(offset => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.001, ctx.currentTime + offset);
            gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + offset + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.28);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime + offset);
            osc.stop(ctx.currentTime + offset + 0.3);
        });
        setTimeout(() => ctx.close(), 2000);
    } catch(e) { console.log('Alarm error:', e); }
}

function handleTimerEnd() {
    playAlarm();

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
    breakType = 'short';
    currentBreakDuration = cfg.short * 60;
    timeLeft = currentBreakDuration;
    updateDisplay();
    updateTimerLabel();
}

function setLongBreak() {
    updatePhrase('break');
    isBreak = true;
    breakType = 'long';
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

    safeSet('totalPomodoros', pomodoroCount);

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
    if (toast) toast.classList.remove('toast--show');
    startTimer();
}

/* ─────────────────────────────────────────
   RESET DE SESSÕES (com foco acessível)
───────────────────────────────────────── */
function openResetModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    lastFocusedElement = document.activeElement;
    overlay.classList.add('modal--show');

    // Move o foco para dentro do modal assim que ele aparece — importante
    // para quem navega só pelo teclado ou usa leitor de tela.
    const cancelBtn = document.getElementById('modalCancelBtn');
    if (cancelBtn) cancelBtn.focus();
}

function closeResetModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('modal--show');

    // Devolve o foco para o botão que abriu o modal
    if (lastFocusedElement) lastFocusedElement.focus();
}

/* Enquanto o modal está aberto, o Tab não pode "vazar" para botões que
   ficaram por baixo dele — isso é o mínimo esperado de um diálogo modal. */
function trapFocusInModal(event) {
    const modal = document.querySelector('#modal-overlay .modal');
    if (!modal) return;

    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;

    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function confirmResetSessions() {
    pomodoroCount = 0;
    safeRemove('totalPomodoros');
    safeRemove(getTodayKey());
    updateStats();
    updateTodayDisplay();
    closeResetModal();
}

/* ─────────────────────────────────────────
   WAKE LOCK
   Mantém a tela acesa enquanto uma sessão está rodando. O próprio
   navegador libera o lock sozinho quando a aba perde visibilidade —
   por isso ele é readquirido no listener de visibilitychange, lá em cima.
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