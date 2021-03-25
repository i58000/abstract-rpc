(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.AbstractRPC = {}));
}(this, (function (exports) { 'use strict';

    var MessageType;
    (function (MessageType) {
        MessageType["REQUSET"] = "request";
        MessageType["RESPONSE"] = "response";
    })(MessageType || (MessageType = {}));
    class Message {
        constructor({ payload, meta, type }) {
            this.payload = payload;
            this.meta = meta;
            this.type = type;
        }
    }

    class RPC {
        constructor() {
            this._messageMeta = 'rpc';
            this._isReady = false;
            this._requestMap = {};
            this._procedureMap = {};
            if (!this.addMessageListener) {
                throw new Error('this RPC instance has no `addMessageListener` method, please implement it correctly.');
            }
            if (!this.removeMessageListener) {
                throw new Error('this RPC instance has no `removeMessageListener` method, please implement it correctly.');
            }
            if (!this.postMessage) {
                throw new Error('this RPC instance has no `postMessage` method, please implement it correctly.');
            }
        }
        /**
         * @public
         * @description init, add the listener
         */
        start() {
            if (this._isReady) {
                throw new Error('this RPC instance has started, do not start again.');
            }
            this.addMessageListener(this._messagelistener.bind(this));
            this._isReady = true;
        }
        /**
         * @public
         * @description remove the listener
         */
        stop() {
            if (!this._isReady) {
                throw new Error('this RPC instance has not started, unable to stop it.');
            }
            this.removeMessageListener(this._messagelistener.bind(this));
            this._isReady = false;
        }
        /**
         * @public
         * @description caller, call the remote procedure
         */
        // eslint-disable-next-line
        async call(name, value) {
            if (!this._isReady) {
                throw new Error('this RPC instance is not ready, start it please.');
            }
            return new Promise(async (resolve, reject) => {
                const uuid = _genUUID();
                const payload = {
                    uuid,
                    name,
                    value,
                    timestamp: new Date().getTime()
                };
                this._requestMap[uuid] = {
                    payload,
                    resolve,
                    reject
                };
                this.postMessage(new Message({ payload, meta: this._messageMeta, type: MessageType.REQUSET }));
            });
        }
        /**
         * @public
         * @description callee, register a procedure, or unregister without second argument
         */
        procedure(name, func) {
            if (!func) {
                // unregister
                delete this._procedureMap[name];
                return;
            }
            if (this._procedureMap[name]) {
                _warn('this name of procedure is registered, replace it.');
            }
            this._procedureMap[name] = func;
        }
        /**
         * @private
         */
        async _messagelistener(msg) {
            const { type, meta, payload } = msg;
            // 非 RPC 消息
            if (meta !== this._messageMeta)
                return;
            switch (type) {
                case MessageType.REQUSET:
                    this._resolveRequest(payload);
                    break;
                case MessageType.RESPONSE:
                    this._resolveResponse(payload);
                    break;
                default:
                    throw new Error(`unknown message type: ${type}`);
            }
        }
        async _resolveRequest({ uuid, value, name }) {
            const payload = {
                uuid,
                name,
                state: 'pending',
                value: undefined
            };
            try {
                _log(`[${this.label()}] callee: procedure \`${name}\`[${uuid}] is being called with:`, value);
                const func = this._procedureMap[name];
                if (!(func instanceof Function)) {
                    throw new Error(`procedure \`${name}\`is not existed or is not a function`);
                }
                const ret = func(value);
                _log(`[${this.label()}] callee: procedure \`${name}\`[${uuid}] returns value/promise:`, ret);
                if (ret instanceof Promise) {
                    //  #<Promise> could not be cloned. so must be resolved
                    const resolvedValue = await ret;
                    payload.value = resolvedValue;
                }
                else {
                    payload.value = ret;
                }
                payload.state = 'fulfilled';
            }
            catch (err) {
                _log(`[${this.label()}] callee: procedure \`${name}\`[${uuid}] throws error: ${err}`);
                payload.error = err;
                payload.state = 'rejected';
            }
            finally {
                this.postMessage(new Message({ payload, meta: this._messageMeta, type: MessageType.RESPONSE }));
            }
        }
        _resolveResponse({ uuid, value, name, error, state }) {
            if (!this._requestMap[uuid]) {
                _warn(`[${this.label()}] caller: procedure \`${name}\`[${uuid}] is not matched`);
                return;
            }
            const { resolve, reject } = this._requestMap[uuid];
            delete this._requestMap[uuid]; // use once
            if (state === 'fulfilled') {
                _log(`[${this.label()}] caller: procedure \`${name}\`[${uuid}] returns value:`, value, this);
                resolve(value);
            }
            else if (state === 'rejected') {
                _log(`[${this.label()}] caller: procedure \`${name}\`[${uuid}] throws error:`, error);
                reject(error);
            }
            else {
                throw new Error(`unknow payload state: ${state}`);
            }
        }
    }
    function _S4() {
        // eslint-disable-next-line
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    }
    function _genUUID() {
        return _S4() + _S4();
    }
    function _warn(...args) {
        console.warn(`[RPC]`, ...args); // eslint-disable-line
    }
    function _log(...args) {
        console.log(`[RPC]`, ...args); // eslint-disable-line
    }

    class ServiceWorkerRPC extends RPC {
        constructor() {
            super(...arguments);
            this.label = () => 'service-worker-side';
        }
        async postMessage(message) {
            const windows = await self.clients.matchAll({ type: 'window' });
            for (const win of windows) {
                win.postMessage(message);
            }
        }
        addMessageListener(listener) {
            self.addEventListener('message', listener);
        }
        removeMessageListener(listener) {
            self.removeEventListener('message', listener);
        }
    }

    class WebRPC extends RPC {
        constructor() {
            super(...arguments);
            this.label = () => 'client-side';
        }
        async postMessage(message) {
            const reg = await navigator.serviceWorker.getRegistration();
            reg?.active?.postMessage(message);
        }
        addMessageListener(listener) {
            navigator.serviceWorker?.addEventListener('message', listener);
        }
        removeMessageListener(listener) {
            navigator.serviceWorker?.removeEventListener('message', listener);
        }
    }

    exports.ServiceWorkerRPC = ServiceWorkerRPC;
    exports.WebRPC = WebRPC;
    exports.default = RPC;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
