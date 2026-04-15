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

    const myEner = gameState.myEner || [];
    const myHand = gameState.myHand || [];
    const myField = gameState.myField || [null, null, null];
    const enemyField = gameState.enemyField || [null, null, null];
    const myLrigDeck = gameState.myLrigDeck || [];

    // --- 1. Global (9 features) ---
    state[i++] = (gameState.myLife || 0) / 7;                      
    state[i++] = (gameState.enemyLife || 0) / 7;
    state[i++] = Math.min(myEner.length / 10, 1);  
    state[i++] = Math.min((gameState.enemyEnerCount || 0) / 10, 1);
    state[i++] = Math.min(myHand.length / 10, 1);  
    state[i++] = Math.min((gameState.enemyHandCount || 0) / 10, 1);
    state[i++] = gameState.myLrig ? (gameState.myLrig.level || 0) / 5 : 0;
    state[i++] = Math.min((gameState.turnCount || 0) / 30, 1);      
    state[i++] = gameState.isMyTurn ? 1 : 0;

    // --- 2. Campo do Jogador (3 zonas x 4 features = 12) ---
    for (let zoneIdx = 0; zoneIdx < 3; zoneIdx++) {
        const signi = myField[zoneIdx];
        state[i++] = signi ? 1 : 0;                          
        state[i++] = signi ? (signi.level || 0) / 4 : 0;            
        state[i++] = signi ? (signi.power || 0) / 15000 : 0;        
        state[i++] = (signi && signi.isUp) ? 1 : 0;          
    }

    // --- 3. Campo Inimigo (3 zonas x 4 features = 12) ---
    for (let zoneIdx = 0; zoneIdx < 3; zoneIdx++) {
        const signi = enemyField[zoneIdx];
        state[i++] = signi ? 1 : 0;
        state[i++] = signi ? (signi.level || 0) / 4 : 0;
        state[i++] = signi ? (signi.power || 0) / 15000 : 0;
        state[i++] = (signi && signi.isUp) ? 1 : 0;
    }

    // --- 4. Fase de Jogo (One-Hot 8 features) ---
    const phases = ['upPhase', 'drawPhase', 'enerPhase', 'growPhase', 'mainPhase', 'attackPhase', 'endPhase', 'setup'];
    const currentPhase = gameState.phase || 'setup';
    phases.forEach(p => {
        state[i++] = (currentPhase === p) ? 1 : 0;
    });

    // --- 5. Composição da Mão (10 features) ---
    if (myHand.length > 0) {
        state[i++] = myHand.filter(c => c && c.level === 1).length / myHand.length;
        state[i++] = myHand.filter(c => c && c.level === 2).length / myHand.length;
        state[i++] = myHand.filter(c => c && c.level === 3).length / myHand.length;
        state[i++] = myHand.filter(c => c && c.level >= 4).length / myHand.length;
        state[i++] = myHand.filter(c => c && c.type === 'SPELL').length / myHand.length;
        state[i++] = myHand.filter(c => c && c.name && c.name.includes('Servant')).length / myHand.length;
    } else {
        i += 6; 
    }
    i += 4; 

    // --- 6. Cartas Específicas / PIDs Críticos (11 features) ---
    const checkPID = (pid) => {
        const inHand = myHand.some(c => c && c.pid === pid);
        const inField = myField.some(c => c && c.pid === pid);
        const inArts = myLrigDeck.some(c => c && c.pid === pid);
        return (inHand || inField || inArts) ? 1 : 0;
    };

    state[i++] = checkPID(110); // Baroque Defense
    state[i++] = checkPID(112); // Servant O
    state[i++] = checkPID(113); // Servant D
    state[i++] = checkPID(108); // Tama Level 4
    
    while (i < this.STATE_SIZE) {
        state[i++] = 0;
    }

    return state;
};

if (typeof module !== 'undefined') {
    module.exports = StateEncoder;
}
