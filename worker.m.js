

/** @type {string[]} */ const SUITS = ['sakura', 'ume', 'momo', 'sumomo', 'hanabi', 'sake'];
/** @type {number[]} */ const NUMS = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5];
/** @type {{[key:number]:number}} */ const N_CARDS = { 2: 6, 3: 5, 4: 5 };

class Card {

    /** @type {string}*/ suit;
    /** @type {number}*/ number;
    /** @type {number}*/ id;
    /** @type { {suit:string?,num:number?} }*/ info;

    /**
     * 
     * @param {string} suit 
     * @param {number} num 
     * @param {number} id 
     */
    constructor(suit, num, id) {
        this.suit = suit;
        this.number = num;
        this.id = id;
        this.info = { suit: null, num: null };
    }

    /**
     * @param {string} sunum
     */
    tell(sunum) {
        /**@type {number}*/ let num_index = NUMS.indexOf(Number(sunum));
        /**@type {number}*/ let suit_index = SUITS.indexOf(sunum);
        if (num_index == -1 && suit_index == -1) {
            console.log('unknown suit or number: ', sunum);
            return this.info;
        }
        if ((num_index > -1) && (Number(sunum) == this.number)) {
            this.info.num = this.number;
        } else if ((suit_index > -1) && (sunum == this.suit || this.suit == 'sake')) {
            if (this.info.suit && this.info.suit != sunum) {
                this.info.suit = this.suit; // 2 diff suits -> wild
            } else {
                this.info.suit = sunum;
            }
        }
        return this.info;
    }

}

class Game {

    /**@type {{[key:number]:Card}}*/ cards;
    /**@type {Card[]}*/ deck;
    /**@type {Card[][]}*/ hands;
    /**@type {{[key:string]:number}}*/ foundation;
    /**@type {Card[]}*/ discardPile;
    /**@type {number}*/ health;

    /**
     * @param {HostSession} session the session controlling the game
     */
    constructor(session) {
        this.session = session;
        let nPlayers = this.session.channels.length + 1;
        this.curPlayer = 0;
        this.health = 5;
        this.dango = 8;
        // build deck
        this.cards = {};
        this.deck = [];
        {
            let i = 0;
            for (let suit of SUITS) {
                for (let num of NUMS) {
                    let cur = new Card(suit, num, i);
                    this.cards[i] = cur;
                    this.deck[i] = cur;
                    i += 1;
                }
            }
        } //i is no longer defined 
        // shuffle deck
        for (let i = 0; i < this.deck.length; i++) {
            let j = Math.floor(Math.random() * this.deck.length - i) + i;
            let t = this.deck[i];
            this.deck[i] = this.deck[j];
            this.deck[j] = t;
        }
        //start foundation
        this.foundation = {}
        for (let suit of SUITS) {
            this.foundation[suit] = 0;
        }
        // deal hands
        this.hands = [];
        this.discardPile = [];
        for (let i = 0; i < nPlayers; i++) {
            this.hands[i] = [];
        }
        for (let j = 0; j < N_CARDS[nPlayers]; j++) {
            for (let i = 0; i < nPlayers; i++) {
                let t = this.deck.pop();
                if (t) {
                    this.hands[i].push(t);
                }
            }
        }
    }

    /**
     * Discard a card
     * @param {number} id the card discarded
     */
    discard(id) {
        let player = this.curPlayer;
        let hand = this.hands[player];
        let i = hand.findIndex((c) => c.id == id);
        if (i < 0) {
            console.log('invalid discard: ', id, player);
            return;
        }
        let card = hand.splice(i, 1);
        this.discardPile.push(card[0]);
        this.dango += 1;
        let dango = this.dango;
        let newcard = this.deal(player);
        let newPlayer = this.nextPlayer();
        this.session.sendAll('discard', { player, id, newcard, newPlayer, dango })
    }

    /**
     * Moves play to the next player
     * @returns the next player
     */
    nextPlayer() {
        this.curPlayer += 1;
        this.curPlayer %= this.hands.length;
        return this.curPlayer;
    }

    /**
     * Deal a card from the deck to the player
     * @param {number} player 
     * @returns {number?} id of the delt card
     */
    deal(player) {
        let hand = this.hands[player];
        let newcard = this.deck.pop();
        if (newcard) {
            hand.push(newcard);
            return newcard.id;
        }
        return null;
    }

    /**
     * Decrement the health
     * @returns the new amount of health
     */
    decrHealth() {
        this.health -= 1;
        if (this.health <= 0) {
            this.session.sendAll('loss', {});
        }
        return this.health;
    }

    /**
     * Attempt to decrease the amount of dango
     * @returns {boolean} whether or not the move was valid
     */
    decrDango() {
        if (this.dango <= 0) {
            return false;
        }
        this.dango -= 1;
        return true;
    }

