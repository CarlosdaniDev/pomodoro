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
            // Valida cada campo: um JSON válido mas com valores estranhos
            // (texto, negativo, absurdo) não pode quebrar o timer.
            const parsed = JSON.parse(saved) || {};
            return {
                focus: clamp(parseInt(parsed.focus, 10), 1, 90, 25),
                short: clamp(parseInt(parsed.short, 10), 1, 30, 5),
                long:  clamp(parseInt(parsed.long, 10), 5, 60, 20)
            };
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
        saveState();
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
let endTime              = null; // horário real (ms) em que a fase atual termina, só existe com o timer rodando
let endTimeout           = null; // alarme extra para o fim da fase, reduz o atraso com a aba em segundo plano
let audioCtx             = null; // criado/liberado num clique do usuário para o alarme não ser bloqueado

const STATE_KEY = 'pomodoroState';

/* ─────────────────────────────────────────
   ESTADO DA FASE (sobrevive a recarregar a página)
   Guarda em que fase estamos (foco, pausa curta ou longa), quanto falta e,
   se estiver rodando, o horário em que termina. Sem isso, recarregar durante
   um descanso voltava como "foco" e ainda contava uma sessão a mais.
───────────────────────────────────────── */
function saveState() {
    safeSet(STATE_KEY, JSON.stringify({
        isBreak,
        breakType,
        timeLeft,
        endTime: isRunning ? endTime : null
    }));
}

function restoreState() {
    safeRemove('pomodoroEndTime'); // chave da versão antiga, não é mais usada

    const raw = safeGet(STATE_KEY);
    if (!raw) return;

    let saved;
    try {
        saved = JSON.parse(raw);
    } catch (e) {
        console.warn('Estado salvo estava corrompido, ignorando.', e.message);
        safeRemove(STATE_KEY);
        return;
    }
    if (!saved || typeof saved !== 'object') return;

    isBreak   = saved.isBreak === true;
    breakType = saved.breakType === 'long' ? 'long' : 'short';
    currentBreakDuration = (breakType === 'long' ? cfg.long : cfg.short) * 60;

    const fullDuration = isBreak ? currentBreakDuration : cfg.focus * 60;
    timeLeft = fullDuration;
    if (isBreak) updateTimerLabel();

    if (Number.isFinite(saved.endTime)) {
        // Estava rodando: recalcula pelo relógio real. Se o tempo acabou com a
        // página fechada, a fase volta ao início e a sessão NÃO é contada.
        const remaining = Math.ceil((saved.endTime - Date.now()) / 1000);
        if (remaining > 0) {
            timeLeft = Math.min(remaining, fullDuration);
            startTimer();
        }
    } else if (Number.isFinite(saved.timeLeft) && saved.timeLeft > 0) {
        // Estava pausado: devolve o tempo que faltava.
        timeLeft = Math.min(Math.floor(saved.timeLeft), fullDuration);
    }
}

