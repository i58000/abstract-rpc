import RPC from './index'

export default class WebRPC extends RPC {
    protected label = (): string => 'client-side';
    protected async postMessage(message: any): Promise<void> {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.active?.postMessage(message);
    }
    protected addMessageListener(listener: any): void {
        navigator.serviceWorker?.addEventListener('message', listener);
    }
    protected removeMessageListener(listener: any): void {
        navigator.serviceWorker?.removeEventListener('message', listener);
    }
}