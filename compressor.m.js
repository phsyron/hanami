
import { Bitstream } from "./bitstream.m.js";
import { Codec } from "./rtc.m.js";


export var MAX_STR_LEN = 128;
export var MIN_STR_LEN = 4;
var VARINT_BITS = 3;

export class Compressor extends Codec {

    /**@type {Corpus}*/ corpus;

    /**
     * @param {Corpus} corpus 
     */
    constructor(corpus) {
        super();
        this.corpus = corpus;
    }

    /**
     * @inheritdoc
     * @param {any} dat 
     * @returns {string}
     */
    encode(dat) {
        let str = JSON.stringify(dat);
        let bs = this.encode_bs(str);
        return bs.toBase64();
    }

    /**
     * @inheritdoc
     * @param {string} dat 
     * @returns {any}
     */
    decode(dat) {
        let /**@type {Bitstream}*/ bs = Bitstream.fromBase64(dat);
        let str = this.decode_bs(bs);
        return JSON.parse(str);
    }

    /**
     * Actually do the encoding
     * @param {string} str 
     * @returns {Bitstream}
     */
    encode_bs(str) {
        let i = 0;
        let bs = new Bitstream();
        let N = str.length;
        let ct = this.corpus.huff.codeTable();
        let /**@type {string[]}*/ literal = [];
        while (i < N) {
            let substring = str.slice(i, i + MAX_STR_LEN);
            let [loc, len] = this.corpus.longestRun(substring);
            if (len >= MIN_STR_LEN) {
                let litbits = this.encode_literal(literal.join(''));
                bs.pushBits(litbits);
                literal = [];
                let runbits = Compressor.encode_run(loc, len);
                bs.pushBits(runbits);
                i += len;
            } else {
                literal.push(str.at(i) || "");
                i += 1
            }
        }
        let litbits = this.encode_literal(literal.join(''));
        bs.pushBits(litbits);
        return bs;
    }

    /**
     * Actually do the Decoding
     * @param {Bitstream} bs 
     * @returns {string}
     */
    decode_bs(bs) {
        let substrings = [];
        while (bs.canRead) {
            let literal;
            try {
                literal = this.decode_literal(bs);
            } catch {
                break;
            }
            substrings.push(literal);
            let loc, len;
            try {
                [loc, len] = Compressor.decode_run(bs);
            } catch {
                break;
            }
            substrings.push(this.corpus.get(loc, len));
        }
        return substrings.join('');
    }

    /**
     * Encodes a bitpattern representing a substing of `corpus`
     * @param {number} loc 
     * @param {number} length 
     * @returns {boolean[]}
     */
    static encode_run(loc, length) {
        let /**@type {boolean[]}*/ r = [];
        r.push(...Compressor.encode_varint(length));
        if (length > 0) {
            r.push(...Compressor.encode_varint(loc));
        }
        return r;
    }

    /**
     * Read a representation of a backreference from the bitstream
     * @param {Bitstream} bs 
     * @returns {[number,number]}
     */
    static decode_run(bs) {
        let loc = 0;
        let len = Compressor.decode_varint(bs);
        if (len > 0) {
            loc = Compressor.decode_varint(bs);
        }
        return [loc, len]
    }

    /**
     * Encodes a literal into bits 
     * @param {string} str 
     * @returns {boolean[]}
     */
    encode_literal(str) {
        let /**@type {boolean[]}*/ r = [];
        let N = str.length;
        let ct = this.corpus.huff.codeTable();
        r.push(...Compressor.encode_varint(N))
        for (let c of str) {
            let code = ct[c];
            if (code == undefined) {
                r.push(...ct['NONCE']);
                r.push(...Compressor.encode_literal_bytes(c));
            } else {
                r.push(...code);
            }
        }
        return r;
    }

    /**
     * Read a literal from the bitstream
     * @param {Bitstream} bs
     * @returns {string}
     */
    decode_literal(bs) {
        let /**@type {string[]}*/ r = [];
        let N = Compressor.decode_varint(bs);
        for (let i = 0; i < N; i++) {
            let /**@type {boolean[]}*/ cur_bits = [];
            let /**@type {string?}*/ s = null;
            while (s == null) {
                let nextbit = bs.readBit();
                cur_bits.push(nextbit);
                s = this.corpus.huff.decode(cur_bits);
            }
            if (s == "NONCE") {
                let t = Compressor.decode_literal_bytes(bs);
                r.push(t);
            } else {
                r.push(s);
            }
        }
        return r.join('')
    }

    /**
     * Encodes a string of 8-bit literals into bits
     * @param {string} str 
     * @returns {boolean[]}
     */
    static encode_literal_bytes(str) {
        let /**@type {boolean[]}*/ r = [];
        let N = str.length;
        r.push(...Compressor.encode_varint(N))
        for (let c of str) {
            let n = /**@type {number}*/ (c.codePointAt(0));
            r.push(...Bitstream.number2bits(n, 8))
        }
        return r;
    }

    /**
     * Read a string of 8-bit literals from the bitstream
     * @param {Bitstream} bs
     * @returns {string}
     */
    static decode_literal_bytes(bs) {
        let /**@type {string[]}*/ r = [];
        let N = Compressor.decode_varint(bs);
        for (let i = 0; i < N; i++) {
            let bits = bs.readNBits(8);
            let n = Bitstream.bits2number(bits);
            r.push(String.fromCodePoint(n));
        }
        return r.join('')
    }


