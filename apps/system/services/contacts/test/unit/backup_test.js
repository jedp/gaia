/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var OriginalXHR = XMLHttpRequest;
var OriginalMozId = navigator.mozId;

function mockXHR(properties) {
  this.properties = properties || {};
  this.headers = {};
  this.method = null;
  this.url = null;
  this.data = null;
  this.response = null;
  this.basicAuth = {
    username: 'ethel',
    password: '123456',
  };
  return this;
}
mockXHR.prototype = {
  get responseText() {
    return JSON.stringify({
      properties: this.properties,
      headers: this.headers,
      method: this.method,
      url: this.url,
      data: this.data,
    });
  },

  setRequestHeader: function(header, value) {
    this.headers[header] = value;
  },

  onload: function() {
    console.error("You didn't handle onload");
  },

  open: function(method, url, async) {
    this.method = method;
    this.url = url;
  },

  send: function(data) {
    this.data = data;
    this.onload();
  },
};

function MockFXA() {
  this.properties = {};  
}
MockFXA.prototype = {
  watch: function(properties) {
    this.properties = properties;
  },

  request: function() {
    this.properties.onlogin('heres~your.assertion.bro');
  },
};

XMLHttpRequest = mockXHR;

requireApp('system/services/contacts/js/backup.js', loaded);

function loaded() {
  suite('Backup', function() {

    // Check that our XMLHttpRequest mock is working
    test('mockXHR', function(done) {
      var xhr = new XMLHttpRequest({mozSystem: true});
      xhr.onload = function() {
        var result = JSON.parse(xhr.responseText);
        done(function() {
          assert.equal('POST', result.method, 'XHR method');
          assert.ok(result.properties.mozSystem, 'mozSystem request');
          assert.equal('https://example.org', result.url, 'Correct url');
          assert.equal('I like pie!', result.data, 'Correct data');
        });
        
      };

      xhr.open('POST', 'https://example.org', true);
      xhr.send('I like pie!');
    });

    // Check that our FirefoxAccounts getAssertion mock is working
    // XXX actually, i don't think we want to use this api
    // we should try the iac api
    test('mockFXA', function(done) {
      navigator.mozId = new MockFXA();

      navigator.mozId.watch({
        onlogin: function(assertion) {
          done(function() {
            assert.equal('heres~your.assertion.bro', assertion, 'Got an assertion');
          });
        }
      });

      navigator.mozId.request();
    });
  });
}

