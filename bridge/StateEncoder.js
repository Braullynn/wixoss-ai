'use strict';

/**
 * StateEncoder.js
 * 
 * Converte o BotGameState (objeto complexo) em um vetor numérico (float array)
 * de tamanho fixo para entrada na Rede Neural (DQL).
 */

function StateEncoder() {
    this.STATE_SIZE = 62;
}

/**
 * Codifica o estado atual em um Float32Array.
 * Filtra e normaliza os valores entre [0, 1].
 */
StateEncoder.prototype.encode = function(gameState) {
    const state = new Float32Array(this.STATE_SIZE);
    let i = 0;

    // --- 1. Global (9 features) ---
    state[i++] = gameState.myLife / 7;                      // Vida normalizada
    state[i++] = gameState.enemyLife / 7;
    state[i++] = Math.min(gameState.myEner.length / 10, 1);  // Ener (capado em 10)
    state[i++] = Math.min(gameState.enemyEnerCount / 10, 1);
    state[i++] = Math.min(gameState.myHand.length / 10, 1);  // Mão
    state[i++] = Math.min(gameState.enemyHandCount / 10, 1);
    state[i++] = gameState.myLrig ? gameState.myLrig.level / 5 : 0;
    state[i++] = Math.min(gameState.turnCount / 30, 1);      // Turno
    state[i++] = gameState.isMyTurn ? 1 : 0;

    // --- 2. Campo do Jogador (3 zonas x 4 features = 12) ---
    for (let zoneIdx = 0; zoneIdx < 3; zoneIdx++) {
        const signi = gameState.myField[zoneIdx];
        state[i++] = signi ? 1 : 0;                          // Existência
        state[i++] = signi ? signi.level / 4 : 0;            // Nível
        state[i++] = signi ? signi.power / 15000 : 0;        // Poder
        state[i++] = (signi && signi.isUp) ? 1 : 0;          // Estado UP
    }

    // --- 3. Campo Inimigo (3 zonas x 4 features = 12) ---
    for (let zoneIdx = 0; zoneIdx < 3; zoneIdx++) {
        const signi = gameState.enemyField[zoneIdx];
        state[i++] = signi ? 1 : 0;
        state[i++] = signi ? signi.level / 4 : 0;
        state[i++] = signi ? signi.power / 15000 : 0;
        state[i++] = (signi && signi.isUp) ? 1 : 0;
    }

    // --- 4. Fase de Jogo (One-Hot 8 features) ---
    const phases = ['upPhase', 'drawPhase', 'enerPhase', 'growPhase', 'mainPhase', 'attackPhase', 'endPhase', 'setup'];
    const currentPhase = gameState.phase || 'mainPhase';
    phases.forEach(p => {
        state[i++] = (currentPhase === p) ? 1 : 0;
    });

    // --- 5. Composição da Mão (10 features) ---
    // % de cartas lv1, lv2, lv3, lv4, Guard, Spell, etc.
    if (gameState.myHand.length > 0) {
        state[i++] = gameState.myHand.filter(c => c.level === 1).length / gameState.myHand.length;
        state[i++] = gameState.myHand.filter(c => c.level === 2).length / gameState.myHand.length;
        state[i++] = gameState.myHand.filter(c => c.level === 3).length / gameState.myHand.length;
        state[i++] = gameState.myHand.filter(c => c.level >= 4).length / gameState.myHand.length;
        state[i++] = gameState.myHand.filter(c => c.type === 'SPELL').length / gameState.myHand.length;
        state[i++] = gameState.myHand.filter(c => c.name && c.name.includes('Servant')).length / gameState.myHand.length;
    } else {
        i += 6; // Pula se mão vazia
    }
    i += 4; // Reservado para futuras métricas de mão

    // --- 6. Cartas Específicas / PIDs Críticos (11 features) ---
    // Presença de cartas chave na mão ou em campo
    const checkPID = (pid) => {
        const inHand = gameState.myHand.some(c => c.pid === pid);
        const inField = gameState.myField.some(c => c && c.pid === pid);
        const inArts = gameState.myLrigDeck && gameState.myLrigDeck.some(c => c.pid === pid);
        return (inHand || inField || inArts) ? 1 : 0;
    };

    state[i++] = checkPID(110); // Baroque Defense (Defesa Crítica)
    state[i++] = checkPID(112); // Servant O (Guarda)
    state[i++] = checkPID(113); // Servant D
    state[i++] = checkPID(108); // Tama Level 4 (Win Condition)
    
    // Preencher o restante até 62
    while (i < this.STATE_SIZE) {
        state[i++] = 0;
    }

    return state;
};

if (typeof module !== 'undefined') {
    module.exports = StateEncoder;
}
