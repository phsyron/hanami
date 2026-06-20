

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
    /**@type {RTCDataChannel[]}*/ channels = [];

    /**
     * @param {Session} session the session controlling the game
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

    /**@type {Game?}*/ game = null;
    /**@type {string}*/ role = 'client';
    /**@type {RTCDataChannel[]}*/ channels = [];
    /**@type {number}*/ player = Math.random();

    constructor() {
        self.onmessage = (msg) => this.localMessage(msg);
    }

    /**
     * Receive and process a message. 
     * @param {MessageEvent<{type:string,payload:any}>} msg 
     */
    localMessage(msg) {
        let { type, payload } = msg.data;
        switch (type) {
            case 'channel':
                let n = this.channels.length;
                payload.onmessage = (/**@type {MessageEvent}*/e) => this.remoteMessage(e, n);
                payload.onclose = (/**@type {Event}*/e) => console.log('channel closed', e);
                this.channels.push(payload);
                console.log(this.channels.length)
                break;
            case 'newGame':
                this.role = 'host';
                this.game = new Game(this);
                this.game.run();
                break;
            default:
                this.gameMessage(type, payload, this.player);
        }
    }

    /**
     * Send a message to a sepecific player
     * @param {string} type 
     * @param {any} payload 
     * @param {number} player 
     */
    sendTo(type, payload, player) {
        if (player == this.player) {
            self.postMessage({ type, payload });
        } else {
            this.channels[player].send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * Broadcast a message to all players (including self)
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
     * Receive a message from another player
     * @param {MessageEvent<string>} message a JSON object like {type,payload}
     * @param {number} player the player that sent the message
     * @returns 
     */
    remoteMessage(message, player) {
        console.log('remote', player, message.data);
        let msg = JSON.parse(message.data);
        if (this.role == 'client') {
            self.postMessage(msg);
            return;
        } else {
            let { type, payload } = msg;
            this.gameMessage(type, payload, player);
        }
    }

    /**
     * Take appropriate Game action on message from other player 
     * @param {string} type 
     * @param {any} payload 
     * @param {number} player the player that initiated the event
     * @returns 
     */
    gameMessage(type, payload, player) {
        if (this.role == 'client') {
            this.sendTo(type, payload, 0);
            return;
        }
        if (this.game == null) {
            console.log('received play on unstarted game', type, payload, player);
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


var session = new Session();


