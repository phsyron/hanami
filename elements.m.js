"use strict";

import {BB} from "./script.m.js"
import {RTC, freeStun} from "./rtc.m.js"

class BzCustom extends HTMLElement{

    constructor(){
        super();
        let template = document.querySelector(`template[for="${this.tagName.toLowerCase()}"]`);
        let clone = document.importNode(template.content, true);
        this.appendChild(clone);
    }

}

class BzCustomL extends BzCustom {

    constructor(){
        super();
        this.abort = new AbortController();
    }
}

const SHORTS = {
    sakura: '\u685C', ume: '\u6885', momo: '\u6843', sumomo: '\u5B63', hanabi: '\u706B', sake: '\u9152',
    1: '\u4E00', 2: '\u4E8C', 3: '\u4E09', 4: '\u56DB', 5: '\u4E94'
}

function MODULO(n,d){
    /* I get % being wrong b/c backwards compatability, 
        but how is this not in the Math library?? */
    return ((n % d) + d) % d;
}

export class HanamiCard extends BzCustom{ 

    suit;
    number;
    index;
    label;
    discard;
    play;

    constructor(kwargs){
        super();
        if(kwargs){
            this.suit = kwargs.suit;
            this.classList.add(this.suit);
            this.number = kwargs.number;
            this.index = kwargs.id;
        }
        this.label = this.querySelector('span.label');
        this.discard = this.querySelector('button[name=discard]');
        this.play = this.querySelector('button[name=play]');
        this.pips = this.querySelector('.pips');
        this.label.innerText = `${SHORTS[this.suit]}${SHORTS[this.number]}`;
        this.discard.onclick = (e) => {
            document.worker.postMessage({type:'discard',payload:{id:this.index}});
        };
        this.play.onclick = (e) => {
            document.worker.postMessage({type:'play',payload:{id:this.index}});
        }
    }

    tell(info){
        if(info.suit){
            this.setAttribute('data-suit',info.suit);
        }
        if(info.num){
            this.setAttribute('data-num',info.num);
            this.pips.innerHTML = `<span>${SHORTS[info.num]}</span>`
        }
    }

};

class HanamiHand extends BzCustom { 

    cards;
    player;
    
    constructor(player,suits,nums){
        super();
        this.player = player; 
        this.setAttribute('player',player);
        this.cards = this.querySelector('.cards');
        this.suitButts = this.querySelector('.buttons .suits');
        this.numButts = this.querySelector('.buttons .numbers');
        for(let sunum in SHORTS){
            let li = document.createElement('li');
            let butt = document.createElement('button');
            butt.setAttribute('value',sunum);
            butt.onclick = (e) => {
                document.worker.postMessage({type:'tell',payload:{sunum:e.target.value,player}})
            };
            butt.innerText=SHORTS[sunum];
            li.appendChild(butt);
            li.setAttribute('data-sunum',sunum);
            if(isNaN(Number(sunum))){
                this.suitButts.appendChild(li);
            } else {
                this.numButts.appendChild(li);
            }
        }
    }

    setButtons(){
        let suits = {};
        let nums = {};
        for(let card of this.cards.querySelectorAll('hanami-card')){
            if(card.suit == 'sake'){
                for(let s in SHORTS){
                    if(isNaN(Number(s))){
                        suits[s] = true;
                    }
                }
            } 
            suits[card.suit] = true;
            nums[card.number] = true;
        }
        if('sake' in suits){
            delete suits['sake'];
        }
        let n = 0;
        for(let butt of this.suitButts.querySelectorAll('li:not(:first-child)')){
            if(butt.getAttribute('data-sunum') in suits){
                butt.classList.add('radial');
                butt.style.setProperty('--radial-nth',n);
                butt.style.setProperty('--radial-of',Object.keys(suits).length);
                n += 1;
            } else {
                butt.classList.remove('radial');
                butt.style.setProperty('--radial-nth',0);
                butt.style.setProperty('--radial-of',0);
            }
        }
        n = 0;
        for(let butt of this.numButts.querySelectorAll('li:not(:first-child)')){
            if(butt.getAttribute('data-sunum') in nums){
                butt.classList.add('radial');
                butt.style.setProperty('--radial-nth',n);
                butt.style.setProperty('--radial-of',Object.keys(nums).length);
                n += 1;
            } else {
                butt.classList.remove('radial');
                butt.style.setProperty('--radial-nth',0);
                butt.style.setProperty('--radial-of',0);
            }
        }

    }

}

