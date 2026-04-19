'use strict';

/**
 * GameBridge.js
 * 
 * Componente principal da camada de tradução.
 * Faz o meio de campo entre o Motor do Jogo (Node.js) e a IA (Python).
 * Comunicação via JSON Lines (stdin/stdout).
 */

const readline = require('readline');
const StateEncoder = require('./StateEncoder');
const ActionSpace = require('./ActionSpace');
const RewardCalculator = require('./RewardCalculator');
const WhiteHopeAdvisor = require('../advisor/WhiteHopeAdvisor');

function GameBridge() {
    this.encoder = new StateEncoder();
    this.actionSpace = new ActionSpace();
    this.rewardCalc = new RewardCalculator();
    this.advisor = new WhiteHopeAdvisor();
    
    this.botSocket = null; // Setado pelo Runner
    this.gameState = new BotGameState();
    
    // Interface para ler comandos do Python
    this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    this._pendingResolve = null;
    this._lastResponse = null; // Armazena a última resposta para re-envio em caso de travamento
    this._activityWatchdog = null;

    this.rl.on('line', (line) => {
        try {
            const cmd = JSON.parse(line);
            if (cmd.action !== undefined && this._pendingResolve) {
                this._pendingResolve(cmd.action);
                this._pendingResolve = null;
            }
        } catch (e) {
            // Ignorar erros de parse (ex: mensagens de depuração do Python)
        }
    });
}

/**
 * Reseta o watchdog de inatividade. Chamado sempre que o motor do jogo envia um sinal de vida.
 */
GameBridge.prototype.resetActivityWatchdog = function() {
    if (this._activityWatchdog) {
        clearTimeout(this._activityWatchdog);
        this._activityWatchdog = null;
    }
};

/**
 * Inicia o watchdog de inatividade após enviarmos uma resposta ao motor.
 * Se o motor não responder nada em 5s, tentamos uma manobra de ressurreição.
 */
GameBridge.prototype.startInactivityWatchdog = function() {
    this.resetActivityWatchdog();
    this._activityWatchdog = setTimeout(() => {
        console.log(`[BRIDGE] [WATCHDOG] Motor silenciou por 5s. A ultima resposta da IA falhou! Mentor assumindo ressureição...`);
        if (this._lastSelectMsgs && this._lastSelectMsgs.length > 0 && this.botSocket) {
            // Se travou, significa que a reposta da IA causou deadlock. O Mentor toma a direção!
            const mentorBest = this.advisor.getBestResponse(this._lastSelectMsgs, this.gameState);
            let fallbackLabel = 'FAIL_SAFE_SKIP';
            let fallbackInput = [];
            
            if (mentorBest) {
                fallbackLabel = mentorBest.label;
                fallbackInput = mentorBest.selectedIndexes;
                console.log(`[WATCHDOG] Injetando ação Mentor de emergência: ${fallbackLabel} [${fallbackInput}]`);
            }

            const responseData = {
                id: Math.floor(Math.random() * 1000000),
                data: { label: fallbackLabel, input: fallbackInput }
            };
            this.botSocket.emit('gameMessage', responseData);
        }
    }, 5000);
};

/**
 * Lida com mensagens de jogo vindas do servidor.
 */
