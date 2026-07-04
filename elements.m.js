"use strict";

import { BB, worker } from "./script.m.js"
import { RTC, freeStun, Codec } from "./rtc.m.js"

/**@type {Codec}*/ var rtc_codec = new Codec();

/**
 * Custom element helper class. Automatically finds and uses a labeled template tag.
 */
class BzCustom extends HTMLElement {

    constructor() {
        super();
        let template = /** @type {HTMLTemplateElement}*/ (document.querySelector(`template[for="${this.tagName.toLowerCase()}"]`));
        let clone = document.importNode(template.content, true);
        this.appendChild(clone);
    }

}

/**
 * Custom element helper class which provides an AbortController.
 */
class BzCustomL extends BzCustom {

    constructor() {
        super();
        this.abort = new AbortController();
    }

}

/**
 * Map from ascii names to corresponding kanji
 * @type {{[key:string]:string}} 
 */
const SHORTS = {
    sakura: '\u685C', ume: '\u6885', momo: '\u6843', sumomo: '\u5B63', hanabi: '\u706B', sake: '\u9152',
    1: '\u4E00', 2: '\u4E8C', 3: '\u4E09', 4: '\u56DB', 5: '\u4E94'
}

/**
 * Literally just the modulo operator. 
 * I get % being wrong b/c backwards compatability, but how is this not in the Math library?? 
 * @param {number} n 
 * @param {number} d 
 * @returns 
 */
function MODULO(n, d) {
    return ((n % d) + d) % d;
}

/**
 * @callback CustomEventCallback
 * @param {CustomEvent} e 
 */

/**
 * Add a CustomEvent listener to an EventTarget in a typsafe way
 * @param {EventTarget} target
 * @param {string} type 
 * @param {CustomEventCallback} callback 
 */
function addCustomListener(target, type, callback) {
    target.addEventListener(type, (e) => {
        if (e instanceof CustomEvent && e.type == type) {
            return callback(e);
        }
    })
}

/**
 * Custom element responsible for displaying a card
 */
export class HanamiCard extends BzCustom {

    /** @type {string}*/ suit;
    /** @type {number}*/ number;
    /** @type {number}*/ index;

    /**
     * @param {{suit:string,number:number,id:number}} kwargs 
     */
    constructor(kwargs) {
        super();
        this.suit = kwargs.suit;
        this.classList.add(this.suit);
        this.number = kwargs.number;
        this.index = kwargs.id;
        this.label.innerText = `${SHORTS[this.suit]}${SHORTS[this.number]}`;
        this.discard.onclick = (e) => {
            worker.postMessage({ type: 'discard', payload: { id: this.index } });
        };
        this.play.onclick = (e) => {
            worker.postMessage({ type: 'play', payload: { id: this.index } });
        }
    }

    get discard() { return /** @type {HTMLButtonElement}*/ (this.querySelector('button[name=discard]')); }

    get label() { return /** @type {HTMLLabelElement} */ (this.querySelector('span.label')); }

    get pips() { return /** @type {HTMLDivElement}*/ (this.querySelector('.pips')); }

    get play() { return /** @type {HTMLButtonElement}*/ (this.querySelector('button[name=play]')); }

    /**
     * Display known information about the card.
     * @param {{suit:string?,num:number?}} info what is known about the card
     */
    tell(info) {
        if (info.suit) {
            this.setAttribute('data-suit', info.suit);
        }
        if (info.num) {
            this.setAttribute('data-num', info.num.toString());
            this.pips.innerHTML = `<span>${SHORTS[info.num]}</span>`
        }
    }

};

/**
 * Custom element for displaying a hand of <hanami-card>s.
 * mostly provides buttons for telling other players about their hands
 */
class HanamiHand extends BzCustom {

    /** @type {number}*/ player;

    /**
     * @param {number} player whose hand it is
     */
    constructor(player) {
        super();
        this.player = player;
        this.setAttribute('player', player.toString());
        for (let sunum in SHORTS) {
            this.addButton(sunum);
        }
    }

    get suitButts() { return /** @type {HTMLOListElement}*/ (this.querySelector('.buttons .suits')); }

    get numButts() { return /** @type {HTMLOListElement}*/ (this.querySelector('.buttons .numbers')); }

    get cardsDiv() { return /** @type {HTMLDivElement}*/ (this.querySelector('div.cards')); }

    get cards() { return /** @type {NodeListOf<HanamiCard>}*/ (this.querySelectorAll('.cards hanami-card')); }

