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
        console.log(`[BRIDGE] [WATCHDOG] Motor silenciou por 5s apos resposta. Tentando ressurreição...`);
        if (this._lastResponse && this.botSocket) {
            // Tenta re-enviar a última mensagem (pode ter sido perdida no buffer interno do core)
            this.botSocket.emit('gameMessage', this._lastResponse);
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

            if (msgObj.type === 'SELECT') {
                selectMsgs.push(msgObj.content);
            } else if (msgObj.type === 'PAY_ENER') {
                const msg = msgObj.content;
                msg.label = 'PAY_ENER'; // Garante a padronização

                const selection = self.advisor.strategy.selectEnerPayment(msg, self.gameState);
                
                let needed = 0;
                if (msg.requirements) {
                    msg.requirements.forEach(r => needed += r.count || 0);
                }

                if (selection.length >= needed) {
                    console.log(`[BRIDGE] Automatizando Pagamento (Mentor): PAY_ENER [${selection}]`);
                    setTimeout(() => self.respond('PAY_ENER', selection), 30);
                } else if (msg.cancelable) {
                    console.log(`[BRIDGE] Sem energia suficiente para custo. Cancelando PAY_ENER (null)`);
                    setTimeout(() => self.respond('PAY_ENER', null), 30);
                } else {
                    console.log(`[BRIDGE] Energia insuficiente para custo obrigatorio! Enviando o q tem: [${selection}]`);
                    setTimeout(() => self.respond('PAY_ENER', selection), 30);
                }
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
        this.respond(action.label, action.selectedIndex);
    }
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