/* ─────────────────────────────────────────
   ÁUDIO
   Navegadores (principalmente Safari e Chrome mobile) só deixam tocar som
   se o AudioContext foi criado/retomado depois de um gesto do usuário. Como o
   alarme toca no fim do timer, sem clique naquele momento, o contexto é
   preparado antes, no clique em "Iniciar", e reaproveitado no alarme.
───────────────────────────────────────── */
function unlockAudio() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {
        console.log('Audio unlock error:', e);
    }
}

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
/* Uma chave por dia: pomodoro-ANO-MÊS-DIA (mês de 0 a 11, como o JS devolve). */
function getDayKey(date) {
    return `pomodoro-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getTodayKey() {
    return getDayKey(new Date());
}

function getTodayCount() {
    return parseInt(safeGet(getTodayKey()), 10) || 0;
}

/* Sessões dos últimos 7 dias (do mais antigo ao de hoje), lidas das mesmas
   chaves diárias que o contador "HOJE" já usava. */
function getLastDaysHistory(days = 7) {
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        // new Date(ano, mês, dia - i) já resolve virada de mês e de ano sozinho
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        result.push({
            date: d,
            count: parseInt(safeGet(getDayKey(d)), 10) || 0
        });
    }
    return result;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function renderHistory() {
    const chart = document.getElementById('history-chart');
    if (!chart) return;

    const history = getLastDaysHistory(7);
    const max = Math.max(1, ...history.map((day) => day.count));
    const total = history.reduce((sum, day) => sum + day.count, 0);

    chart.textContent = ''; // limpa antes de redesenhar
    history.forEach((day, index) => {
        const isToday = index === history.length - 1;
        const label = isToday ? 'hoje' : WEEKDAYS[day.date.getDay()];

        const col = document.createElement('div');
        col.className = 'history-col' + (isToday ? ' history-col--today' : '');

        const value = document.createElement('span');
        value.className = 'history-value';
        value.textContent = day.count;

        const bar = document.createElement('div');
        bar.className = 'history-bar';
        // O dia mais cheio ocupa 70% da coluna (o resto é do número e do rótulo);
        // altura mínima de 4% para o dia zerado continuar visível como "traço".
        bar.style.height = Math.max(4, Math.round((day.count / max) * 70)) + '%';

        const name = document.createElement('span');
        name.className = 'history-label';
        name.textContent = label;

        col.append(value, bar, name);
        chart.appendChild(col);
    });

    const summary = document.getElementById('history-summary');
    if (summary) summary.textContent = `${total} ${total === 1 ? 'sessão' : 'sessões'} nos últimos 7 dias`;

    // Leitores de tela leem o resumo em texto em vez das barras
    chart.setAttribute('aria-label',
        'Sessões por dia: ' + history.map((day, i) =>
            `${i === history.length - 1 ? 'hoje' : WEEKDAYS[day.date.getDay()]} ${day.count}`
        ).join(', '));
}

/* Apaga todos os registros diários (usado ao zerar o progresso). */
function clearAllDailyKeys() {
    try {
        Object.keys(localStorage)
            .filter((key) => key.startsWith('pomodoro-'))
            .forEach((key) => safeRemove(key));
    } catch (e) {
        console.warn('Não foi possível apagar o histórico:', e.message);
    }
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
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // O ícone é um arquivo local do próprio projeto (não depende de outro domínio).
    const options = { body, silent: false, icon: 'icons/icon-192.png' };

    // No Chrome do Android, `new Notification()` lança erro ("Illegal
    // constructor"): lá a notificação precisa sair pelo Service Worker. Por
    // isso tentamos o Service Worker primeiro e usamos o construtor direto
    // como alternativa (desktop sem SW, por exemplo).
    const direct = () => {
        try { new Notification(title, options); }
        catch (e) { console.log('Notificação indisponível:', e.message); }
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration()
            .then((registration) => registration ? registration.showNotification(title, options) : direct())
            .catch(direct);
    } else {
        direct();
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
    cleanupOldDailyKeys();
    renderHistory();
    initEventListeners();
    registerServiceWorker();

    // Retoma a fase (foco/pausa), pausada ou rodando, se a página foi recarregada
    restoreState();
    updateDisplay();
    updateTabTitle();

    // Prepara o áudio no primeiro toque/tecla, para o alarme tocar mesmo se a
    // página foi retomada por recarregamento (sem clique em "Iniciar").
    ['click', 'keydown'].forEach((eventName) => {
        document.addEventListener(eventName, unlockAudio, { once: true });
    });

    // Page Visibility API: o navegador pausa o setInterval (e libera o Wake
    // Lock) quando a aba fica em segundo plano. Ao voltar, recalculamos o
    // tempo real a partir do timestamp salvo e pedimos a tela acesa de novo.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isRunning) {
            tick(); // atualiza o display e, se o tempo já acabou, encerra a fase na hora
            if (isRunning) requestWakeLock();
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
    document.getElementById('skipBtn').addEventListener('click', skipPhase);
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
        if (overlay.classList.contains('modal--show')) {
            if (event.key === 'Escape') closeResetModal();
            if (event.key === 'Tab') trapFocusInModal(event);
            return; // com o modal aberto, os atalhos do timer ficam desligados
        }
        handleShortcuts(event);
    });
}

/* Atalhos: Espaço inicia/pausa e S pula a fase.
   - Tudo fica desligado enquanto a pessoa digita num campo (senão o "s" de
     uma digitação pularia a fase) e quando há Ctrl/Alt/Meta apertado (não
     atrapalha os atalhos do navegador).
   - O Espaço também fica desligado com o foco num botão ou link, porque
     ali ele já tem função própria: aciona o próprio botão.
   - O S funciona mesmo com o foco num botão. Depois de clicar em "Iniciar"
     o foco fica nesse botão, e o atalho precisa continuar valendo. */
function handleShortcuts(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;

    const target = event.target;
    const tag = target && target.tagName;
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (target && target.isContentEditable);
    if (isTyping) return;

    const isClickable = tag === 'BUTTON' || tag === 'A';

    if (event.code === 'Space') {
        if (isClickable) return; // o navegador já aciona o botão/link focado
        event.preventDefault();  // evita rolar a página
        toggleStartPause();
    } else if (event.key === 's' || event.key === 'S') {
        skipPhase();
    }
}

/* Registra o Service Worker (cache para funcionar offline e notificações no
   celular). Só funciona em HTTPS ou localhost, então em qualquer outro caso
   (como abrir o arquivo direto) o app segue normal, sem o SW. */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return; // HTTPS, localhost ou 127.0.0.1

    navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service Worker não registrado:', err.message);
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

    // Se o aviso de fim de fase ainda estiver na tela (e a pessoa iniciou pelo
    // botão principal em vez do botão do aviso), esconde o aviso.
    const toast = document.getElementById('toast');
    if (toast) toast.classList.remove('toast--show');

    endTime = Date.now() + (timeLeft * 1000);
    saveState();

    timer = setInterval(tick, 1000);
    // Segundo alarme exatamente no fim: com a aba em segundo plano o setInterval
    // pode ser espaçado pelo navegador, e esse reduz o atraso do aviso.
    endTimeout = setTimeout(tick, (timeLeft * 1000) + 50);
}

/* Roda a cada segundo (e ao voltar para a aba). Sempre calcula pelo relógio
   real, nunca "subtraindo 1" — por isso não acumula atraso. */
function tick() {
    if (!isRunning) return;

    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    if (remaining <= 0) {
        finishTimer();
    } else {
        timeLeft = remaining;
        updateDisplay();
        updateTabTitle();
    }
}

function clearTimers() {
    clearInterval(timer);
    timer = null;
    clearTimeout(endTimeout);
    endTimeout = null;
}

function finishTimer() {
    clearTimers();
    isRunning = false;
    endTime = null;
    timeLeft = 0;
    releaseWakeLock();
    updateDisplay();
    updateTabTitle();
    updateStartPauseBtn();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');

    handleTimerEnd();
}

function pauseTimer() {
    if (!isRunning) return;

    // Guarda o tempo exato que faltava no momento da pausa (o display pode
    // estar até 1s atrasado em relação ao relógio real).
    timeLeft = Math.max(1, Math.ceil((endTime - Date.now()) / 1000));
    clearTimers();
    isRunning = false;
    endTime = null;
    releaseWakeLock();
    updateDisplay();
    updateStartPauseBtn();
    updateTabTitle();
    saveState();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');
}

function toggleStartPause() {
    if (isRunning) {
        pauseTimer();
    } else {
        // Ações que o navegador só permite depois de um clique do usuário
        unlockAudio();
        requestNotificationPermission();
        startTimer();
    }
}

function updateStartPauseBtn() {
    const btn = document.getElementById('startPauseBtn');
    if (btn) btn.textContent = isRunning ? '⏸ PAUSAR' : '▶ INICIAR';
}

function resetTimer() {
    clearTimers();
    isRunning = false;
    endTime = null;
    releaseWakeLock();
    updateStartPauseBtn();
    updateTabTitle();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');

    timeLeft = isBreak ? currentBreakDuration : cfg.focus * 60;
    updateDisplay();
    saveState();
}

/* Pula para a próxima fase SEM contar sessão nem dar XP (só a sessão de foco
   concluída até o fim conta). Foco pulado → pausa curta; descanso pulado →
   foco. A nova fase fica parada, esperando o "Iniciar". */
function skipPhase() {
    clearTimers();
    isRunning = false;
    endTime = null;
    releaseWakeLock();

    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.classList.remove('running');

    const toast = document.getElementById('toast');
    if (toast) toast.classList.remove('toast--show');

    if (isBreak) {
        setFocus();
    } else {
        setShortBreak();
    }

    updateStartPauseBtn();
    updateTabTitle();
    saveState();
}

function playAlarm() {
    try {
        unlockAudio();
        const ctx = audioCtx;
        if (!ctx) return;
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
    } catch(e) { console.log('Alarm error:', e); }
}

function handleTimerEnd() {
    playAlarm();

    if (!isBreak) {
        pomodoroCount++;
        incrementTodayCount();
        updateStats();
        updateTodayDisplay();
        renderHistory();

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

    saveState(); // grava a nova fase já com o tempo cheio, parada
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
    unlockAudio();
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
    clearAllDailyKeys(); // inclui o histórico dos 7 dias, como o aviso do modal diz
    updateStats();
    updateTodayDisplay();
    renderHistory();
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