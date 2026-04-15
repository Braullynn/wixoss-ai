'use strict';

/**
 * RewardCalculator.js
 * 
 * Calcula as recompensas imediatas e finais para o agente DQL.
 * Ajuda a guiar o aprendizado através de reforço positivo e negativo.
 */

function RewardCalculator() {
    this.lastLifeCount = 7;
    this.lastEnemyLifeCount = 7;
    this.lastTurnCount = 0;
}

/**
 * Zera o estado para um novo episódio.
 */
RewardCalculator.prototype.reset = function() {
    this.lastLifeCount = 7;
    this.lastEnemyLifeCount = 7;
    this.lastTurnCount = 0;
};

/**
 * Calcula a recompensa para um step (decisão).
 */
RewardCalculator.prototype.calculateStepReward = function(gameState, actionFollowsAdvisor) {
    let reward = 0;
    const myLife = gameState.myLife !== undefined ? gameState.myLife : this.lastLifeCount;
    const enemyLife = gameState.enemyLife !== undefined ? gameState.enemyLife : this.lastEnemyLifeCount;
    const turnCount = gameState.turnCount || 0;
    const myHand = gameState.myHand || [];

    // 1. Recompensa por causar dano (reduzir life cloth inimigo)
    if (enemyLife < this.lastEnemyLifeCount) {
        reward += 0.15 * (this.lastEnemyLifeCount - enemyLife);
        this.lastEnemyLifeCount = enemyLife;
    }

    // 2. Penalidade por tomar dano
    if (myLife < this.lastLifeCount) {
        reward -= 0.1 * (this.lastLifeCount - myLife);
        this.lastLifeCount = myLife;
    }

    // 3. Recompensa por sobrevivência (novo turno)
    if (turnCount > this.lastTurnCount) {
        reward += 0.05;
        this.lastTurnCount = turnCount;
    }

    // 4. Incentivo ao Mestre (Guided Exploration)
    if (actionFollowsAdvisor) {
        reward += 0.02;
    }

    // 5. Penalidade por "Mão Travada" (gestão de recursos)
    if (myHand.length === 0 && (gameState.phase === 'mainPhase' || !gameState.phase)) {
        reward -= 0.05;
    }

    return reward;
};

/**
 * Calcula a recompensa final do jogo.
 */
RewardCalculator.prototype.calculateGameEndReward = function(result) {
    if (result.winner === 'player1') {
        return 1.0;  // Vitória
    } else {
        return -1.0; // Derrota
    }
};

if (typeof module !== 'undefined') {
    module.exports = RewardCalculator;
}
