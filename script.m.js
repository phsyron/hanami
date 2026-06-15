"use strict";

import {RTC, freeStun} from "./rtc.m.js"

const worker = new Worker("worker.m.js",{type:'module'});
document.worker = worker;
export const BB = document;

worker.onmessage = (msg) => {
    let type = msg.data.type;
    let detail = msg.data.payload;
    console.log(type,detail);
    let e = new CustomEvent(type,{detail});
    BB.dispatchEvent(e);
};

class myRTC extends RTC{
    
    setChannelCallbacks(e){
        document.worker.postMessage({type:'channel',payload:this.channel},[this.channel]);
    }

}

class GameOptions {

    form;
    gtos;
    join_rtc;
    host_rtc;

    constructor(form){
        this.form = form;
        this.gtos = this.form.querySelectorAll('.gametypeoptions');
        for(let el of this.form.querySelectorAll('input[name="gametype"]')){
            el.oninput = (e) => this.show_gto(e.target.value);
        }
        this.show_gto(this.find('input[name="gametype"][checked]').value);
        // host
        this.host_rtc = new myRTC(freeStun,true);
        this.find('button[name="copy"]').onclick = () => {
            let val = this.find('fieldset#host output').value;
            this.copy(val);
        };
        this.find('button[name="start"]').onclick = () => {
            document.worker.postMessage({type:'newGame',payload:{nPlayers:2}});
        };
        this.find('button[name="host"]').onclick = (e) => {
            this.host_rtc.one();
        };
        this.host_rtc.addEventListener('icecandidate',(e)=>{
            console.log(JSON.stringify(e.description));
            this.find('fieldset#host output').value = this.encode(e.description);
        });
        this.find('button[name="connect"]').onclick = (e) =>{
            let val = this.find('fieldset#host textarea').value;
            this.host_rtc.three(this.decode(val));
        };
        //join
        this.join_rtc = new myRTC(freeStun,true);
        this.join_rtc.addEventListener('answercreated',(e)=>{
            console.log(JSON.stringify(e.description));
            this.find('fieldset#join output').value = this.encode(e.description);
        });
        this.find('fieldset#join button[name="copy"]').onclick = () => {
            let val = this.find('fieldset#join output').value;
            this.copy(val);
        };
        this.find('button[name="join"]').onclick = (e) => {
            let val = this.find('fieldset#join textarea').value;
            this.join_rtc.two(this.decode(val));
        };
    }

    encode(dat){
        return btoa(JSON.stringify(dat));
    }

    decode(dat){
        return JSON.parse(atob(dat));
    }

    find(query){
        return this.form.querySelector(query);
    }

    copy(value){
        navigator.clipboard.write([new ClipboardItem({["text/plain"]:value})]);
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
window.theRTC = theGameOpts.join_rtc;



