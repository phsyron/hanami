
import {Game} from "./game.m.js"

/**
 * generates a random 
 * @returns {string}
 */
function uuid64(){
    /* TODO soon this can be: return crypto.getRandomValues(new Uint8Array(16)).toBase64(); */
    return btoa(String.fromCharCode(...Array.from(crypto.getRandomValues(new Uint8Array(16)))));
}

class Session {

    /**@type {string}*/ peer = uuid64();

    constructor() {
        if (new.target === Session) {
            throw new TypeError("Abstract classes are not constructable");
        }
    }

    /**
     * Receive a new channel from UI
     * @param {RTCDataChannel} channel 
     */
    addChannel(channel) { }

    /**
     * Take appropriate Game action on message from other player 
     * @param {string} type 
     * @param {any} payload 
     * @param {string} peer who initiated the event
     */
    gameMessage(type, payload, peer) { }

    /**
     * Receive and process a message from the local UI
     * @param {MessageEvent<{type:string,payload:any}>} msg 
     */
    localMessage(msg) { }

    /**
     * Receive a message from another player
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {string} channel who sent the message
     */
    remoteMessage(message, channel) { }

    /**
     * Broadcast a message to all players (including self)
     * @param {string} type 
     * @param {any} payload 
     */
    sendAll(type, payload) { }

    /**
     * Send a message to a sepecific player
     * @param {string} type 
     * @param {any} payload 
     * @param {string} peer who to send to  
     */
    sendTo(type, payload, peer) { }

}

class HostSession extends Session {

    /**@type {Game?}*/ game = null;
    /**@type {{[key:string]:RTCDataChannel}}*/ channels = {};
    /**@type {{[key:string]:string}}*/ peers = {};
    /**@type {number}*/ player = Math.random();

    /**
     * @inheritdoc
     * @param {MessageEvent<{type:string,payload:any}>} msg 
     */
    localMessage(msg) {
        let { type, payload } = msg.data;
        console.log('local', type, payload);
        switch (type) {
            case 'channel':
                this.addChannel(payload);
                break;
            case 'newGame':
                let peers = [...Object.keys(this.peers), this.peer];
                this.game = new Game(peers, (t,p,i)=>{this.sendTo(t,p,i)});
                this.game.run();
                break;
            default:
                this.gameMessage(type, payload, this.peer);
        }
    }

    /**
     * @inheritdoc
     * @param {RTCDataChannel} channel 
     */
    addChannel(channel) {
        let k = channel.label;
        channel.onmessage = (/**@type {MessageEvent}*/e) => this.remoteMessage(e, k);
        channel.onclose = (/**@type {Event}*/e) => console.log('channel closed', e);
        this.channels[k] = channel;
        console.log(k)
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {string} peer who to send to  
     */
    sendTo(type, payload, peer) {
        if (peer == this.peer) {
            self.postMessage({ type, payload });
        } else {
            
            this.channels[this.peers[peer]].send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     */
    sendAll(type, payload) {
        for (let i of Object.keys(this.peers)) {
            this.sendTo(type, payload, i);
        }
        this.sendTo(type, payload, this.peer);
    }

    /**
     * @inheritdoc
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {string} channel the player that sent the message
     * @returns 
     */
    remoteMessage(message, channel) {
        console.log('remote', channel, message.data);
        let msg = JSON.parse(message.data);
        let { type, payload } = msg;
        switch (type) {
            case 'iam':
                this.peers[payload] = channel;
                this.channels[channel].send(JSON.stringify({type:'iam',payload:this.peer}));
                break;
            case 'nameChange':
                console.log('should do something with this name huh', payload);
                break;
            default:
                this.gameMessage(type, payload, channel);
        }
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {string} peer the player that initiated the event
     * @returns 
     */
    gameMessage(type, payload, peer) {
        if (this.game == null) {
            console.log('received game action on unstarted game', type, payload, peer);
            return;
        }
        switch (type) {
            case 'discard':
                this.game.discard(payload.id);
                break;
            case 'play':
                this.game.play(payload.id);
                break;
            case 'tell':
                this.game.tell(payload.player, payload.sunum);
                break;
            default:
                console.log('unrecognized msg type:', type, payload);
        }
    }

}

class ClientSession extends Session {

    /**@type {RTCDataChannel?}*/ #hostchannel = null;
    /**@type {string}*/ #HOST = uuid64();
    /**@type {string}*/ #SELF = uuid64();

    /**
     * @inheritdoc
     * @param {MessageEvent<{type:string,payload:any}>} msg 
     */
    localMessage(msg) {
        let { type, payload } = msg.data;
        switch (type) {
            case 'channel':
                this.addChannel(payload);
                break;
            default:
                this.sendTo(type, payload, this.#HOST);
        }
    }

    /**
     * @inheritdoc
     * @param {RTCDataChannel} channel 
     */
    addChannel(channel) {
        if (this.#hostchannel != null) {
            console.log("joined second channel, overriding original");
        }
        channel.onmessage = (/**@type {MessageEvent}*/e) => this.remoteMessage(e, this.#HOST);
        channel.onclose = (/**@type {Event}*/e) => console.log('channel closed', e);
        this.#hostchannel = channel;
        channel.send(JSON.stringify({type:'iam',payload:this.peer}));
        console.log('channel added')
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {string} peer who to send to  
     */
    sendTo(type, payload, peer) {
        if (peer != this.#HOST) {
            self.postMessage({ type, payload });
            return;
        }
        if (this.#hostchannel == null) {
            console.log("tried to send message before receiving channel", type, payload);
            return;
        }
        this.#hostchannel.send(JSON.stringify({ type, payload }));
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     */
    sendAll(type, payload) {
        this.sendTo(type, payload, this.#SELF);
        this.sendTo(type, payload, this.#HOST);
    }

    /**
     * @inheritdoc
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {string} channel the player that sent the message
     */
    remoteMessage(message, channel) {
        console.log('remote', channel, message.data);
        let msg = JSON.parse(message.data);
        self.postMessage(msg);
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {string} player the player that initiated the event
     */
    gameMessage(type, payload, player) {
        console.log("ClientSession has no game, can't process game message")
    }

}


/**@type {Session}*/ var session = new ClientSession();


self.onmessage = (msg) => {
    let { type, payload } = msg.data;
    if (type == 'gameTypeChange') {
        switch (payload) {
            case 'host':
                console.log('hosting')
                session = new HostSession();
                break;
            case 'join':
                session = new ClientSession();
                break;
            default:
                session = new ClientSession();
        }
        return;
    }
    session.localMessage(msg);
}
