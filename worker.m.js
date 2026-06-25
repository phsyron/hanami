
import { Game } from "./game.m.js"

/**
 * generates a random 
 * @returns {string}
 */
function uuid64() {
    /* TODO soon this can be: return crypto.getRandomValues(new Uint8Array(16)).toBase64(); */
    return btoa(String.fromCharCode(...Array.from(crypto.getRandomValues(new Uint8Array(16)))));
}

class Session {

    /**@type {string}*/ peer = uuid64();
    /**@type {string}*/ user = "";

    /**
     * @param {Session?} old a previous session to inherit some information from
     */
    constructor(old = null) {
        if (new.target === Session) {
            throw new TypeError("Abstract classes are not constructable");
        }
        if (old) {
            this.user = old.user;
        }
    }

    /**
     * Receive a new channel from UI
     * @param {RTCDataChannel} channel 
     */
    addChannel(channel) { }

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
    /**@type {{[key:string]:string}}*/ users = {};

    /**
     * @inheritdoc
     * @param {Session?} old
     */
    constructor(old = null) {
        super(old);
        this.users[this.peer] = this.user;
    }

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
            case 'nameChange':
                this.user = payload;
                this.users[this.peer] = payload;
                this.sendTo('nameChange', this.users, 'ALL');
                break;
            case 'newGame':
                let peers = [...Object.keys(this.peers), this.peer];
                this.game = new Game(peers, (t, p, i) => { this.sendTo(t, p, i) });
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
        if (peer == 'ALL') {
            for (let p in this.peers) {
                this.sendTo(type, payload, p);
            }
            this.sendTo(type, payload, this.peer);
            return;
        }
        if (peer == this.peer) {
            self.postMessage({ type, payload });
        } else {
            let channelID = this.peers[peer];
            this.channels[channelID].send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * @inheritdoc
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {string} channel the player that sent the message
     * @returns 
     */
    remoteMessage(message, channel) {
        let msg = JSON.parse(message.data);
        let { type, payload } = msg;
        switch (type) {
            case 'iam':
                this.peers[payload] = channel;
                this.sendTo('iam', this.peer, this.channel2peer(channel));
                this.sendTo('TODO', { channel, peer: payload }, this.peer);
                this.sendTo('nameChange', this.users, this.channel2peer(channel));
                break;
            case 'nameChange':
                let peer = this.channel2peer(channel);
                this.users[peer] = payload;
                this.sendTo('nameChange', this.users, 'ALL');
                break;
            default:
                this.gameMessage(type, payload, channel);
        }
    }

    /**
     * Finds the corresponding peer ID for a given channel ID
     * @param {string} channel the channel ID
     * @returns {string} the peer ID
     */
    channel2peer(channel) {
        let [peer] = Object.entries(this.peers)
            .filter(([_, c]) => c == channel)
            .map(([p, _]) => p);
        return peer
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
            case 'nameChange':
                this.user = payload;
                console.log('name is now', payload);
                if (this.#hostchannel != null) {
                    this.sendTo('nameChange', payload, this.#HOST)
                }
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
        channel.onmessage = (/**@type {MessageEvent}*/e) => this.remoteMessage(e, channel.label);
        channel.onclose = (/**@type {Event}*/e) => console.log('channel closed', e);
        this.#hostchannel = channel;
        channel.send(JSON.stringify({ type: 'iam', payload: this.peer }));
        console.log('channel added')
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
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {string} channel the player that sent the message
     */
    remoteMessage(message, channel) {
        console.log('remote', channel, message.data);
        let { type, payload } = JSON.parse(message.data);
        switch (type) {
            case 'iam':
                this.#HOST = payload;
                this.sendTo('nameChange', this.user, this.#HOST);
                break;
            default:
                this.sendTo(type, payload, this.peer);
        }
    }

}


/**@type {Session}*/ var session = new ClientSession();


self.onmessage = (msg) => {
    let { type, payload } = msg.data;
    if (type == 'gameTypeChange') {
        let old = session;
        switch (payload) {
            case 'host':
                console.log('hosting')
                session = new HostSession(old);
                break;
            case 'join':
                session = new ClientSession(old);
                break;
            default:
                session = new ClientSession(old);
        }
    } else {
        session.localMessage(msg);
    }
}
