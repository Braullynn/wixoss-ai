'use strict';

/**
 * ActionSpace.js
 * 
 * Gerencia o espaço de ações da IA.
 * Converte as mensagens de SELECT dinâmicas do servidor em um formato
 * de índices fixos que a rede neural consegue processar, usando máscaras de validade.
 */

function ActionSpace() {
    this.MAX_ACTIONS = 40; // Tamanho do vetor de saída da rede neural
}

/**
 * Achata as mensagens de seleção atuais em uma lista de ações possíveis.
 * Retorna { actions, mask }
 */
ActionSpace.prototype.getAvailableActions = function(selectMsgs) {
    const flattened = [];
    
    // Wixoss pode enviar múltiplos grupos de SELECT (ex: GROW e END_GROW_PHASE)
    selectMsgs.forEach((msg, selectIdx) => {
        const options = msg.options || [];
        const label = msg.label;

        if (options.length === 0) {
            // Caso especial: SELECT sem opções (ex: "Confirmar" ou "Pular")
            flattened.push({
                selectIdx: selectIdx,
                optionIdx: -1,
                label: label,
                description: `${label} (confirm/skip)`
            });
        } else {
            // Mapeia cada opção individual do SELECT
            options.forEach((opt, optIdx) => {
                flattened.push({
                    selectIdx: selectIdx,
                    optionIdx: optIdx,
                    label: label,
                    description: `${label}: ${opt.name || opt.cid || optIdx}`
                });
            });
        }
    });

    // Criar máscara de validade (1 para ação disponível, 0 para indisponível/padding)
    const mask = new Array(this.MAX_ACTIONS).fill(0);
    const validActions = flattened.slice(0, this.MAX_ACTIONS);
    
    validActions.forEach((_, i) => {
        mask[i] = 1;
    });

    return {
        available: validActions,
        mask: mask
    };
};

/**
 * Converte o índice escolhido pela IA de volta para o formato de resposta do Wixoss.
 */
ActionSpace.prototype.decodeAction = function(index, availableActions) {
    const action = availableActions[index];
    if (!action) return null;

    // Se optionIdx for -1, significa que é um SELECT sem lista de itens (ex: OK/SKIP)
    // Caso contrário, retornamos o índice da opção dentro daquele SELECT
    return {
        label: action.label,
        selectedIndex: action.optionIdx === -1 ? [] : [action.optionIdx]
    };
};

if (typeof module !== 'undefined') {
    module.exports = ActionSpace;
}
