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
 * Lida com mensagens de jogo vindas do servidor.
 */
GameBridge.prototype.handleGameMessage = function(msg) {
    if (!msg || !msg.buffer) return;

    msg.buffer.forEach(buf => {
        const data = buf.data;
        if (!data || !data.length) return;

        const selectMsgs = [];
        let isGameOver = false;
        let gameResult = null;

        data.forEach(msgObj => {
            // Atualizar estado interno do jogo
            this.processMessage(msgObj);

            if (msgObj.type === 'SELECT') {
                selectMsgs.push(msgObj.content);
            } else if (msgObj.type === 'WIN' || msgObj.type === 'LOSE') {
                isGameOver = true;
                gameResult = msgObj.type;
            }
            // Outros tipos (PAY_ENER, etc) seriam tratados aqui se definidos no ActionSpace
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
        mask: mask,
        advisor: advisorIdx,
        reward: reward
    }));

    // Esperar resposta via stdin (Promessa resolvida pelo evento 'line')
    const chosenIdx = await new Promise(resolve => {
        this._pendingResolve = resolve;
    });

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
        data: { label: label, input: input || [] }
    };
    if (this.botSocket) {
        this.botSocket.emit('gameMessage', responseData);
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

if (typeof module !== 'undefined') {
    module.exports = GameBridge;
}
