
export var freeStun = {iceServers: [{urls: 'stun:stun1.l.google.com:19302'}]};

export class RTC extends EventTarget{

    channel;
    configuration;
    logging;

    constructor(configuration,logging=true){
        super();
        if(configuration) {
            this.configuration = configuration;
        } else{
          this.configuration = {};
        }
        this.logging = logging;
        this.connection = new RTCPeerConnection(this.configuration);
        this.connection.onicecandidate = (x)=>{this.onIceCandidate(x)};
        this.connection.ondatachannel = (x)=>{this.onDataChannel(x)};
    }

    setChannelCallbacks(){
        this.channel.onmessage = (x) => this.onMessage(x);
        this.channel.onopen = (x) => this.onOpen(x);
        this.channel.onclose = (x) => this.channelClose(x);
    }

    onIceCandidate(e){
        let d = this.connection.localDescription;
        if(this.logging){
            console.log('new ICE candidate',JSON.stringify(d));
        }
        this.dispatchEvent(new IceCandidateEvent(d));
    }

    onMessage(e){
        if(this.logging){
            console.log('new message:', e.data);
        }
        this.dispatchEvent(new MessageEvent(e.data));
    }

    onOpen(e){
        if(this.logging){
            console.log('channel open');
        }
        this.dispatchEvent(new OpenEvent());
    }

    onClose(e){
        if(this.logging){
            console.log('channel closed');
        }
        this.dispatchEvent(new CloseEvent());
    }

    onDataChannel(e){
        if(this.logging){
            console.log('new data channel',e);
        }
        this.dispatchEvent(new DataChannelEvent());
        this.channel = e.channel;
        this.setChannelCallbacks();
    }

    onAnswerCreated(answer){
        let d = this.connection.localDescription;
        if(this.logging){
            console.log('answer created:',JSON.stringify(d));
        }
        this.dispatchEvent(new AnswerCreatedEvent(d));
    }

    one(){
        this.channel = this.connection.createDataChannel('data');
        this.setChannelCallbacks();
        this.connection.createOffer().then( (o) => this.connection.setLocalDescription(o))
    }

    two(offer){
        this.connection.setRemoteDescription(offer)
            .then(()=>{if(this.logging){console.log('done')}});
        this.connection.createAnswer()
            .then(a=>this.connection.setLocalDescription(a))
            .then(a=>this.onAnswerCreated(a));
    }

    three(answer){
        this.connection.setRemoteDescription(answer)
            .then(()=>{if(this.logging){console.log('done')}});
    }
}

class IceCandidateEvent extends Event {

    #description;

    constructor(description){
        super('icecandidate');
        this.#description = description;
    }

    get description(){
        return this.#description;
    }

}

class MessageEvent extends Event {

    #message;

    constructor(message){
        super('message');
        this.#message = message;
    }

    get message(){
        return this.#message;
    }

}

class OpenEvent extends Event {

    constructor(){
        super('open');
    }

}

class CloseEvent extends Event {

    constructor(){
        super('close');
    }

}

class DataChannelEvent extends Event {

    constructor(){
        super('datachannel');
    }

}

class AnswerCreatedEvent extends Event {

    #description;

    constructor(description){
        super('answercreated');
        this.#description = description;
    }

    get description(){
        return this.#description;
    }

}

