import { Message } from './message';
export default abstract class RPC {
    private _messageMeta;
    private _isReady;
    private _requestMap;
    private _procedureMap;
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
    constructor();
    /**
     * @public
     * @description init, add the listener
     */
    start(): void;
    /**
     * @public
     * @description remove the listener
     */
    stop(): void;
    /**
     * @public
     * @description caller, call the remote procedure
     */
    call<T>(name: string, value?: any): Promise<T>;
    /**
     * @public
     * @description callee, register a procedure, or unregister without second argument
     */
    procedure(name: string, func: Function): void;
    /**
     * @private
     */
    private _messagelistener;
    private _resolveRequest;
    private _resolveResponse;
}
