/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mocha.globals([
  'gdb',
  'STORE_NAME',
  'CONTACTS_PROVIDERS',
  'ContactsBackupStorage',
]);

suite('services/contats', function() {
  suiteSetup(function(done) {
    requireApp('system/services/contacts/js/storage.js', done);
  });

  test('save', function(done) {
    var data = {
      fxa_id: 42,
      provider: 'foo',
      providers: {
        foo: {
          url: 'https://example.com',
          canProvision: true
        }
      }
    };
    ContactsBackupStorage.save(data).then(
      function () {
        done(function() {
          assert.ok(true, 'Saved data');
        });
      }
    );
  });

  test('load', function(done) {
    ContactsBackupStorage.load(42).then(
      function(data) {
        done(function() {
          assert.equal('foo', data.provider);
          assert.ok(data.providers[data.provider].canProvision);
        });
      }
    );
  });

  test('getProviderProfile', function(done) {
    ContactsBackupStorage.getProviderProfile(42).then(
      function(data) {
        done(function() {
          assert.equal('https://example.com', data.url);
        });
      }
    );
  });

  test('updateProviderProfile', function(done) {
    var profile = {
      url: 'https://example.org/foo/',
      canProvision: true,
      username: 'leonardo',
      password: '123456',
    };
    ContactsBackupStorage.updateProviderProfile(42, profile).then(
      function() {
        ContactsBackupStorage.getProviderProfile(42).then(
          function(data) {
            done(function() {
              assert.equal('leonardo', data.username);
              assert.equal('123456', data.password);
            });
          }
        );
      }
    );
  });

  test('getProvider', function(done) {
    ContactsBackupStorage.getProvider(42).then(
      function(provider) {
        done(function() {
          assert.equal('foo', provider);
        });
      }
    );
  });

  test('setProvider', function(done) {
    ContactsBackupStorage.setProvider(42, 'blargh').then(
      function() {
        ContactsBackupStorage.getProvider(42).then(
          function(provider) {
            done(function() {
              assert.equal('blargh', provider);
            });
          }
        );
      }
    );
  });

  test('setAndUpdateProvider', function(done) {
    var profile = {
      url: 'https://blarg.org',
      username: 'francine',
      password: 'i like pie'
    };
    ContactsBackupStorage.setAndUpdateProvider(42, 'blargh', profile).then(
      function() {
        ContactsBackupStorage.getProviderProfile(42).then(
          function(data) {
            done(function() {
              assert.equal('francine', data.username);
              assert.equal('i like pie', data.password);
            });
          }
        );
      }
    );
  });
});

