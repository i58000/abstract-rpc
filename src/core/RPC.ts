import { RequestPayload, ResponsePayload } from './payload'
import { Message, MessageType } from './message'

interface RequestMap {
    [uuid: string]: {
        payload: RequestPayload;
        resolve: Function;
        reject: Function;
    };
}
interface ProcedureMap {
    [name: string]: Function;
}

export default abstract class RPC {
    private _messageMeta = 'rpc';
    private _isReady = false;
    private _requestMap: RequestMap = {};
    private _procedureMap: ProcedureMap = {};

    /**
     * @protected
     * @description please implement this method, and do not use it outside this class
     */
    protected abstract addMessageListener(listener: Function): void;
    /**
     * @protected
     * @description please implement this method, and do not use it outside this class
     */
    protected abstract removeMessageListener(listener: Function): void;
    /**
     * @protected
     * @description please implement this method, and do not use it outside this class
     */
    protected abstract postMessage(message: Message): void;
    /**
     * @protected
     * @description please implement this method, and do not use it outside this class
     */
    protected abstract label(): string;

    constructor() {
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
    public start(): void {
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
    public stop(): void {
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
    public async call<T>(name: string, value?: any): Promise<T> {
        if (!this._isReady) {
            throw new Error('this RPC instance is not ready, start it please.');
        }
        return new Promise(async (resolve, reject) => {
            const uuid = _genUUID();
            const payload: RequestPayload = {
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
    public procedure(name: string, func: Function): void {
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
    private async _messagelistener(msg: Message): Promise<void> {
        const { type, meta, payload } = msg;
        // 非 RPC 消息
        if (meta !== this._messageMeta) return;
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

    private async _resolveRequest({ uuid, value, name }: RequestPayload): Promise<void> {
        const payload: ResponsePayload = {
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
            } else {
                payload.value = ret;
            }
            payload.state = 'fulfilled';
        } catch (err) {
            _log(`[${this.label()}] callee: procedure \`${name}\`[${uuid}] throws error: ${err}`);
            payload.error = err;
            payload.state = 'rejected';
        } finally {
            this.postMessage(new Message({ payload, meta: this._messageMeta, type: MessageType.RESPONSE }));
        }
    }

    private _resolveResponse({ uuid, value, name, error, state }: ResponsePayload): void {
        if (!this._requestMap[uuid]) {
            _warn(`[${this.label()}] caller: procedure \`${name}\`[${uuid}] is not matched`);
            return;
        }
        const { resolve, reject } = this._requestMap[uuid];
        delete this._requestMap[uuid]; // use once
        if (state === 'fulfilled') {
            _log(`[${this.label()}] caller: procedure \`${name}\`[${uuid}] returns value:`, value, this);
            resolve(value);
        } else if (state === 'rejected') {
            _log(`[${this.label()}] caller: procedure \`${name}\`[${uuid}] throws error:`, error);
            reject(error);
        } else {
            throw new Error(`unknow payload state: ${state}`);
        }
    }
}

function _S4(): string {
    // eslint-disable-next-line
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}
function _genUUID(): string {
    return _S4() + _S4();
}

function _warn(...args: any[]): void {
    console.warn(`[RPC]`, ...args); // eslint-disable-line
}
function _log(...args: any[]): void {
    console.log(`[RPC]`, ...args); // eslint-disable-line
}