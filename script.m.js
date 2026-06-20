"use strict";

export const worker = new Worker("worker.m.js", { type: 'module' });
export const BB = document;

/**
 * 
 * @param {MessageEvent<{type:string,payload:any}>} msg 
 */
function process_message(msg) {
    let type = msg.data.type;
    let detail = msg.data.payload;
    console.log(type, detail);
    let e = new CustomEvent(type, { detail });
    BB.dispatchEvent(e);
}

worker.onmessage = process_message;



