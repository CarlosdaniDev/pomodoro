# 🎯 Concentração e Foco | Pomodoro

Um cronômetro Pomodoro com visual de terminal escuro, XP, níveis e histórico semanal, feito em HTML, CSS e JavaScript puros, sem bibliotecas nem framework. Instalável como app (PWA) e funciona offline.

> **Status do projeto:** funcional e em evolução.

## 🛠️ Tecnologias
* **HTML5/CSS3**: estrutura e layout responsivo.
* **JavaScript (ES6+)**: lógica do timer, estado e interface.
* **Web APIs**: Wake Lock, Notifications, Page Visibility, Web Audio, LocalStorage e Service Worker.
* **PWA**: Web App Manifest + Service Worker.

## ✨ Funcionalidades
* Ciclo completo: 4 sessões de foco seguidas de uma pausa longa, com pausa curta entre elas.
* Tempos de foco, pausa curta e pausa longa configuráveis (e salvos no navegador).
* **Pular fase** sem contar sessão nem XP.
* **Atalhos de teclado:** `Espaço` inicia/pausa e `S` pula a fase.
* Gamificação: XP, níveis (a cada 10 sessões) e contador de sessões do dia.
* **Histórico dos últimos 7 dias** em gráfico de barras.
* Aviso ao fim de cada fase: alarme sonoro, notificação do sistema e tempo no título da aba.
* A tela do aparelho fica acesa enquanto o timer roda (Wake Lock).
* Recarregar ou fechar a página não perde a fase atual (foco ou descanso), pausada ou rodando.
* **PWA:** pode ser instalado na tela inicial e abre offline.

## 💡 Decisões técnicas

1. **Contagem pelo relógio real, não por "menos 1 a cada segundo".** O timer guarda o horário em que a fase termina (`Date.now()`) e recalcula o tempo restante a cada tick. Se a aba ficar em segundo plano e o navegador atrasar o `setInterval`, o tempo exibido continua correto ao voltar.
2. **Estado da fase salvo em um único objeto no `localStorage`** (fase, tempo restante e horário de término). Ao recarregar, o app restaura a fase certa. Se o tempo acabou com a página fechada, a fase volta ao início e a sessão **não** é contada.
3. **Áudio liberado no clique em "Iniciar".** Navegadores bloqueiam som criado sem gesto do usuário, e o alarme toca no fim do timer, sem clique naquele momento. Por isso o `AudioContext` é preparado antes e reaproveitado.
4. **Notificação pelo Service Worker.** No Chrome do Android, `new Notification()` lança erro; a notificação precisa sair por `registration.showNotification()`. O código tenta o Service Worker primeiro e usa o construtor direto como alternativa.
5. **Service Worker com "rede primeiro, cache como reserva".** Online, sempre entrega a versão mais nova dos arquivos; offline, abre a última versão guardada.
6. **Histórico sem back-end.** Cada dia é uma chave no `localStorage` (`pomodoro-ANO-MÊS-DIA`); o gráfico lê os últimos 7 dias e os registros com mais de 30 dias são apagados.
7. **Alarme gerado por Web Audio API**, sem arquivo de áudio externo e sem dependência.
8. **`localStorage` com `try/catch` e valores validados.** Em modo privado ele pode lançar exceção, e configurações corrompidas voltam ao padrão em vez de quebrar o timer.
9. **Acessibilidade:** modal com foco preso e fechamento por `Esc`, avisos com `aria-live`, resumo em texto do gráfico para leitores de tela, foco visível no teclado e respeito a `prefers-reduced-motion`.

## ⚠️ Limitações conhecidas
* **Aba em segundo plano ou tela bloqueada:** o navegador pode atrasar o alarme e a notificação, porque o código só roda quando a página está ativa. O tempo exibido fica correto ao voltar. O PWA melhora a experiência (instalável, offline, notificação confiável no Android), mas não garante aviso na hora com a tela bloqueada.
* O progresso fica salvo só no navegador do aparelho usado, sem conta e sem sincronização.

## 🚀 Como usar
1. Ajuste os tempos em **Configurações**, se quiser, e clique em **Aplicar**.
2. Clique em **Iniciar** (ou aperte `Espaço`).
3. Ao fim de cada fase, use o botão do aviso para seguir para a próxima.
4. Cada sessão de foco concluída dá XP e sobe seu nível.

## 🔧 Melhorias futuras
- [ ] Sistema de ranks.
- [ ] Testes automatizados da lógica do timer.
- [ ] Exportar o histórico.

---
Criado por [CarlosDaniDev](https://github.com/CarlosdaniDev) - Estudante de ADS @ Uninter, 2026.
