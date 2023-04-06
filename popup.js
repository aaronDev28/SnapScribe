"use strict";
var sjcl = {
  cipher: {},
  hash: {},
  keyexchange: {},
  mode: {},
  misc: {},
  codec: {},
  exception: {
    corrupt: function (a) {
      this.toString = function () {
        return "CORRUPT: " + this.message;
      };
      this.message = a;
    },
    invalid: function (a) {
      this.toString = function () {
        return "INVALID: " + this.message;
      };
      this.message = a;
    },
    bug: function (a) {
      this.toString = function () {
        return "BUG: " + this.message;
      };
      this.message = a;
    },
    notReady: function (a) {
      this.toString = function () {
        return "NOT READY: " + this.message;
      };
      this.message = a;
    },
  },
};
if (typeof module != "undefined" && module.exports) module.exports = sjcl;

//encode the image and download it
var enc = function() {
    var msg = document.getElementById('message').value;
    var pswrd = document.getElementById('password').value;
    var otpt = document.getElementById('output');
    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');

    //encrypt message with password
    if (pswrd.length > 0) {
        msg = sjcl.encrypt(pswrd, msg);
    } else {
        msg = JSON.stringify({'text': msg});
    }

    //exit if message is too big for image
    var pix_Count = ctx.canvas.width * ctx.canvas.height;
    if ((msg.length + 1) * 16 > pix_Count * 4 * 0.75) {
        alert('Message is too big for the image.');
        return;
    }

    //exit if message is above manual limit
    if (msg.length > MsgMaxSize) {
        alert('Message is too big.');
        return;
    }
    //encode the encrypted message with the given password
    var imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    enc_Msg(imgData.data, sjcl.hash.sha256.hash(pswrd), msg);
    ctx.putImageData(imgData, 0, 0);

    alert('Done! When the image appears, save and share it with someone.');
    
    //download the image
    var dwnld = function(){
        var canvas = document.getElementById('canvas');
        var link = document.createElement('a');
        link.download = 'encImage.jpg';
        link.href = document.getElementById('canvas').toDataURL();
        link.click()

}
dwnld();

};

var dec = function() {
    var pswrd = document.getElementById('password2').value;
    var pswrd_fail = 'Password is incorrect or there is nothing here.';

    var ctx = document.getElementById('canvas').getContext('2d');
    var imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    var msg = dec_Msg(imgData.data, sjcl.hash.sha256.hash(pswrd));

    var obj = null;
    try {
        obj = JSON.parse(msg);
    } catch (e) {

        document.getElementById('choose').style.display = 'block';
        document.getElementById('reveal').style.display = 'none';

        if (pswrd.length > 0) {
            alert(pswrd_fail);
        }
    }

    if (obj) {
        document.getElementById('choose').style.display = 'none';
        document.getElementById('reveal').style.display = 'block';

        if (obj.ct) {
            try {
                obj.text = sjcl.decrypt(pswrd, msg);
            } catch (e) {
                alert(pswrd_fail);
            }
        }

        var escChars = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#39;',
            '/': '&#x2F;',
            '\n': '<br/>'
        };
        var escHtml = function(string) {
            return String(string).replace(/[&<>"'\/\n]/g, function (c) {
                return escChars[c];
            });
        };
        document.getElementById('messageDecoded').innerHTML = escHtml(obj.text);
    }
};

//bitwise operations to get individual bits
// returns a 1 or 0 for the bit in 'location'
var get_bit = function(number, location) {
   return ((number >> location) & 1);
};

// sets the bit in 'location' to 'bit' (either a 1 or 0)
var set_bit = function(number, location, bit) {
   return (number & ~(1 << location)) | (bit << location);
};

// returns an array of 1s and 0s for a 2-byte number
var FromNumbergetBits = function(number) {
   var bits = [];
   for (var i = 0; i < 16; i++) {
       bits.push(get_bit(number, i));
   }
   return bits;
};

//to get 2-byte unicode value of each letter
var getNumberFromBits = function(bytes, history, hash) {
    var number = 0, pos = 0;
    while (pos < 16) {
        var loc = getNxtLoc(history, hash, bytes.length);
        var bit = get_bit(bytes[loc], 0);
        number = set_bit(number, pos, bit);
        pos++;
    }
    return number;
};


// returns an array of 1s and 0s for the string 'message'
var getMsgBits = function(msg) {
    var msg_bits = [];
    for (var i = 0; i < msg.length; i++) {
        var code = msg.charCodeAt(i);
        msg_bits = msg_bits.concat(FromNumbergetBits(code));
    }
    return msg_bits;
};

var getNxtLoc = function(history, hash, total) {
    var pos = history.length;
    var loc = Math.abs(hash[pos % hash.length] * (pos + 1)) % total;
    while (true) {
        if (loc >= total) {
            loc = 0;
        } else if (history.indexOf(loc) >= 0) {
            loc++;
        } else if ((loc + 1) % 4 === 0) {
            loc++;
        } else {
            history.push(loc);
            return loc;
        }
    }
};
//colors contains each of the four color values from each pixel (r,g, b, a)
var enc_Msg = function(colors, hash, msg) {
    var msg_bits = FromNumbergetBits(msg.length);
    msg_bits = msg_bits.concat(getMsgBits(msg));

    var history = [];

    var pos = 0;
    while (pos < msg_bits.length) {
        var loc = getNxtLoc(history, hash, colors.length);
        colors[loc] = set_bit(colors[loc], 0, msg_bits[pos]);


        while ((loc + 1) % 4 !== 0) {
            loc++;
        }
        colors[loc] = 255; //no transparency

        pos++;
    }
};
var dec_Msg = function(colors, hash) {
    var history = [];

    var msg_size = getNumberFromBits(colors, history, hash);

    if ((msg_size + 1) * 16 > colors.length * 0.75) {
        return '';
    }

    if (msg_size === 0 || msg_size > MsgMaxSize) {
        return '';
    }

    var msg = [];
    for (var i = 0; i < msg_size; i++) {
        var code = getNumberFromBits(colors, history, hash);
        msg.push(String.fromCharCode(code));
    }

    return msg.join('');
};
