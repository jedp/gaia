/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

requireApp('services/contacts/js/vcard.js', loaded);

function loaded() {
  console.log("** YAY **\n\n\n\n\n");
  suite('VCard', function() {
    test('smoke test', function() {
      assert.ok(typeof Line == 'function');
      assert.ok(typeof MozContactTranslator == 'function');
    });
  });
}
