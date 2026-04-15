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
    
    selectMsgs.forEach((msg, selectIdx) => {
        // Unificação: Busca opções em 'options' (SELECT) ou 'cards' (PAY_ENER)
        const options = msg.options || msg.cards || [];
        const label = msg.label || 'UNKNOWN';

        // Caso Especial: Ordenação de mútiplos itens
        if (label === 'SET_ORDER' && options.length > 0) {
            flattened.push({
                selectIdx: selectIdx,
                optionIdx: -1, 
                isOrder: true,
                count: options.length,
                label: label,
                description: `SET_ORDER: Definir ordem de ${options.length} itens`
            });
            return;
        }

        if (options.length === 0) {
            flattened.push({
                selectIdx: selectIdx,
                optionIdx: -1,
                label: label,
                description: `${label} (confirm/skip)`
            });
        } else {
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

    // MECANISMO FAIL-SAFE:
    // Se o motor do jogo está esperando uma decisão (selectMsgs não vazio)
    // mas não conseguimos mapear nenhuma ação (flattened vazio), 
    // forçamos uma ação de "pular/confirmar" para evitar o travamento do motor.
    if (selectMsgs.length > 0 && flattened.length === 0) {
        console.log("[BRIDGE] [FAIL-SAFE] Nenhuma acao mapeada. Forcando Skip.");
        flattened.push({
            selectIdx: 0,
            optionIdx: -1,
            label: 'FAIL_SAFE_SKIP',
            description: 'Ação de Emergência (Skip)'
        });
    }

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

    if (action.isOrder) {
        // Para SET_ORDER, precisamos enviar a lista completa de índices.
        // Por padrão, enviamos a ordem original [0, 1, 2, ...] para destravar o jogo.
        const order = [];
        for (let i = 0; i < action.count; i++) {
            order.push(i);
        }
        return {
            label: action.label,
            selectedIndex: order
        };
    }

    return {
        label: action.label,
        selectedIndex: action.optionIdx === -1 ? [] : [action.optionIdx]
    };
};

if (typeof module !== 'undefined') {
    module.exports = ActionSpace;
}
