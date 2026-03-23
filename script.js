let timer;
let timeLeft = 25 * 60; 
let isRunning = false;
let isBreak = false;
let isAmbiencePlaying = false;
let pomodoroCount = parseInt(localStorage.getItem('totalPomodoros')) || 0;

function startTimer() {
    if (isRunning) return;
    
    isRunning = true;
    // 1. Define o momento exato do fim baseado no tempo que restava
    const endTime = Date.now() + (timeLeft * 1000);
    localStorage.setItem('pomodoroEndTime', endTime);

    timer = setInterval(() => {
        const currentTime = Date.now();
        const remaining = Math.round((endTime - currentTime) / 1000);

        if (remaining <= 0) {
            // 2. O tempo acabou
            clearInterval(timer);
            isRunning = false;
            timeLeft = 0;
            localStorage.removeItem('pomodoroEndTime');
            updateDisplay();
            
            // Executa a finalização
            handleTimerEnd();
        } else {
            // 3. Apenas atualiza o tempo restante
            timeLeft = remaining;
            updateDisplay();
        }
    }, 1000);
}

function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    document.getElementById('timer').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Lógica para recuperar o tempo se a página for recarregada
window.onload = () => {
    const savedEndTime = localStorage.getItem('pomodoroEndTime');
    if (savedEndTime) {
        const remaining = Math.round((savedEndTime - Date.now()) / 1000);
        if (remaining > 0) {
            timeLeft = remaining;
            startTimer(); // Retoma de onde parou
        }
    }
};
function handleTimerEnd() {
    const alarm = getAlarm();
    const audioAmbiente = document.getElementById('ambienceAudio');

    // Tocar Alarme
    if (alarm) {
        if (audioAmbiente && isAmbiencePlaying) audioAmbiente.volume = 0.02;
        alarm.volume = 1.0; 
        alarm.play().catch(e => console.log("Erro som:", e));
    }

    // Lógica de Troca de Estado (Foco vs Pausa)
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

function getAlarm() {
    return document.getElementById('alarm');
}

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
    if (icon) icon.innerText = c.icon;
    if (title) title.innerText = c.title;
    if (sub) sub.innerText = c.sub;
    if (btn) btn.innerText = c.btn;
    if (toast) toast.className = c.cls;
}

function dismissToast() {
    const toast = document.getElementById('toast');
    const alarm = getAlarm();
    const audioAmbiente = document.getElementById('ambienceAudio');

    if (toast) toast.classList.remove('toast--show');

    if (alarm) {
        alarm.pause();
        alarm.currentTime = 0;
    }

    // Restaura o volume da música ambiente ao fechar o toast
    if (audioAmbiente && isAmbiencePlaying) {
        audioAmbiente.volume = 0.1;
    }

    startTimer();
}

/* ── SOM AMBIENTE ── */
function toggleAmbience() {
    const audioAmbiente = document.getElementById('ambienceAudio');
    const botaoSom = document.getElementById('bgMusicBtn');

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

/* ── FRASE ── */
function updatePhrase(type) {
    const container = document.getElementById('message-container');
    if (!container) return;
    const list = phrases[type];
    const randomIndex = Math.floor(Math.random() * list.length);
    container.style.opacity = 0;
    setTimeout(() => {
        container.innerText = `"${list[randomIndex]}"`;
        container.style.opacity = 1;
    }, 500);
}

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
    timeLeft = 5 * 60;
    updateDisplay();
    updateTimerLabel();
}

function setLongBreak() {
    updatePhrase('break');
    isBreak = true;
    timeLeft = 20 * 60;
    updateDisplay();
    updateTimerLabel();
}

function updateTimerLabel() {
    const label = document.getElementById('timer-label');
    if (!label) return;
    label.innerText = isBreak ? "MODO: DESCANSO" : "MODO: FOCO";
    label.style.color = isBreak ? "#10b981" : "#3b82f6";
    
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.style.color = isBreak ? "#10b981" : "#3b82f6";
}

function updateStats() {
    const counterEl = document.getElementById('counter');
    const xpBar = document.getElementById('xp-bar');
    const levelEl = document.getElementById('level');

    localStorage.setItem('totalPomodoros', pomodoroCount);

    if (counterEl) counterEl.innerHTML = `SESSÕES CONCLUÍDAS: <strong>#${pomodoroCount}</strong>`;
    
    const xpPorcentagem = (pomodoroCount % 10) * 10;
    const level = Math.floor(pomodoroCount / 10) + 1;

    if (xpBar) xpBar.style.width = xpPorcentagem + "%";
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
    clearInterval(timer);
    const alarm = getAlarm();
    if (alarm) { alarm.pause(); alarm.currentTime = 0; }
    
    timeLeft = isBreak ? (pomodoroCount % 4 === 0 && pomodoroCount !== 0 ? 20 * 60 : 5 * 60) : 25 * 60;
    updateDisplay();
}

window.onload = () => {
    updateStats();
    
    const savedEndTime = localStorage.getItem('pomodoroEndTime');
    if (savedEndTime) {
        const remaining = Math.round((savedEndTime - Date.now()) / 1000);
        if (remaining > 0) {
            timeLeft = remaining;
            isRunning = false; // Garante que startTimer possa iniciar
            startTimer(); 
        } else {
            localStorage.removeItem('pomodoroEndTime');
            updateDisplay();
        }
    } else {
        updateDisplay();
    }
};