    /**
     * Add a button to the appropriate list
     * @param {string} sunum 
     */
    addButton(sunum) {
        let li = document.createElement('li');
        let butt = document.createElement('button');
        butt.setAttribute('value', sunum);
        butt.onclick = (e) => {
            worker.postMessage({ type: 'tell', payload: { sunum: butt.value, player: this.player } });
        };
        butt.innerText = SHORTS[sunum];
        li.appendChild(butt);
        li.setAttribute('data-sunum', sunum);
        if (isNaN(Number(sunum))) {
            this.suitButts.appendChild(li);
        } else {
            this.numButts.appendChild(li);
        }
    }

    setButtons() {
        /** @type {{[key:string]:boolean}}*/ let suits = {};
        /** @type {{[key:string]:boolean}}*/ let nums = {};
        for (let card of this.cards) {
            if (card.suit == 'sake') {
                for (let s in SHORTS) {
                    if (isNaN(Number(s))) {
                        suits[s] = true;
                    }
                }
            }
            suits[card.suit] = true;
            nums[card.number] = true;
        }
        if ('sake' in suits) {
            delete suits['sake'];
        }
        let n = 0;
        for (let butt of /**@type {NodeListOf<HTMLLIElement>}*/(this.suitButts.querySelectorAll('li:not(:first-child)'))) {
            let sunum = butt.getAttribute('data-sunum');
            if (sunum && sunum in suits) {
                butt.classList.add('radial');
                butt.style.setProperty('--radial-nth', n.toString());
                butt.style.setProperty('--radial-of', Object.keys(suits).length.toString());
                n += 1;
            } else {
                butt.classList.remove('radial');
                butt.style.setProperty('--radial-nth', "0");
                butt.style.setProperty('--radial-of', "0");
            }
        }
        n = 0;
        for (let butt of /**@type {NodeListOf<HTMLLIElement>}*/(this.numButts.querySelectorAll('li:not(:first-child)'))) {
            let sunum = butt.getAttribute('data-sunum');
            if (sunum && sunum in nums) {
                butt.classList.add('radial');
                butt.style.setProperty('--radial-nth', n.toString());
                butt.style.setProperty('--radial-of', Object.keys(nums).length.toString());
                n += 1;
            } else {
                butt.classList.remove('radial');
                butt.style.setProperty('--radial-nth', "0");
                butt.style.setProperty('--radial-of', "0");
            }
        }

    }

}

/**
 * Custom element serving as the core game UI
 */
class HanamiGame extends BzCustomL {

    /**@type {{[key:string]:{domEl:HanamiCard,id:number,info:{suit:string?,num:number?},loc:string,number:number,suit:string}}}*/
    cards;
    /**@type {{[key:string]:HanamiHand}}*/ hands;

    /**
     * 
     * @param {{[key:string]:any}} allCards 
     * @param {number[][]} allHands 
     * @param {number} youAre 
     * @param {number} dango 
     * @param {number} health 
     */
    constructor(allCards, allHands, youAre, dango, health) {
        super();
        this.player = youAre;
        if (youAre == 0) {
            this.classList.add('current');
        }
        this.showTime(health);
        this.dango = [];
        for (let i = 0; i < dango; i++) {
            let t = document.createElement('div');
            t.classList.add('dango');
            this.dango.push(t);
        }
        this.cards = allCards;
        for (let id in allCards) {
            this.cards[id].domEl = new HanamiCard(this.cards[id]);
            this.cards[id].loc = 'draw';
        }
        this.hands = {};
        for (let [playerID, hand] of allHands.entries()) {
            let newhand = new HanamiHand(playerID);
            let /**@type {{[key:number]:string[]}}*/ positions = {
                2: ['HS', 'HN'],
                3: ['HS', 'HW', 'HN'],
                4: ['HS', 'HW', 'HN', 'HE']
            };
            if (playerID == youAre) {
                newhand.classList.add('player');
            }
            let pos_i = MODULO(playerID - youAre, allHands.length);
            newhand.classList.add(positions[allHands.length][pos_i]);
            this.hands[playerID] = newhand;
            this.appendChild(newhand);
            for (let card of hand) {
                this.draw(card, playerID);
            }
        }
        this.setDango(dango);
        addCustomListener(BB, 'discard', (e) => {
            this.discard(e.detail.id);
            this.draw(e.detail.newcard, e.detail.player);
            this.setDango(e.detail.dango);
            this.nextPlayer(e.detail.newPlayer);
        });
        addCustomListener(BB, 'play', (e) => {
            this.play(e.detail.id);
            this.draw(e.detail.newcard, e.detail.player);
            this.nextPlayer(e.detail.newPlayer);
        });
        addCustomListener(BB, 'failedplay', (e) => {
            this.discard(e.detail.id);
            this.draw(e.detail.newcard, e.detail.player);
            this.showTime(e.detail.health);
            this.nextPlayer(e.detail.newPlayer);
        });
        addCustomListener(BB, 'tell', (e) => {
            this.tell(e.detail.info);
            this.setDango(e.detail.dango);
            this.nextPlayer(e.detail.newPlayer);
        });
    }

