let timer;
let timeLeft = 1 * 2;
let isBreak = false;
let isAmbiencePlaying = false;
let pomodoroCount = parseInt(localStorage.getItem('totalPomodoros')) || 0;

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

/* ── Função auxiliar — sempre pega o alarm do DOM na hora ── */
function getAlarm() {
    return document.getElementById('alarm');
}

/* ── TOAST ── */
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
    icon.innerText  = c.icon;
    title.innerText = c.title;
    sub.innerText   = c.sub;
    btn.innerText   = c.btn;
    toast.className = c.cls;
}

function dismissToast() {
    const toast  = document.getElementById('toast');
    const alarm  = getAlarm();

    toast.classList.remove('toast--show');

    if (alarm) {
        alarm.pause();
        alarm.currentTime = 0;
    }

    startTimer();
}

/* ── SOM AMBIENTE ── */
function toggleAmbience() {
    const audioAmbiente = document.getElementById('ambienceAudio');
    const botaoSom      = document.getElementById('bgMusicBtn');

    if (!isAmbiencePlaying) {
        audioAmbiente.load();
        audioAmbiente.play().then(() => {
            audioAmbiente.volume = 0.1;
            botaoSom.innerText = "🔊 SOM AMBIENTE: ON";
            isAmbiencePlaying = true;
        }).catch(error => {
            console.error("Erro ao carregar áudio:", error);
        });
    } else {
        audioAmbiente.pause();
        botaoSom.innerText = "🔇 SOM AMBIENTE: OFF";
        isAmbiencePlaying = false;
    }
}

/* ── FRASE MOTIVACIONAL ── */
function updatePhrase(type) {
    const container = document.getElementById('message-container');
    if (!container) return;
    const list = phrases[type];
    const randomIndex = Math.floor(Math.random() * list.length);
    container.style.opacity = 0;
    setTimeout(() => {
        container.innerText = `"${list[randomIndex]}"`;
        container.style.opacity = 1;
        container.style.transition = "opacity 0.5s";
    }, 500);
}

/* ── TIMER ── */
function startTimer() {
    const alarm = getAlarm();

    clearInterval(timer);

    if (alarm) {
        alarm.pause();
        alarm.currentTime = 0;
    }

    timer = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(timer);

            const alarm = getAlarm();
            if (alarm) {
                alarm.volume = 1.0;
                alarm.currentTime = 0;
                alarm.play().catch(e => console.log("Erro ao tocar alarme:", e));
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
            return;
        }

        timeLeft--;
        updateDisplay();
    }, 1000);
}

function setFocus() {
    updatePhrase('focus');
    clearInterval(timer);
    isBreak = false;
    timeLeft = 25 * 60;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.style.color = "#3b82f6";
    updateDisplay();
    updateTimerLabel();
}

function setShortBreak() {
    updatePhrase('break');
    isBreak = true;
    timeLeft = 5 * 60;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.style.color = "#10b981";
    updateDisplay();
    updateTimerLabel();
}

function setLongBreak() {
    updatePhrase('break');
    isBreak = true;
    timeLeft = 20 * 60;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.style.color = "#f59e0b";
    updateDisplay();
    updateTimerLabel();
}

function updateTimerLabel() {
    const label = document.getElementById('timer-label');
    if (!label) return;
    if (isBreak) {
        label.innerText = "MODO: DESCANSO";
        label.style.color = "#10b981";
    } else {
        label.innerText = "MODO: FOCO";
        label.style.color = "#3b82f6";
    }
}

function updateStats() {
    const counterEl = document.getElementById('counter');
    const xpBar     = document.getElementById('xp-bar');
    const levelEl   = document.getElementById('level');

    localStorage.setItem('totalPomodoros', pomodoroCount);

    if (counterEl) {
        counterEl.innerHTML = `SESSÕES CONCLUÍDAS: <strong>#${pomodoroCount}</strong>`;
    }

    const xpPorcentagem = (pomodoroCount % 10) * 10;
    const level = Math.floor(pomodoroCount / 10) + 1;

    if (xpBar)   xpBar.style.width = xpPorcentagem + "%";
    if (levelEl) levelEl.innerText = `NÍVEL: ${level}`;
}

function updateDisplay() {
    const timerDisplay = document.getElementById('timer');
    if (!timerDisplay) return;
    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;
    timerDisplay.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function resetTimer() {
    const alarm = getAlarm();

    clearInterval(timer);

    if (alarm) {
        alarm.pause();
        alarm.currentTime = 0;
    }

    timeLeft = isBreak
        ? (pomodoroCount % 4 === 0 && pomodoroCount !== 0 ? 20 * 60 : 5 * 60)
        : 25 * 60;

    updateDisplay();
}

window.onload = () => {
    updateStats();
    updateDisplay();
};