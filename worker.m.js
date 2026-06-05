

const SUITS = ['sakura','ume','momo','sumomo','hanabi','sake'];
const NUMS = [1,1,1,2,2,3,3,4,4,5];
const N_CARDS = {2:6, 3:5, 4:5};

class Card {
    
    suit;
    number;
    id;
    info;

    constructor(s,n,i){
        this.suit = s;
        this.number = n;
        this.id = i;
        this.info = {suit:false,num:false};
    }

    tell(sunum){
        let num_index = NUMS.indexOf(Number(sunum));
        let suit_index = SUITS.indexOf(sunum);
        if( num_index == -1 && suit_index == -1){
            console.log('unknown suit or number: ',sunum);
            return this.info;
        }
        if( (num_index>-1) && (Number(sunum)==this.number) ){
            this.info.num = this.number;
        } else if( (suit_index>-1) && (sunum==this.suit||this.suit=='sake') ){
            if(this.info.suit && this.info.suit!=sunum){
                this.info.suit = this.suit; // 2 diff suits -> wild
            } else {
                this.info.suit = sunum;
            }
        }
        return this.info;
    }

}

class Game {

    cards;
    deck;
    hands;
    foundation;
    discardPile;
    health;
    channels = [];

    constructor(session){
        this.session = session;
        let nPlayers = this.session.channels.length + 1;
        this.curPlayer = 0;
        this.health = 5;
        this.dango = 8;
        // build deck
        this.cards = {};
        this.deck = [];
        {let i = 0;
            for (let suit of SUITS){
                for (let num of NUMS){
                    let cur = new Card(suit, num, i);
                    this.cards[i] = cur;
                    this.deck[i] = cur;
                    i += 1;
                }
            }
        } //i is no longer defined 
        // shuffle deck
        for (let i=0; i<this.deck.length; i++){
            let j = Math.floor(Math.random() * this.deck.length-i) + i;
            let t = this.deck[i];
            this.deck[i] = this.deck[j];
            this.deck[j] = t;
        }
        //start foundation
        this.foundation = {}
        for (let suit of  SUITS){
            this.foundation[suit] = 0;
        }
        // deal hands
        this.hands = [];
        this.discardPile = [];
        for(let i=0; i<nPlayers; i++){
            this.hands[i] = [];
        }
        for(let j=0; j<N_CARDS[nPlayers]; j++){
            for(let i=0; i<nPlayers; i++){
                this.hands[i].push(this.deck.pop());
            }
        }
    }

    discard(id) {
        let player = this.curPlayer; 
        let hand = this.hands[player];
        let i = hand.findIndex((c)=>c.id==id);
        if(i<0){
            console.log('invalid discard: ', id, player);
            return;
        }
        let card = hand.splice(i,1);
        this.discardPile.push(card);
        this.dango += 1;
        let dango = this.dango;
        let newcard = this.deal(player);
        let newPlayer = this.nextPlayer();
        this.session.sendAll('discard',{player,id,newcard,newPlayer,dango})
    }

    nextPlayer(){
        this.curPlayer += 1;
        this.curPlayer %= this.hands.length;
        return this.curPlayer;
    }

    deal(player) {
        let hand = this.hands[player];
        let newcard = this.deck.pop();
        if(newcard){
            hand.push(newcard);
            return newcard.id;
        } 
        return null;
    }

    decrHealth() {
        this.health -= 1;
        if(this.health<=0){
            this.session.sendAll('loss',{});
        }
        return this.health;
    }

    decrDango(){
        if(this.dango <=0){
            return false;
        }
        this.dango -= 1;
        return true;
    }

    play(id){
        let player = this.curPlayer;
        let card = this.cards[id];
        let hand = this.hands[player];
        let i = hand.findIndex((c)=>c.id==id);
        if(i<0){
            console.log('played card not in current hand',id, player);
            return;
        }
        hand.splice(i,1);
        let type;
        let health = this.health;
        if(this.foundation[card.suit] == card.number-1){
            this.foundation[card.suit] += 1;
            type = 'play';
        } else {
            health = this.decrHealth();
            if(health <= 0) 
                return;
            type = 'failedplay';
        }
        let newcard = this.deal(player);
        let newPlayer = this.nextPlayer();
        this.session.sendAll(type,{id,player,newcard,newPlayer,health});
        if(SUITS.map(k=>this.foundation[k]==5).reduce((x,y)=>x&&y)){
            this.session.sendAll('victory',{});
        }
    }

    run(){
        this.session.player = this.session.channels.length;
        let cards = this.cards;
        let hands = this.hands.map( (h) => h.map( x=>x.id ) );
        let dango = this.dango;
        let health = this.health;
        for(let player in hands){
            this.session.sendTo('init',{hands,cards,player,dango,health},player);
        };
    }
    
    tell(player,sunum){
        if( player == this.curPlayer ){
            console.log("can't tell",player,sunum,"not your turn");
            return;
        }
        if( !this.decrDango() ){
            console.log("can't tell",player,sunum,this.dango);
            return;
        }
        let hand = this.hands[player];
        let info = {};
        for(let c of hand){
            info[c.id] = c.tell(sunum);
        }
        let newPlayer = this.nextPlayer();
        let dango = this.dango;
        this.session.sendAll('tell',{info,newPlayer,dango});
    }

}


class Session {

    game;
    role = 'client';
    channels = [];
    player;

    constructor(){
        self.onmessage = (msg) => this.localMessage(msg);
    }

    localMessage(msg){
        let {type,payload} = msg.data;
        switch(type){
            case 'channel':
                let n = this.channels.length;
                payload.onmessage = (e) => this.remoteMessage(e,n);
                payload.onclose = (e) => console.log('channel closed',e);
                this.channels.push(payload);
                console.log(this.channels.length)
                break;
            case 'newGame':
                this.role = 'host';
                this.game = new Game(this);
                this.game.run();
                break;
            default:
                this.gameMessage(type,payload,this.player);
        }
    }

    sendTo(type,payload,player){
        if(player==this.player){
            self.postMessage({type,payload});
        } else {
            this.channels[player].send(JSON.stringify({type,payload}));
        }
    }

    sendAll(type,payload){
        for(let i in this.channels){
            this.sendTo(type,payload,i)
        }
        this.sendTo(type,payload,this.player);
    }

    remoteMessage(message,player){
        console.log('remote',message.data);
        let msg = JSON.parse(message.data);
        if(this.role == 'client'){
            self.postMessage(msg);
            return;
        } else {
            let {type,payload} = msg;
            this.gameMessage(type,payload,player);
        }
    }

    gameMessage(type,payload,player){
        if(this.role == 'client'){
            this.sendTo(type,payload,0);
            return;
        }
        switch(type){
            case 'discard':
                this.game.discard(payload.id);
                break;
            case 'play': 
                this.game.play(payload.id);
                break;
            case 'tell':
                this.game.tell(payload.player,payload.sunum);
                break;
            default:
                console.log('unrecognized msg type:',type,msg.data);
        }
    }

}


var session = new Session();


