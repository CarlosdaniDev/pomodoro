# 🎯 Pomodoro | Terminal de Estudos 🚀

Um cronômetro de alta precisão focado em produtividade, desenvolvido com a estética de **Terminal Digital** e lógica avançada de persistência de dados.

> **Status do Projeto:** 🛠️ Funcional e em constante evolução (Digital Architect Path).

## 🛠️ Tecnologias Utilizadas
* **HTML5/CSS3**: Estrutura e estilização responsiva.
* **JavaScript (ES6+)**: Lógica de cronometragem, gamificação e manipulação de hardware.
* **Wake Lock API**: Mantém a tela do dispositivo ativa durante as sessões de foco.
* **LocalStorage**: Persistência de progresso (XP, Nível e Sessões).

## 💡 Diferenciais Técnicos

Diferente de cronômetros comuns que travam quando o celular bloqueia, este projeto foi construído com:

1. **Sincronização por Timestamp (`Date.now()`):** A contagem não depende do processador, mas do relógio real do sistema. Se você fechar a aba e voltar 5 minutos depois, o tempo estará correto.
2. **Wake Lock API:** Integração que solicita ao navegador para não apagar a tela enquanto o timer estiver rodando, garantindo que o alarme toque sem interrupções.
3. **Gamificação ADS:** Sistema de Nível e XP (Digital Architect) para motivar o progresso contínuo.
4. **Som Ambiente Integrado:** Frequências de chuva para auxiliar no isolamento acústico e foco profundo.

## 🚀 Como usar
1. Escolha o seu modo (Foco/Pausa).
2. Ative o **Som Ambiente** se desejar.
3. Clique em **Iniciar Seção**.
4. Ao final de cada ciclo, você ganhará XP e avançará de nível!

## 🔧 Melhorias Futuras
- [ ] Transformar em PWA (Progressive Web App).
- [ ] Adicionar sistema de Ranks (Junior, Pleno, Senior).
- [ ] Histórico detalhado de horas estudadas.

---
Criado por [CarlosDaniDev](https://github.com/CarlosdaniDev) - Estudante de ADS @ Uninter 2026.