GameBridge.prototype.handleGameMessage = function(msg) {
    if (!msg || !msg.buffer) return;

    // Sinal de vida do motor: resetar watchdog
    this.resetActivityWatchdog();
    
    const self = this;

    msg.buffer.forEach(buf => {
        const data = buf.data;
        if (!data || !data.length) return;

        const selectMsgs = [];
        let isGameOver = false;
        let gameResult = null;

        data.forEach(msgObj => {
            // Log de atividade detalhado para depuração
            console.log(`[SYSTEM] Msg: ${msgObj.type} ${msgObj.content?.label || ''}`);
            
            // Atualizar estado interno do jogo
            this.processMessage(msgObj);

            if (msgObj.type === 'SELECT' || msgObj.type === 'PAY_ENER') {
                const content = msgObj.content;
                if (msgObj.type === 'PAY_ENER') content.label = 'PAY_ENER';
                selectMsgs.push(content);
            } else if (msgObj.type === 'WIN' || msgObj.type === 'LOSE') {
                isGameOver = true;
                gameResult = msgObj.type;
            } else if (['SHOW_CARDS', 'SHOW_CARDS_BY_ID', 'SHOW_COLORS', 'SHOW_TYPES', 'SHOW_EFFECTS', 'SHOW_TEXT'].includes(msgObj.type)) {
                console.log(`[BRIDGE] Auto-resolvendo diálogo de UI: ${msgObj.type}`);
                // Disparar resposta de confirmação de leitura visual
                setTimeout(() => self.respond('OK', []), 50);
            } else if (msgObj.type === 'CONFIRM') {
                console.log(`[BRIDGE] Auto-resolvendo CONFIRM`);
                setTimeout(() => self.respond('OK', true), 50);
            } else if (msgObj.type === 'SELECT_NUMBER' || msgObj.type === 'SELECT_TEXT' || msgObj.type === 'SELECT_CARD_ID') {
                console.log(`[BRIDGE] Auto-resolvendo prompt generico: ${msgObj.type}`);
                const label = msgObj.content?.label || msgObj.type;
                const defValue = msgObj.content?.defaultValue || msgObj.content?.min || 0;
                setTimeout(() => self.respond(label, defValue), 50);
            }
            // Outros tipos seriam tratados aqui se definidos no ActionSpace
        });

        if (isGameOver) {
            this.sendGameOver(gameResult);
            return;
        }

        if (selectMsgs.length > 0) {
            this._lastSelectMsgs = selectMsgs; // Guarda para o Watchdog
            this.askIA(selectMsgs);
        }
    });
};

/**
 * Atualiza o BotGameState.
 */
GameBridge.prototype.processMessage = function(msgObj) {
    // Reutiliza a lógica do BotController
    switch (msgObj.type) {
        case 'INIT': this.gameState.initialize(msgObj.content); break;
        case 'MOVE_CARD': this.gameState.handleMoveCard(msgObj.content); break;
        case 'INFORM_CARDS': this.gameState.handleInformCards(msgObj.content); break;
        case 'FACEUP_CARD': this.gameState.handleFaceupCard(msgObj.content); break;
        case 'UP_CARD': this.gameState.handleUpCard(msgObj.content); break;
        case 'DOWN_CARD': this.gameState.handleDownCard(msgObj.content); break;
        case 'CRASH': this.gameState.handleCrash(msgObj.content); break;
        case 'LIFE_COUNT': this.gameState.handleLifeCount(msgObj.content); break;
    }
};

/**
 * Codifica o estado e pergunta ao Python qual ação tomar.
 */
GameBridge.prototype.askIA = async function(selectMsgs) {
    const encodedState = this.encoder.encode(this.gameState);
    const { available, mask } = this.actionSpace.getAvailableActions(selectMsgs);
    const advisorIdx = this.advisor.getBestActionIdx(selectMsgs, this.gameState, available);
    const reward = this.rewardCalc.calculateStepReward(this.gameState, false);

    // Enviar para o Python via stdout
    console.log(JSON.stringify({
        type: 'decision',
        state: Array.from(encodedState),
        actions_count: available.length,
        available_actions: available.map(a => a.label), // Adicionado para feedback visual
        mask: mask,
        advisor: advisorIdx,
        reward: reward
    }));

    // Esperar resposta via stdin OU disparar timeout de emergência (Sistema de Muleta)
    let timeoutId;
    const timeoutPromise = new Promise(resolve => {
        timeoutId = setTimeout(() => {
            console.log(`[BRIDGE] [TIMEOUT] IA demorou > 5s. Usando Muleta (Advisor): ${advisorIdx}`);
            resolve(advisorIdx);
        }, 5000);
    });

    const pythonPromise = new Promise(resolve => {
        this._pendingResolve = resolve;
    });

    const chosenIdx = await Promise.race([pythonPromise, timeoutPromise]);
    clearTimeout(timeoutId); // Limpa o timer se a resposta chegar a tempo

    const action = this.actionSpace.decodeAction(chosenIdx, available);
    if (action) {
        let finalIndexes = action.selectedIndex;
        const originalMsg = selectMsgs[action.selectIdx];

        // --- SISTEMA DE ASSISTÊNCIA DE VOO: DISCARD & PAY_ENER ---
        if (action.label === 'DISCARD' || action.label === 'DISCARD_AND_REDRAW') {
            finalIndexes = this._assistDiscard(originalMsg, finalIndexes, selectMsgs);
        } else if (action.label === 'PAY_ENER') {
            finalIndexes = this._assistPayEner(originalMsg, finalIndexes);
        }

        this.respond(action.label, finalIndexes);
    }
};

