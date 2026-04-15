'use strict';

/**
 * WhiteHopeAdvisor.js
 * 
 * Um wrapper que usa a estratégia WHITE_HOPE original para sugerir
 * a "melhor" ação em um dado estado. Serve como mentor para a IA.
 */

function WhiteHopeAdvisor() {
    this.logger = new BotLogger('[ADVISOR]');
    this.logger.enabled = false; // Silencioso durante o treino
    this.strategy = new WhiteHopeStrategy(this.logger);
}

/**
 * Analisa as opções disponíveis e retorna o índice FLAT da melhor ação
 * segundo a heurística do white_hope.js.
 */
WhiteHopeAdvisor.prototype.getBestActionIdx = function(selectMsgs, gameState, availableActions) {
    // 1. Obter a decisão da estratégia original
    const bestAction = this.strategy.evaluateSelects(selectMsgs, gameState);
    if (!bestAction) return -1;

    // 2. Encontrar qual índice no ActionSpace (vetor flat) corresponde à escolha do bot
    const idx = availableActions.findIndex(a => {
        return a.label === bestAction.label && 
               JSON.stringify(a.optionIdx === -1 ? [] : [a.optionIdx]) === JSON.stringify(bestAction.selectedIndexes);
    });

    return idx;
};

/**
 * Retorna a decisão completa da estratégia (incluindo múltiplos índices)
 * Útil para PAY_ENER e automações de muleta.
 */
WhiteHopeAdvisor.prototype.getBestResponse = function(selectMsgs, gameState) {
    return this.strategy.evaluateSelects(selectMsgs, gameState);
};

if (typeof module !== 'undefined') {
    module.exports = WhiteHopeAdvisor;
}