    get discardPile() { return /**@type {HTMLDivElement}*/ (this.querySelector('.mat>div.discard')); }

    get food() { return /**@type {HTMLDivElement}*/ (this.querySelector('div.food')); }

    get foundation() { return /**@type {HTMLDivElement}*/ (this.querySelector('.mat>div.foundation')); }

    get timeSpan() { return /**@type {HTMLSpanElement}*/ (this.querySelector('.time>span')); }

    /**
     * Tell various cards their info
     * @param {{[key:number]:{suit:string?,num:number?}}} info 
     */
    tell(info) {
        for (let i in info) {
            Object.assign(this.cards[i].info, info[i]);
            this.cards[i].domEl.tell(info[i]);
        }
    }

    /**
     * Move a card to the appropriate foundation
     * @param {number} cardID 
     */
    play(cardID) {
        let card = this.cards[cardID].domEl;
        let suit = this.cards[cardID].suit;
        let pile;
        if (card.number == 1) {
            pile = document.createElement("div");
            pile.classList.add(suit);
            this.foundation.appendChild(pile);
        } else {
            pile = /**@type {HTMLDivElement}*/ (this.foundation.querySelector(`.${suit}`));
        }
        pile.appendChild(card);
    }

    /**
     * Move a card to a hand 
     * @param {number} cardID 
     * @param {number} handID 
     * @returns 
     */
    draw(cardID, handID) {
        if (cardID == null) return;
        let cur = this.cards[cardID];
        if (cur.loc != 'draw') console.log('drew card not in draw pile: ', cardID);
        cur.loc = handID.toString();
        this.hands[handID].cardsDiv.appendChild(cur.domEl);
        this.hands[handID].setButtons();
    }

    /**
     * Move a card to discard pile
     * @param {number} cardID 
     */
    discard(cardID) {
        let card = this.cards[cardID].domEl;
        this.cards[cardID].loc = 'discard';
        this.discardPile.appendChild(card)
    }

    /**
     * Show next player as current player
     * @param {number} newPlayer 
     */
    nextPlayer(newPlayer) {
        if (newPlayer == this.player) {
            this.classList.add('current');
        } else {
            this.classList.remove('current');
        }
        //this.querySelector(`[player="${newPlayer}"]`).classList.add('current');
    }

    /**
     * Update the number of shown dango
     * @param {number} nval 
     */
    setDango(nval) {
        for (let [i, e] of this.dango.entries()) {
            if (i < nval) {
                this.food.appendChild(e);
            } else {
                e.remove();
            }
        }
    }

    /**
     * Update the shown health
     * @param {number} newTime 
     */
    showTime(newTime) {
        this.timeSpan.innerText = newTime.toString();
    }

}

class myRTC extends RTC {

    /** @override */
    setChannelCallbacks() {
        // @ts-ignore RTCDataChannel is now transferrable as of 2026 //TODO remove ts-ignore when linters catch up
        worker.postMessage({ type: 'channel', payload: this.channel }, [this.channel]);
    }

}

/**
 * Copy a string to the system clipboard
 * @param {string} value 
 */
function copy(value) {
    navigator.clipboard.write([new ClipboardItem({ ["text/plain"]: value })]);
}


class HanamiHostedPlayer extends BzCustom {

    /**@type {myRTC}*/ rtc;
    /**@type {string?}*/ peerID = null;

    constructor() {
        super();
        this.rtc = new myRTC(freeStun, false);
        this.rtc.one();
        this.copybutton.onclick = () => copy(this.output.value);
        addCustomListener(this.rtc, 'icecandidate', (e) => {
            this.output.value = rtc_codec.encode(e.detail);
        });
        this.connectbutton.onclick = (e) => {
            this.rtc.three(rtc_codec.decode(this.textarea.value));
        };
        addCustomListener(BB, 'nameChange', (e) => {
            console.log(e, e.detail)
            if (this.peerID && this.peerID in e.detail) {
                this.username.innerText = e.detail[this.peerID];
            }
        });
        addCustomListener(BB, 'TODO', (e) => {
            console.log(e, e.detail)
            if (e.detail.channel == this.rtc.channel?.label) {
                this.peerID = e.detail.peer;
            }
        });
    }

