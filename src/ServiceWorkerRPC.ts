import RPC from './index'

export default class ServiceWorkerRPC extends RPC {
    protected label = (): string => 'service-worker-side';
    protected async postMessage(message: any): Promise<void> {
        const windows = await (self as any).clients.matchAll({ type: 'window' });
        for (const win of windows) {
            win.postMessage(message);
        }
    }
    protected addMessageListener(listener: any): void {
        self.addEventListener('message', listener);
    }
    protected removeMessageListener(listener: any): void {
        self.removeEventListener('message', listener);
    }
}