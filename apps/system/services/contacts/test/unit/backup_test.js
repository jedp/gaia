/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global BackupService */
 
requireApp('system/shared/test/unit/mocks/mock_navigator_moz_settings.js');
requireApp('system/services/contacts/js/storage.js');
requireApp('system/js/fxa_client.js');
requireApp('/shared/js/fxa_iac_client.js');

var BACKUP_PROVIDERS_PREF = 'identity.services.contacts.providers';
var DEFAULT_PROVIDERS = {
  'fxa_id': 'ethel',
  'provider': 'default',
  'providers': {
    'default': {
      name: 'Pertelote',
      url: 'https://example.org/',
      canProvision: true
    },
    'custom': {
      name: 'pie',
      url: 'https://example.net/',
      username: 'ozymandias',
      password: 'king of ants'
    }
  }
};

function Observer() {
  this.callbacks = [];
}
Observer.prototype = {
  subscribe: function(cb) {
    this.callbacks.push(cb);
  },

  unsubscribe: function(cb) {
    if (this.callbacks.indexOf(cb) !== -1) {
      this.callbacks = this.callbacks.splice(this.callbacks.indexOf(cb), 1);
    }
  },

  observe: function(data) {
    this.callbacks.forEach(function(cb) {
      cb(data);
    });
  },
};

var observer = new Observer();

function mockXHR(properties) {
  this.properties = properties || {};
  this.headers = {};
  this.method = null;
  this.url = null;
  this.data = null;
  this.response = null;
  this.basicAuth = null;
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
      basicAuth: this.basicAuth,
      links: this.links,
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

    if (url.match('browserid/login')) {
      // mock provision an identity
      this.basicAuth = {
        userName: 'ethel',
        password: '123456',
      };
      this.links = "{'addressbook-home-set': 'foo/bar'}";
    }
  },

  send: function(data) {
    this.data = JSON.parse(data);
    this.onload(this.responseText);

    // XXX temporary - url is likely to change
    if (this.url.match('sample.vcf')) {
      observer.observe(url);
    }

    if (this.url.match('browserid/login')) {

    }
  },
};


function mockFxAccountsClient() {
}
mockFxAccountsClient.prototype = {
  getAccounts: function(successCb, errorCb) {
    successCb({
      accountId: 'ethel',
      verified: true
    });
  },

  getAssertion: function(audience, options, successCb, errorCb) {
    successCb('heres~your.assertion.bro');
  }
};

suite('services/contacts', function() {
  var realXHR;
  var realFxAccountsClient;
  var realMozSettings;

  suiteSetup(function(done) {
    realMozSettings = navigator.mozSettings;
    navigator.mozSettings = MockNavigatorSettings;

    realXHR = XMLHttpRequest;
    XMLHttpRequest = mockXHR;

    realFxAccountsClient = FxAccountsClient;
    FxAccountsClient = new mockFxAccountsClient();

    // populate mock settings
    var lock = navigator.mozSettings.createLock(BACKUP_PROVIDERS_PREF);
    var settings = {};
    settings[BACKUP_PROVIDERS_PREF] = DEFAULT_PROVIDERS;
    var result = lock.set(settings);
    result.onsuccess = function() {
      requireApp('system/services/contacts/js/backup.js', function() {
        ContactsBackupStorage.save(DEFAULT_PROVIDERS).then(function() {
          done();
        });
      });
    };
  });

  suiteTeardown(function() {
    navigator.mozSettings = realMozSettings;
    XMLHttpRequest = realXHR;
    FxAccountsClient = realFxAccountsClient;
  });

  // Test our MockXMLHttpRequest
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
    xhr.send(JSON.stringify('I like pie!'));
  });

  // Test mock settings
  test('mock settings', function(done) {
    var req = navigator.mozSettings.createLock().get(BACKUP_PROVIDERS_PREF);
    req.onsuccess = function() {
      done(function() {
        assert.equal('Pertelote', req.result[BACKUP_PROVIDERS_PREF].providers.default.name);
      });
    };
  });

  // Confirm that getAssertion works
  test('mock FxA Client', function(done) {
    FxAccountsClient.getAccounts(function(account) {
      assert.equal(account.accountId, 'ethel', 'Get account id');
      assert.equal(account.verified, true, 'Get account verified');
      FxAccountsClient.getAssertion('https://example.org', {},
        function onsuccess(assertion) {
          done(function() {
            assert.equal(assertion, 'heres~your.assertion.bro', 'Got assertion');
          });
        }
      );
    });
  });

  // Provision an identity 
  test('identity provisioning', function(done) {
    BackupService.provision().then(
      function success(creds) {
        done(function() {
          assert.equal('ethel', creds.username);
          assert.equal('123456', creds.password);
        });
      }
    );
  });

  // Get credentials already provisioned by previous test
  test('get credentials (already provisioned)', function(done) {
    BackupService.getCredentials().then(
      function success(creds) {
        done(function() {
          assert.equal('ethel', creds.username);
          assert.equal('123456', creds.password);
        });
      }
    );
  });

  // Get credentials without prior provisioning.  Clear the stored credentials
  // and call getCredentials().  The BackupService will provision new identity
  // credentials to replace them.
  test('get credentials (no current stored credentials)', function(done) {
    FxAccountsClient.getAccounts(function(account) {
      // Clear current storage
      var noCreds = {
        url: 'https://example.org',
        canProvision: true
      };
      ContactsBackupStorage.setAndUpdateProvider(account.accountId, 'default', noCreds).then(
        function saved() {
          BackupService.getCredentials().then(
            function success(creds) {
              done(function() {
                assert.equal('ethel', creds.username);
                assert.equal('123456', creds.password);
              });
            }
          );
        }
      );
    });
  });

  // Switch the selected provider and get stored credentials
  test('change provider and get credentials', function() {
    FxAccountsClient.getAccounts(function(account) {
      ContactsBackupStorage.setProvider(account.accountId, 'custom').then(
        function updated() {
          BackupService.getCredentials().then(
            function success(creds) {
              done(function() {
                assert.equal('ozymandias', creds.username);
                assert.equal('king of ants', creds.password);
              });
            }
          );
        }
      );
    });
  });

  // Clear the stored credentials and call getCredentials.  Our current
  // provider does not support provisioning, so we expect the credentials to
  // come back null.
  test('get credentials (empty and cannot provision)', function() {
    FxAccountsClient.getAccounts(function(account) {
      // Clear current storage
      var noCreds = {
        url: 'https://example.org',
      };
      ContactsBackupStorage.setAndUpdateProvider(account.accountId, 'custom', noCreds).then(
        function saved() {
          BackupService.getCredentials().then(
            function success(creds) {
              done(function() {
                assert.equal(null, creds.username);
                assert.equal(null, creds.password);
              });
            }
          );
        }
      );
    });
  });

  test('update contact', function() {
    var contact = new navigator.mozContact({
      name: ['The Queeeeeen of France!'],
    });

  });
});

