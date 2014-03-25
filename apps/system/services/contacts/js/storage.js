
// Exposes the ContactsBackupStorage object, which wraps an internal indexedDB
// database for holding carddav config and credentials for the user.

// Global db for this module
var gdb = {};
var STORE_NAME = 'settings';

// Schema:
// {fxa_id:    fxa id of currently signed-in user,
//  url:       url of remote contacts backup service,
//  username:  username for basic auth at service,
//  password:  password for basic auth at service
// }
//
// XXX maybe create an fxa dom api that encrypts/decrypts records using kB -
// helper function so we don't store stuff in the clear

// Hide db internals
(function() {
  'use strict';

  var DB_NAME = 'services-contacts-backup';
  var VERSION = 1;
  var DUMMY_FXA_ID = 'my-fxa-id';

  var req = window.indexedDB.open(DB_NAME, VERSION);

  req.onupgradeneeded = function(event) {
    var db = event.target.result;
    db.createObjectStore(STORE_NAME, {keyPath: 'fxa_id'});
    setup(db);
  };

  req.onerror = function() {
    console.error("indexedDB error: " + req.errorCode);
    callback(req.errorCode);
  };

  req.onsuccess = function(event) {
    var db = req.result;
    setup(db);
  };

  function setup(db) {
    gdb = {
      _db: db,

      // Save credentials for the current fxa user
      save: function(data) {
        data.fxa_id = DUMMY_FXA_ID;

        var trans = gdb._db.transaction([STORE_NAME], "readwrite");
        trans.onerror = function(event) {
          console.error("Transaction error: " + event.target.error.name);
        };

        var store = trans.objectStore(STORE_NAME);
        store.put(data);
      },

      // Load the credentials for the current fxa user
      load: function(callback) {
        var results = [];
        if (!gdb._db) {
          return callback(results);
        }

        var store = this._db.transaction(STORE_NAME).objectStore(STORE_NAME);
        var range = store.openCursor(IDBKeyRange.only(DUMMY_FXA_ID));

        range.onsuccess = function(event) {
          var cursor = event.target.result;

          if (!cursor) {
            return callback(results);
          }

          results = cursor.value;
          return callback(results);
        };
      }
    };
  }
}());

// Public interface
var ContactsBackupStorage = {
  load: function(callback) {
    gdb.load(callback);
  },

  save: function(data) {
    gdb.save(data);
  }
};