    get connectbutton() { return /**@type {HTMLButtonElement}*/ (this.querySelector('button.connect')); }

    get copybutton() { return /**@type {HTMLButtonElement}*/ (this.querySelector('button.copy')); }

    get textarea() { return /**@type {HTMLTextAreaElement}*/ (this.querySelector('textarea')); }

    get output() { return /**@type {HTMLOutputElement}*/ (this.querySelector('output.code')); }

    get username() { return /**@type {HTMLOutputElement}*/ (this.querySelector('output.username')); }

}

class GameOptions {

    /**@type {HTMLFormElement}*/ form;
    /**@type {myRTC}*/ join_rtc;
    /**@type {myRTC[]}*/ host_rtc = [];

    /**
     * @param {HTMLFormElement} form 
     */
    constructor(form) {
        this.form = form;
        for (let el of this.gametypes) {
            el.oninput = (e) => this.show_gto(el.value);
        }
        this.show_gto(this.checkedgametype.value);
        // host
        this.startbutton.onclick = () => {
            worker.postMessage({ type: 'newGame', payload: { nPlayers: 2 } });
        };
        this.addbutton.onclick = (e) => {
            let hp = new HanamiHostedPlayer();
            this.hostedplayers.appendChild(hp);
            this.host_rtc.push(hp.rtc);
        };
        //join
        this.join_rtc = new myRTC(freeStun, false);
        addCustomListener(this.join_rtc, 'answercreated', (e) => {
            this.joinoutput.value = rtc_codec.encode(e.detail);
        });
        this.joincopybutton.onclick = () => {
            let val = this.joinoutput.value;
            copy(val);
        };
        this.joinbutton.onclick = () => {
            let val = this.jointextarea.value;
            this.join_rtc.two(rtc_codec.decode(val));
        };
        //general
        this.usernameinput.oninput = () => {
            let name = this.usernameinput.value;
            worker.postMessage({ type: 'nameChange', payload: name });
        };
    }

    get addbutton() { return /**@type {HTMLButtonElement}*/ (this.form.querySelector('button[name="add"]')); }

    get checkedgametype() { return /**@type {HTMLInputElement}*/ (this.form.querySelector('input[name="gametype"][checked]')); }

    get gtos() { return /**@type {NodeListOf<HTMLElement>}*/ (this.form.querySelectorAll('.gametypeoptions')); }

    get gametypes() { return /**@type {NodeListOf<HTMLInputElement>}*/ (this.form.querySelectorAll('input[name="gametype"]')); }

    get hostedplayers() { return /**@type {HTMLDivElement}*/ (this.form.querySelector('div#hostedplayers')); }

    get joinbutton() { return /**@type {HTMLButtonElement}*/ (this.form.querySelector('button[name="join"]')); }

    get joincopybutton() { return /**@type {HTMLButtonElement}*/ (this.form.querySelector('fieldset#join button[name="copy"]')); }

    get joinoutput() { return /**@type {HTMLOutputElement}*/ (this.form.querySelector('fieldset#join output')); }

    get jointextarea() { return /**@type {HTMLTextAreaElement}*/ (this.form.querySelector('fieldset#join textarea')); }

    get startbutton() { return /**@type {HTMLButtonElement}*/ (this.form.querySelector('button[name="start"]')); }

    get usernameinput() { return /**@type {HTMLInputElement}*/ (this.form.querySelector('input[name="username"]')); }

    /**
     * Show the given gametype option fieldset
     * @param {string} gameType 
     */
    show_gto(gameType) {
        for (let gto of this.gtos) {
            if (gto.id == gameType) {
                gto.removeAttribute('disabled');
                worker.postMessage({ type: 'gameTypeChange', payload: gameType });
            } else {
                gto.setAttribute('disabled', '');
            }
        }
    }

}

let theGameOpts = new GameOptions(/**@type {HTMLFormElement}*/(document.querySelector('form')));

customElements.define("hanami-card", HanamiCard);
customElements.define("hanami-hand", HanamiHand);
customElements.define("hanami-game", HanamiGame);
customElements.define("hanami-hosted-player", HanamiHostedPlayer);

addCustomListener(BB, 'init', (dat) => {
    let board = /**@type {HTMLElement}*/ (document.querySelector('main'));
    let old = board.querySelector('hanami-game');
    if (old) {
        old.remove();
    }
    let det = dat.detail;
    let game = new HanamiGame(det.cards, det.hands, det.player, det.dango, det.health);
    board.insertBefore(game, board.querySelector('form'));
});


