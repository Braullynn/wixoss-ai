'use strict';

/**
 * HeadlessBotSocket.js
 * 
 * Simula um Socket para ambiente Node.js puro.
 * Implementa um par de sockets conectados (duplex) para que o Cliente
 * e o Servidor não ouçam suas próprias mensagens emitidas.
 */

function HeadlessBotSocket(id) {
    this.id = id || '<HEADLESS-' + Math.random().toString(36).substr(2, 5) + '>';
    this._listeners = {};
    this.disconnected = false;
    this.partner = null; // Referência para o outro lado da conexão
    
    this.io = {
        reconnection: function() {},
        opts: { query: '' }
    };
    this.handshake = { address: '127.0.0.1' };
}

/**
 * Cria um par de sockets conectados entre si.
 */
HeadlessBotSocket.createPair = function(id1, id2) {
    const s1 = new HeadlessBotSocket(id1);
    const s2 = new HeadlessBotSocket(id2);
    s1.partner = s2;
    s2.partner = s1;
    return [s1, s2];
};

HeadlessBotSocket.prototype.on = function(name, handler) {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(handler);
};

/**
 * Envia uma mensagem para o PARCEIRO (outro lado da conexão).
 */
HeadlessBotSocket.prototype.emit = function(name, data) {
    if (this.disconnected || !this.partner) return;
    
    // Dispara o evento no parceiro
    this.partner._doEmit(name, data);
};

/**
 * Função interna para disparar os callbacks registrados neste lado.
 */
HeadlessBotSocket.prototype._doEmit = function(name, data) {
    const listeners = this._listeners[name];
    if (listeners) {
        listeners.forEach(handler => handler(data));
    }
};

HeadlessBotSocket.prototype.removeAllListeners = function(name) {
    if (name) {
        delete this._listeners[name];
    } else {
        this._listeners = {};
    }
};

HeadlessBotSocket.prototype.disconnect = function() {
    if (this.disconnected) return;
    this.disconnected = true;
    this._doEmit('disconnect');
    if (this.partner) {
        this.partner._doEmit('disconnect');
        this.partner.disconnected = true;
    }
};

if (typeof module !== 'undefined') {
    module.exports = HeadlessBotSocket;
}
