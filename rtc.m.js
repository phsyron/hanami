
export var freeStun = {iceServers: [{urls: 'stun:stun1.l.google.com:19302'}]};

export class RTC {

    channel;
    configuration;

    constructor(configuration){
        if(configuration) {
            this.configuration = configuration;
        } else{
          this.configuration = {};
        }
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
        console.log('new ICE candidate',JSON.stringify(this.connection.localDescription));
    }

    onMessage(e){
        console.log('new message:', e.data);
    }

    onOpen(e){
        console.log('channel open');
    }

    onClose(e){
        console.log('channel closed');
    }
    
    onDataChannel(e){
        console.log('new data channel',e);
        this.channel = e.channel;
        this.setChannelCallbacks();
    }

    onAnswerCreated(answer){
        let a = 
        console.log('answer created:',JSON.stringify(this.connection.localDescription));
    }

    one(){
        this.channel = this.connection.createDataChannel('data');
        console.log('foo');
        this.setChannelCallbacks();
        this.connection.createOffer().then( (o) => this.connection.setLocalDescription(o))
    }

    two(offer){
        this.connection.setRemoteDescription(offer).then(console.log('done'));
        this.connection.createAnswer()
            .then(a=>this.connection.setLocalDescription(a))
            .then(a=>this.onAnswerCreated(a));
    }

    three(answer){
        this.connection.setRemoteDescription(answer)
            .then(console.log('done'));
    }
}
