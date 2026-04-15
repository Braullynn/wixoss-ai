'use strict';

/**
 * bootstrap.js
 * 
 * Este arquivo carrega o motor do jogo Wixoss no ambiente Node.js.
 * Ele simula o ambiente global necessário para que os scripts originais
 * funcionem sem modificações, injetando as classes no objeto 'global'.
 */

const path = require('path');
const fs = require('fs');

// Configuração de ambiente global (compatibilidade com browser scripts)
global.window = global;

// Injetar bibliotecas base
global.Random = require('random-js');

// Helper para carregar arquivos JS do core que usam variáveis globais
function include(relativePath) {
    const fullPath = path.resolve(__dirname, '../../', relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    // Executa o código no contexto global
    eval.call(global, code);
}

console.log('[BOOTSTRAP] Carregando motor do jogo...');

// 1. Carregar Utilidades Internas
include('util.js');
include('random.min.js');
include('Callback.js');

// 2. Carregar Classes Base do Engine
include('Zone.js');
include('CardInfo.js');
include('Card.js');
include('Phase.js');
include('Timming.js');
include('Mask.js');
include('ConstEffect.js');
include('ConstEffectManager.js');
include('Effect.js');
include('EffectManager.js');
include('IO.js');
include('Player.js');
include('Game.js');

// 3. Carregar Classes de Gerenciamento de Sala (para o Runner)
include('Client.js');
include('Room.js');
include('RoomManager.js');

// 4. Carregar Componentes de Bot (para o oponente)
include('webxoss-client/bot-cpu/BotLogger.js');
include('webxoss-client/bot-cpu/BotDecks.js');
include('webxoss-client/bot-cpu/BotGameState.js');
include('webxoss-client/bot-cpu/BotController.js');

// 5. Carregar Estratégia Específica (WHITE_HOPE)
include('webxoss-client/bot-cpu/strategies/WHITE_HOPE.js');

// Wrapper para Debug e Correção do BotController
const originalHandleMsg = global.BotController.prototype.handleGameMessage;
global.BotController.prototype.handleGameMessage = function(msg) {
    if (!msg || !msg.buffer) {
        // Ignora mensagens sem buffer (geralmente ecos de resposta do próprio bot se o loopback não for perfeito)
        return;
    }
    return originalHandleMsg.apply(this, arguments);
};

// Se o BotController usar _doEmit no respond, ele não envia pro servidor no nosso par de sockets.
// Vamos forçar o uso de emit() que é o padrão de rede.
global.BotController.prototype.respond = function (label, input) {
	if (this._gameOver) return;
	if (input === undefined) input = [];
	var responseData = {
		id: this._responseId++,
		data: {
			label: label,
			input: input
		}
	};
	this.logger.log('Respondendo: ' + label + ' → [' + input.toString() + ']', 'action');
	if (this.botSocket) {
		this.botSocket.emit('gameMessage', responseData); // Usar emit em vez de _doEmit
	}
};

console.log('[BOOTSTRAP] Motor carregado com sucesso.');

module.exports = {
    include: include
};
