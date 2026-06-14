"use strict";

import {RTC, freeStun} from "./rtc.m.js"

const worker = new Worker("worker.m.js",{type:'module'});
document.worker = worker;
export const BB = document;

worker.onmessage = (msg) => {
    let type = msg.data.type;
    let detail = msg.data.payload;
    console.log(type,detail);
    if(type=='send'){
        theRTC.channel.send(JSON.stringify(detail));
    } else {
        let e = new CustomEvent(type,{detail});
        BB.dispatchEvent(e);
    }
};

let gtos = document.querySelectorAll('.gametypeoptions');
let show_gto = (gt) => {
    console.log(gt);
    for(let gto of gtos){
        if(gto.id == gt){
            gto.removeAttribute('disabled');
        } else {
            gto.setAttribute('disabled','');
        }
    }
}

for(let el of document.querySelectorAll('input[name="gametype"]')){
    el.oninput = (e) => show_gto(e.target.value);
}

show_gto(document.querySelector('input[name="gametype"][checked]').value);

class myRTC extends RTC{
    
    setChannelCallbacks(e){
        document.worker.postMessage({type:'channel',payload:this.channel},[this.channel]);
    }

}

let form = document.querySelector('form');
let houtput = form.querySelector('fieldset#host output');
let hta = form.querySelector('fieldset#host textarea');
let hbutt_copy = form.querySelector('button[name="copy"]');
hbutt_copy.onclick = () => {
    navigator.clipboard.write([new ClipboardItem({["text/plain"]:houtput.value})]);
};
let hbutt_start = form.querySelector('button[name="start"]');
hbutt_start.onclick = () => worker.postMessage({type:'newGame',payload:{nPlayers:2}});
let butt_host = form.querySelector('button[name="host"]');
butt_host.onclick = (e) => {
    theRTC.one();
}

let theRTC = new myRTC(freeStun,true);
theRTC.addEventListener('icecandidate',(e)=>{
    console.log(JSON.stringify(e.description));
    houtput.value = btoa(JSON.stringify(e.description));
});
theRTC.addEventListener('answercreated',(e)=>{
    console.log(JSON.stringify(e.description));
    joutput.value = btoa(JSON.stringify(e.description));
});
window.theRTC = theRTC;

let joutput = form.querySelector('fieldset#join output');
let jta = form.querySelector('fieldset#join textarea');
let jbutt_copy = form.querySelector('fieldset#join button[name="copy"]');
jbutt_copy.onclick = () => {
    navigator.clipboard.write([new ClipboardItem({["text/plain"]:joutput.value})]);
};

let butt_join = form.querySelector('button[name="join"]');
butt_join.onclick = (e) => theRTC.two(JSON.parse(atob(jta.value)));
let butt_connect = form.querySelector('button[name="connect"]');
butt_connect.onclick = (e) => theRTC.three(JSON.parse(atob(hta.value)));


