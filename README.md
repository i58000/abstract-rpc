# 造轮子：一个类RPC的JS库



隐藏“远程”过程方法调用的通信交互细节，基于`Promise`，简化JS进程间的方法调用。

适用于JS进程间的“远程”过程调用，如 ServiceWorker与webJS、Chrome插件的background与webJS、Node进程间、websocket通信的两端等场景。



## Quick Start

### 1. 基本用法

**被调用方：**

```typescript
const rpc = new CalleeRPC(); // 需先实现 CalleeRPC
rpc.start();
// 注册名为`double`的过程，以供调用
rpc.procedure('double', x => { return x * 2; });
```

**调用方：**

```typescript
const rpc = new CallerRPC(); // 需先实现 CallerRPC
rpc.start();
// 调用名为`double`过程
const result = await rpc.call<number>('double', 1024); // result === 2048
```



### 2. 端侧实现

> 使用前，需完成相应的底层API实现，共四个，以ServiceWorker与web页面js相互调用为例

1. 实现`label`方法：简单返回字符串即可
2. 实现`postMessage`方法：发送消息
3. 实现`addMessageListener`方法：添加监听器
4. 实现`removeageListener`方法：移除监听器



#### eg 1. Web侧

```typescript
class ClientRPC extends RPC{
    protected label = (): string => 'client-side';
    protected async postMessage(message): Promise<void> {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.active?.postMessage(message);
    }
    protected addMessageListener(listener): void {
        navigator.serviceWorker?.addEventListener('message', listener);
    }
    protected removeMessageListener(listener): void {
        navigator.serviceWorker?.removeEventListener('message', listener);
    }
}
```

#### eg 2. ServiceWorker侧

```typescript
class ServiceWorkerRPC extends RPC {
    protected label = (): string => 'service-worker-side';
    protected async postMessage(message): Promise<void> {
        const windows = await (self as any).clients.matchAll({ type: 'window' });
        for (const win of windows) {
            win.postMessage(message);
        }
    }
    protected addMessageListener(listener): void {
        self.addEventListener('message', listener);
    }
    protected removeMessageListener(listener): void {
        self.removeEventListener('message', listener);
    }
}
```



### 3. API

1. `start(): void` 开始监听，使用前需先调用该API
2. `stop(): void` 停止监听
3. `procedure(string, Function): void` 过程注册；若第二个参数为`undefined`，注销该过程；可重复注册，最后一次注册的过程将生效。
4. `call<T>(string, any): Promise<T>`  远程过程调用



## 解析

### 1. 原理

1. 调用方向被调用方发送消息体，消息体携带uuid、过程方法名，以及入参数据
2. 被调用方事先注册好过程方法，该方法被调用后，向调用方发送消息体，携带调用方传来的uuid以及结果数据
3. 无论是调用方还是被调用方，都需要监听/发送消息，故过程的调用和被调用，将共享同一信道



### 2. 源码

核心源码200余行，对外暴露一个抽象类，需开发者利用相应的端侧通信相关的API完成实现。



#### 抽象类RPC

```typescript
abstract class RPC {
    private _messageMeta = 'rpc';
    private _isReady = false;
    private _requestMap: RequestMap = {};
    private _procedureMap: ProcedureMap = {};

    /**
     * @protected
     * @description please implement this method, and do not use it outside this class
     */
    protected abstract addMessageListener(listener: Function);
    protected abstract removeMessageListener(listener: Function);
    protected abstract postMessage(message: Message);
    protected abstract label(): string;

    constructor() {
        if (!this.addMessageListener) {
            throw new Error('this RPC instance has no `addMessageListener` method, please implement it correctly.');
        }
        /* ... */
    }

    /**
     * @public
     * @description init, add the listener
     */
    public start(): void {
        if (this._isReady) {
            throw new Error('this RPC instance has started, do not start again.');
        }
        // 【核心逻辑：添加监听】
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
        // 【核心逻辑：移除监听】
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
            // 【核心逻辑：将该Promise的resolve和reject记录在`_requestMap`中】
            this._requestMap[uuid] = {
                payload,
                resolve,
                reject
            };
            // 【核心逻辑：以统一的消息体发送】
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
		// 【核心逻辑：将待调用的过程注册在`_procedureMap`中】
        this._procedureMap[name] = func;
    }

    /**
     * @private
     */
    private async _messagelistener({ data }): Promise<void> {
        const { type, meta, payload } = data as Message;
        // 非 RPC 消息
        if (meta !== this._messageMeta) return;
	    // 【核心逻辑：实例内的唯一监听器，在此作不同消息类型的分流】
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
            // 【核心逻辑：找到相应的过程方法】
            const func = this._procedureMap[name];
            if (!(func instanceof Function)) {
                throw new Error(`procedure \`${name}\`is not existed or is not a function`);
            }
            // 【核心逻辑：实际调用】
            const ret = func(value);
            // 【核心逻辑：若调用返回结果为Promise对象，则等待其resolve，否则直接赋值给payload】
            if (ret instanceof Promise) {
                //  #<Promise> could not be cloned. so must be resolved
                const resolvedValue = await ret;
                payload.value = resolvedValue;
            } else {
                payload.value = ret;
            }
            payload.state = 'fulfilled';
        } catch (err) {
            // 【核心逻辑：过程调用错误时错误】
            payload.error = err;
            payload.state = 'rejected';
        } finally {
            // 【核心逻辑：以统一的消息体发送】
            this.postMessage(new Message({ payload, meta: this._messageMeta, type: 'response' }));
        }
    }

    private _resolveResponse({ uuid, value, name, error, state }: ResponsePayload): void {
        if (!this._requestMap[uuid]) {
            return;
        }
		// 【核心逻辑：从`_requestMap`取出相应Promise的resolve和reject方法】
        const { resolve, reject } = this._requestMap[uuid];
		// 【核心逻辑：取一次后删除，exactly once】
        delete this._requestMap[uuid]; // use once
		// 【核心逻辑：根据state决定调用的方法和入参】
        if (state === 'fulfilled') {
            resolve(value);
        } else if (state === 'rejected') {
            reject(error);
        } else {
            throw new Error(`unknow payload state: ${state}`);
        }
    }
}

```



#### 数据结构

```typescript
interface Payload {
    uuid: string;
    name: string;
    value: any; // eslint-disable-line
}
interface RequestPayload extends Payload {
    timestamp: number;
}
interface ResponsePayload extends Payload {
    state: 'fulfilled' | 'rejected' | 'pending';
    error?: Error;
}

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

enum MessageType {
    REQUSET = 'request',
    RESPONSE = 'response'
}

class Message {
    public payload: any; // eslint-disable-line
    public meta: string;
    public type: MessageType;
    constructor({ payload, meta, type }) {
        this.payload = payload;
        this.meta = meta;
        this.type = type;
    }
}
```