class HanamiGame extends BzCustomL { 

    constructor(allCards,allHands,youAre,dango,health){
        super();
        this.player = youAre;
        if(youAre==0){
            this.classList.add('current');
        }
        this.discardPile = this.querySelector('.discard');
        this.foundation = this.querySelector('.mat>.foundation');
        this.timeSpan = this.querySelector('.time>span');
        this.showTime(health);
        this.food = this.querySelector('.food');
        this.dango = [];
        for(let i=0; i<dango; i++){
            let t = document.createElement('div');
            t.classList.add('dango');
            this.dango.push(t);
        }
        this.cards = allCards;
        for(let id in allCards){
            this.cards[id].domEl = new HanamiCard(this.cards[id]);
            this.cards[id].loc = 'draw';
        }
        this.hands = {};
        for (let playerID in allHands){
            let hand = allHands[playerID];
            let newhand = new HanamiHand(playerID);
            let positions = {
                2:['HS','HN'],
                3:['HS','HW','HN'],
                4:['HS','HW','HN','HE']
            };
            if(playerID==youAre){
                newhand.classList.add('player');
            }
            let pos_i = MODULO( playerID-youAre, allHands.length );
            newhand.classList.add(positions[2][pos_i]);
            this.hands[playerID] = newhand;
            this.appendChild(newhand);
            for (let card of hand){
               this.draw(card,playerID);
            }
        }
        this.setDango(dango);
        BB.addEventListener('discard',(e)=>{
                this.discard(e.detail.id);
                this.draw(e.detail.newcard,e.detail.player);
                this.setDango(e.detail.dango);
                this.nextPlayer(e.detail.newPlayer);
            }, {passive:true,signal:this.abort.signal});
        BB.addEventListener('play',(e)=>{
                this.play(e.detail.id);
                this.draw(e.detail.newcard,e.detail.player);
                this.nextPlayer(e.detail.newPlayer);
            }, {passive:true,signal:this.abort.signal});
        BB.addEventListener('failedplay',(e)=>{
                this.discard(e.detail.id);
                this.draw(e.detail.newcard,e.detail.player);
                this.showTime(e.detail.health);
                this.nextPlayer(e.detail.newPlayer);
            }, {passive:true,signal:this.abort.signal});
        BB.addEventListener('tell',(e)=>{
                this.tell(e.detail.info);
                this.setDango(e.detail.dango);
                this.nextPlayer(e.detail.newPlayer);
            }, {passive:true,signal:this.abort.signal});
    }

    tell(info){
        for(let i in info){
            Object.assign(this.cards[i].info,info[i]);
            this.cards[i].domEl.tell(info[i]);
        }
    }

    play(cardID){
        let card = this.cards[cardID].domEl;
        let suit = this.cards[cardID].suit;
        let pile;
        if(card.number==1){
            pile = document.createElement("div");
            pile.classList.add(suit);
            this.foundation.appendChild(pile);
        }else{
            pile = this.foundation.querySelector(`.${suit}`);
        }
        pile.appendChild(card);
    }

    draw(cardID,handID){
        if(cardID==null) return;
        let cur = this.cards[cardID];
        if(cur.loc!='draw') console.log('drew card not in draw pile: ',cardID);
        cur.loc = handID;
        this.hands[handID].cards.appendChild(cur.domEl);
        this.hands[handID].setButtons();
    }

    discard(cardID){
        let card = this.cards[cardID].domEl;
        this.cards[cardID].loc = 'discard';
        this.discardPile.appendChild(card)
    }