    /**
     * Attempt to play a card to the foundation 
     * @param {number} id the card being played
     */
    play(id) {
        let player = this.curPlayer;
        let card = this.cards[id];
        let hand = this.hands[player];
        let i = hand.findIndex((c) => c.id == id);
        if (i < 0) {
            console.log('played card not in current hand', id, player);
            return;
        }
        hand.splice(i, 1);
        let type;
        let health = this.health;
        if (this.foundation[card.suit] == card.number - 1) {
            this.foundation[card.suit] += 1;
            type = 'play';
        } else {
            health = this.decrHealth();
            if (health <= 0)
                return;
            type = 'failedplay';
        }
        let newcard = this.deal(player);
        let newPlayer = this.nextPlayer();
        this.session.sendAll(type, { id, player, newcard, newPlayer, health });
        if (SUITS.map(k => this.foundation[k] == 5).reduce((x, y) => x && y)) {
            this.session.sendAll('victory', {});
        }
    }

    /**
     * Start the game
     */
    run() {
        this.session.player = this.session.channels.length;
        let cards = this.cards;
        let hands = this.hands.map((h) => h.map(x => x.id));
        let dango = this.dango;
        let health = this.health;
        for (let player of hands.keys()) {
            this.session.sendTo('init', { hands, cards, player, dango, health }, player);
        };
    }

    /**
     * Tell player something about the cards in their hand
     * @param {number} player 
     * @param {string} sunum what info is being told - either a suit or a number
     * @returns 
     */
    tell(player, sunum) {
        if (player == this.curPlayer) {
            console.log("can't tell", player, sunum, "not your turn");
            return;
        }
        if (!this.decrDango()) {
            console.log("can't tell", player, sunum, this.dango);
            return;
        }
        let hand = this.hands[player];
        /**@type {{[key:number]:{num:number?,suit:string?}}}*/ let info = {};
        for (let c of hand) {
            info[c.id] = c.tell(sunum);
        }
        let newPlayer = this.nextPlayer();
        let dango = this.dango;
        this.session.sendAll('tell', { info, newPlayer, dango });
    }

}


class Session {

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
     * @param {number} player the player that initiated the event
     * @returns 
     */
    gameMessage(type, payload, player) { }

    /**
     * Receive and process a message from the local UI
     * @param {MessageEvent<{type:string,payload:any}>} msg 
     */
    localMessage(msg) { }

    /**
     * Receive a message from another player
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {number} player the player that sent the message
     * @returns 
     */
    remoteMessage(message, player) { }

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
     * @param {number} player who to send to  
     */
    sendTo(type, payload, player) { }

}

class HostSession extends Session {

    /**@type {Game?}*/ game = null;
    /**@type {RTCDataChannel[]}*/ channels = [];
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
                this.game = new Game(this);
                this.game.run();
                break;
            default:
                this.gameMessage(type, payload, this.player);
        }
    }

    /**
     * @inheritdoc
     * @param {RTCDataChannel} channel 
     */
    addChannel(channel) {
        let n = this.channels.length;
        channel.onmessage = (/**@type {MessageEvent}*/e) => this.remoteMessage(e, n);
        channel.onclose = (/**@type {Event}*/e) => console.log('channel closed', e);
        this.channels.push(channel);
        console.log(this.channels.length)
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {number} player who to send to  
     */
    sendTo(type, payload, player) {
        if (player == this.player) {
            self.postMessage({ type, payload });
        } else {
            this.channels[player].send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     */
    sendAll(type, payload) {
        for (let i of this.channels.keys()) {
            this.sendTo(type, payload, i);
        }
        this.sendTo(type, payload, this.player);
    }

    /**
     * @inheritdoc
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {number} player the player that sent the message
     * @returns 
     */
    remoteMessage(message, player) {
        console.log('remote', player, message.data);
        let msg = JSON.parse(message.data);
        let { type, payload } = msg;
        switch (type) {
            case 'nameChange':
                console.log('should do something with this name huh', payload);
                break;
            default:
                this.gameMessage(type, payload, player);
        }
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {number} player the player that initiated the event
     * @returns 
     */
    gameMessage(type, payload, player) {
        if (this.game == null) {
            console.log('received game action on unstarted game', type, payload, player);
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
    /**@type {number}*/ #HOST = 2;
    /**@type {number}*/ #SELF = Math.random();

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
        console.log('channel added')
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {number} player who to send to  
     */
    sendTo(type, payload, player) {
        if (player != this.#HOST) {
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
     * @param {number} player the player that sent the message
     * @returns 
     */
    remoteMessage(message, player) {
        console.log('remote', player, message.data);
        let msg = JSON.parse(message.data);
        self.postMessage(msg);
    }

    /**
     * @inheritdoc
     * @param {string} type 
     * @param {any} payload 
     * @param {number} player the player that initiated the event
     * @returns 
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
                self.session = new HostSession();
                break;
            case 'join':
                self.session = new ClientSession();
                break;
            default:
                self.session = new ClientSession();
        }
        return;
    }
    self.session.localMessage(msg);
}
