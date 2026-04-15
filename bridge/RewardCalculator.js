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

    // 1. Recompensa por causar dano (reduzir life cloth inimigo)
    if (gameState.enemyLife < this.lastEnemyLifeCount) {
        reward += 0.15 * (this.lastEnemyLifeCount - gameState.enemyLife);
        this.lastEnemyLifeCount = gameState.enemyLife;
    }

    // 2. Penalidade por tomar dano
    if (gameState.myLife < this.lastLifeCount) {
        reward -= 0.1 * (this.lastLifeCount - gameState.myLife);
        this.lastLifeCount = gameState.myLife;
    }

    // 3. Recompensa por sobrevivência (novo turno)
    if (gameState.turnCount > this.lastTurnCount) {
        reward += 0.05;
        this.lastTurnCount = gameState.turnCount;
    }

    // 4. Incentivo ao Mestre (Guided Exploration)
    if (actionFollowsAdvisor) {
        reward += 0.02;
    }

    // 5. Penalidade por "Mão Travada" (gestão de recursos)
    if (gameState.myHand.length === 0 && gameState.phase === 'mainPhase') {
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
