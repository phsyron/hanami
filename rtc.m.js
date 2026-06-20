
export var freeStun = { iceServers: [{ urls: 'stun:stun1.l.google.com:19302' }] };

/**
 * Helper wrapper class around RTCPeerConnection and RTCDataChannel
 */
export class RTC extends EventTarget {

    /**@type {RTCDataChannel?}*/ channel = null;
    /**@type {RTCConfiguration}*/ configuration = {};
    /**@type {boolean}*/ logging;
    /**@type {RTCPeerConnection}*/ connection;

    /**
     * @param {RTCConfiguration} configuration 
     * @param {boolean} logging 
     */
    constructor(configuration, logging = true) {
        super();
        if (configuration) {
            this.configuration = configuration;
        }
        this.logging = logging;
        this.connection = new RTCPeerConnection(this.configuration);
        this.connection.onicecandidate = (x) => { this.onIceCandidate(x) };
        this.connection.ondatachannel = (x) => { this.onDataChannel(x) };
    }

    /**
     * Called whenever a channel is opened
     */
    setChannelCallbacks() {
        if (this.channel) {
            this.channel.onmessage = (x) => this.onMessage(x);
            this.channel.onopen = (x) => this.onOpen(x);
            this.channel.onclose = (x) => this.onClose(x);
        }
    }

    /**
     * Called when theres a new Ice candidate. 
     * @param {RTCPeerConnectionIceEvent} e 
     */
    onIceCandidate(e) {
        let d = this.connection.localDescription;
        if (this.logging) {
            console.log('new ICE candidate', JSON.stringify(d));
        }
        this.dispatchEvent(new CustomEvent('icecandidate', { detail: d }));
    }

    /**
     * Called whenever `channel` receives a message
     * @param {MessageEvent} e 
     */
    onMessage(e) {
        if (this.logging) {
            console.log('new message:', e.data);
        }
        this.dispatchEvent(new CustomEvent('message', { detail: e.data }));
    }

    /**
     * Called when `this.channel` opens
     * @param {Event} e 
     */
    onOpen(e) {
        if (this.logging) {
            console.log('channel open');
        }
        this.dispatchEvent(new CustomEvent('open'));
    }

    /**
     * Called when `this.channel` closes
     * @param {Event} e 
     */
    onClose(e) {
        if (this.logging) {
            console.log('channel closed');
        }
        this.dispatchEvent(new CustomEvent('close'));
    }

    /**
     * Called when `this.channel` is created
     * @param {RTCDataChannelEvent} e 
     */
    onDataChannel(e) {
        if (this.logging) {
            console.log('new data channel', e);
        }
        this.dispatchEvent(new CustomEvent('datachannel'));
        this.channel = e.channel;
        this.setChannelCallbacks();
    }

    /**
     * Called when an answer is created.
     * @param {RTCSessionDescriptionInit} answer 
     */
    onAnswerCreated(answer) {
        if (this.logging) {
            console.log('answer created:', JSON.stringify(answer));
        }
        this.dispatchEvent(new CustomEvent('answercreated', { detail: answer }));
    }

    /**
     * The host calls this first to initialize the connection.
     */
    one() {
        this.channel = this.connection.createDataChannel('data');
        this.setChannelCallbacks();
        this.connection.createOffer().then((o) => this.connection.setLocalDescription(o))
    }

    /**
     * The guest calls this with the offer given by the host.
     * It's better to override `onAnswerCreated()` than this.
     * @param {RTCSessionDescriptionInit} offer 
     */
    two(offer) {
        this.connection.setRemoteDescription(offer)
            .then(() => { if (this.logging) { console.log('done') } });
        this.connection.createAnswer()
            .then(a => {
                this.connection.setLocalDescription(a);
                this.onAnswerCreated(a)
            });
    }

    /**
     * The Host calls this with the answer given by the guest
     * @param {RTCSessionDescriptionInit} answer 
     */
    three(answer) {
        this.connection.setRemoteDescription(answer)
            .then(() => { if (this.logging) { console.log('done') } });
    }
}
