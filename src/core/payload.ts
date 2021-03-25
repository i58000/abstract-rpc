interface Payload {
    uuid: string;
    name: string;
    value: any; // eslint-disable-line
}
export interface RequestPayload extends Payload {
    timestamp: number;
}
export interface ResponsePayload extends Payload {
    state: 'fulfilled' | 'rejected' | 'pending';
    error?: Error;
}