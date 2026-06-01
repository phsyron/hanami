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

let form = document.querySelector('form');
let output = form.querySelector('output');
let ta = form.querySelector('textarea');
ta.value="";
let butt_copy = form.querySelector('button[name="copy"]');
butt_copy.onclick = () => {
    navigator.clipboard.write([new ClipboardItem({["text/plain"]:output.value})]);
};
let butt_start = form.querySelector('button[name="start"]');
butt_start.onclick = () => worker.postMessage({type:'newGame',payload:{nPlayers:2}});

class myRTC extends RTC{
    
    onIceCandidate(e){
        output.value = btoa(JSON.stringify(this.connection.localDescription));
    }

    setChannelCallbacks(e){
        document.worker.postMessage({type:'channel',payload:theRTC.channel},[theRTC.channel]);
    }

}



let theRTC = new myRTC(freeStun);
window.theRTC = theRTC;

let butt_host = form.querySelector('button[name="host"]');
butt_host.onclick = (e) => {
    theRTC.one();
}
let butt_join = form.querySelector('button[name="join"]');
butt_join.onclick = (e) => theRTC.two(JSON.parse(atob(ta.value)));
let butt_connect = form.querySelector('button[name="connect"]');
butt_connect.onclick = (e) => theRTC.three(JSON.parse(atob(ta.value)));


