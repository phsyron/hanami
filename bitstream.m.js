
var MAX_INT_BITS = 30;

export class Bitstream {

    /**@type {number[]}*/ shipped;
    /**@type {boolean[]}*/ writeBuffer;
    /**@type {boolean[]}*/ readBuffer;

    /**
     * @param {number[]?} buffer 
     */
    constructor(buffer = null) {
        if (buffer) {
            this.shipped = Array.from(buffer)
        } else {
            this.shipped = [];
        }
        this.writeBuffer = [];
        if (this.shipped.length > 0) {
            this.readBuffer = [];
        } else {
            this.readBuffer = this.writeBuffer;
        }
    }

    /**
     * Add a bit to the (write) working bits
     * @param {boolean} bit 
     */
    pushBit(bit) {
        this.writeBuffer.push(bit);
        if (this.writeBuffer.length == 8) {
            this.shipByte();
        }
    }

    /**
     * Add a number of bits to the (write) working bits
     * @param {boolean[]} bits 
     */
    pushBits(bits) {
        for(let bit of bits){
            this.pushBit(bit);
        }
    }

    /**
     * Flush the current working bits into the bitstream
     */
    shipByte() {
        while (this.writeBuffer.length < 8) {
            this.writeBuffer.push(false);
        }
        let newbyte = Bitstream.bits2number(this.writeBuffer);
        this.shipped.push(newbyte);
        if (this.readBuffer === this.writeBuffer) {
            this.readBuffer = [];
        }
        this.writeBuffer = [];
    }

    /**
     * Read one bit from the bitstream
     * @returns {boolean} the least-recently pushed bit
     */
    readBit() {
        if (this.readBuffer.length == 0) {
            this.unpackByte();
        }
        return /**@type {boolean}*/ (this.readBuffer.shift());
    }

    /**
     * Read some number of bits 
     * @param {number} N
     * @returns {boolean[]} the bits
     */
    readNBits(N) {
        if (N > this.nReadable) {
            throw new RangeError(`can't read ${N} bits`);
        }
        /**@type {boolean[]}*/ let r = []
        while (r.length < N) {
            r.push(this.readBit());
        }
        return r;
    }

    /**
     * Reads N bits as a number
     * @param {number} Nbits 
     * @returns {number}
     */
    readNumber(Nbits) {
        if (Nbits > MAX_INT_BITS) {
            throw new RangeError(`can't safely read a ${Nbits}-bit number`);
        }
        return Bitstream.bits2number(this.readNBits(Nbits));
    }

    /**
     * Bit magic to create an N-bit bitstream from a number
     * @param {number} x the number to convert
     * @param {number} Nbits
     * @returns {boolean[]}
     */
    static number2bits(x, Nbits = 8) {
        /**@type {boolean[]}*/ let r = [];
        for (let i = 0; i < Nbits; i++) {
            let j = (Nbits - 1) - i;
            r.push((x & (1 << j)) != 0);
        }
        return r;
    }

    /**
     * interpret some bits as a number
     * @param {boolean[]} bits 
     * @return {number}
     */
    static bits2number(bits) {
        if (bits.length > MAX_INT_BITS) {
            throw new RangeError(`can't safely read a ${bits.length}-bit number`);
        }
        let r = 0;
        for (let bit of bits) {
            r = r << 1;
            r = r | (bit ? 1 : 0);
        }
        return r;
    }

    /**
     * Read a byte into the (read) working bits
     */
    unpackByte() {
        let newbyte = this.shipped.shift();
        if (newbyte == undefined) {
            if (this.writeBuffer.length == 0) {
                throw new RangeError("attempted to read from empty bitstream")
            };
            this.readBuffer = this.writeBuffer;
            return;
        }
        let newbits = Bitstream.number2bits(newbyte, 8);
        this.readBuffer = this.readBuffer.concat(newbits);
    }

    /**
     * Whether or not there are bits to read from the stream
     */
    get canRead() {
        return this.nReadable > 0;
    }

    /**
     * The number of readable bits in the stream
     */
    get nReadable() {
        return this.readBuffer.length + (this.shipped.length * 8) + this.writeBuffer.length;
    }

    /**
     * Dump the bitstream to a base-64 encoded string
     * @returns {string}
     */
    toBase64() {
        if (this.writeBuffer.length == 0) {
            return btoa(String.fromCodePoint(...this.shipped));
        }
        let t = Array.from(this.writeBuffer);
        this.shipByte();
        let r = btoa(String.fromCodePoint(...this.shipped));
        this.writeBuffer = t;
        this.shipped.pop();
        return r;
    }

    /**
     * Create a bitstream from a base64-encoded string
     * @param {string} a
     * @returns {Bitstream}
     */
    static fromBase64(a) {
        let b = atob(a)
        let bytes = Array.from(b).map(s => s.codePointAt(0) || NaN);
        return new Bitstream(bytes);
    }

}
