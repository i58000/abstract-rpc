export enum MessageType {
    REQUSET = 'request',
    RESPONSE = 'response'
}
export class Message {
    public payload: any; // eslint-disable-line
    public meta: string;
    public type: MessageType;
    constructor({ payload, meta, type }: Message) {
        this.payload = payload;
        this.meta = meta;
        this.type = type;
    }
}
