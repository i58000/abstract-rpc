import RPC from './index';
export default class WebRPC extends RPC {
    protected label: () => string;
    protected postMessage(message: any): Promise<void>;
    protected addMessageListener(listener: any): void;
    protected removeMessageListener(listener: any): void;
}