    nextPlayer(newPlayer){
        if(newPlayer == this.player){
            this.classList.add('current');
        } else {
            this.classList.remove('current');
        }
        //this.querySelector(`[player="${newPlayer}"]`).classList.add('current');
    }

    setDango(nval){
        for(let [i,e] of this.dango.entries()){
            if(i<nval){
                this.food.appendChild(e);
            } else {
                e.remove();
            }
        }
    }

    showTime(newtime){
        this.timeSpan.innerText = newtime;
    }

}

class myRTC extends RTC{

    setChannelCallbacks(e){
        document.worker.postMessage({type:'channel',payload:this.channel},[this.channel]);
    }

}

function copy(value){
    navigator.clipboard.write([new ClipboardItem({["text/plain"]:value})]);
}

function encode(dat){
    return btoa(JSON.stringify(dat));
}

function decode(dat){
    return JSON.parse(atob(dat));
}

class HanamiHostedPlayer extends BzCustom {

    rtc;

    constructor(){
        super();
        this.rtc = new myRTC(freeStun,true);
        this.rtc.one();
        this.copybutton.onclick = () => copy(this.output.value);
        this.rtc.addEventListener('icecandidate',(e)=>{
            this.output.value = encode(e.description);
        });
        this.connectbutton.onclick = (e) =>{
            this.rtc.three(decode(this.textarea.value));
        };
    }

    get connectbutton() {
        return this.querySelector('button.connect');
    }

    get copybutton() {
        return this.querySelector('button.copy');
    }

    get textarea() {
        return this.querySelector('textarea');
    }

    get output() {
        return this.querySelector('output');
    }

}

class GameOptions {

    form;
    gtos;
    join_rtc;
    host_rtc=[];

    constructor(form){
        this.form = form;
        this.gtos = this.form.querySelectorAll('.gametypeoptions');
        for(let el of this.form.querySelectorAll('input[name="gametype"]')){
            el.oninput = (e) => this.show_gto(e.target.value);
        }
        this.show_gto(this.find('input[name="gametype"][checked]').value);
        // host
        this.find('button[name="start"]').onclick = () => {
            document.worker.postMessage({type:'newGame',payload:{nPlayers:2}});
        };
        this.find('button[name="add"]').onclick = (e) => {
            let hp = new HanamiHostedPlayer();
            this.find('div').appendChild(hp);
            this.host_rtc.push(hp.rtc);
        };
        //join
        this.join_rtc = new myRTC(freeStun,true);
        this.join_rtc.addEventListener('answercreated',(e)=>{
            console.log(JSON.stringify(e.description));
            this.find('fieldset#join output').value = encode(e.description);
        });
        this.find('fieldset#join button[name="copy"]').onclick = () => {
            let val = this.find('fieldset#join output').value;
            copy(val);
        };
        this.find('button[name="join"]').onclick = (e) => {
            let val = this.find('fieldset#join textarea').value;
            this.join_rtc.two(decode(val));
        };
        //general
        this.find('input[name="username"]').oninput = (e) => {
            let name = e.target.value;
            document.worker.postMessage({type:'nameChange',payload:name});
        };
    }

    find(query){
        return this.form.querySelector(query);
    }

    show_gto(gt) {
        console.log(gt);
        for(let gto of this.gtos){
            if(gto.id == gt){
                gto.removeAttribute('disabled');
            } else {
                gto.setAttribute('disabled','');
            }
        }
    }

}

let theGameOpts = new GameOptions(document.querySelector('form'));

customElements.define("hanami-card", HanamiCard);
customElements.define("hanami-hand", HanamiHand);
customElements.define("hanami-game", HanamiGame);
customElements.define("hanami-hosted-player", HanamiHostedPlayer);

BB.addEventListener('init',(dat)=>{
    let board = document.querySelector('main');
    let old = board.querySelector('hanami-game');
    if(old){
       old.remove(); 
    }
    let det = dat.detail;
    let game = new HanamiGame(det.cards,det.hands,det.player,det.dango,det.health);
    board.insertBefore(game,board.querySelector('form'));
},{passive:true});