    /**
     * Encode a number as a variable length integer
     * @param {number} n 
     * @returns 
     */
    static encode_varint(n) {
        let /**@type {boolean[]}*/ r = [];
        let n_bits = n == 0 ? VARINT_BITS : minBits(n);
        let bits = Bitstream.number2bits(n, n_bits);
        while ((bits.length % VARINT_BITS) != 0) {
            bits.unshift(false)
        }
        for (let i = 0; i < bits.length; i += VARINT_BITS) {
            let cont = (i + VARINT_BITS) < bits.length;
            let cur_slice = bits.slice(i, i + VARINT_BITS);
            r.push(cont, ...cur_slice);
        }
        return r;
    }

    /**
     * Read a variable-length integer from the bitstream
     * @param {Bitstream} bs
     * @returns {number}
     */
    static decode_varint(bs) {
        let bits = [];
        let cont = true;
        while (cont) {
            cont = bs.readBit();
            let cur_bits = bs.readNBits(VARINT_BITS);
            bits.push(...cur_bits);
        }
        let r = Bitstream.bits2number(bits);
        return r;
    }


}

/**
 * Number of bits required to encode a number in binary
 * @param {number} n 
 * @returns 
 */
function minBits(n) {
    return Math.ceil(Math.log2(n + 1));
}

export class Corpus {

    /**@type {string}*/ text;
    /**@type {Huffman}*/ huff;

    /**
     * 
     * @param {string} text 
     */
    constructor(text) {
        this.text = text;
        this.huff = HNode.build(text);
    }

    /**
     * Get a string from a reference
     * @param {number} loc 
     * @param {number} len 
     * @returns {string}
     */
    get(loc, len) {
        return this.text.slice(loc, loc + len);
    }

    /**
     * Find the location of an ocurrance of s in the Corpus
     * @param {string} str 
     * @returns {number}
     */
    find(str) {
        return this.text.indexOf(str);
    }

    /**
     * 
     * @param {string} str
     * @returns {[number,number]}
     */
    longestRun(str) {
        let loc = 0;
        let len = 0;
        for (let L = 1; L <= str.length; L++) {
            let s = str.slice(0, L);
            let curloc = this.find(s);
            if (curloc >= 0) {
                loc = curloc;
                len = L;
            } else {
                break;
            }
        }
        return [loc, len];
    }

    /**
     * Fetch and create a Corpus from a file
     * @param {string} url 
     * @returns {Promise<Corpus>}
     */
    static async fromURL(url) {
        let r = await fetch(url);
        let t = await r.text();
        return new Corpus(t);
    }

}

/**
 * @typedef {HNode | HLeaf} Huffman
 */

export class HNode {

    /**@type {Huffman}*/ L;
    /**@type {Huffman}*/ R;
    /**@type {number}*/ count;
    /**@type {{[key:string]:boolean[]}?}*/ #ct = null;

    /**
     * @param {Huffman} L 
     * @param {Huffman} R 
     */
    constructor(L, R) {
        this.L = L;
        this.R = R;
        this.count = L.count + R.count;
    }

    /**
     * Build the code table for all symbols
     * @returns {{[key:string]:boolean[]}}
     */
    codeTable() {
        let /**@type {{[key:string]:boolean[]}}*/r = {};
        for (let [k, v] of Object.entries(this.L.codeTable())) {
            r[k] = Array(false, ...v);
        }
        for (let [k, v] of Object.entries(this.R.codeTable())) {
            if (r[k] != undefined) {
                throw new Error(`doubly defined symbol ${k}`)
            }
            r[k] = Array(true, ...v);
        }
        return r;
    }

    /**
     * Decode a bitstream into a string
     * @param {boolean[]} bits 
     * @returns {string?} null if bits is invalid
     */
    decode(bits) {
        if (bits.length == 0) {
            return null;
        }
        let head = bits[0];
        let tail = bits.slice(1);
        if (head) {
            return this.R.decode(tail);
        } else {
            return this.L.decode(tail);
        }
    }

    /**
     * 
     * @param {string} text 
     */
    static build(text) {
        let /**@type {{[key:string]:HLeaf}}*/ leaves = {};
        for (let char of text) {
            if (leaves[char] == undefined) {
                leaves[char] = new HLeaf(char);
            }
            leaves[char].count += 1;
        }
        let /**@type {Set<Huffman>}*/ working = new Set(Object.values(leaves));
        let nonce = new HLeaf('NONCE');
        nonce.count = 2;
        working.add(nonce);
        let eof = new HLeaf('EOF');
        eof.count = 1;
        working.add(eof);
        while (working.size > 1) {
            let L = HNode.smallest(working);
            working.delete(L);
            let R = HNode.smallest(working);
            working.delete(R);
            let cur = new HNode(L, R);
            working.add(cur);
        }
        let [root] = Array.from(working.values());
        return root;
    }

    /**
     * 
     * @param {Set<Huffman>} set 
     * @returns {Huffman}
     */
    static smallest(set) {
        let r = null;
        let n = Infinity;
        for (let cur of set) {
            if (cur.count < n) {
                r = cur;
                n = cur.count;
            }
        }
        if (r == null) {
            throw new Error("Can't find smallest of empty set");
        }
        return r;
    }

}

export class HLeaf {

    /**@type {string}*/ symbol;
    /**@type {number}*/ count = 0;

    /**
     * @param {string} symbol 
     */
    constructor(symbol) {
        this.symbol = symbol;
    }

    /**
     * 
     * @returns {{[key:string]:boolean[]}}
     */
    codeTable() {
        let /**@type {{[key:string]:boolean[]}}*/r = {};
        r[this.symbol] = [];
        return r
    }

    /**
     * Decode a bitstream into a string
     * @param {boolean[]} bits 
     * @returns {string?} null if bits is invalid
     */
    decode(bits) {
        if (bits.length == 0) {
            return this.symbol;
        } else {
            return null;
        }
    }
}

// @ts-ignore
window.compressor = new Compressor(await Corpus.fromURL('./example_rtc.txt'));