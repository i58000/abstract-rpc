export declare enum MessageType {
    REQUSET = "request",
    RESPONSE = "response"
}
export declare class Message {
    payload: any;
    meta: string;
    type: MessageType;
    constructor({ payload, meta, type }: Message);
}
