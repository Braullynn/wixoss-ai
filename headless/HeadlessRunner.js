'use strict';

/**
 * HeadlessRunner.js
 * 
 * Orquestra partidas de Wixoss em ambiente Node.js.
 * Responsável por configurar a sala, os jogadores e monitorar o progresso até o fim.
 */

const { include } = require('./bootstrap');
const HeadlessBotSocket = require('./HeadlessBotSocket');

function HeadlessRunner() {
    this.roomManager = new RoomManager({
        MAX_ROOMS: 1,
        MAX_CLIENTS: 2,
        MAX_ROOM_NAME_LENGTH: 30,
        MAX_NICKNAME_LENGTH: 30,
        MAX_PASSWORD_LENGTH: 15
    });
    
    this.gameResult = null;
    this.onGameOverCallback = null;
}

/**
 * Prepara uma partida entre dois controladores.
 */
HeadlessRunner.prototype.setupMatch = function(player1Controller, player2Controller, deck1, deck2) {
    console.log('[RUNNER] Configurando partida...');

    // 1. Criar Pares de Sockets (Cliente <-> Servidor)
    const [clientSocket1, serverSocket1] = HeadlessBotSocket.createPair('<CLIENT-1>', '<SERVER-1>');
    const [clientSocket2, serverSocket2] = HeadlessBotSocket.createPair('<CLIENT-2>', '<SERVER-2>');

    // 2. Conectar Sockets do Lado Servidor ao RoomManager
    this.roomManager.createClient(serverSocket1);
    const client1 = this.roomManager.clients[this.roomManager.clients.length - 1];
    
    this.roomManager.createClient(serverSocket2);
    const client2 = this.roomManager.clients[this.roomManager.clients.length - 1];

    if (!client1 || !client2) {
        throw new Error('[RUNNER] Falha ao criar instâncias de conexão (Client)');
    }

    // Associar controladores aos sockets do Lado Cliente
    player1Controller.botSocket = clientSocket1;
    player2Controller.botSocket = clientSocket2;

    // Configurar listeners de mensagem (conectar socket -> controller) no Lado Cliente
    clientSocket1.on('gameMessage', msg => player1Controller.handleGameMessage(msg));
    clientSocket2.on('gameMessage', msg => player2Controller.handleGameMessage(msg));

    // 3. Criar Sala e Iniciar Fluxo
    const roomName = 'ML_TRAINING_ROOM';
    
    // Jogador 1 cria a sala
    this.roomManager.createRoom(client1, {
        roomName: roomName,
        nickname: 'DQL_Agent',
        password: '',
        mayusRoom: false
    });

    // Jogador 2 entra na sala
    this.roomManager.joinRoom(client2, {
        roomName: roomName,
        nickname: 'WHITE_HOPE_BOT',
        password: ''
    });

    // Ambos ficam prontos com seus decks
    client2.ready(deck2);
    
    // Iniciar a partida
    client1.startGame({
        mainDeck: deck1.mainDeck,
        lrigDeck: deck1.lrigDeck,
        live: false
    });

    // Rastrear fim de jogo
    const game = this.roomManager.rooms[0].game;
    const self = this;
    
    // Sobrescrever onGameover do engine para capturar resultado
    const originalOnGameover = game.onGameover;
    game.onGameover = function() {
        if (originalOnGameover) originalOnGameover.apply(this, arguments);
        self.gameResult = {
            winner: game.winner === game.hostPlayer ? 'player1' : 'player2',
            turnCount: game.phase.turnCount
        };
        console.log(`[RUNNER] Fim de jogo! Vencedor: ${self.gameResult.winner} em ${self.gameResult.turnCount} turnos.`);
        if (self.onGameOverCallback) self.onGameOverCallback(self.gameResult);
    };

    return game;
};

/**
 * Função de teste: Roda uma partida Bot vs Bot localmente.
 */
function runTest() {
    console.log('[TEST] Iniciando teste local Headless (Bot vs Bot)...');
    
    const runner = new HeadlessRunner();
    
    // Usar estratégia WHITE_HOPE para ambos para o teste
    const logger = new BotLogger('[HEADLESS-BOT]');
    
    const strategy1 = new WhiteHopeStrategy(logger);
    const controller1 = new BotController(strategy1, logger);
    controller1.actionDelay = { min: 0, max: 0 }; // SEM DELAY

    const strategy2 = new WhiteHopeStrategy(logger);
    const controller2 = new BotController(strategy2, logger);
    controller2.actionDelay = { min: 0, max: 0 }; // SEM DELAY

    const whiteHopeDeck = BotDecks.getDeck('WHITE_HOPE').deck;

    runner.onGameOverCallback = (result) => {
        console.log('[TEST] Resultado verificado com sucesso.');
        process.exit(0);
    };

    runner.setupMatch(controller1, controller2, whiteHopeDeck, whiteHopeDeck);
}

/**
 * Função de treino para a IA: Conecta GameBridge vs WhiteHope Bot.
 */
function runMLTraining() {
    const GameBridge = require('../bridge/GameBridge');
    const runner = new HeadlessRunner();
    
    // Player 1: IA (via Bridge)
    const bridge = new GameBridge();
    
    // Player 2: Mentor (WhiteHope Bot)
    const logger = new BotLogger('[OPPONENT-BOT]');
    logger.enabled = false;
    const strategy2 = new WhiteHopeStrategy(logger);
    const controller2 = new BotController(strategy2, logger);
    controller2.actionDelay = { min: 0, max: 0 }; // SEM DELAY no treino

    const whiteHopeDeck = BotDecks.getDeck('WHITE_HOPE').deck;

    runner.setupMatch(bridge, controller2, whiteHopeDeck, whiteHopeDeck);
}

// Se executado diretamente com --test
if (require.main === module) {
    if (process.argv.includes('--test')) {
        runTest();
    } else if (process.argv.includes('--ml-training')) {
        runMLTraining();
    }
}

module.exports = HeadlessRunner;
