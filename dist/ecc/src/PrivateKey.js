'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ecurve = require('ecurve');

var _require = require('ecurve'),
    Point = _require.Point,
    getCurveByName = _require.getCurveByName;

var secp256k1 = getCurveByName('secp256k1');
var BigInteger = require('bigi');

var _require2 = require('bs58'),
    encode = _require2.encode,
    decode = _require2.decode;

var assert = require('assert');
var hash = require('./hash');
var PublicKey = require('./PublicKey');
var deepEqual = require("deep-equal");

var G = secp256k1.G,
    n = secp256k1.n;

var PrivateKey = function () {

    /**
        @private see static functions
        @param {BigInteger}
    */
    function PrivateKey(d) {
        _classCallCheck(this, PrivateKey);

        this.d = d;
    }

    _createClass(PrivateKey, [{
        key: 'toWif',
        value: function toWif() {
            var private_key = this.toBuffer();
            // checksum includes the version
            private_key = Buffer.concat([new Buffer([0x80]), private_key]);
            var checksum = hash.sha256(private_key);
            checksum = hash.sha256(checksum);
            checksum = checksum.slice(0, 4);
            var private_wif = Buffer.concat([private_key, checksum]);
            return encode(private_wif);
        }

        /**
            @return {Point}
        */

    }, {
        key: 'toPublicKeyPoint',
        value: function toPublicKeyPoint() {
            var Q;
            return Q = secp256k1.G.multiply(this.d);
        }
    }, {
        key: 'toPublicKey',
        value: function toPublicKey() {
            if (this.public_key) {
                return this.public_key;
            }
            return this.public_key = PublicKey.fromPoint(this.toPublicKeyPoint());
        }
    }, {
        key: 'toBuffer',
        value: function toBuffer() {
            return this.d.toBuffer(32);
        }

        /** ECIES */

    }, {
        key: 'get_shared_secret',
        value: function get_shared_secret(public_key) {
            var legacy = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

            public_key = toPublic(public_key);
            var KB = public_key.toUncompressed().toBuffer();
            var KBP = Point.fromAffine(secp256k1, BigInteger.fromBuffer(KB.slice(1, 33)), // x
            BigInteger.fromBuffer(KB.slice(33, 65)) // y
            );
            var r = this.toBuffer();
            var P = KBP.multiply(BigInteger.fromBuffer(r));
            var S = P.affineX.toBuffer({ size: 32 });
            /*
            the input to sha512 must be exactly 32-bytes, to match the c++ implementation
            of get_shared_secret.  Right now S will be shorter if the most significant
            byte(s) is zero.  Pad it back to the full 32-bytes
            */
            if (!legacy && S.length < 32) {
                var pad = new Buffer(32 - S.length).fill(0);
                S = Buffer.concat([pad, S]);
            }

            // SHA512 used in ECIES
            return hash.sha512(S);
        }

        // /** ECIES (does not always match the Point.fromAffine version above) */
        // get_shared_secret(public_key){
        //     public_key = toPublic(public_key)
        //     var P = public_key.Q.multiply( this.d );
        //     var S = P.affineX.toBuffer({size: 32});
        //     // ECIES, adds an extra sha512
        //     return hash.sha512(S);
        // }

        /** @throws {Error} - overflow of the key could not be derived */

    }, {
        key: 'child',
        value: function child(offset) {
            offset = Buffer.concat([this.toPublicKey().toBuffer(), offset]);
            offset = hash.sha256(offset);
            var c = BigInteger.fromBuffer(offset);

            if (c.compareTo(n) >= 0) throw new Error("Child offset went out of bounds, try again");

            var derived = this.d.add(c); //.mod(n)

            if (derived.signum() === 0) throw new Error("Child offset derived to an invalid key, try again");

            return new PrivateKey(derived);
        }

        /* <helper_functions> */

    }, {
        key: 'toByteBuffer',
        value: function toByteBuffer() {
            var b = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN);
            this.appendByteBuffer(b);
            return b.copy(0, b.offset);
        }
    }, {
        key: 'toHex',
        value: function toHex() {
            return this.toBuffer().toString('hex');
        }

        /* </helper_functions> */

    }], [{
        key: 'fromBuffer',
        value: function fromBuffer(buf) {
            if (!Buffer.isBuffer(buf)) {
                throw new Error("Expecting paramter to be a Buffer type");
            }
            if (32 !== buf.length) {
                console.log('WARN: Expecting 32 bytes, instead got ' + buf.length + ', stack trace:', new Error().stack);
            }
            if (buf.length === 0) {
                throw new Error("Empty buffer");
            }
            return new PrivateKey(BigInteger.fromBuffer(buf));
        }

        /** @arg {string} seed - any length string.  This is private, the same seed produces the same private key every time.  */

    }, {
        key: 'fromSeed',
        value: function fromSeed(seed) {
            // generate_private_key
            if (!(typeof seed === 'string')) {
                throw new Error('seed must be of type string');
            }
            return PrivateKey.fromBuffer(hash.sha256(seed));
        }

        /** @return {string} Wallet Import Format (still a secret, Not encrypted) */

    }, {
        key: 'fromWif',
        value: function fromWif(_private_wif) {
            var private_wif = new Buffer(decode(_private_wif));
            var version = private_wif.readUInt8(0);
            assert.equal(0x80, version, 'Expected version ' + 0x80 + ', instead got ' + version);
            // checksum includes the version
            var private_key = private_wif.slice(0, -4);
            var checksum = private_wif.slice(-4);
            var new_checksum = hash.sha256(private_key);
            new_checksum = hash.sha256(new_checksum);
            new_checksum = new_checksum.slice(0, 4);
            var isEqual = deepEqual(checksum, new_checksum); //, 'Invalid checksum'
            if (!isEqual) {
                throw new Error("Checksum did not match");
            }
            private_key = private_key.slice(1);
            return PrivateKey.fromBuffer(private_key);
        }
    }, {
        key: 'fromHex',
        value: function fromHex(hex) {
            return PrivateKey.fromBuffer(new Buffer(hex, 'hex'));
        }
    }]);

    return PrivateKey;
}();

module.exports = PrivateKey;

var toPublic = function toPublic(data) {
    return data == null ? data : data.Q ? data : PublicKey.fromStringOrThrow(data);
};