"use strict";

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