/**
 * Auxiliar: Completa o descarte se a IA escolheu menos que o mínimo.
 */
GameBridge.prototype._assistDiscard = function(originalMsg, finalIndexes, selectMsgs) {
    // Replicando a mesma extração exata do Mentor Nativo do WIXOSS
    const minRequired = originalMsg ? (originalMsg.max || originalMsg.min || 1) : 1;
    
    if (minRequired <= finalIndexes.length) return finalIndexes;

    console.log(`[BRIDGE] Assistência (Descarte): IA descartou ${finalIndexes.length}, mas a Engine exige ${minRequired}. Completando...`);
    const mentorBest = this.advisor.getBestResponse(selectMsgs, this.gameState);
    if (mentorBest && (mentorBest.label === 'DISCARD' || mentorBest.label === 'DISCARD_AND_REDRAW')) {
        mentorBest.selectedIndexes.forEach(idx => {
            if (!finalIndexes.includes(idx) && finalIndexes.length < minRequired) {
                finalIndexes.push(idx);
            }
        });
    }

    // Fallback absoluto
    for (let i = 0; i < (originalMsg.options?.length || 0) && finalIndexes.length < minRequired; i++) {
        if (!finalIndexes.includes(i)) finalIndexes.push(i);
    }
    return finalIndexes;
};

/**
 * Auxiliar: Completa o pagamento de energia garantindo validade para o motor.
 */
GameBridge.prototype._assistPayEner = function(originalMsg, finalIndexes) {
    // Calculamos o pagamento perfeito do Mentor
    const mentorPayment = this.advisor.strategy.selectEnerPayment(originalMsg, this.gameState);
    
    let needed = 0;
    if (originalMsg.requirements) {
        originalMsg.requirements.forEach(r => needed += r.count || 0);
    }

    // Se a IA escolheu o suficiente e de forma válida, confiamos (mas validamos o tamanho)
    if (finalIndexes.length >= needed) return finalIndexes;

    console.log(`[BRIDGE] Assistência (Energia): IA: ${finalIndexes.length}, Requisito: ${needed}`);
    
    // Pegamos a escolha da IA como base e completamos com a do mentor
    const result = [...finalIndexes];
    mentorPayment.forEach(idx => {
        if (!result.includes(idx) && result.length < needed) {
            result.push(idx);
        }
    });

    // Se mesmo assim não deu (IA escolheu errado?), usamos o pagamento do mentor integralmente por segurança
    return result.length >= needed ? result : mentorPayment;
};

/**
 * Envia resposta de volta pro servidor.
 */
GameBridge.prototype.respond = function(label, input) {
    const responseData = {
        id: Math.floor(Math.random() * 1000000), // ID aleatório para simplificar
        data: { label: label, input: input !== undefined ? input : [] }
    };
    if (this.botSocket) {
        console.log(`[BRIDGE] Enviando resposta: ${label} [${input}]`);
        this._lastResponse = responseData; // Salva para re-envio se travar
        this.botSocket.emit('gameMessage', responseData);
        
        // Inicia vigilância: se o motor não disser nada em 5s, tentamos de novo.
        this.startInactivityWatchdog();
    }
};

/**
 * Notifica o Python que o jogo acabou.
 */
GameBridge.prototype.sendGameOver = function(result) {
    console.log(JSON.stringify({
        type: 'game_over',
        result: result, // 'WIN' ou 'LOSE'
        reward: result === 'WIN' ? 1.0 : -1.0
    }));
    this.rewardCalc.reset();
};

/**
 * Fecha recursos da Bridge.
 */
GameBridge.prototype.close = function() {
    this.resetActivityWatchdog();
    if (this.rl) {
        this.rl.close();
    }
};

if (typeof module !== 'undefined') {
    module.exports = GameBridge;
}
